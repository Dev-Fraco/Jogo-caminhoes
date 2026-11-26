package com.exemplo.jogo3d;

import com.badlogic.gdx.graphics.g3d.Environment;
import com.badlogic.gdx.math.MathUtils;
import com.badlogic.gdx.math.Vector3;

/**
 * Disparo da arma na mão, do botão até o dano:
 *  1. Weapons decide se pode atirar (arma na mão, pente, recarga, cadência, modo auto/semi/rajada, sacar).
 *  2. A direção sai da mira (câmera) com a dispersão da postura e do tempo de rajada.
 *  3. HitDetection acha o primeiro obstáculo/inimigo e confere do cano (não atravessa parede).
 *  4. DamageSystem aplica o dano pela região; CombatFx mostra marcador/número/abate.
 *  5. MuzzleFlash (cano), ImpactEffects (material), WeaponAudio (som) e o coice da mira.
 * Recuo: cada tiro empurra a mira para cima (e um pouco para o lado, com tendência constante), crescendo
 * levemente na rajada longa. Parando de atirar, a mira volta em parte; o que o jogador já puxou para baixo
 * com o dedo não volta (previsível e controlável).
 */
final class ShootingSystem {
    /** Estado do jogador/mira neste quadro (reutilizado). */
    static final class Input {
        boolean fireHeld, firePressed, ads, crouch, prone, grounded;
        float speed;               // m/s
        float manualPitch;         // quanto o jogador desceu a mira com o dedo neste quadro (rad, + = para baixo)
        final Vector3 cam = new Vector3(), aim = new Vector3(), playerPos = new Vector3();
    }

    final Weapons weapons;
    final MuzzleFlash flash;
    final ImpactEffects impacts;
    final WeaponAudio audio;
    private final World world;
    private final Enemies enemies;
    private final DamageSystem damage;
    private final CombatFx fx;
    private final HitDetection hitDetect = new HitDetection();
    private final HitDetection.Result res = new HitDetection.Result();
    private final Vector3 shotDir = new Vector3(), side1 = new Vector3(), side2 = new Vector3();

    float bloom;                  // abertura da mira nos tiros seguidos (graus)
    private float pendPitch, pendYaw, accum, idleT = 9f;
    private int streak;
    private float drift = 1f;
    float dPitch, dYaw;           // correção da mira neste quadro: pitch += dPitch (+ = desce), yaw += dYaw
    float camKick;                // empurrão da câmera para trás (m)
    float bodyTilt;               // inclinação do corpo para trás (graus)
    boolean firedThisFrame;
    int shotsFired;               // total (testes)
    float lastSpread;
    /** Só para os testes automáticos: 0 tira o espalhamento aleatório (acerto determinístico). */
    static float spreadScale = 1f;

    ShootingSystem(World world, Weapons weapons, Enemies enemies, DamageSystem damage, CombatFx fx, Environment env) {
        this.world = world;
        this.weapons = weapons;
        this.enemies = enemies;
        this.damage = damage;
        this.fx = fx;
        flash = new MuzzleFlash(env);
        impacts = new ImpactEffects(world);
        audio = new WeaponAudio();
        fx.setImpacts(impacts);
    }

    /** Um quadro. canShoot = armado, em pé no chão, vivo, sem menu aberto etc. */
    void update(float dt, Input in, boolean canShoot) {
        firedThisFrame = false;
        dPitch = 0f;
        dYaw = 0f;
        audio.update(dt);
        weapons.tick(dt);
        int ev = weapons.takeEvents();
        if ((ev & Weapons.EV_EQUIP) != 0) audio.equip();
        if ((ev & Weapons.EV_RELOAD) != 0) audio.reload();
        if ((ev & Weapons.EV_EMPTY) != 0) audio.empty();

        WeaponConfig c = weapons.config();
        if (c != null && canShoot) {
            int r = weapons.tryFire(in.fireHeld, in.firePressed);
            if (r == 1) fireShot(c, in);
            ev = weapons.takeEvents();   // o clique do pente vazio e a recarga automática acontecem dentro do tryFire
            if ((ev & Weapons.EV_EMPTY) != 0) audio.empty();
            if ((ev & Weapons.EV_RELOAD) != 0) audio.reload();
        }
        idleT += dt;
        if (idleT > 0.3f) streak = 0;

        // O coice chega em ~60 ms (a mira sobe)
        float rk = Math.min(1f, dt * 16f);
        float ap = pendPitch * rk, ay = pendYaw * rk;
        pendPitch -= ap;
        pendYaw -= ay;
        dPitch -= ap;
        dYaw += ay;
        // O que o jogador puxou para baixo com o dedo já corrigiu o coice
        if (in.manualPitch > 0f) accum = Math.max(0f, accum - in.manualPitch);
        // Parou de atirar: a mira volta aos poucos (70% do que sobrou do coice)
        if (idleT > 0.15f && accum > 0f) {
            float step = accum * Math.min(1f, dt * 4f);
            accum -= step;
            dPitch += step * 0.7f;
        }
        // A abertura da mira só começa a fechar depois de um instante sem atirar (na rajada ela acumula)
        if (idleT > 0.2f) bloom = Math.max(0f, bloom - dt * 6f);
        camKick -= camKick * Math.min(1f, dt * 12f);
        bodyTilt = Math.min(3f, camKick * 55f);

        flash.update(dt, weapons.armed() ? weapons.muzzle : null, weapons.barrel);
        impacts.update(dt);
    }

    /** Dispersão atual (graus): mira/quadril, andando/correndo, no ar, postura e abertura da rajada. */
    float spreadDeg(WeaponConfig c, Input in) {
        float s = in.ads ? c.spreadAds : c.spreadHip;
        s *= 1f + MathUtils.clamp(in.speed / Player.RUN_SPEED, 0f, 1f) * 0.8f;   // correndo: pior
        if (!in.grounded) s *= 2f;
        if (in.prone) s *= 0.55f;          // deitado: muito melhor
        else if (in.crouch) s *= 0.75f;    // agachado: melhor
        return s + bloom;
    }

    private void fireShot(WeaponConfig c, Input in) {
        firedThisFrame = true;
        shotsFired++;
        idleT = 0f;
        Vector3 muzzle = weapons.muzzle;
        float spread = spreadDeg(c, in);
        lastSpread = spread;
        spread *= spreadScale;
        side1.set(in.aim).crs(Vector3.Y);
        if (side1.len2() < 1e-6f) side1.set(1f, 0f, 0f);
        side1.nor();
        side2.set(side1).crs(in.aim).nor();
        fx.setShotNormal(in.aim);
        damage.beginShot();
        int shownImpacts = 0;
        boolean sounded = false;
        for (int p = 0; p < c.pellets; p++) {
            float r = (float) Math.tan(Math.toRadians(spread * (float) Math.sqrt(MathUtils.random()))), a = MathUtils.random(MathUtils.PI2);
            shotDir.set(in.aim).mulAdd(side1, MathUtils.cos(a) * r).mulAdd(side2, MathUtils.sin(a) * r).nor();
            hitDetect.shoot(in.cam, shotDir, muzzle, c.range, enemies, world, res);
            damage.register(c, res);
            if (p == 0 || c.pellets <= 3 || p % 3 == 0) fx.tracer(muzzle, res.point);
            if (res.hitWorld && shownImpacts < 4) {   // poucos efeitos por disparo (espingarda)
                shownImpacts++;
                impacts.hit(res.surface, res.point, res.normal);
                if (!sounded) {
                    audio.impact(res.surface, res.distance);
                    sounded = true;
                }
            }
        }
        damage.endShot(in.playerPos);
        flash.fire(muzzle, weapons.barrel, c);
        audio.fire(c.category, c.pellets > 1);

        // Coice: sobe a mira (e um pouco de lado, com tendência), cresce na rajada longa
        float kick = in.ads ? 0.7f : 1f;
        if (in.prone) kick *= 0.7f;
        else if (in.crouch) kick *= 0.85f;
        if (streak == 0) drift = MathUtils.randomBoolean() ? 1f : -1f;
        streak = Math.min(streak + 1, 14);
        float up = (float) Math.toRadians(c.recoilPitch) * kick * (1f + 0.035f * streak);
        float side = (float) Math.toRadians(c.recoilYaw) * kick * (0.6f * drift + 0.4f * MathUtils.random(-1f, 1f));
        pendPitch += up;
        accum += up;
        pendYaw += side;
        bloom = Math.min(bloom + c.spreadHip * 0.16f, c.spreadHip * 1.4f);
        camKick = Math.min(0.06f, camKick + c.kick * 0.35f);
    }

    void dispose() {
        flash.dispose();
        impacts.dispose();
        audio.dispose();
    }
}
