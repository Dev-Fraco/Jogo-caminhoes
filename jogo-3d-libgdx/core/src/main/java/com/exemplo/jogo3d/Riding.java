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

    Riding(World world, Mount m) {
        this.world = world;
        this.m = m;
        placeAnimal();
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
        updateCart(dt);
        if (reinsOn) updateReins(dt, ch);
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
            boolean galloping = run || cart != null;   // galopa correndo ou puxando a carroça
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
        if (driving && !posed) {
            // Entrando na carroça: animação de sentar toca uma vez, depois fica na pose de arreios
            posed = true;
            ch.playOnce("StandToSit");
            addReins();
        } else if (driving && !seated && ch.onceFinished()) {
            seated = true;
            ch.playOnce("SentadoArreios");
        }
        Vector3 seat = driving ? cartSeat() : seatRoot();
        setPlayer(player, seat.x, seat.y, seat.z, true);
        player.speed = 0f;
        player.facing = m.facing;
        ch.setSitting(!driving);
        ch.setCrouch(0f);
    }

    // ---------- Carroça ----------

    private Cart cart;
    private boolean driving = false;   // o cavaleiro está sentado na carroça e conduz o cavalo
    private boolean posed = false;     // animação de sentar começou
    private boolean seated = false;    // sentou: pose de arreios parada

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
        c.beginTow(world);
    }

    /** Solta a carroça onde ela está (atrás do cavalo). */
    void detachCart() {
        if (cart == null) return;
        cart.attached = false;
        cart.setRest(world, cart.ax, cart.az, cart.yaw);   // as varas descem até o chão
        cart.obstacle = new World.Obstacle(cart.ax, cart.az, 1.9f, cart.pos.y, 2.2f);
        world.obstacles.add(cart.obstacle);
        cart = null;
    }

    /** Sobe na carroça: o cavaleiro controla o cavalo, que puxa a carroça. */
    void sitCart(Player p) {
        if (cart == null || state != St.FREE) return;
        driving = true;
        state = St.MOUNTED;
    }

    private boolean cartExit = false;   // saindo da carroça: animação de pular para fora

    private void dismountCart(Player player, Character ch) {
        driving = false;
        posed = false;
        seated = false;
        removeReins();
        Vector3 side = tmp2.set(1.8f, 0f, 0f).mul(cart.inst.transform);
        setPlayer(player, side.x, world.heightAt(side.x, side.z), side.z, true);
        player.speed = 0f;
        ch.setSitting(false);
        ch.setCrouch(0f);
        ch.playOnce("SairCarroca");
        cartExit = true;
        state = St.DISMOUNTING;
    }

    // Engate: ponta das varas presa ao cavalo, dos lados do corpo, na altura da barrigueira
    static final float HITCH_Y = 1.05f, HITCH_Z = -0.2f;   // altura em que a caixa fica nivelada
    private final Vector3 hitch = new Vector3();

    /** Carroça presa: física de reboque, rodas e amortecedor (ver Cart). */
    private void updateCart(float dt) {
        if (cart == null) return;
        hitch.set(0f, HITCH_Y, HITCH_Z).mul(m.inst.transform);
        cart.tow(dt, hitch, world, m);
    }

    /** Lugar do cavaleiro na carroça (o banco). */
    private Vector3 cartSeat() {
        return new Vector3(0f, 1.2f, 0.1f).mul(cart.inst.transform);   // no banco, não no assoalho
    }

    // ---------- Rédeas (corda com física) ----------

    private static Model reinModel;
    private Rope[] reins;
    private boolean reinsOn = false;
    private final Vector3 rHead = new Vector3(), rMuzzle = new Vector3(), rHand = new Vector3();

    private void addReins() {
        if (reinModel == null) {
            reinModel = new ModelBuilder().createBox(0.022f, 0.022f, 1f,
                    new Material(ColorAttribute.createDiffuse(0.20f, 0.12f, 0.06f, 1f)), Usage.Position | Usage.Normal);
        }
        if (reins == null) reins = new Rope[]{new Rope(reinModel, 12), new Rope(reinModel, 12)};
        for (Rope rp : reins) rp.addTo(world.instances);
        reinsOn = true;
    }

    private void removeReins() {
        if (reins != null) for (Rope rp : reins) rp.removeFrom(world.instances);
        reinsOn = false;
    }

    /** Rédeas: do focinho do cavalo (osso da cabeça) até as mãos do personagem (ossos das mãos). */
    private void updateReins(float dt, Character ch) {
        com.badlogic.gdx.graphics.g3d.model.Node head = m.inst.getNode("Head");
        float fx = MathUtils.sin(m.facing), fz = MathUtils.cos(m.facing);
        float rx = fz, rz = -fx;
        for (int i = 0; i < 2; i++) {
            float side = i == 0 ? -1f : 1f;
            if (head != null) rHead.set(0f, 0f, 0f).mul(head.globalTransform).mul(m.inst.transform);
            else rHead.set(0f, 2.9f, 1.7f).mul(m.inst.transform);
            rMuzzle.set(rHead).add(fx * 0.42f + rx * 0.07f * side, -0.22f, fz * 0.42f + rz * 0.07f * side);
            ch.handWorld(i == 0, rHand);
            reins[i].update(dt, rMuzzle, rHand);
        }
    }

    // ---------- Descer ----------

    private void startDismount(Player player, Character ch) {
        from.set(player.pos);
        t = 0f;
        ch.setSitting(false);
        state = St.DISMOUNTING;
    }

    private void dismountUpdate(float dt, Player player, Character ch) {
        if (cartExit) {
            // Saindo da carroça: espera a animação de pular para fora terminar
            if (ch.onceFinished()) {
                cartExit = false;
                state = St.FREE;
                ch.endOnce();
            }
            return;
        }
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
