package com.exemplo.jogo3d;

import com.badlogic.gdx.ApplicationAdapter;
import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.backends.headless.HeadlessApplication;
import com.badlogic.gdx.backends.headless.HeadlessApplicationConfiguration;
import com.badlogic.gdx.graphics.GL20;
import com.badlogic.gdx.graphics.g3d.Environment;
import com.badlogic.gdx.graphics.g3d.Model;
import com.badlogic.gdx.graphics.g3d.ModelInstance;
import com.badlogic.gdx.graphics.g3d.attributes.ColorAttribute;
import com.badlogic.gdx.graphics.g3d.loader.G3dModelLoader;
import com.badlogic.gdx.math.MathUtils;
import com.badlogic.gdx.math.Vector3;
import com.badlogic.gdx.utils.JsonReader;

import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.List;

/**
 * Testes do sistema de armas e disparos, com o mundo, o personagem, o esqueleto, as armas, os inimigos,
 * o dano, os efeitos e o áudio reais do projeto (sem tela). Cobre os 20 testes pedidos.
 */
public class ShootTests extends ApplicationAdapter {
    static int pass = 0, fail = 0;
    World w;
    Character ch;
    Player pl;
    Model jake;
    Enemies en;
    DamageSystem dmg;
    CombatFx fx;
    ShootingSystem sh;
    Weapons wp;
    final ShootingSystem.Input in = new ShootingSystem.Input();
    final Vector3 cam = new Vector3();
    float yaw, pitch, ax, az, gy;
    // registro dos acertos
    final List<float[]> events = new ArrayList<>();   // {dano, cabeça?, abate?}
    boolean hitListenerOn = true;

    static void check(String name, boolean ok, String info) {
        System.out.println((ok ? "  OK   " : "  FALHA") + "  " + name + (info.isEmpty() ? "" : "  [" + info + "]"));
        if (ok) pass++; else fail++;
    }

    Vector3 aimDir() {
        float e = -pitch;
        return new Vector3(MathUtils.sin(yaw) * MathUtils.cos(e), MathUtils.sin(e), MathUtils.cos(yaw) * MathUtils.cos(e));
    }

    void aimAt(Vector3 p) {
        Vector3 v = new Vector3(p).sub(cam);
        yaw = MathUtils.atan2(v.x, v.z);
        pitch = -MathUtils.atan2(v.y, (float) Math.sqrt(v.x * v.x + v.z * v.z));
    }

    /** Área plana e aberta (sem obstáculos) para os testes. */
    float[] openArea() {
        java.util.Random r = new java.util.Random(7);
        // varredura em grade de 25 m por todo o mapa (o mapa é grande: lugar plano é raro)
        for (int t = 0; t < 41 * 41; t++) {
            float[] p = {-500f + (t % 41) * 25f, -500f + (t / 41) * 25f};
            boolean ok = true;
            for (float dx = -25; dx <= 25 && ok; dx += 5)
                for (float dz = -25; dz <= 25 && ok; dz += 5)
                    if (Math.abs(w.groundAt(p[0] + dx, p[1] + dz) - w.groundAt(p[0], p[1])) > 0.6f) ok = false;
            if (!ok) continue;
            Vector3 o = new Vector3(p[0], w.groundAt(p[0], p[1]) + 1.6f, p[1]);
            boolean clear = true;
            for (int a = 0; a < 16 && clear; a++)
                if (w.raycast(o, new Vector3(MathUtils.cosDeg(a * 22.5f), 0f, MathUtils.sinDeg(a * 22.5f)), 30f) < 30f) clear = false;
            if (clear) return p;
        }
        return w.openSpot(r);
    }

    /** Monta o cenário: jogador com a arma slot (config opcional no lugar da M416) já sacada. */
    void setup(int type, WeaponConfig override) {
        if (override != null) WeaponConfig.BY_TYPE[type] = override;
        wp = new Weapons();
        en = new Enemies(w, jake, null);
        en.list.clear();
        fx = new CombatFx();
        dmg = new DamageSystem((e, at, d, head, killed) -> {
            if (hitListenerOn) events.add(new float[]{d, head ? 1f : 0f, killed ? 1f : 0f});
            fx.onHit(e, at, d, head, killed);
        });
        sh = new ShootingSystem(w, wp, en, dmg, fx, new Environment());
        fx.setAudio(sh.audio);
        pl = new Player();
        pl.spawn(ax, az, gy);
        yaw = 0f;
        pitch = 0f;
        cam.set(pl.pos).add(0f, 1.9f, -3f);
        wp.pickUp(new Weapons.Pickup(type, new ModelInstance(wp.models()[type]), ax, gy, az), w, ch, pl);
        events.clear();
        for (int i = 0; i < 40; i++) step(1f / 30f, false, false);   // termina de sacar
    }

    void step(float dt, boolean held, boolean pressed) {
        pl.facing = yaw;
        ch.update(pl, dt);
        in.fireHeld = held;
        in.firePressed = pressed;
        in.cam.set(cam);
        in.aim.set(aimDir());
        in.playerPos.set(pl.pos);
        in.grounded = true;
        in.speed = pl.speed;
        wp.ads = in.ads;
        wp.aimElev = -pitch;
        wp.update(ch, pl);
        en.nextFrame();
        sh.update(dt, in, true);
        yaw += sh.dYaw;
        pitch += sh.dPitch;
    }

    Enemy spawnEnemy(float x, float z, float facing, String clip) {
        Enemy e = new Enemy(jake, null, x, z, 0.3f);
        e.pos.y = w.groundAt(x, z);
        e.facing = facing;
        e.weapon = WeaponConfig.RIFLE_INIMIGO;   // alvo armado: sem arma ele sai andando atrás de uma arma
        e.forceClip(clip);
        for (int i = 0; i < 40; i++) e.pose(1f / 30f);
        en.list.add(e);
        en.nextFrame();
        e.hitbox.update(en.frame());
        return e;
    }

    /** Atira UMA vez (toque) mirando em p. Devolve se disparou. */
    boolean shootOnce(Vector3 p) {
        aimAt(p);
        int before = sh.shotsFired;
        step(1f / 30f, true, true);   // o toque na tela: botão pressionado neste quadro
        return sh.shotsFired > before;
    }

    void restAmmo() {
        for (int i = 0; i < 200 && wp.reloading(); i++) step(1f / 30f, false, false);
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
        System.exit(fail == 0 ? 0 : 1);
    }

    void run() {
        MathUtils.random.setSeed(1915);
        ShootingSystem.spreadScale = 0f;   // acertos determinísticos (a dispersão é testada à parte, pelo spreadDeg)
        w = new World();
        w.create();
        ch = new Character();
        ch.create();
        jake = ch.model();
        float[] A = openArea();
        ax = A[0];
        az = A[1];
        gy = w.groundAt(ax, az);
        WeaponConfig akm = WeaponConfig.AKM;

        System.out.println("== 1/2. Equipar e disparar com o carregador cheio ==");
        setup(0, null);
        check("arma na mão com pente cheio e reserva", wp.armed() && wp.ammo() == 30 && wp.reserveAmmo() == 120, wp.ammo() + "/" + wp.reserveAmmo());
        Enemy e1 = spawnEnemy(ax, az + 15f, MathUtils.PI, "Idle");
        Vector3 chest = e1.hitbox.chest;
        boolean fired = shootOnce(chest);
        check("o toque no botão dispara", fired && wp.ammo() == 29, "pente " + wp.ammo());
        check("o clarão sai no mesmo quadro", sh.flash.shots == 1 && sh.flash.flashing(), "");

        System.out.println("== 15. Clarão na ponta do cano (e não no centro da tela) ==");
        Vector3 fp = new Vector3(), hand = new Vector3();
        sh.flash.flashPosition(fp);
        ch.handWorld(false, hand);
        float flashToMuzzle = fp.dst(wp.muzzle), handToMuzzle = hand.dst(wp.muzzle);
        check("clarão colado no cano (≤ 0,2 m)", flashToMuzzle < 0.2f, String.format("%.3f m", flashToMuzzle));
        check("o cano fica à frente da mão (0,4 a 1,0 m)", handToMuzzle > 0.4f && handToMuzzle < 1.0f, String.format("%.2f m", handToMuzzle));
        Vector3 toMuz = new Vector3(wp.muzzle).sub(hand).nor();
        check("o cano aponta para a frente do personagem", toMuz.dot(new Vector3(MathUtils.sin(yaw), 0f, MathUtils.cos(yaw))) > 0.7f, String.format("%.2f", toMuz.dot(new Vector3(MathUtils.sin(yaw), 0f, MathUtils.cos(yaw)))));
        int parts = sh.flash.instances().size;
        check("o tiro gera clarão (2), faíscas e fumaça", parts >= 5, parts + " elementos visíveis");
        check("clarão some em instantes (não fica ligado)", !runUntilFlashEnds(), "");

        System.out.println("== 16. Recuo e volta da arma ==");
        setup(0, null);
        e1 = spawnEnemy(ax, az + 15f, MathUtils.PI, "Idle");
        aimAt(e1.hitbox.chest);
        for (int i = 0; i < 6; i++) step(1f / 30f, false, false);
        Vector3 idle = new Vector3(wp.muzzle);
        shootOnce(e1.hitbox.chest);
        float kick = wp.kickOffset();   // no instante do tiro
        step(1f / 30f, false, false);
        Vector3 shotMuzzle = new Vector3(wp.muzzle);
        for (int i = 0; i < 12; i++) step(1f / 30f, false, false);
        float back = new Vector3(wp.muzzle).dst(idle);
        check("a arma recua no tiro (≥ 5 cm)", kick >= 0.05f && shotMuzzle.dst(idle) > 0.02f, String.format("recuo %.3f m, cano deslocou %.3f m", kick, shotMuzzle.dst(idle)));
        check("e volta ao lugar depois", back < 0.03f, String.format("falta %.3f m", back));

        System.out.println("== 3/4/5. Esvaziar o pente, tentar sem munição e recarregar ==");
        setup(0, null);
        e1 = spawnEnemy(ax, az + 15f, MathUtils.PI, "Idle");
        aimAt(e1.hitbox.chest);
        int shots = 0;
        float t0 = 0f;
        for (int f = 0; f < 120 && wp.ammo() > 0; f++) {
            int b = sh.shotsFired;
            step(1f / 30f, true, f == 0);
            shots += sh.shotsFired - b;
            t0 += 1f / 30f;
            e1.health = Enemy.MAX_HEALTH;   // não deixa morrer: o teste é de munição
            e1.state = Enemy.State.PATROL;
        }
        check("30 tiros esvaziam o pente", wp.ammo() == 0 && shots == 30, shots + " tiros em " + String.format("%.2f s", t0));
        check("cadência respeitada (0,1 s entre tiros, não um por quadro)", t0 > 2.7f && t0 < 3.4f, String.format("%.2f s para 30 tiros", t0));
        for (int i = 0; i < 6; i++) step(1f / 30f, false, false);   // passa o intervalo do último tiro
        int before = sh.shotsFired, flashes = sh.flash.shots, played0 = sh.audio.played;
        step(1f / 30f, true, true);
        check("sem munição: o clique não dispara e a arma começa a recarregar", sh.shotsFired == before && wp.ammo() == 0 && wp.reloading(), "recarregando=" + wp.reloading());
        check("sem munição: não sai clarão e toca só o clique/recarga", sh.flash.shots == flashes && sh.audio.played - played0 <= 2, (sh.audio.played - played0) + " som(ns)");
        before = sh.shotsFired;
        for (int i = 0; i < 10; i++) step(1f / 30f, true, true);
        check("durante a recarga o disparo é bloqueado", sh.shotsFired == before, "");
        check("não inicia outra recarga junto", !wp.startReload(), "");
        restAmmo();
        for (int i = 0; i < 100 && wp.reloading(); i++) step(1f / 30f, false, false);
        check("recarga completa: pente 30, reserva 90", wp.ammo() == 30 && wp.reserveAmmo() == 90, wp.ammo() + "/" + wp.reserveAmmo());
        // recarga parcial desconta só o que faltava
        shootOnce(e1.hitbox.chest);
        for (int i = 0; i < 12; i++) step(1f / 30f, false, false);
        shootOnce(e1.hitbox.chest);
        for (int i = 0; i < 12; i++) step(1f / 30f, false, false);
        int missing = 30 - wp.ammo(), res0 = wp.reserveAmmo();
        wp.startReload();
        for (int i = 0; i < 120 && wp.reloading(); i++) step(1f / 30f, false, false);
        check("recarga parcial só repõe o que faltava", wp.ammo() == 30 && wp.reserveAmmo() == res0 - missing, "faltavam " + missing);
        check("pente cheio: não recarrega", !wp.startReload(), "");

        System.out.println("== 6/7/8/9. Precisão: em pé, andando, correndo, agachado e deitado ==");
        setup(0, null);
        in.ads = false;
        in.crouch = in.prone = false;
        pl.speed = 0f;
        float sStand = sh.spreadDeg(akm, in);
        pl.speed = Player.WALK_SPEED;
        in.speed = pl.speed;
        float sWalk = sh.spreadDeg(akm, in);
        in.speed = Player.RUN_SPEED;
        float sRun = sh.spreadDeg(akm, in);
        in.speed = 0f;
        in.crouch = true;
        float sCrouch = sh.spreadDeg(akm, in);
        in.crouch = false;
        in.prone = true;
        float sProne = sh.spreadDeg(akm, in);
        in.prone = false;
        in.ads = true;
        float sAds = sh.spreadDeg(akm, in);
        in.ads = false;
        check("correndo é pior que andando e que parado", sRun > sWalk && sWalk > sStand, String.format("parado %.2f°, andando %.2f°, correndo %.2f°", sStand, sWalk, sRun));
        check("agachado melhora e deitado melhora ainda mais", sCrouch < sStand && sProne < sCrouch, String.format("agachado %.2f°, deitado %.2f°", sCrouch, sProne));
        check("mirando melhora", sAds < sStand, String.format("%.2f°", sAds));
        // atirar andando e correndo de verdade (o tiro sai e a munição desce)
        e1 = spawnEnemy(ax, az + 15f, MathUtils.PI, "Idle");
        in.speed = Player.RUN_SPEED;
        pl.speed = Player.RUN_SPEED;
        int b0 = wp.ammo();
        aimAt(e1.hitbox.chest);
        for (int i = 0; i < 5; i++) step(1f / 30f, true, i == 0);
        check("atirar correndo funciona", wp.ammo() < b0, (b0 - wp.ammo()) + " tiros");
        pl.speed = 0f;
        in.speed = 0f;

        System.out.println("== 11/20. Inimigo parado: dano, região e headshot ==");
        setup(0, null);
        e1 = spawnEnemy(ax, az + 15f, MathUtils.PI, "Idle");
        events.clear();
        shootOnce(e1.hitbox.chest);
        check("acerto no tronco: 30 de dano, a vida baixa", events.size() == 1 && events.get(0)[0] == 30f && e1.health == Enemy.MAX_HEALTH - 30f, events.isEmpty() ? "" : events.get(0)[0] + " dano");
        check("o inimigo reage ao dano (recua e pisca)", e1.flinching() && e1.barT > 0f, "");
        boolean glow = e1.inst.materials.get(0).has(ColorAttribute.Emissive);
        check("o pano pisca vermelho", glow, "");
        for (int i = 0; i < 12; i++) step(1f / 30f, false, false);
        e1.update(0.4f, w, en, new Vector3(ax, gy, az), true);   // passa o tempo da reação
        check("a reação termina e o brilho some", !e1.flinching() && !e1.inst.materials.get(0).has(ColorAttribute.Emissive), "");
        events.clear();
        shootOnce(e1.hitbox.headCenter);
        check("headshot: 60 de dano, marcado como cabeça", events.size() == 1 && events.get(0)[0] == 60f && events.get(0)[1] == 1f, events.isEmpty() ? "" : events.get(0)[0] + " dano");
        for (int i = 0; i < 12; i++) step(1f / 30f, false, false);
        events.clear();
        float hpBefore = e1.health;
        shootOnce(e1.hitbox.headCenter);
        check("o inimigo morre e a reação de dano para (animação de morte)", !e1.alive() && !e1.flinching() && (events.size() == 1 && events.get(0)[2] == 1f), "vida " + hpBefore + " → " + e1.health);
        int ev0 = events.size();
        for (int i = 0; i < 12; i++) step(1f / 30f, false, false);
        shootOnce(e1.hitbox.headCenter);
        check("não atira mais em morto", events.size() == ev0, "");

        System.out.println("== 12. Inimigo em movimento ==");
        setup(0, null);
        e1 = spawnEnemy(ax - 4f, az + 15f, MathUtils.HALF_PI, "Run");
        int hit = 0, tries = 8;
        for (int k = 0; k < tries; k++) {
            for (int i = 0; i < 6; i++) {
                e1.pos.add(4.2f / 30f, 0f, 0f);
                e1.pos.y = w.groundAt(e1.pos.x, e1.pos.z);
                e1.pose(1f / 30f);
                step(1f / 30f, false, false);
            }
            e1.hitbox.update(en.frame());
            events.clear();
            shootOnce(e1.hitbox.chest);
            e1.health = Enemy.MAX_HEALTH;
            e1.state = Enemy.State.PATROL;
            if (!events.isEmpty()) hit++;
            for (int i = 0; i < 6; i++) step(1f / 30f, false, false);
        }
        check("tiro instantâneo acerta alvo correndo mirado no peito", hit >= tries - 1, hit + " de " + tries);

        System.out.println("== 13/14. Parede: impacto, material e nada atravessa ==");
        setup(0, null);
        World.House h = w.houses.get(0);
        Vector3 out1 = new Vector3(0f, 0f, 9f).mul(h.t), behindWall = new Vector3(0f, 0f, -4.6f).mul(h.t);
        pl.spawn(out1.x, out1.z, w.groundAt(out1.x, out1.z));
        cam.set(out1.x, w.groundAt(out1.x, out1.z) + 1.9f, out1.z);
        // refaz a arma na mão nessa posição
        for (int i = 0; i < 10; i++) step(1f / 30f, false, false);
        Enemy hid = spawnEnemy(behindWall.x, behindWall.z, 0f, "Idle");
        events.clear();
        Vector3 hidChest = new Vector3(hid.hitbox.chest);
        aimAt(hidChest);
        HitDetection.Result probe = new HitDetection.Result();
        new HitDetection().shoot(cam, aimDir(), wp.muzzle, 150f, en, w, probe);
        check("a parede da casa de taipa para o tiro: o inimigo atrás não é atingido", probe.enemy == null && probe.hitWorld, "inimigo=" + (probe.enemy != null));
        check("material da casa de taipa = BARRO", probe.surface == Surface.BARRO, "" + probe.surface);
        for (int i = 0; i < 6; i++) step(1f / 30f, false, false);
        shootOnce(hidChest);
        check("disparo real: sem dano atrás da parede", events.isEmpty() && hid.health == Enemy.MAX_HEALTH, "");
        check("o impacto gera efeitos na parede", sh.impacts.activeCount() > 0, sh.impacts.activeCount() + " partículas/marcas");
        // personagem colado na quina: câmera vê, mas o cano está atrás da parede
        World.Box box = null;
        for (int i = 0; i < w.boxes.size; i++) if (w.boxes.get(i).hx > 2f) { box = w.boxes.get(i); break; }
        if (box != null) {
            Vector3 wallPoint = new Vector3(0f, 1.2f, -box.hz).mul(box.t);
            Vector3 front = new Vector3(0f, 0f, -box.hz - 8f).mul(box.t);
            Vector3 c2 = new Vector3(front.x, w.groundAt(front.x, front.z) + 1.7f, front.z);
            Vector3 dd = new Vector3(wallPoint).sub(c2).nor();
            w.raycast(c2, dd, 60f);
            check("casa da cidade (alvenaria): material PEDRA", w.hitSurface == Surface.PEDRA, "" + w.hitSurface);
        }
        // chão e madeira
        Vector3 d2 = new Vector3(0.2f, -0.3f, 0.9f).nor();
        w.raycast(new Vector3(ax, gy + 1.7f, az), d2, 100f);
        check("chão de terra = TERRA", w.hitSurface == Surface.TERRA && w.hitNormal.y > 0.7f, w.hitSurface + " n.y=" + String.format("%.2f", w.hitNormal.y));
        World.Obstacle tree = null;
        for (int i = 0; i < w.obstacles.size; i++) if (w.obstacles.get(i).surface == Surface.MADEIRA && w.obstacles.get(i).height > 1.4f) { tree = w.obstacles.get(i); break; }
        if (tree != null) {
            Vector3 o = new Vector3(tree.x - 1.5f, Math.max(tree.baseY + 1f, w.groundAt(tree.x - 1.5f, tree.z) + 0.5f), tree.z);
            w.raycast(o, new Vector3(1f, 0f, 0f), 20f);
            check("árvore/cacto = MADEIRA", w.hitSurface == Surface.MADEIRA, "" + w.hitSurface);
        }
        Vector3 rockO = null;
        for (int i = 0; i < w.obstacles.size; i++) if (w.obstacles.get(i).surface == Surface.PEDRA) { World.Obstacle ob = w.obstacles.get(i); rockO = new Vector3(ob.x - 2.2f, Math.max(ob.baseY + 0.6f, w.groundAt(ob.x - 2.2f, ob.z) + 0.4f), ob.z); w.raycast(rockO, new Vector3(1f, 0f, 0f), 30f); break; }
        check("pedra/poço = PEDRA", rockO != null && w.hitSurface == Surface.PEDRA, "" + w.hitSurface);

        System.out.println("== 18/19. Cada categoria: modo de disparo, cadência e rajadas ==");
        Object[][] cats = {{WeaponConfig.PISTOLA}, {WeaponConfig.REVOLVER}, {WeaponConfig.SUBMETRALHADORA}, {WeaponConfig.AKM}, {WeaponConfig.ESPINGARDA}, {WeaponConfig.PRECISAO}};
        for (Object[] cc : cats) {
            WeaponConfig c = (WeaponConfig) cc[0];
            int slot = c == WeaponConfig.AKM ? 0 : 4;
            setup(slot, c == WeaponConfig.AKM ? null : c);
            Enemy t = spawnEnemy(ax, az + 12f, MathUtils.PI, "Idle");
            aimAt(t.hitbox.chest);
            // segurar o botão por 2 s
            int b = sh.shotsFired;
            for (int f = 0; f < 60; f++) {
                step(1f / 30f, true, f == 0);
                t.health = Enemy.MAX_HEALTH;
                t.state = Enemy.State.PATROL;
                aimAt(t.hitbox.chest);
                if (wp.reloading()) break;
            }
            int held2s = sh.shotsFired - b;
            float expectedMax = c.mode == WeaponConfig.FireMode.AUTO ? 2f / c.fireInterval + 1.5f : c.mode == WeaponConfig.FireMode.SEMI ? 1f : c.burstCount * (1f + 2f / c.fireInterval);
            boolean ok;
            String why;
            if (c.mode == WeaponConfig.FireMode.AUTO) {
                float rate = Math.min(c.magazine, 2f / c.fireInterval);
                ok = Math.abs(held2s - rate) <= 3;
                why = held2s + " tiros em 2 s (esperado ~" + Math.round(rate) + ")";
            } else if (c.mode == WeaponConfig.FireMode.SEMI) {
                ok = held2s == 1 || (c.fireInterval < 2f && held2s == 1);
                why = "segurando o botão: " + held2s + " tiro";
            } else {
                ok = held2s == c.burstCount;
                why = held2s + " tiros por toque";
            }
            check(c.name + " (" + c.category.label + ", " + c.mode.label + "): " + why, ok, "");
            if (c.mode == WeaponConfig.FireMode.SEMI) {
                // um toque por vez respeitando o intervalo
                setup(slot, c == WeaponConfig.AKM ? null : c);
                t = spawnEnemy(ax, az + 12f, MathUtils.PI, "Idle");
                aimAt(t.hitbox.chest);
                int b2 = sh.shotsFired;
                step(1f / 30f, false, true);
                step(1f / 30f, false, true);   // toque dentro do intervalo
                int quick = sh.shotsFired - b2;
                for (int i = 0; i < (int) (c.fireInterval * 30f) + 3; i++) { step(1f / 30f, false, false); t.health = Enemy.MAX_HEALTH; t.state = Enemy.State.PATROL; aimAt(t.hitbox.chest); }
                step(1f / 30f, false, true);
                check("   toques respeitam o intervalo de " + c.fireInterval + " s", quick == 1 && sh.shotsFired - b2 == 2, "dois toques seguidos=" + quick + ", após o intervalo=" + (sh.shotsFired - b2));
            }
            if (c.pellets > 1) {
                setup(slot, c);
                t = spawnEnemy(ax, az + 6f, MathUtils.PI, "Idle");
                events.clear();
                aimAt(t.hitbox.chest);
                shootOnce(t.hitbox.chest);
                check("   espingarda: vários chumbos viram UM número de dano", events.size() == 1 && events.get(0)[0] > c.damage, events.size() + " eventos, " + (events.isEmpty() ? 0 : events.get(0)[0]) + " de dano");
            }
        }
        System.out.println("== M16A4: rajada de 3 ==");
        setup(3, null);
        Enemy tb = spawnEnemy(ax, az + 12f, MathUtils.PI, "Idle");
        aimAt(tb.hitbox.chest);
        int b = sh.shotsFired;
        step(1f / 30f, false, true);
        for (int i = 0; i < 12; i++) { step(1f / 30f, false, false); tb.health = Enemy.MAX_HEALTH; tb.state = Enemy.State.PATROL; aimAt(tb.hitbox.chest); }
        check("um toque = exatamente 3 tiros, mesmo soltando o botão", sh.shotsFired - b == 3, (sh.shotsFired - b) + " tiros");
        b = sh.shotsFired;
        step(1f / 30f, false, true);
        step(1f / 30f, false, true);
        check("outro toque dentro da rajada não empilha", sh.shotsFired - b <= 1, "");

        System.out.println("== 10/19. Recuo, rajada longa e controle com o dedo ==");
        setup(0, null);
        Enemy r1 = spawnEnemy(ax, az + 20f, MathUtils.PI, "Idle");
        aimAt(r1.hitbox.chest);
        float pitch0 = pitch;
        float s0 = 0f;
        for (int f = 0; f < 24; f++) {
            step(1f / 30f, true, f == 0);
            r1.health = Enemy.MAX_HEALTH;
            r1.state = Enemy.State.PATROL;
            if (f == 1) s0 = sh.lastSpread;
        }
        float rise = pitch0 - pitch;
        check("a mira sobe com o coice (previsível)", rise > 0.01f && rise < 0.6f, String.format("subiu %.1f°", Math.toDegrees(rise)));
        check("a dispersão aumenta na rajada longa", sh.lastSpread > s0 + 0.2f, String.format("%.2f° → %.2f°", s0, sh.lastSpread));
        float afterBurst = pitch;
        for (int f = 0; f < 45; f++) step(1f / 30f, false, false);
        float recovered = pitch - afterBurst;
        check("parando de atirar a mira volta em parte, sem passar do ponto", recovered > 0.2f * rise && recovered < rise, String.format("subiu %.1f°, voltou %.1f°", Math.toDegrees(rise), Math.toDegrees(recovered)));
        // o jogador puxa a mira para baixo: a volta automática diminui (o dedo já corrigiu)
        setup(0, null);
        r1 = spawnEnemy(ax, az + 20f, MathUtils.PI, "Idle");
        aimAt(r1.hitbox.chest);
        float p1 = pitch;
        for (int f = 0; f < 12; f++) {
            in.manualPitch = 0f;
            step(1f / 30f, true, f == 0);
            r1.health = Enemy.MAX_HEALTH;
            r1.state = Enemy.State.PATROL;
            float pull = Math.max(0f, (p1 - pitch)) * 0.5f;   // dedo para baixo compensando metade do coice
            pitch += pull;
            in.manualPitch = pull;
            p1 = pitch + 0f;
        }
        float afterPull = pitch;
        in.manualPitch = 0f;
        for (int f = 0; f < 45; f++) step(1f / 30f, false, false);
        float recoveredManual = pitch - afterPull;
        check("corrigindo com o dedo, a volta automática é menor (controle manual)", recoveredManual < recovered, String.format("%.1f° contra %.1f°", Math.toDegrees(recoveredManual), Math.toDegrees(recovered)));

        System.out.println("== 17/18. Troca de arma, recarga em animação e áudio ==");
        setup(0, null);
        Enemy rl = spawnEnemy(ax, az + 15f, MathUtils.PI, "Idle");
        shootOnce(rl.hitbox.chest);
        for (int i = 0; i < 8; i++) step(1f / 30f, false, false);
        check("a recarga começa (falta munição no pente)", wp.startReload(), "");
        float r0 = 0f;
        Vector3 m0 = new Vector3(wp.muzzle);
        for (int i = 0; i < 20; i++) step(1f / 30f, false, false);
        check("na recarga o cano desce (animação de recarga)", wp.muzzle.y < m0.y - 0.08f, String.format("desceu %.2f m", m0.y - wp.muzzle.y));
        wp.pickUp(new Weapons.Pickup(1, new ModelInstance(wp.models()[1]), ax, gy, az), w, ch, pl);
        check("trocar de arma cancela a recarga e a nova vem com pente cheio", !wp.reloading() && wp.ammo() == 30 && wp.modeLabel().equals("AUTO"), "");
        check("sacar a nova arma bloqueia o tiro por um instante (animação de sacar)", wp.drawing(), "");
        int bb = sh.shotsFired;
        step(1f / 30f, true, true);
        check("não atira enquanto saca", sh.shotsFired == bb, "");
        Vector3 mLow = new Vector3(wp.muzzle);
        for (int i = 0; i < 30; i++) step(1f / 30f, false, false);
        check("a arma sobe até a posição de mira ao terminar de sacar", !wp.drawing() && wp.muzzle.y > mLow.y, String.format("subiu %.2f m", wp.muzzle.y - mLow.y));
        int pl0 = sh.audio.played;
        sh.audio.update(1f);
        sh.audio.fire(WeaponConfig.Category.FUZIL, false);
        sh.audio.fire(WeaponConfig.Category.FUZIL, false);
        check("áudio: dois estampidos no mesmo instante tocam só um (sem empilhar)", sh.audio.played - pl0 <= 1, (sh.audio.played - pl0) + " som(ns)");
        sh.audio.update(1f);
        int p2 = sh.audio.played;
        for (int i = 0; i < 40; i++) { sh.audio.impact(Surface.MADEIRA, 10f); sh.audio.impact(Surface.PEDRA, 10f); sh.audio.update(0.002f); }
        check("áudio: o limite de vozes por janela de 100 ms vale", sh.audio.played - p2 <= 16, (sh.audio.played - p2) + " sons em 80 ms");

        System.out.println("== Zona segura ==");
        Zone z = new Zone(1915);
        float r0z = z.radius;
        boolean startsInside = z.inside(z.cx, z.cz) && !z.inside(z.cx + r0z + 5f, z.cz);
        check("zona começa grande e o centro está dentro dela", startsInside && r0z == Zone.RADII[0], "raio " + r0z);
        for (int i = 0; i < 101 * 30; i++) z.update(1f / 30f);
        check("depois da espera inicial ela começa a encolher", z.shrinking, z.label());
        boolean monotone = true;
        float prevR = z.radius, maxStep = 0f;
        for (int i = 0; i < 45 * 30; i++) {
            z.update(1f / 30f);
            if (z.radius > prevR + 1e-3f) monotone = false;
            maxStep = Math.max(maxStep, prevR - z.radius);
            prevR = z.radius;
        }
        check("encolhe suave até o raio da fase 2, sem pular", monotone && Math.abs(z.radius - Zone.RADII[1]) < 0.5f && maxStep < 0.2f, String.format("raio %.1f, maior passo %.3f m", z.radius, maxStep));
        check("o novo círculo cabe dentro do mapa", Math.hypot(z.cx, z.cz) < World.HALF, "");
        for (int i = 0; i < 20 * 60 * 30; i++) z.update(1f / 30f);
        check("termina na zona final pequena e para", z.finalPhase() && Math.abs(z.radius - Zone.RADII[Zone.RADII.length - 1]) < 0.5f && z.label().equals("Zona final"), String.format("raio %.1f", z.radius));
        boolean allInside = true, varied = true;
        float firstX = 0f;
        for (int k = 0; k < 300; k++) {
            Zone zk = new Zone(k * 7919L + 1);
            if (k == 0) firstX = zk.cx;
            else if (zk.cx == firstX) varied = false;
            if (Math.abs(zk.cx) + zk.radius > Zone.MAP_HALF || Math.abs(zk.cz) + zk.radius > Zone.MAP_HALF) allInside = false;
            if (zk.nextR() > 0 && Math.hypot(zk.nextCx() - zk.cx, zk.nextCz() - zk.cz) + zk.nextR() > zk.radius + 1e-3f) allInside = false;
        }
        check("300 partidas: centro aleatório e círculo sempre dentro do mapa", allInside && varied, "");
        Zone zev = new Zone(5);
        String evStart = zev.takeEvent();
        for (int i = 0; i < 101 * 30; i++) zev.update(1f / 30f);
        String ev1 = zev.takeEvent();
        check("avisos: começo e 'zona diminuindo' aparecem na tela", evStart != null && ev1 != null && ev1.startsWith("ZONA DIMINUINDO"), String.valueOf(ev1));
        check("o dano fora da zona cresce nas fases finais", z.damagePerSecond() > new Zone(1).damagePerSecond(), z.damagePerSecond() + " vida/s");

        System.out.println("== Desempenho e pool ==");
        setup(0, null);
        Enemy pf = spawnEnemy(ax, az + 8f, MathUtils.PI, "Idle");
        long t1 = System.nanoTime();
        int N = 300;
        for (int i = 0; i < N; i++) {
            pf.health = Enemy.MAX_HEALTH;
            pf.state = Enemy.State.PATROL;
            aimAt(i % 2 == 0 ? pf.hitbox.chest : new Vector3(ax + 3f, gy, az + 10f));
            step(1f / 30f, true, i == 0);
            if (wp.ammo() < 5) { wp.startReload(); for (int k = 0; k < 120 && wp.reloading(); k++) sh.update(1f / 30f, in, false); wp.tick(10f); }
        }
        float us = (System.nanoTime() - t1) / 1000f / N;
        check("mais de 300 quadros de rajada: partículas e marcas dentro do limite", sh.impacts.activeCount() <= 24 + 40 + 24, sh.impacts.activeCount() + " ativos");
        check("quadro completo de tiro (personagem+arma+tiro+efeitos) abaixo de 3 ms no PC", us < 3000f, String.format("%.0f µs", us));
    }

    boolean runUntilFlashEnds() {
        for (int i = 0; i < 10; i++) {
            step(1f / 30f, false, false);
            if (!sh.flash.flashing()) return false;
        }
        return true;
    }

    public static void main(String[] args) {
        new HeadlessApplication(new ShootTests(), new HeadlessApplicationConfiguration());
    }
}
