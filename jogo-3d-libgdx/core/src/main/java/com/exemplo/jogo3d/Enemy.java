package com.exemplo.jogo3d;

import com.badlogic.gdx.graphics.Color;
import com.badlogic.gdx.graphics.g3d.Material;
import com.badlogic.gdx.graphics.g3d.Model;
import com.badlogic.gdx.graphics.g3d.ModelInstance;
import com.badlogic.gdx.graphics.g3d.attributes.ColorAttribute;
import com.badlogic.gdx.graphics.g3d.model.Node;
import com.badlogic.gdx.graphics.g3d.utils.AnimationController;
import com.badlogic.gdx.math.MathUtils;
import com.badlogic.gdx.math.Vector3;

/**
 * Cangaceiro inimigo: mesmo esqueleto do personagem (as hitboxes seguem as animações), roupa de
 * couro e rifle na mão.
 *
 * Comportamento: patrulha em volta de casa; ao ver o jogador (linha de visão livre), entra em
 * combate alternando correr de lado / avançar / recuar e parar para atirar. Tomando tiro, vira para
 * o atirador. Morto, toca a animação de morte e fica no chão.
 */
final class Enemy {
    enum State { PATROL, COMBAT, DEAD }

    static final float MAX_HEALTH = 100f;
    private static final float WALK = 1.3f, RUN = 4.2f, SIGHT = 60f;
    private static final float RUN_CLIP_SPEED = 5.5f, WALK_CLIP_SPEED = 1.8f;

    private static final Color[] SHIRTS = {new Color(0.42f, 0.27f, 0.14f, 1f), new Color(0.75f, 0.70f, 0.60f, 1f),
            new Color(0.55f, 0.25f, 0.18f, 1f), new Color(0.35f, 0.45f, 0.55f, 1f), new Color(0.45f, 0.50f, 0.32f, 1f),
            new Color(0.25f, 0.22f, 0.20f, 1f), new Color(0.80f, 0.62f, 0.30f, 1f)};
    private static final Color[] PANTS = {new Color(0.55f, 0.48f, 0.33f, 1f), new Color(0.30f, 0.25f, 0.20f, 1f),
            new Color(0.35f, 0.42f, 0.58f, 1f), new Color(0.50f, 0.42f, 0.30f, 1f), new Color(0.22f, 0.22f, 0.24f, 1f)};
    private static final Color[] HAIR = {new Color(0.10f, 0.07f, 0.05f, 1f), new Color(0.30f, 0.20f, 0.12f, 1f),
            new Color(0.55f, 0.40f, 0.22f, 1f), new Color(0.65f, 0.63f, 0.60f, 1f)};

    final ModelInstance inst;
    final ModelInstance gun;
    private final AnimationController anim;
    final Hitbox hitbox;
    private final Node hand;
    final Vector3 pos = new Vector3(), home = new Vector3(), vel = new Vector3();
    float facing;
    float health = MAX_HEALTH;
    State state = State.PATROL;
    float deadT;
    private String clip = "";
    private final Vector3 goal = new Vector3(), tmp = new Vector3(), eye = new Vector3();
    private float waitT, phaseT, lookT, lostT, fireT;
    private boolean shooting;
    private float animAcc;
    private int side = 1;
    boolean canSee;
    // Alvo: outro bot ou o jogador. Sem alvo à vista, vai ao último lugar conhecido (não sabe onde o jogador está).
    Enemy targetEnemy;
    boolean targetPlayer;
    final Vector3 lastKnown = new Vector3(), tgt = new Vector3();
    boolean hasLast;
    int botKills;
    final Vector3 muzzle = new Vector3();
    boolean visibleToCam;   // dentro da distância de desenho (para não animar longe)

    Enemy(Model body, Model gunModel, float x, float z, float seed) {
        inst = new ModelInstance(body);
        anim = new AnimationController(inst);
        hitbox = new Hitbox(inst);
        hand = inst.getNode("RightHand", true);
        gun = gunModel != null ? new ModelInstance(gunModel) : null;
        pos.set(x, 0f, z);
        home.set(x, 0f, z);
        facing = seed * MathUtils.PI2;
        // Roupa de couro e cáqui, cabelo escuro
        int k = (int) (seed * 997f) % SHIRTS.length;
        tint("mat21", SHIRTS[k]);
        tint("mat17", PANTS[(k + 2) % PANTS.length]);
        tint("mat18", PANTS[(k + 2) % PANTS.length].cpy().mul(0.8f, 0.8f, 0.8f, 1f));
        tint("mat19", HAIR[k % HAIR.length]);
        tint("mat20", HAIR[k % HAIR.length]);
        setClip("Idle", 1f);
        waitT = 1f + seed * 3f;
    }

    private void tint(String id, Color c) {
        Material m = inst.getMaterial(id);
        if (m != null) m.set(ColorAttribute.createDiffuse(c));
    }

    boolean alive() { return state != State.DEAD; }

    /**
     * Um passo do comportamento. Devolve true se disparou neste quadro (o Enemies decide se acertou).
     */
    boolean update(float dt, World w, Enemies all, Vector3 player, boolean playerAlive) {
        if (state == State.DEAD) {
            deadT += dt;
            if (visibleToCam) anim.update(dt);
            placeGun();
            return false;
        }
        if (targetEnemy != null && !targetEnemy.alive()) { targetEnemy = null; canSee = false; }
        if (targetPlayer && !playerAlive) { targetPlayer = false; canSee = false; }
        boolean haveTarget = targetEnemy != null || targetPlayer;
        if (targetEnemy != null) tgt.set(targetEnemy.pos);
        else if (targetPlayer) tgt.set(player);

        // Visão: algumas vezes por segundo (raio custa). Mantém o alvo atual se ainda o vê; senão procura
        // entre os 3 mais próximos (outros bots e o jogador), na frente ou muito perto.
        lookT -= dt;
        if (lookT <= 0f) {
            lookT = 0.25f + MathUtils.random(0.1f);
            canSee = false;
            eye.set(pos).add(0f, 1.6f, 0f);
            if (haveTarget) canSee = see(w, tgt);
            if (!canSee) {
                float prev = -1f;
                for (int round = 0; round < 3 && !canSee; round++) {
                    float bd = Float.MAX_VALUE;
                    Enemy be = null;
                    boolean bp = false;
                    if (playerAlive) {
                        float d = (float) Math.hypot(player.x - pos.x, player.z - pos.z);
                        if (d > prev && d < SIGHT && d < bd) { bd = d; bp = true; }
                    }
                    for (int i = 0; i < all.list.size; i++) {
                        Enemy o = all.list.get(i);
                        if (o == this || !o.alive()) continue;
                        float d = (float) Math.hypot(o.pos.x - pos.x, o.pos.z - pos.z);
                        if (d > prev && d < SIGHT && d < bd) { bd = d; be = o; bp = false; }
                    }
                    if (bd == Float.MAX_VALUE) break;
                    prev = bd;
                    Vector3 at = bp ? player : be.pos;
                    float ahead = MathUtils.cos(wrap(MathUtils.atan2(at.x - pos.x, at.z - pos.z) - facing));
                    if ((bd < 14f || ahead > 0.2f || state == State.COMBAT) && see(w, at)) {
                        canSee = true;
                        targetEnemy = bp ? null : be;
                        targetPlayer = bp;
                        tgt.set(at);
                    }
                }
            }
        }
        haveTarget = targetEnemy != null || targetPlayer;
        if (canSee && haveTarget) {
            if (state != State.COMBAT) { phaseT = 0f; shooting = false; fireT = 0.6f + MathUtils.random(0.6f); }
            state = State.COMBAT;
            lostT = 0f;
            lastKnown.set(tgt);
            hasLast = true;
        } else if (state == State.COMBAT) {
            lostT += dt;
            if (lostT > 10f || !hasLast) {
                state = State.PATROL;
                targetEnemy = null;
                targetPlayer = false;
                hasLast = false;
                waitT = 1f;
            }
        }
        Vector3 aim = canSee && haveTarget ? tgt : lastKnown;
        float dx = aim.x - pos.x, dz = aim.z - pos.z;
        float dist = (float) Math.sqrt(dx * dx + dz * dz);
        float toPlayer = MathUtils.atan2(dx, dz);   // (direção do alvo)

        boolean fired = false;
        float speed = 0f;
        float moveDir = facing;
        if (state == State.PATROL) {
            if (waitT > 0f) {
                waitT -= dt;
                setClip("IdleLook", 1f);
                if (waitT <= 0f) {
                    float a = MathUtils.random(MathUtils.PI2), r = MathUtils.random(5f, 22f);
                    goal.set(home.x + MathUtils.cos(a) * r, 0f, home.z + MathUtils.sin(a) * r);
                }
            } else {
                float gx = goal.x - pos.x, gz = goal.z - pos.z, gd = (float) Math.sqrt(gx * gx + gz * gz);
                if (gd < 0.5f) waitT = MathUtils.random(2f, 5f);
                else { moveDir = MathUtils.atan2(gx, gz); speed = WALK; }
            }
        } else {
            // Combate: anda (lado, frente, trás) e para para atirar
            phaseT -= dt;
            if (phaseT <= 0f) {
                shooting = !shooting && canSee;
                phaseT = shooting ? MathUtils.random(1.4f, 2.8f) : MathUtils.random(1.0f, 2.2f);
                if (!shooting && MathUtils.randomBoolean(0.6f)) side = -side;
            }
            if (shooting) {
                facing += wrap(toPlayer - facing) * Math.min(1f, dt * 8f);
                setClip("Mirar", 1f);
                fireT -= dt;
                if (fireT <= 0f && canSee) {
                    fireT = WeaponConfig.RIFLE_INIMIGO.fireInterval + MathUtils.random(0.25f, 0.8f);
                    fired = true;
                }
            } else {
                if (!canSee && dist < 2.5f) {                                  // chegou e não achou ninguém: olha em volta
                    setClip("IdleLook", 1f);
                    lostT += dt * 2f;
                    speed = 0f;
                } else if (dist > 28f || !canSee) { moveDir = toPlayer; speed = RUN; }   // avança
                else if (dist < 9f) { moveDir = toPlayer + MathUtils.PI + side * 0.5f; speed = RUN; }   // recua
                else { moveDir = toPlayer + side * MathUtils.HALF_PI; speed = RUN; }                   // corre de lado
            }
        }
        if (speed > 0f) {
            facing += wrap(moveDir - facing) * Math.min(1f, dt * 7f);
            float px = pos.x, pz = pos.z;
            pos.x += MathUtils.sin(moveDir) * speed * dt;
            pos.z += MathUtils.cos(moveDir) * speed * dt;
            pos.x = MathUtils.clamp(pos.x, -World.HALF + 3f, World.HALF - 3f);
            pos.z = MathUtils.clamp(pos.z, -World.HALF + 3f, World.HALF - 3f);
            w.resolveCollisions(pos, 0.35f);
            // preso numa parede: troca de lado / desiste do ponto
            float moved = (float) Math.hypot(pos.x - px, pos.z - pz);
            if (moved < speed * dt * 0.3f) { side = -side; if (state == State.PATROL) waitT = 1f; }
            vel.set((pos.x - px) / dt, 0f, (pos.z - pz) / dt);
            setClip(speed > 2f ? "Run" : "Walk", speed > 2f ? speed / RUN_CLIP_SPEED : speed / WALK_CLIP_SPEED);
        } else {
            vel.setZero();
        }
        pos.y = w.groundAt(pos.x, pos.z);
        inst.transform.setToTranslation(pos).rotate(Vector3.Y, facing * MathUtils.radiansToDegrees);
        // longe da câmera: anima em passos maiores (economia); a pose continua válida para as hitboxes
        animAcc += dt;
        if (visibleToCam || animAcc > 0.2f) {
            anim.update(animAcc);
            animAcc = 0f;
        }
        placeGun();
        return fired;
    }

    private void placeGun() {
        if (gun == null || hand == null) return;
        tmp.set(0f, 0f, 0f).mul(hand.globalTransform).mul(inst.transform);
        float down = state == State.DEAD ? 70f : (clip.equals("Mirar") ? 4f : 28f);
        gun.transform.setToTranslation(tmp).rotate(Vector3.Y, facing * MathUtils.radiansToDegrees).rotate(Vector3.X, down);
        muzzle.set(tmp).add(MathUtils.sin(facing) * 0.62f, 0.05f, MathUtils.cos(facing) * 0.62f);
    }

    /** Linha de visão até o alvo (peito). */
    private boolean see(World w, Vector3 at) {
        tmp.set(at).add(0f, 1.2f, 0f);
        return w.lineOfSight(eye, tmp);
    }

    /** Ouviu um tiro vindo de "at": vai até lá procurar (não sabe quem é). */
    void hear(Vector3 at) {
        if (state == State.DEAD) return;
        if (state != State.COMBAT) { phaseT = 0f; shooting = false; fireT = 0.8f; }
        state = State.COMBAT;
        lostT = -2f;
        lastKnown.set(at);
        hasLast = true;
    }

    /** Levou tiro de outro bot: passa a reagir contra ele. */
    void retaliate(Enemy shooter) {
        if (state == State.DEAD) return;
        if (!canSee || targetEnemy == null) {
            targetEnemy = shooter;
            targetPlayer = false;
            lastKnown.set(shooter.pos);
            hasLast = true;
            canSee = false;
            lookT = 0f;
        }
        hear(shooter.pos);
    }

    /** Leva dano; devolve true se morreu agora. */
    boolean damage(float amount, Vector3 from) {
        if (state == State.DEAD) return false;
        health -= amount;
        // virou alvo: entra em combate e encara o atirador
        state = State.COMBAT;
        lostT = 0f;
        if (from != null) {
            facing = MathUtils.atan2(from.x - pos.x, from.z - pos.z);
            lastKnown.set(from);
            hasLast = true;
            lookT = 0f;
        }
        if (health <= 0f) {
            health = 0f;
            state = State.DEAD;
            deadT = 0f;
            clip = "Dying";
            anim.animate("Dying", 1, 1f, null, 0.12f);
            return true;
        }
        return false;
    }

    private void setClip(String c, float sp) {
        if (!c.equals(clip)) {
            clip = c;
            anim.animate(c, -1, 1f, null, 0.2f);
        }
        if (anim.current != null) anim.current.speed = sp;
    }

    /** Força uma animação (usado nos testes de hitbox: pular, agachar, deitar). */
    void forceClip(String c) {
        clip = c;
        anim.animate(c, -1, 1f, null, 0f);
    }

    /** Toca uma animação uma vez e para na última pose (testes: deitar, morrer). */
    void forceOnce(String c) {
        clip = c;
        anim.animate(c, 1, 1f, null, 0f);
    }

    void pose(float dt) {
        inst.transform.setToTranslation(pos).rotate(Vector3.Y, facing * MathUtils.radiansToDegrees);
        anim.update(dt);
    }

    private static float wrap(float a) {
        while (a > MathUtils.PI) a -= MathUtils.PI2;
        while (a < -MathUtils.PI) a += MathUtils.PI2;
        return a;
    }
}
