package com.exemplo.jogo3d;

import com.badlogic.gdx.graphics.Color;
import com.badlogic.gdx.graphics.g3d.Material;
import com.badlogic.gdx.graphics.g3d.Model;
import com.badlogic.gdx.graphics.g3d.ModelInstance;
import com.badlogic.gdx.graphics.g3d.attributes.ColorAttribute;
import com.badlogic.gdx.graphics.g3d.utils.ModelBuilder;
import com.badlogic.gdx.graphics.VertexAttributes.Usage;
import com.badlogic.gdx.math.Quaternion;
import com.badlogic.gdx.graphics.g3d.utils.AnimationController;
import com.badlogic.gdx.math.MathUtils;
import com.badlogic.gdx.math.Matrix4;
import com.badlogic.gdx.math.Vector3;

/**
 * Montaria (donkey ou cavalo).
 *
 * Sequência de montar: anda até o lado do animal, agacha, pula e senta sobre o lombo.
 * Montado: o joystick guia o animal (andando ou correndo, se for cavalo), e o personagem vai junto sentado.
 * Pular enquanto montado desce do lado. Depois pode montar de novo.
 *
 * Coordenadas do animal: a cabeça aponta para +z; a origem fica no chão.
 */
public class Riding {

    static final float MOUNT_WALK_END = 0.9f;
    static final float MOUNT_CROUCH_END = 1.4f;
    static final float MOUNT_END = 2.2f;
    static final float DISMOUNT_END = 1.0f;
    static final float MOUNT_RANGE = 2.2f;
    static final float RIDER_HIP = 0.9f;   // quadril do personagem sentado, abaixo do lombo
    static final float ANIMAL_RADIUS = 0.7f;

    /** Dados de uma montaria (o donkey ou um cavalo). */
    static final class Mount {
        final ModelInstance inst;
        final AnimationController anim;
        final ModelInstance rope;        // corda do morão (pode ser null)
        final Vector3 pos;               // posição no chão
        float facing;                    // radianos (direção da cabeça)
        final float seatY;               // altura do lombo
        final float seatZ;               // onde fica o assento no sentido do corpo
        final float sideX;               // distância do lado para subir
        final float walkSpeed, runSpeed;
        final boolean horse;             // cavalo tem o clipe Run; donkey só andar mais rápido
        final float zMin, zMax;          // extensão do corpo no eixo do animal (cápsula de colisão)

        Mount(ModelInstance inst, AnimationController anim, ModelInstance rope, Vector3 pos, float facingDeg,
              float seatY, float seatZ, float sideX, float walkSpeed, float runSpeed, boolean horse,
              float zMin, float zMax) {
            this.inst = inst;
            this.anim = anim;
            this.rope = rope;
            this.pos = pos;
            this.facing = facingDeg * MathUtils.degreesToRadians;
            this.seatY = seatY;
            this.seatZ = seatZ;
            this.sideX = sideX;
            this.walkSpeed = walkSpeed;
            this.runSpeed = runSpeed;
            this.horse = horse;
            this.zMin = zMin;
            this.zMax = zMax;
        }
    }

    private enum St { FREE, MOUNTING, MOUNTED, DISMOUNTING }

    private final World world;
    private final Mount m;
    private final Matrix4 inv = new Matrix4();
    private final Vector3 from = new Vector3();
    private final Vector3 tmp = new Vector3();
    private final Vector3 tmp2 = new Vector3();
    private St state = St.FREE;
    private float t = 0f;
    private float sideSign = 1f;
    private String clipNow = "";
    private float walkFactor = 1f;
    private boolean ropeCut = false;

    // Sons do cavalo: parado (bufada e relincho), andando e correndo (cascos sincronizados com a animação)
    private static com.badlogic.gdx.audio.Sound[] idleSounds, hooves;
    private static boolean soundsLoaded = false;
    private float idleTimer = 3f;
    private com.badlogic.gdx.graphics.g3d.model.Animation lastHoofAnim;
    private int lastHoofIdx = -1;

    Riding(World world, Mount m) {
        this.world = world;
        this.m = m;
        placeAnimal();
    }

    private static com.badlogic.gdx.audio.Sound load(String path) {
        return com.badlogic.gdx.Gdx.audio.newSound(com.badlogic.gdx.Gdx.files.internal(path));
    }

    private static void loadSounds() {
        if (soundsLoaded) return;
        soundsLoaded = true;
        try {
            idleSounds = new com.badlogic.gdx.audio.Sound[]{
                    load("audio/cavalo_bufada.mp3"), load("audio/cavalo_bufada2.mp3"),
                    load("audio/cavalo_relincho.mp3"), load("audio/cavalo_relincho_longo.mp3")};
            hooves = new com.badlogic.gdx.audio.Sound[]{
                    load("audio/casco1.mp3"), load("audio/casco2.mp3"), load("audio/casco3.mp3"),
                    load("audio/casco4.mp3"), load("audio/casco5.mp3"), load("audio/casco6.mp3")};
        } catch (RuntimeException e) {
            idleSounds = new com.badlogic.gdx.audio.Sound[0];   // sem som: o jogo continua
            hooves = new com.badlogic.gdx.audio.Sound[0];
        }
    }

    /** Volume pela distância do jogador: some a partir de cerca de 30 m. */
    private float volumeAt(Player player) {
        float dx = player.pos.x - m.pos.x, dz = player.pos.z - m.pos.z;
        float d = (float) Math.sqrt(dx * dx + dz * dz);
        return MathUtils.clamp(1f - d / 30f, 0.1f, 1f);
    }

    /** Sons do cavalo, chamados todo quadro. */
    private void sounds(float dt, Player player) {
        if (!m.horse) return;
        loadSounds();
        boolean mounted = state == St.MOUNTED;
        if (state == St.FREE || (mounted && "Idle".equals(clipNow))) {
            // parado: de tempos em tempos bufa ou relincha
            idleTimer -= dt;
            if (idleTimer <= 0f) {
                idleTimer = MathUtils.random(6f, 14f);
                if (idleSounds.length > 0) {
                    idleSounds[MathUtils.random(idleSounds.length - 1)]
                            .play(volumeAt(player) * 0.8f, MathUtils.random(0.92f, 1.05f), 0f);
                }
            }
        } else {
            idleTimer = MathUtils.random(2f, 5f);
        }
        if (mounted && ("Walk".equals(clipNow) || "Run".equals(clipNow))) hoofSteps(player);
        else { lastHoofAnim = null; lastHoofIdx = -1; }
    }

    /**
     * Um casco no chão por batida. O clipe Walk/Run tem quatro batidas por ciclo, então o som
     * sai quando a animação troca de perna.
     */
    private void hoofSteps(Player player) {
        com.badlogic.gdx.graphics.g3d.utils.AnimationController.AnimationDesc cur = m.anim.current;
        if (cur == null || cur.animation == null || cur.animation.duration <= 0f) return;
        if (cur.animation != lastHoofAnim) {          // clipe trocou: começa a contar de novo
            lastHoofAnim = cur.animation;
            lastHoofIdx = -1;
        }
        float dur = cur.animation.duration;
        float tt = cur.time % dur;
        if (tt < 0f) tt += dur;
        int idx = (int) (tt / dur * 4f) & 3;
        if (lastHoofIdx >= 0 && idx != lastHoofIdx && hooves.length > 0) {
            boolean run = "Run".equals(clipNow);
            float vol = (run ? 0.6f : 0.35f) * volumeAt(player);
            float pitch = run ? MathUtils.random(0.98f, 1.08f) : MathUtils.random(0.85f, 0.95f);
            hooves[MathUtils.random(hooves.length - 1)].play(vol, pitch, 0f);
        }
        lastHoofIdx = idx;
    }

    boolean isMounted() { return state == St.MOUNTED; }
    boolean isBusy() { return state == St.MOUNTING || state == St.DISMOUNTING; }

    /** Pode montar agora: perto do animal e livre. */
    boolean canMount(Vector3 p) {
        if (state != St.FREE) return false;
        float dx = p.x - m.pos.x, dz = p.z - m.pos.z;
        return dx * dx + dz * dz < MOUNT_RANGE * MOUNT_RANGE;
    }

    /** Começa a subir, pelo lado em que o personagem está. */
    void startMount(Player player) {
        if (state != St.FREE) return;
        from.set(player.pos);
        inv.set(m.inst.transform).inv();
        Vector3 local = tmp.set(player.pos).mul(inv);
        sideSign = local.x >= 0f ? 1f : -1f;
        t = 0f;
        state = St.MOUNTING;
    }

    /**
     * Atualiza a montaria. Chame todo quadro, também quando ela não está em uso (o animal
     * continua com a animação dele). Quando isMounted() ou isBusy(), o Player não deve andar.
     */
    void update(float dt, float inX, float inY, float camYaw, boolean run, boolean jumpPressed,
                Player player, Character ch) {
        sounds(dt, player);
        switch (state) {
            case FREE:
                break;
            case MOUNTING:
                mountUpdate(dt, player, ch);
                break;
            case MOUNTED:
                if (jumpPressed) { if (driving) dismountCart(player, ch); else startDismount(player, ch); }
                else rideUpdate(dt, inX, inY, camYaw, run, player, ch);
                break;
            case DISMOUNTING:
                dismountUpdate(dt, player, ch);
                break;
        }
        m.anim.update(dt);
        updateCart();
    }

    // ---------- Montar ----------

    private void mountUpdate(float dt, Player player, Character ch) {
        t += dt;
        Vector3 side = sidePoint();
        float groundSide = side.y;
        if (t < MOUNT_WALK_END) {
            float s = smooth(t / MOUNT_WALK_END);
            tmp.set(from).lerp(side, s);
            tmp.y = world.heightAt(tmp.x, tmp.z);
            setPlayer(player, tmp.x, tmp.y, tmp.z, true);
            player.speed = 1.6f;
            player.facing = facingToAnimal(player);
            ch.setCrouch(0f);
            ch.setSitting(false);
            setClip("Eat", 1f);
        } else if (t < MOUNT_CROUCH_END) {
            setPlayer(player, side.x, groundSide, side.z, true);
            player.speed = 0f;
            player.facing = facingToAnimal(player);
            ch.setCrouch(smooth((t - MOUNT_WALK_END) / (MOUNT_CROUCH_END - MOUNT_WALK_END)));
        } else if (t < MOUNT_END) {
            float s = (t - MOUNT_CROUCH_END) / (MOUNT_END - MOUNT_CROUCH_END);
            Vector3 seat = seatRoot();
            float x = side.x + (seat.x - side.x) * s;
            float z = side.z + (seat.z - side.z) * s;
            float y = groundSide + (seat.y - groundSide) * s + 0.8f * MathUtils.sin(MathUtils.PI * s);
            setPlayer(player, x, y, z, false);
            player.speed = 0f;
            player.facing = m.facing;
            ch.setCrouch(1f - smooth(Math.min(1f, s * 2f)));
        } else {
            Vector3 seat = seatRoot();
            setPlayer(player, seat.x, seat.y, seat.z, true);
            player.speed = 0f;
            player.facing = m.facing;
            ch.setCrouch(0f);
            ch.setSitting(true);
            state = St.MOUNTED;
            cutRope();
        }
    }

    // ---------- Cavalgar ----------

    private void rideUpdate(float dt, float inX, float inY, float camYaw, boolean run, Player player, Character ch) {
        // Mesmo cálculo do personagem (Player): frente e direita da câmera
        float fx = MathUtils.sin(camYaw), fz = MathUtils.cos(camYaw);
        float rx = -fz, rz = fx;
        float mx = inX * rx + inY * fx;
        float mz = inX * rz + inY * fz;
        float mag = (float) Math.sqrt(mx * mx + mz * mz);
        boolean moving = mag > 0.15f;
        if (moving) {
            float target = MathUtils.atan2(mx, mz);
            m.facing += wrapAngle(target - m.facing) * Math.min(1f, dt * 4f);
            boolean galloping = run;   // correr: galope no cavalo, trote rápido no donkey
            float speed = (galloping ? m.runSpeed : m.walkSpeed) * Math.min(1f, mag);
            m.pos.x += MathUtils.sin(m.facing) * speed * dt;
            m.pos.z += MathUtils.cos(m.facing) * speed * dt;
            tmp.set(m.pos.x, 0f, m.pos.z);
            world.resolveCollisionsExcept(tmp, ANIMAL_RADIUS, m);   // não atravessa paredes nem cercas
            m.pos.x = tmp.x;
            m.pos.z = tmp.z;
            if (galloping) setClip("Run", 1f);
            else setClip("Walk", speed / m.walkSpeed);
        } else {
            setClip("Idle", 1f);
        }
        placeAnimal();
        updateReins();
        updateCart();
        Vector3 seat = driving ? cartSeat() : seatRoot();
        setPlayer(player, seat.x, seat.y, seat.z, true);
        player.speed = 0f;
        player.facing = m.facing;
        ch.setSitting(true);
        ch.setCrouch(0f);
    }

    // ---------- Carroça ----------

    private Cart cart;
    private boolean driving = false;   // o cavaleiro está sentado na carroça e conduz o cavalo

    boolean hasCart() { return cart != null; }

    boolean isNear(Vector3 p, float r) { return distTo(p) < r; }

    float distTo(Vector3 p) {
        float dx = p.x - m.pos.x, dz = p.z - m.pos.z;
        return (float) Math.sqrt(dx * dx + dz * dz);
    }

    /** Prende a carroça atrás do cavalo: ela passa a seguir o cavalo. */
    void attachCart(Cart c) {
        cart = c;
        c.attached = true;
        world.obstacles.removeValue(c.obstacle, true);
        updateCart();
    }

    /** Solta a carroça onde ela está (atrás do cavalo). */
    void detachCart() {
        if (cart == null) return;
        cart.attached = false;
        cart.obstacle = new World.Obstacle(cart.pos.x, cart.pos.z, 1.5f, cart.pos.y, 1.8f);
        world.obstacles.add(cart.obstacle);
        cart = null;
    }

    /** Sobe na carroça: o cavaleiro controla o cavalo, que puxa a carroça. */
    void sitCart(Player p) {
        if (cart == null || state != St.FREE) return;
        driving = true;
        state = St.MOUNTED;
    }

    private void dismountCart(Player player, Character ch) {
        driving = false;
        state = St.FREE;
        Vector3 side = tmp2.set(1.8f, 0f, 0f).mul(cart.inst.transform);
        setPlayer(player, side.x, world.heightAt(side.x, side.z), side.z, true);
        player.speed = 0f;
        ch.setSitting(false);
        ch.setCrouch(0f);
    }

    /** Carroça presa: fica 3,4 m atrás do cavalo, com a mesma direção. */
    private void updateCart() {
        if (cart == null) return;
        Vector3 p = tmp2.set(0f, 0f, -3.4f).mul(m.inst.transform);
        float y = world.heightAt(p.x, p.z);
        cart.inst.transform.setToTranslation(p.x, y, p.z).rotate(Vector3.Y, m.facing * MathUtils.radiansToDegrees);
        cart.pos.set(p.x, y, p.z);
    }

    /** Lugar do cavaleiro na carroça (o banco). */
    private Vector3 cartSeat() {
        return new Vector3(0f, 0.9f, 0.2f).mul(cart.inst.transform);
    }

    // ---------- Rédeas ----------

    private static Model reinModel;
    private final ModelInstance[] reins = new ModelInstance[2];
    private final Vector3 rA = new Vector3(), rB = new Vector3(), rD = new Vector3();
    private final Quaternion rQ = new Quaternion();

    /** Duas rédeas do focinho do cavalo até as mãos do cavaleiro (aparecem só montado). */
    private void updateReins() {
        if (reinModel == null) {
            reinModel = new ModelBuilder().createBox(0.03f, 0.03f, 1f,
                    new Material(ColorAttribute.createDiffuse(0.22f, 0.13f, 0.07f, 1f)), Usage.Position | Usage.Normal);
        }
        for (int i = 0; i < 2; i++) {
            if (reins[i] == null) reins[i] = new ModelInstance(reinModel);
            float s = i == 0 ? -1f : 1f;
            rA.set(s * 0.04f, 2.9f, 2.1f).mul(m.inst.transform);            // focinho
            rB.set(s * 0.25f, m.seatY + 0.35f, m.seatZ + 0.45f).mul(m.inst.transform);   // mão
            rD.set(rB).sub(rA);
            float len = rD.len();
            rA.add(rB).scl(0.5f);
            rQ.setFromCross(Vector3.Z, rD);
            reins[i].transform.set(rA, rQ).scale(1f, 1f, Math.max(len, 0.01f));
        }
    }

    private void addReins() {
        updateReins();
        for (ModelInstance r : reins) if (!world.instances.contains(r, true)) world.instances.add(r);
    }

    private void removeReins() {
        for (ModelInstance r : reins) if (r != null) world.instances.removeValue(r, true);
    }

    // ---------- Descer ----------

    private void startDismount(Player player, Character ch) {
        from.set(player.pos);
        t = 0f;
        ch.setSitting(false);
        state = St.DISMOUNTING;
    }

    private void dismountUpdate(float dt, Player player, Character ch) {
        t += dt;
        Vector3 side = sidePoint();
        float s = Math.min(1f, t / DISMOUNT_END);
        float e = smooth(s);
        float x = from.x + (side.x - from.x) * e;
        float z = from.z + (side.z - from.z) * e;
        float y = from.y + (side.y - from.y) * e + 0.6f * MathUtils.sin(MathUtils.PI * e);
        setPlayer(player, x, y, z, s >= 1f);
        player.speed = 0f;
        player.facing = m.facing;
        if (s >= 1f) {
            removeReins();
            state = St.FREE;
            ch.setCrouch(0f);
        }
    }

    // ---------- Auxiliares ----------

    private void setClip(String clip, float speed) {
        if (!clip.equals(clipNow)) {
            clipNow = clip;
            m.anim.animate(clip, -1, 1f, null, 0.2f);
        }
        m.anim.current.speed = speed;
    }

    private void placeAnimal() {
        m.inst.transform.setToTranslation(m.pos.x, world.heightAt(m.pos.x, m.pos.z), m.pos.z)
                .rotate(Vector3.Y, m.facing * MathUtils.radiansToDegrees);
    }

    /** Ponto no chão ao lado do animal (y = altura do chão). */
    private Vector3 sidePoint() {
        Vector3 p = tmp2.set(sideSign * m.sideX, 0f, 0.1f).mul(m.inst.transform);
        p.y = world.heightAt(p.x, p.z);
        return new Vector3(p);
    }

    /** Posição do personagem sentado (origem dos pés, não o quadril). */
    private Vector3 seatRoot() {
        return new Vector3(0f, m.seatY - RIDER_HIP, m.seatZ).mul(m.inst.transform);
    }

    private void setPlayer(Player player, float x, float y, float z, boolean grounded) {
        player.pos.set(x, y, z);
        player.grounded = grounded;
    }

    private float facingToAnimal(Player player) {
        float dx = m.pos.x - player.pos.x, dz = m.pos.z - player.pos.z;
        return MathUtils.atan2(dx, dz);
    }

    private void cutRope() {
        addReins();
        if (!ropeCut && m.rope != null) {
            world.instances.removeValue(m.rope, true);   // o cabresto é solto ao montar
            ropeCut = true;
        }
    }

    private static float smooth(float x) {
        x = MathUtils.clamp(x, 0f, 1f);
        return x * x * (3f - 2f * x);
    }

    private static float wrapAngle(float a) {
        while (a > MathUtils.PI) a -= MathUtils.PI2;
        while (a < -MathUtils.PI) a += MathUtils.PI2;
        return a;
    }
}
