package com.exemplo.jogo3d;

import com.badlogic.gdx.ApplicationAdapter;
import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.backends.headless.HeadlessApplication;
import com.badlogic.gdx.backends.headless.HeadlessApplicationConfiguration;
import com.badlogic.gdx.graphics.GL20;
import com.badlogic.gdx.graphics.g3d.Model;
import com.badlogic.gdx.graphics.g3d.loader.G3dModelLoader;
import com.badlogic.gdx.math.MathUtils;
import com.badlogic.gdx.math.Vector3;
import com.badlogic.gdx.utils.JsonReader;

import java.lang.reflect.Proxy;

/** Testes do sistema de mira, hitbox e dano com o mundo e o esqueleto reais (sem tela). */
public class AimTests extends ApplicationAdapter {
    static int pass = 0, fail = 0;
    World w;
    Model jake;
    Enemies en;
    final Vector3 cam = new Vector3();
    float yaw, pitch;

    static void check(String name, boolean ok, String info) {
        System.out.println((ok ? "  OK   " : "  FALHA") + "  " + name + (info.isEmpty() ? "" : "  [" + info + "]"));
        if (ok) pass++; else fail++;
    }

    Vector3 dir() {
        float e = -pitch;
        return new Vector3(MathUtils.sin(yaw) * MathUtils.cos(e), MathUtils.sin(e), MathUtils.cos(yaw) * MathUtils.cos(e));
    }

    void aimAt(Vector3 p) {
        Vector3 v = new Vector3(p).sub(cam);
        yaw = MathUtils.atan2(v.x, v.z);
        pitch = -MathUtils.atan2(v.y, (float) Math.sqrt(v.x * v.x + v.z * v.z));
    }

    Enemy spawn(float x, float z, float facing, String clip) {
        Enemy e = new Enemy(jake, null, x, z, 0.3f);
        e.pos.y = w.groundAt(x, z);
        e.facing = facing;
        e.forceClip(clip);
        for (int i = 0; i < 40; i++) e.pose(1f / 30f);   // assenta a pose
        en.list.add(e);
        en.nextFrame();
        e.hitbox.update(en.frame());
        return e;
    }

    /** Ponto plano e aberto (sem obstáculos) para os testes. */
    float[] openArea() {
        java.util.Random r = new java.util.Random(7);
        // varredura em grade de 25 m por todo o mapa (o mapa é grande: lugar plano é raro)
        for (int t = 0; t < 41 * 41; t++) {
            float[] p = {-500f + (t % 41) * 25f, -500f + (t / 41) * 25f};
            boolean ok = true;
            for (float dx = -25; dx <= 25 && ok; dx += 5)
                for (float dz = -25; dz <= 25 && ok; dz += 5)
                    if (Math.abs(w.heightAt(p[0] + dx, p[1] + dz) - w.heightAt(p[0], p[1])) > 0.6f) ok = false;
            if (!ok) continue;
            Vector3 o = new Vector3(p[0], w.heightAt(p[0], p[1]) + 1.6f, p[1]);
            boolean clear = true;
            for (int a = 0; a < 16 && clear; a++) {
                Vector3 d = new Vector3(MathUtils.cosDeg(a * 22.5f), 0f, MathUtils.sinDeg(a * 22.5f));
                if (w.raycast(o, d, 30f) < 30f) clear = false;
            }
            if (clear) return p;
        }
        return w.openSpot(r);
    }

    HitDetection.Result shootAt(Vector3 target, WeaponConfig cfg) {
        aimAt(target);
        Vector3 d = dir();
        Vector3 muzzle = new Vector3(cam).mulAdd(d, 2.6f);   // cano ~2,6 m à frente da câmera (ombro)
        HitDetection.Result r = new HitDetection.Result();
        new HitDetection().shoot(cam, d, muzzle, cfg.range, en, w, r);
        return r;
    }

    @Override
    public void create() {
        Gdx.gl = Gdx.gl20 = (GL20) Proxy.newProxyInstance(GL20.class.getClassLoader(), new Class[]{GL20.class}, (p, m, a) -> {
            Class<?> t = m.getReturnType();
            if (t == int.class) return 1;
            if (t == boolean.class) return true;
            if (t == float.class) return 0f;
            if (t == String.class) return "";
            return null;
        });
        try {
            run();
        } catch (Throwable t) {
            t.printStackTrace();
            fail++;
        }
        System.out.println("\nRESULTADO: " + pass + " ok, " + fail + " falhas");
        Gdx.app.exit();
        System.exit(fail == 0 ? 0 : 1);
    }

    void run() {
        w = new World();
        w.create();
        jake = ModelIO.load("models/jake/jake.g3dj");
        en = new Enemies(w, jake, null);
        en.list.clear();
        float[] A = openArea();
        float ax = A[0], az = A[1];
        float gy = w.heightAt(ax, az);
        cam.set(ax, gy + 1.7f, az - 12f);
        WeaponConfig akm = WeaponConfig.AKM;

        System.out.println("== 1/9/10/11. Inimigo parado de frente: cabeça, tronco, braço e perna ==");
        Enemy e = spawn(ax, az, MathUtils.PI, "Idle");   // de frente para a câmera
        Hitbox hb = e.hitbox;
        HitDetection.Result r = shootAt(hb.headCenter, akm);
        check("tiro na cabeça → CABEÇA", r.enemy == e && r.region == WeaponConfig.Region.HEAD, "" + r.region);
        float dHead = akm.damageAt(r.region == null ? WeaponConfig.Region.TORSO : r.region, r.distance);
        check("AKM: 30 no corpo vira 72 na cabeça de perto (×2, +20% de perto)", Math.abs(dHead - 72f) < 0.01f, "dano " + dHead);
        r = shootAt(hb.chest, akm);
        check("tiro no peito → TRONCO", r.enemy == e && r.region == WeaponConfig.Region.TORSO, "" + r.region);
        Vector3 thigh = new Vector3(hb.a[8]).lerp(hb.b[8], 0.5f);
        r = shootAt(thigh, akm);
        check("tiro na coxa → PERNA (0,75×)", r.enemy == e && r.region == WeaponConfig.Region.LEG,
                r.region + " dano " + (r.region == null ? 0 : akm.damageAt(r.region, r.distance)));
        // braço: mira de lado para não pegar o tronco atrás
        Vector3 arm = new Vector3(hb.a[5]).lerp(hb.b[5], 0.5f);
        Vector3 camSave = new Vector3(cam);
        cam.set(arm.x - 8f, arm.y, arm.z);
        if (arm.x < e.pos.x) cam.x = arm.x - 8f; else cam.x = arm.x + 8f;
        r = shootAt(arm, akm);
        check("tiro no braço (de lado) → BRAÇO", r.enemy == e && r.region == WeaponConfig.Region.ARM, "" + r.region);
        cam.set(camSave);
        // um tiro = um dano (sobreposição de cápsulas no pescoço)
        DamageSystem ds = new DamageSystem(null);
        ds.beginShot();
        r = shootAt(new Vector3(hb.a[3]).lerp(hb.b[3], 0.5f), akm);
        ds.register(akm, r);
        ds.register(akm, r);   // o mesmo resultado registrado 2× continua um inimigo só
        float before = e.health;
        ds.endShot(cam);
        check("sobreposição: um disparo gera um dano só", before - e.health <= 72f && before - e.health > 0f,
                "tirou " + (before - e.health));
        e.health = Enemy.MAX_HEALTH;
        en.list.clear();

        System.out.println("== Hitboxes acompanham as animações ==");
        String[] clips = {"Idle", "Walk", "Run", "Jump", "IdleKneel", "LieDown", "Dying"};
        float standHead = 0f;
        for (String c : clips) {
            Enemy x = spawn(ax, az, MathUtils.PI, c);
            if (c.equals("LieDown") || c.equals("Dying")) {
                x.forceOnce(c);
                for (int i = 0; i < 200; i++) x.pose(1f / 30f);   // vai até o fim (deitado/caído)
                en.nextFrame();
                x.hitbox.update(en.frame());
            }
            float hh = x.hitbox.headCenter.y - x.pos.y;
            if (c.equals("Idle")) standHead = hh;
            HitDetection.Result rr = shootAt(x.hitbox.headCenter, akm);
            boolean low = !(c.equals("LieDown") || c.equals("Dying")) || hh < standHead - 0.5f;   // a hitbox desceu junto com o osso
            check("anim " + c + ": cabeça em " + String.format("%.2f m", hh) + ", tiro nela → CABEÇA",
                    rr.enemy == x && rr.region == WeaponConfig.Region.HEAD && low, "" + rr.region);
            en.list.clear();
        }

        System.out.println("== 6/7. Escondido atrás de construção ==");
        // casa de taipa: inimigo do outro lado da parede
        World.House h = w.houses.get(0);
        Vector3 hp = h.t.getTranslation(new Vector3());
        Vector3 inside = new Vector3(0f, 0f, 0f).mul(h.t);
        Vector3 out1 = new Vector3(0f, 0f, 9f).mul(h.t), behind = new Vector3(0f, 0f, -0.2f).mul(h.t);
        cam.set(out1.x, w.heightAt(out1.x, out1.z) + 1.7f, out1.z);
        Enemy hid = spawn(behind.x, behind.z, 0f, "Idle");
        // empurra para trás da parede dos fundos (lado oposto da porta)
        Vector3 back = new Vector3(0f, 0f, -4.6f).mul(h.t);
        hid.pos.set(back.x, w.groundAt(back.x, back.z), back.z);
        for (int i = 0; i < 5; i++) hid.pose(1f / 30f);
        en.nextFrame();
        hid.hitbox.update(en.frame());
        r = shootAt(hid.hitbox.chest, akm);
        check("atrás da casa: tiro não atravessa a parede", r.enemy == null && r.hitWorld, "inimigo=" + (r.enemy != null));
        TargetDetection td = new TargetDetection();
        aimAt(hid.hitbox.chest);
        for (int i = 0; i < 5; i++) { en.nextFrame(); td.update(0.11f, cam, dir(), en, w, 7f, 150f); }
        check("totalmente escondido: assistência não pega", td.target == null, "");
        en.list.clear();
        // parcialmente: atrás de um muro baixo (1 m): pernas escondidas, peito e cabeça aparecem
        cam.set(ax, gy + 1.7f, az - 12f);
        World.Obstacle wall = new World.Obstacle(ax, az - 1.2f, 0.8f, w.heightAt(ax, az - 1.2f), 1.0f);
        w.obstacles.add(wall);
        Enemy part = spawn(ax, az, MathUtils.PI, "Idle");
        aimAt(part.hitbox.chest);
        td = new TargetDetection();
        for (int i = 0; i < 3; i++) { en.nextFrame(); td.update(0.11f, cam, dir(), en, w, 7f, 150f); }
        check("parcialmente escondido: vira alvo (peito/cabeça à vista)", td.target == part, "");
        Vector3 shin = new Vector3(part.hitbox.a[9]).lerp(part.hitbox.b[9], 0.5f);
        r = shootAt(shin, akm);
        check("parcialmente escondido: tiro na canela para no muro", r.enemy == null, "" + r.region);
        r = shootAt(part.hitbox.headCenter, akm);
        check("parcialmente escondido: cabeça à vista → CABEÇA", r.enemy == part && r.region == WeaponConfig.Region.HEAD, "" + r.region);
        w.obstacles.removeValue(wall, true);
        en.list.clear();

        System.out.println("== 2/3/4. Assistência acompanhando o alvo em movimento (jogador acompanha ~70% com tremor) ==");
        String[] names = {"correndo de lado", "vindo na direção", "se afastando"};
        float[][] vel = {{4.2f, 0f}, {0f, -4.2f}, {0f, 4.2f}};
        for (int k = 0; k < 3; k++) {
            float[] errs = new float[2];
            float maxStep = 0f;
            for (int on = 0; on < 2; on++) {
                AimSettings.assistOn = on == 1;
                MathUtils.random.setSeed(42);
                cam.set(ax, gy + 1.7f, az - 14f);
                en.list.clear();
                Enemy m = spawn(ax - (k == 0 ? 4f : 0f), az + (k == 1 ? 6f : 0f), MathUtils.atan2(vel[k][0], vel[k][1]), "Run");
                aimAt(m.hitbox.chest);
                errs[on] = track(m, vel[k][0], vel[k][1], 0f, 0f, 0.7f, on == 1 ? new float[1] : null);
                if (on == 1) maxStep = lastMaxStep;
            }
            check("inimigo " + names[k] + ": com assistência a mira fica mais perto, sem tranco",
                    errs[1] <= errs[0] + 0.02f && maxStep < 1.0f,
                    String.format("erro médio sem %.2f°, com %.2f°; maior correção %.2f°/quadro", errs[0], errs[1], maxStep));
        }
        AimSettings.assistOn = true;

        System.out.println("== Aim assist: atração ao peito, FOV e resistência para cima ==");
        en.list.clear();
        cam.set(ax, gy + 1.7f, az - 12f);
        Enemy ta = spawn(ax, az, MathUtils.PI, "Idle");
        WeaponConfig.Category fuzil = WeaponConfig.Category.FUZIL;
        AimAssist aa = new AimAssist();
        // 1. Mira na cabeça, aperta o tiro: vai para o peito na fração escolhida (80%)
        aimAt(ta.hitbox.headCenter);
        float e0 = errChest(ta);
        aa.update(1f / 30f, cam, dir(), yaw, pitch, ta, fuzil, true, true, false);
        yaw += aa.dYaw;
        pitch += aa.dPitch;
        float e1 = errChest(ta);
        check("apertar o tiro sobe a mira em direção ao peito (assistência vertical 40%)", e1 != 0f && Math.abs(e1) < Math.abs(e0) * 0.7f,
                String.format("erro %.3f -> %.3f rad", e0, e1));
        // 1b. Desviada para o lado, a correção horizontal é pequena (assistência horizontal 10%)
        aimAt(ta.hitbox.chest);
        yaw += 0.03f;
        aa.update(1f / 30f, cam, dir(), yaw, pitch, ta, fuzil, true, true, false);
        check("assistência horizontal baixa: o puxão para o lado é pequeno", Math.abs(aa.dYaw) < 0.03f * 0.2f,
                String.format("correção %.4f rad (desvio 0,030)", aa.dYaw));
        // 2. Sem apertar o tiro, nada muda
        aimAt(ta.hitbox.headCenter);
        aa.update(1f / 30f, cam, dir(), yaw, pitch, ta, fuzil, false, false, false);
        check("sem atirar a assistência não mexe na mira", aa.dYaw == 0f && aa.dPitch == 0f, "");
        // 3. Fora do FOV: não puxa
        aimAt(new Vector3(ax + 40f, gy + 1.7f, az));
        aa.update(1f / 30f, cam, dir(), yaw, pitch, ta, fuzil, true, true, false);
        check("alvo fora do FOV: a mira não é puxada", aa.dYaw == 0f && aa.dPitch == 0f, "");
        // 4. Mira no peito e segurando o tiro: não sobe sozinha para a cabeça
        aimAt(ta.hitbox.chest);
        float drift = 0f;
        for (int f = 0; f < 60; f++) {
            aa.update(1f / 30f, cam, dir(), yaw, pitch, ta, fuzil, true, false, false);
            yaw += aa.dYaw;
            pitch += aa.dPitch;
            drift = Math.max(drift, Math.abs(errChest(ta)));
        }
        check("segurando o tiro no peito, a assistência não sobe para a cabeça", drift < 0.01f, String.format("desvio %.4f rad", drift));
        // 5. Dentro do FOV, a resistência desconta parte do movimento para cima (sem prender)
        float freeIn = climbOffset(ta, aa, fuzil, 0f, 0.02f, 0.0015f, 20);
        float resistIn = climbOffset(ta, aa, fuzil, 0.95f, 0.02f, 0.0015f, 20);
        float gainFree = freeIn - 0.02f, gainResist = resistIn - 0.02f;
        float kept = gainFree > 1e-4f ? gainResist / gainFree : -1f;
        check("resistência padrão 95%: subir 10% volta 9,5% (sobra 5%)", Math.abs(AimSettings.upResist - 0.95f) < 1e-6f && kept > 0.0f && kept < 0.12f,
                String.format("sobra %.0f%% do movimento", kept * 100f));
        check("resistência para cima: dentro do FOV, a mira sobe menos", resistIn < freeIn - 0.003f,
                String.format("sem %.4f, com 95%% %.4f rad acima do peito", freeIn, resistIn));
        // 5b. Fora do FOV a assistência não age: a subida é livre mesmo com resistência máxima
        float outStart = (AimSettings.fovDeg() * MathUtils.degreesToRadians) + 0.1f;
        float outFree = climbOffset(ta, aa, fuzil, 0f, outStart, 0.002f, 20);
        float outResist = climbOffset(ta, aa, fuzil, 1f, outStart, 0.002f, 20);
        check("fora do FOV a mira sobe livre, mesmo com resistência máxima", Math.abs(outResist - outFree) < 1e-3f,
                String.format("livre %.4f, resistência 100%% %.4f", outFree, outResist));
        // 6. FOV em porcentagem: 0% = 2°, 100% = 15°
        float savedFov = AimSettings.fovPct;
        AimSettings.fovPct = 0f;
        float f0 = AimSettings.fovDeg();
        AimSettings.fovPct = 1f;
        float f1 = AimSettings.fovDeg();
        AimSettings.fovPct = savedFov;
        check("FOV do aim assist vai de 2° a 15°", Math.abs(f0 - 2f) < 1e-3f && Math.abs(f1 - 15f) < 1e-3f, String.format("%.1f° a %.1f°", f0, f1));

        System.out.println("== Desempenho ==");
        en.list.clear();
        en = new Enemies(w, jake, null);
        long t0 = System.nanoTime();
        int N = 2000;
        Hitbox.Hit hh = new Hitbox.Hit();
        cam.set(ax, gy + 1.7f, az - 12f);
        for (int i = 0; i < N; i++) {
            en.nextFrame();
            Vector3 d = new Vector3(MathUtils.random(-1f, 1f), MathUtils.random(-0.2f, 0.2f), MathUtils.random(-1f, 1f)).nor();
            float tw = w.raycast(cam, d, 150f);
            en.raycast(cam, d, tw, false, hh);
        }
        float us = (System.nanoTime() - t0) / 1000f / N;
        check("tiro (raio no mundo + 10 inimigos) leva menos de 1 ms", us < 1000f, String.format("%.0f µs por tiro (PC)", us));
    }

    /** Erro de elevação entre o peito do alvo e a mira (positivo = peito acima da mira). */
    float errChest(Enemy e) {
        Vector3 c = e.hitbox.chest;
        float dx = c.x - cam.x, dy = c.y - cam.y, dz = c.z - cam.z;
        float elevChest = MathUtils.atan2(dy, (float) Math.sqrt(dx * dx + dz * dz));
        return elevChest - (-pitch);
    }

    /** Dedo sobe 'step' rad por quadro durante 'frames' quadros, a partir de 'start' rad acima do peito. Devolve a altura final. */
    float climbOffset(Enemy ta, AimAssist aa, WeaponConfig.Category cat, float up, float start, float step, int frames) {
        float saved = AimSettings.upResist;
        AimSettings.upResist = up;
        aimAt(ta.hitbox.chest);
        pitch -= start;
        aa.reset();
        for (int f = 0; f < frames; f++) {
            pitch -= step;   // o dedo sobe
            aa.update(1f / 30f, cam, dir(), yaw, pitch, ta, cat, true, false, false);
            yaw += aa.dYaw;
            pitch += aa.dPitch;
        }
        float off = -errChest(ta);
        AimSettings.upResist = saved;
        return off;
    }

    float lastMaxStep;

    /**
     * Simula 2 s: alvo andando (vx, vz), câmera andando (cvx, cvz), "jogador" corrigindo a mira com o
     * dedo a uma fração (human) do necessário, com tremor e 100 ms de atraso de reação.
     * Devolve o erro angular médio no último 1,5 s.
     */
    float track(Enemy m, float vx, float vz, float cvx, float cvz, float human, float[] unused) {
        TargetDetection t = new TargetDetection();
        AimAssist as = new AimAssist();
        AimController ctl = new AimController();
        float sum = 0f;
        int n = 0;
        float[] lagYaw = new float[4];
        lastMaxStep = 0f;
        for (int f = 0; f < 60; f++) {
            float dt = 1f / 30f;
            m.pos.add(vx * dt, 0f, vz * dt);
            m.pos.y = w.groundAt(m.pos.x, m.pos.z);
            m.pose(dt);
            cam.add(cvx * dt, 0f, cvz * dt);
            en.nextFrame();
            m.hitbox.update(en.frame());
            // dedo: corrige (com atraso de 3 quadros) uma parte do erro horizontal até o peito
            Vector3 v = new Vector3(m.hitbox.chest).sub(cam);
            float need = wrapA(MathUtils.atan2(v.x, v.z) - yaw);
            lagYaw[f % 4] = need;
            float seen = lagYaw[(f + 1) % 4];
            float px = -seen * human * 0.5f / (4f / 1080f) + MathUtils.random(-3f, 3f);   // pixels
            ctl.addDrag(px, MathUtils.random(-1.5f, 1.5f));
            ctl.update(dt, 1080f, false, WeaponConfig.Category.FUZIL, as.friction);
            yaw += ctl.yawDelta;
            pitch += ctl.pitchDelta;
            Vector3 d = dir();
            t.update(dt, cam, d, en, w, 7f, 150f);
            as.update(dt, cam, d, yaw, pitch, t.target, WeaponConfig.Category.FUZIL, true, false, false);
            yaw += as.dYaw;
            pitch += as.dPitch;
            lastMaxStep = Math.max(lastMaxStep, (float) Math.toDegrees(Math.abs(as.dYaw) + Math.abs(as.dPitch)));
            if (f >= 15) { sum += t.angleTo(cam, dir(), m.hitbox); n++; }
        }
        return sum / Math.max(1, n);
    }

    static float wrapA(float a) {
        while (a > MathUtils.PI) a -= MathUtils.PI2;
        while (a < -MathUtils.PI) a += MathUtils.PI2;
        return a;
    }

    HitDetection.Result shootAt0(WeaponConfig cfg) {
        Vector3 d = dir();
        HitDetection.Result r = new HitDetection.Result();
        new HitDetection().shoot(cam, d, new Vector3(cam).mulAdd(d, 2.6f), cfg.range, en, w, r);
        return r;
    }

    public static void main(String[] args) {
        HeadlessApplicationConfiguration c = new HeadlessApplicationConfiguration();
        new HeadlessApplication(new AimTests(), c);
    }
}
