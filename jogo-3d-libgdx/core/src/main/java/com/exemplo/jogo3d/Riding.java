package com.exemplo.jogo3d;

import com.badlogic.gdx.graphics.g3d.ModelInstance;
import com.badlogic.gdx.graphics.g3d.utils.AnimationController;
import com.badlogic.gdx.math.MathUtils;
import com.badlogic.gdx.math.Matrix4;
import com.badlogic.gdx.math.Vector3;

/**
 * Montaria no donkey.
 *
 * Sequência de montar: anda até o lado do donkey, agacha, pula e senta sobre o lombo.
 * Montado: o joystick guia o donkey (andando, o personagem vai junto sentado).
 * Pular enquanto montado desce do lado. O donkey desamarrado pode ser montado de novo.
 *
 * Coordenadas do donkey: a cabeça aponta para +z; o lombo fica em y ≈ 1,2 m.
 */
public class Riding {

    static final float MOUNT_WALK_END = 0.9f;
    static final float MOUNT_CROUCH_END = 1.4f;
    static final float MOUNT_END = 2.2f;
    static final float DISMOUNT_END = 1.0f;
    static final float MOUNT_RANGE = 2.2f;
    static final float WALK_SPEED = 1.4f;
    static final float RUN_SPEED = 2.6f;
    static final float DONKEY_RADIUS = 0.7f;

    static final float SEAT_Y = 1.22f;     // lombo, no modelo do donkey
    static final float SEAT_Z = 0.1f;
    static final float SIDE_X = 0.75f;     // ponto ao lado do donkey, para subir
    static final float SIDE_Z = 0.1f;
    static final float RIDER_HIP = 0.9f;   // quadril do personagem sentado, abaixo do lombo

    private enum St { FREE, MOUNTING, MOUNTED, DISMOUNTING }

    private final World world;
    private final ModelInstance donkey;
    private final AnimationController donkeyAnim;
    private final ModelInstance rope;     // pode ser null
    private final Vector3 donkeyPos = new Vector3();
    private float donkeyFacing;           // radianos
    private final Matrix4 inv = new Matrix4();
    private final Vector3 from = new Vector3();
    private final Vector3 tmp = new Vector3();
    private final Vector3 tmp2 = new Vector3();
    private St state = St.FREE;
    private float t = 0f;
    private float sideSign = 1f;
    private String donkeyClip = "";
    private boolean ropeCut = false;

    Riding(World world) {
        this.world = world;
        this.donkey = world.getDonkey();
        this.donkeyAnim = world.getDonkeyAnim();
        this.rope = world.getRope();
        donkeyPos.set(world.getDonkeyStart());
        donkeyFacing = world.getDonkeyStartFacingDeg() * MathUtils.degreesToRadians;
        placeDonkey();
    }

    boolean isMounted() { return state == St.MOUNTED; }
    boolean isBusy() { return state == St.MOUNTING || state == St.DISMOUNTING; }

    /** Pode montar agora: perto do donkey e livre. */
    boolean canMount(Vector3 p) {
        if (donkey == null || state != St.FREE) return false;
        float dx = p.x - donkeyPos.x, dz = p.z - donkeyPos.z;
        return dx * dx + dz * dz < MOUNT_RANGE * MOUNT_RANGE;
    }

    /** Começa a subir no donkey, pelo lado em que o personagem está. */
    void startMount(Player player) {
        if (state != St.FREE) return;
        from.set(player.pos);
        inv.set(donkey.transform).inv();
        Vector3 local = tmp.set(player.pos).mul(inv);
        sideSign = local.x >= 0f ? 1f : -1f;
        t = 0f;
        state = St.MOUNTING;
    }

    /**
     * Atualiza a montaria. Chame todo quadro, mesmo quando não está montado (o donkey
     * continua com a animação dele). Quando isMounted() ou isBusy(), não use player.update.
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
                if (jumpPressed) {
                    startDismount(player, ch);
                } else {
                    rideUpdate(dt, inX, inY, camYaw, run, player, ch);
                }
                break;
            case DISMOUNTING:
                dismountUpdate(dt, player, ch);
                break;
        }
        donkeyAnim.update(dt);
    }

    // ---------- Montar ----------

    private void mountUpdate(float dt, Player player, Character ch) {
        t += dt;
        Vector3 side = sidePoint();
        float groundSide = side.y;
        if (t < MOUNT_WALK_END) {
            // Anda até o lado do donkey
            float s = smooth(t / MOUNT_WALK_END);
            tmp.set(from).lerp(side, s);
            tmp.y = world.heightAt(tmp.x, tmp.z);
            setPlayer(player, tmp.x, tmp.y, tmp.z, true);
            player.speed = 1.6f;
            playerFacingToDonkey(player);
            ch.setCrouch(0f);
            ch.setSitting(false);
            setDonkeyClip("Eat");
        } else if (t < MOUNT_CROUCH_END) {
            // Agacha ao lado do donkey
            setPlayer(player, side.x, groundSide, side.z, true);
            player.speed = 0f;
            playerFacingToDonkey(player);
            ch.setCrouch(smooth((t - MOUNT_WALK_END) / (MOUNT_CROUCH_END - MOUNT_WALK_END)));
        } else if (t < MOUNT_END) {
            // Pula para cima do lombo
            float s = (t - MOUNT_CROUCH_END) / (MOUNT_END - MOUNT_CROUCH_END);
            Vector3 seat = seatRoot();
            float x = side.x + (seat.x - side.x) * s;
            float z = side.z + (seat.z - side.z) * s;
            float y = groundSide + (seat.y - groundSide) * s + 0.8f * MathUtils.sin(MathUtils.PI * s);
            setPlayer(player, x, y, z, false);
            player.speed = 0f;
            player.facing = donkeyFacing;
            ch.setCrouch(1f - smooth(Math.min(1f, s * 2f)));
        } else {
            // Sentado
            Vector3 seat = seatRoot();
            setPlayer(player, seat.x, seat.y, seat.z, true);
            player.speed = 0f;
            player.facing = donkeyFacing;
            ch.setCrouch(0f);
            ch.setSitting(true);
            state = St.MOUNTED;
            cutRope();
        }
    }

    // ---------- Cavalgar ----------

    private void rideUpdate(float dt, float inX, float inY, float camYaw, boolean run, Player player, Character ch) {
        // Direção do joystick em relação à câmera
        float fx = MathUtils.sin(camYaw), fz = MathUtils.cos(camYaw);
        float rx = fz, rz = -fx;
        float mx = inX * rx + inY * fx;
        float mz = inX * rz + inY * fz;
        float mag = (float) Math.sqrt(mx * mx + mz * mz);
        boolean moving = mag > 0.15f;
        if (moving) {
            float target = MathUtils.atan2(mx, mz);
            donkeyFacing += wrapAngle(target - donkeyFacing) * Math.min(1f, dt * 4f);
            float speed = (run ? RUN_SPEED : WALK_SPEED) * Math.min(1f, mag);
            donkeyPos.x += MathUtils.sin(donkeyFacing) * speed * dt;
            donkeyPos.z += MathUtils.cos(donkeyFacing) * speed * dt;
            tmp.set(donkeyPos.x, 0f, donkeyPos.z);
            world.resolveCollisions(tmp, DONKEY_RADIUS);   // o donkey não atravessa paredes nem cercas
            donkeyPos.x = tmp.x;
            donkeyPos.z = tmp.z;
            donkeyAnimSpeed = speed / WALK_SPEED;
            setDonkeyClip("Walk");
        } else {
            setDonkeyClip("Idle");
        }
        placeDonkey();
        Vector3 seat = seatRoot();
        setPlayer(player, seat.x, seat.y, seat.z, true);
        player.speed = 0f;
        player.facing = donkeyFacing;
        ch.setSitting(true);
        ch.setCrouch(0f);
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
        player.facing = donkeyFacing;
        if (s >= 1f) {
            state = St.FREE;
            ch.setCrouch(0f);
        }
    }

    // ---------- Auxiliares ----------

    private float donkeyAnimSpeed = 1f;

    private void setDonkeyClip(String clip) {
        if (!clip.equals(donkeyClip)) {
            donkeyClip = clip;
            donkeyAnim.animate(clip, -1, 1f, null, 0.2f);
        }
        donkeyAnim.current.speed = clip.equals("Walk") ? donkeyAnimSpeed : 1f;
    }

    private void placeDonkey() {
        donkey.transform.setToTranslation(donkeyPos.x, world.heightAt(donkeyPos.x, donkeyPos.z), donkeyPos.z)
                .rotate(Vector3.Y, donkeyFacing * MathUtils.radiansToDegrees);
    }

    /** Ponto no chão ao lado do donkey (y = altura do chão). */
    private Vector3 sidePoint() {
        Vector3 p = tmp2.set(sideSign * SIDE_X, 0f, SIDE_Z).mul(donkey.transform);
        p.y = world.heightAt(p.x, p.z);
        return new Vector3(p);
    }

    /** Posição do personagem sentado (pés, não quadril). */
    private Vector3 seatRoot() {
        Vector3 p = new Vector3(0f, SEAT_Y - RIDER_HIP, SEAT_Z).mul(donkey.transform);
        return p;
    }

    private void setPlayer(Player player, float x, float y, float z, boolean grounded) {
        player.pos.set(x, y, z);
        player.grounded = grounded;
    }

    private void playerFacingToDonkey(Player player) {
        float dx = donkeyPos.x - player.pos.x, dz = donkeyPos.z - player.pos.z;
        player.facing = MathUtils.atan2(dx, dz);
    }

    private void cutRope() {
        if (!ropeCut && rope != null) {
            world.instances.removeValue(rope, true);   // o cabresto é solto ao montar
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
