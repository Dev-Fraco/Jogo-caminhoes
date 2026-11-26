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
        check("AKM: 30 no corpo vira 60 na cabeça", Math.abs(dHead - 60f) < 0.01f, "dano " + dHead);
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
        check("sobreposição: um disparo gera um dano só", before - e.health <= 60f && before - e.health > 0f,
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

        System.out.println("== 5. Dois inimigos próximos: sem ficar trocando ==");
        en.list.clear();
        cam.set(ax, gy + 1.7f, az - 14f);
        Enemy e1 = spawn(ax - 0.7f, az, MathUtils.PI, "Idle"), e2 = spawn(ax + 0.7f, az, MathUtils.PI, "Idle");
        aimAt(new Vector3(ax, e1.hitbox.chest.y, az));
        TargetDetection t5 = new TargetDetection();
        AimAssist a5 = new AimAssist();
        for (int f = 0; f < 120; f++) {
            float dt = 1f / 30f;
            yaw += MathUtils.sin(f * 0.25f) * 0.002f;   // mão tremendo entre os dois
            en.nextFrame();
            Vector3 d = dir();
            t5.update(dt, cam, d, en, w, 7f, 150f);
            a5.update(dt, cam, d, yaw, pitch, t5.target, WeaponConfig.Category.FUZIL, true, false);
            yaw += a5.dYaw;
            pitch += a5.dPitch;
        }
        check("4 s mirando entre dois: no máximo 1 troca de alvo", t5.switches <= 1, "trocas " + t5.switches);

        System.out.println("== 8. Puxar a mira do peito para a cabeça ==");
        en.list.clear();
        cam.set(ax, gy + 1.7f, az - 12f);
        Enemy p8 = spawn(ax, az, MathUtils.PI, "Idle");
        aimAt(p8.hitbox.chest);
        TargetDetection t8 = new TargetDetection();
        AimAssist a8 = new AimAssist();
        AimController ctl = new AimController();
        float maxAssistPitch = 0f;
        // 3 s sem mexer: a assistência NÃO pode subir sozinha para a cabeça
        for (int f = 0; f < 90; f++) {
            float dt = 1f / 30f;
            en.nextFrame();
            Vector3 d = dir();
            t8.update(dt, cam, d, en, w, 7f, 150f);
            a8.update(dt, cam, d, yaw, pitch, t8.target, WeaponConfig.Category.FUZIL, true, false);
            yaw += a8.dYaw;
            pitch += a8.dPitch;
            maxAssistPitch = Math.max(maxAssistPitch, Math.abs(a8.dPitch));
        }
        r = shootAt0(akm);
        check("sem puxar: continua no peito (não trava na cabeça)", r.region == WeaponConfig.Region.TORSO, "" + r.region);
        check("entre quadril e cabeça a assistência não mexe na vertical", maxAssistPitch < 1e-4f,
                String.format("%.5f rad", maxAssistPitch));
        // puxa o dedo para cima (tela 1080 px de altura) até a cabeça
        WeaponConfig.Region got = null;
        int frames = 0;
        for (int f = 0; f < 60 && got != WeaponConfig.Region.HEAD; f++) {
            float dt = 1f / 30f;
            ctl.addDrag(0f, -2.0f);   // 2 px por quadro para cima
            ctl.update(dt, 1080f, false, WeaponConfig.Category.FUZIL, a8.friction);
            yaw += ctl.yawDelta;
            pitch += ctl.pitchDelta;
            en.nextFrame();
            Vector3 d = dir();
            t8.update(dt, cam, d, en, w, 7f, 150f);
            a8.update(dt, cam, d, yaw, pitch, t8.target, WeaponConfig.Category.FUZIL, true, false);
            yaw += a8.dYaw;
            pitch += a8.dPitch;
            got = shootAt0(akm).region;
            frames = f + 1;
        }
        check("puxando para cima a mira chega na cabeça", got == WeaponConfig.Region.HEAD,
                "em " + frames + " quadros (" + Math.round(frames * 1000f / 30f) + " ms)");
        // e continua lá ao soltar o dedo
        for (int f = 0; f < 30; f++) {
            float dt = 1f / 30f;
            ctl.update(dt, 1080f, false, WeaponConfig.Category.FUZIL, a8.friction);
            yaw += ctl.yawDelta;
            pitch += ctl.pitchDelta;
            en.nextFrame();
            Vector3 d = dir();
            t8.update(dt, cam, d, en, w, 7f, 150f);
            a8.update(dt, cam, d, yaw, pitch, t8.target, WeaponConfig.Category.FUZIL, true, false);
            yaw += a8.dYaw;
            pitch += a8.dPitch;
        }
        WeaponConfig.Region after = shootAt0(akm).region;
        check("soltando o dedo a mira fica na cabeça (assistência não puxa de volta)", after == WeaponConfig.Region.HEAD, "" + after);

        System.out.println("== 12/13. Movendo o analógico / girando a câmera enquanto mira ==");
        float[] e12 = new float[2];
        Enemy p12 = null;
        for (int on = 0; on < 2; on++) {
            AimSettings.assistOn = on == 1;
            MathUtils.random.setSeed(7);
            en.list.clear();
            cam.set(ax, gy + 1.7f, az - 12f);
            p12 = spawn(ax, az, MathUtils.PI, "Idle");
            aimAt(p12.hitbox.chest);
            e12[on] = track(p12, 0f, 0f, 3.5f, 0f, 0.7f, null);   // jogador andando de lado a 3,5 m/s
        }
        AimSettings.assistOn = true;
        check("andando de lado (analógico) enquanto mira: assistência ajuda", e12[1] <= e12[0] + 0.02f,
                String.format("erro médio sem %.2f°, com %.2f°", e12[0], e12[1]));
        TargetDetection t12 = new TargetDetection();
        AimAssist a12 = new AimAssist();
        aimAt(p12.hitbox.chest);
        for (int f = 0; f < 5; f++) { en.nextFrame(); t12.update(1f / 30f, cam, dir(), en, w, 7f, 150f); }
        // jogador gira a câmera para longe: a assistência solta (controle é do jogador)
        AimController c13 = new AimController();
        int sign = 0, flips = 0;
        float prevErr = 0f;
        for (int f = 0; f < 45; f++) {
            float dt = 1f / 30f;
            c13.addDrag(9f, 0f);   // arrasta para a direita
            c13.update(dt, 1080f, false, WeaponConfig.Category.FUZIL, a12.friction);
            yaw += c13.yawDelta;
            en.nextFrame();
            Vector3 d = dir();
            t12.update(dt, cam, d, en, w, 7f, 150f);
            a12.update(dt, cam, d, yaw, pitch, t12.target, WeaponConfig.Category.FUZIL, true, false);
            yaw += a12.dYaw;
            float err = t12.angleTo(cam, dir(), p12.hitbox);
            int s2 = (int) Math.signum(err - prevErr);
            if (sign != 0 && s2 != 0 && s2 != sign) flips++;
            if (s2 != 0) sign = s2;
            prevErr = err;
        }
        check("girando a câmera para longe: o jogador vence a assistência", prevErr > 10f && t12.target == null,
                String.format("saiu %.1f° do alvo, alvo=%s, vai-e-volta %d", prevErr, t12.target, flips));

        System.out.println("== 14. Trocar de arma durante a mira ==");
        AimAssist a14 = new AimAssist();
        aimAt(p12.hitbox.chest);
        yaw += 0.04f;
        TargetDetection t14 = new TargetDetection();
        float dF = 0f, dP = 0f;
        for (int f = 0; f < 6; f++) {
            en.nextFrame();
            t14.update(1f / 30f, cam, dir(), en, w, 7f, 150f);
            a14.update(1f / 30f, cam, dir(), yaw, pitch, t14.target, f < 3 ? WeaponConfig.Category.FUZIL : WeaponConfig.Category.PRECISAO, true, false);
            if (f == 2) dF = Math.abs(a14.dYaw);
            if (f == 5) dP = Math.abs(a14.dYaw);
        }
        check("troca para precisão no meio: assistência mais contida, sem erro", dP < dF && dP > 0f,
                String.format("fuzil %.4f, precisão %.4f rad/quadro", dF, dP));

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
            as.update(dt, cam, d, yaw, pitch, t.target, WeaponConfig.Category.FUZIL, true, false);
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
