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

    // Dispersão: os 7 primeiros tiros seguidos são de precisão máxima; a partir do 8º ela cresce.
    // Não há recuo: a mira e a câmera nunca são empurradas pelo disparo.
    static final float PRECISE_DEG = 0.15f;   // dispersão mínima (ainda vale a postura e o movimento)
    static final int FREE_SHOTS = 7;          // tiros de precisão máxima
    static final float PAUSE = 0.45f;         // s sem atirar: a sequência recomeça
    private float idleT = 9f;
    private int streak;                       // tiros seguidos até agora
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
        if (idleT > PAUSE) streak = 0;   // parou de atirar: a precisão volta

        flash.update(dt, weapons.armed() ? weapons.muzzle : null, weapons.barrel);
        impacts.update(dt);
    }

    /** Dispersão do PRÓXIMO tiro (graus): a postura e o movimento valem sempre; a sequência só a partir do 8º. */
    float spreadDeg(WeaponConfig c, Input in) {
        float f = 1f + MathUtils.clamp(in.speed / Player.RUN_SPEED, 0f, 1f) * 0.8f;   // correndo: pior
        if (!in.grounded) f *= 2f;
        if (in.prone) f *= 0.55f;          // deitado: muito melhor
        else if (in.crouch) f *= 0.75f;    // agachado: melhor
        if (in.ads) f *= 0.6f;             // mirando: melhor
        float cap = in.ads ? c.spreadAds : c.spreadHip;   // limite de dispersão desta arma
        return f * (PRECISE_DEG + cap * shotCurve(streak + 1));
    }

    /** Quanto da dispersão máxima a arma já tem no tiro n: zero até o 7º; depois sobe devagar até 1. */
    static float shotCurve(int n) {
        if (n <= FREE_SHOTS) return 0f;
        if (n == 8) return 0.08f;
        if (n == 9) return 0.2f;
        if (n == 10) return 0.3f;
        return Math.min(1f, 0.3f + (n - 10) * 0.05f);
    }

    /** Distância do ponto p ao segmento ab (para o assobio de bala que passa perto). */
    static float segDist(Vector3 a, Vector3 b, Vector3 p) {
        float ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
        float len2 = ux * ux + uy * uy + uz * uz;
        float t = len2 < 1e-6f ? 0f : MathUtils.clamp(((p.x - a.x) * ux + (p.y - a.y) * uy + (p.z - a.z) * uz) / len2, 0f, 1f);
        float dx = a.x + ux * t - p.x, dy = a.y + uy * t - p.y, dz = a.z + uz * t - p.z;
        return (float) Math.sqrt(dx * dx + dy * dy + dz * dz);
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
        // Espingarda com projétil próprio (M1014): o tiro pega o alvo da mira com a chance da distância
        // (100% até 3 m, 80% de 3,5 a 6 m, 40% de 6 a 10 m, 0% depois). Se pega, os chumbos ficam juntos no
        // corpo; se erra, caem fora do boneco.
        float pelletD = 1f;
        boolean onTarget = false;
        if (c.separate) {
            hitDetect.shoot(in.cam, in.aim, muzzle, c.range, enemies, world, res);
            pelletD = Math.max(1.5f, res.enemy != null || res.hitWorld ? res.distance : c.range);
            onTarget = res.enemy != null && MathUtils.random() < WeaponConfig.shotgunHitChance(res.distance);
        }
        for (int p = 0; p < c.pellets; p++) {
            if (c.separate) {
                float rr = WeaponConfig.pelletOffsetM(onTarget, pelletD, MathUtils.random());
                float a = MathUtils.random(MathUtils.PI2);
                float tn = rr / pelletD;
                shotDir.set(in.aim).mulAdd(side1, MathUtils.cos(a) * tn).mulAdd(side2, MathUtils.sin(a) * tn).nor();
            } else {
                float r = (float) Math.tan(Math.toRadians(spread * (float) Math.sqrt(MathUtils.random()))), a = MathUtils.random(MathUtils.PI2);
                shotDir.set(in.aim).mulAdd(side1, MathUtils.cos(a) * r).mulAdd(side2, MathUtils.sin(a) * r).nor();
            }
            hitDetect.shoot(in.cam, shotDir, muzzle, c.range, enemies, world, res);
            if (res.obstacle != null) {   // muro: a bala tira vida dele (e mostra o número azul)
                world.damageObstacle(res.obstacle, c.damage, res.point, in.playerPos);
                fx.wallHit(res.point, c.damage);
            }
            if (c.separate) damage.applyPellet(c, res, in.playerPos);
            else damage.register(c, res);
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
        damage.endShot(in.playerPos);   // (no M1014 o dano já foi aplicado projétil a projétil)
        flash.fire(muzzle, weapons.barrel, c);
        audio.fire(c.category, c.pellets > 1);

        streak++;   // mais um tiro da sequência (a dispersão cresce a partir do 8º)
    }

    void dispose() {
        flash.dispose();
        impacts.dispose();
        audio.dispose();
    }
}
