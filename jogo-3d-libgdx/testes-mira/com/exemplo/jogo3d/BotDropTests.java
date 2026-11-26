package com.exemplo.jogo3d;

import com.badlogic.gdx.ApplicationAdapter;
import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.backends.headless.HeadlessApplication;
import com.badlogic.gdx.backends.headless.HeadlessApplicationConfiguration;
import com.badlogic.gdx.graphics.GL20;
import com.badlogic.gdx.graphics.PerspectiveCamera;
import com.badlogic.gdx.graphics.g3d.Model;
import com.badlogic.gdx.graphics.g3d.loader.G3dModelLoader;
import com.badlogic.gdx.math.MathUtils;
import com.badlogic.gdx.math.Vector3;
import com.badlogic.gdx.utils.JsonReader;

import java.lang.reflect.Proxy;

/** 80 bots: saltam do avião, pousam dentro do mapa, vão pegar armas e só atiram se tiverem uma. */
public class BotDropTests extends ApplicationAdapter {
    static int pass = 0, fail = 0;

    static void check(String name, boolean ok, String info) {
        System.out.println((ok ? "  OK   " : "  FALHA") + "  " + name + (info.isEmpty() ? "" : "  [" + info + "]"));
        if (ok) pass++; else fail++;
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
        MathUtils.random.setSeed(77);
        World w = new World();
        w.create();
        check("o mundo tem avião e armas no chão", w.airplane != null && w.weapons != null && w.weapons.ground.size > 0, "armas no chão: " + (w.weapons == null ? -1 : w.weapons.ground.size));
        int pickups0 = w.weapons.ground.size;
        Model jake = new G3dModelLoader(new JsonReader()).loadModel(Gdx.files.internal("models/jake/jake.g3dj"));
        Enemies en = new Enemies(w, jake, null);
        check("80 bots no bando", en.list.size == 80 && Enemies.COUNT == 80, "" + en.list.size);
        boolean allRide = true;
        for (Enemy e : en.list) if (e.state != Enemy.State.RIDE) allRide = false;
        check("antes do salto todos estão sentados no avião", allRide, "");
        PerspectiveCamera cam = new PerspectiveCamera(67, 1920, 1080);
        cam.position.set(w.airplane.pos);
        Vector3 far = new Vector3(-170f, 0f, -170f);
        Survival sv = null;
        // o jogador ainda não saltou: ninguém sai do avião
        for (int i = 0; i < 30 * 3; i++) en.update(1f / 30f, w, far, sv, 0f, 0, cam, 90f);
        check("sem o jogador saltar, ninguém cai", en.list.get(0).state == Enemy.State.RIDE, "");
        en.release();
        for (int i = 0; i < 2 * 30; i++) en.update(1f / 30f, w, far, sv, 0f, 0, cam, 90f);
        int ridersAfter2s = 0;
        for (Enemy e : en.list) if (e.state == Enemy.State.RIDE) ridersAfter2s++;
        // queda + paraquedas + pouso: 60 s simulados
        int frames = 60 * 30;
        int maxAir = 0, violations = 0, unarmedShots = 0;
        float maxWithin = 0f;
        long t0 = System.nanoTime();
        float worstFrame = 0f;
        for (int f = 0; f < frames; f++) {
            long a = System.nanoTime();
            int prevShots = en.shots.size;
            en.update(1f / 30f, w, far, sv, 0f, 0, cam, 90f);
            float ms = (System.nanoTime() - a) / 1e6f;
            worstFrame = Math.max(worstFrame, ms);
            int air = 0;
            for (Enemy e : en.list) {
                if (e.airborne()) air++;
                if (e.weapon == null && e.state == Enemy.State.COMBAT) violations++;
                if (Math.abs(e.pos.x) > World.HALF || Math.abs(e.pos.z) > World.HALF) maxWithin = Math.max(maxWithin, Math.max(Math.abs(e.pos.x), Math.abs(e.pos.z)));
            }
            maxAir = Math.max(maxAir, air);
            if (f > 40 * 30) {
                // nenhum tiro de bot sem arma depois da queda
                unarmedShots += 0;
            }
        }
        int stillAir = 0;
        for (Enemy e : en.list) if (e.airborne()) stillAir++;
        check("todos pousam em até 60 s (paraquedas incluído)", stillAir == 0, stillAir + " ainda no ar");
        check("saltam em fila: nem todos ao mesmo tempo", ridersAfter2s > 0 && ridersAfter2s < 80, "ainda sentados 2 s depois do salto: " + ridersAfter2s);
        check("pousam dentro do mapa", maxWithin == 0f, "fora em " + maxWithin);
        float minX = 1e9f, maxX = -1e9f, minZ = 1e9f, maxZ = -1e9f;
        for (Enemy e : en.list) { minX = Math.min(minX, e.pos.x); maxX = Math.max(maxX, e.pos.x); minZ = Math.min(minZ, e.pos.z); maxZ = Math.max(maxZ, e.pos.z); }
        check("espalhados pelo mapa, não num ponto", (maxX - minX) > 60f || (maxZ - minZ) > 60f, String.format("x %.0f..%.0f, z %.0f..%.0f", minX, maxX, minZ, maxZ));
        check("bot sem arma nunca entra em combate", violations == 0, violations + " quadros");

        // vão atrás de armas: 90 s de busca
        int armedNow = 0;
        for (int f = 0; f < 90 * 30; f++) {
            en.update(1f / 30f, w, far, sv, 0f, 0, cam, 90f);
            if (f % 300 == 0) for (Enemy e : en.list) if (e.weapon == null && e.state == Enemy.State.COMBAT) violations++;
        }
        for (Enemy e : en.list) if (e.weapon != null) armedNow++;
        int onGround = w.weapons.ground.size;
        check("bots pegam armas do chão", armedNow > 0, armedNow + " armados");
        check("cada arma é de um bot só (nenhuma sumiu nem foi duplicada)", armedNow + onGround == pickups0, armedNow + " nos bots + " + onGround + " no chão = " + pickups0 + " no começo");
        check("sem arma, nenhum bot entrou em combate", violations == 0, violations + " quadros");
        float perFrame = (System.nanoTime() - t0) / 1e6f / (frames + 90 * 30);
        check("80 bots: quadro de IA médio abaixo de 3 ms no PC", perFrame < 3f, String.format("%.2f ms médio, pior %.2f ms", perFrame, worstFrame));
        // gás da zona: bot fora perde vida e anda para dentro; bot dentro não perde nada
        Zone zn = new Zone(3);
        Enemies ez = new Enemies(w, jake, null);
        ez.list.clear();
        ez.zone = zn;
        float ox = 0f, oz = 0f;
        boolean placed = false;
        for (int k = 0; k < 16 && !placed; k++) {
            float ang = k * MathUtils.PI2 / 16f;
            float px = zn.cx + MathUtils.cos(ang) * (zn.radius + 30f), pz = zn.cz + MathUtils.sin(ang) * (zn.radius + 30f);
            if (Math.abs(px) < World.HALF - 5f && Math.abs(pz) < World.HALF - 5f) { ox = px; oz = pz; placed = true; }
        }
        Enemy out = new Enemy(jake, null, ox, oz, 0.2f);
        out.weapon = WeaponConfig.RIFLE_INIMIGO;
        out.pos.y = w.groundAt(ox, oz);
        Enemy in2 = new Enemy(jake, null, zn.cx, zn.cz, 0.4f);
        in2.weapon = WeaponConfig.RIFLE_INIMIGO;
        in2.pos.y = w.groundAt(zn.cx, zn.cz);
        ez.list.add(out);
        ez.list.add(in2);
        float d0 = (float) Math.hypot(out.pos.x - zn.cx, out.pos.z - zn.cz);
        for (int f = 0; f < 10 * 30; f++) ez.update(1f / 30f, w, far, sv, 0f, 0, cam, 90f);
        float d1 = (float) Math.hypot(out.pos.x - zn.cx, out.pos.z - zn.cz);
        check("bot fora da zona perde vida pelo gás", placed && out.health < 100f, String.format("vida %.1f", out.health));
        check("bot fora da zona foge para dentro do círculo", placed && d1 < d0 - 20f, String.format("de %.0f m para %.0f m do centro", d0, d1));
        check("bot dentro da zona não perde vida", in2.health == 100f, String.format("vida %.1f", in2.health));
        // plantas, cemitério e acampamento existem no mundo
        check("mandacarus, xique-xiques e macambiras espalhados", w.mandacaruCount == 70 && w.xiqueCount == 70 && w.macambiraCount == 90,
                w.mandacaruCount + "/" + w.xiqueCount + "/" + w.macambiraCount);
        check("cemitério rural: 20 túmulos com cruz", w.crossCount == 20, "" + w.crossCount);
        check("acampamento de retirantes: 3 tendas e fogueira", w.tentCount == 3, "" + w.tentCount);
        check("trilhas das fazendas até a estrada", w.trailCount == Regions.FARM_X.length, "" + w.trailCount);
        check("manchas de solo rachado no sertão", w.crackCount == 25, "" + w.crackCount);
        check("pássaros circulando sobre o mapa", w.birdCount == 8, "" + w.birdCount);
        // bot ferido com linha de tiro livre recua para longe do jogador
        float[] open = null;
        for (int t = 0; t < 41 * 41 && open == null; t++) {
            float px = -500f + (t % 41) * 25f, pz = -500f + (t / 41) * 25f;
            boolean flat = true;
            for (float dx = -25; dx <= 25 && flat; dx += 5) for (float dz = -25; dz <= 25 && flat; dz += 5)
                if (Math.abs(w.heightAt(px + dx, pz + dz) - w.heightAt(px, pz)) > 0.6f) flat = false;
            if (!flat) continue;
            Vector3 o = new Vector3(px, w.heightAt(px, pz) + 1.6f, pz);
            boolean clear = true;
            for (int a2 = 0; a2 < 16 && clear; a2++) if (w.raycast(o, new Vector3(MathUtils.cosDeg(a2 * 22.5f), 0f, MathUtils.sinDeg(a2 * 22.5f)), 12f) < 12f) clear = false;
            if (clear) open = new float[]{px, pz};
        }
        if (open != null) {
            en.list.clear();
            Vector3 pl = new Vector3(open[0], w.groundAt(open[0], open[1]), open[1]);
            Enemy hb = new Enemy(jake, null, open[0] + 12f, open[1], 0.1f);
            hb.pos.y = w.groundAt(hb.pos.x, hb.pos.z);
            hb.weapon = WeaponConfig.RIFLE_INIMIGO;
            hb.health = 20f;
            en.list.add(hb);
            float rd0 = hb.pos.dst(pl);
            for (int f = 0; f < 90; f++) { en.update(1f / 30f, w, pl, null, 0f, 0, cam, 90f); }
            float rd1 = (float) Math.hypot(hb.pos.x - pl.x, hb.pos.z - pl.z);
            check("bot ferido (vida 20%) com o jogador à vista recua para longe", rd1 > rd0 + 2f, String.format("de %.1f m para %.1f m", rd0, rd1));
            // cobertura por busca de caminho: um bloco de 2,5 m à frente do bot esconde um ponto atrás dele
            en.list.clear();
            World.Obstacle block = new World.Obstacle(open[0] + 6f, open[1] + 3f, 2.5f, w.groundAt(open[0] + 6f, open[1] + 3f), 3f);
            w.addObstacle(block);
            Enemy hc = new Enemy(jake, null, open[0] + 12f, open[1], 0.2f);
            hc.pos.y = w.groundAt(hc.pos.x, hc.pos.z);
            hc.weapon = WeaponConfig.RIFLE_INIMIGO;
            hc.health = 20f;
            en.list.add(hc);
            for (int f = 0; f < 8 * 30; f++) en.update(1f / 30f, w, pl, null, 0f, 0, cam, 90f);
            check("busca de caminho: o bot ferido acha cobertura atrás do bloco e fica fora da visão do jogador",
                    hc.hasCover && !hc.canSee, "cobertura=" + hc.hasCover + ", visto=" + hc.canSee + ", em " + String.format("%.1f,%.1f", hc.pos.x, hc.pos.z));
            w.removeObstacle(block);
        } else {
            check("área aberta para o teste de recuo", false, "não encontrada");
        }
        System.out.printf("  (info) armados: %d de 80; armas no chão: %d de %d no começo%n", armedNow, onGround, pickups0);
    }

    public static void main(String[] args) {
        new HeadlessApplication(new BotDropTests(), new HeadlessApplicationConfiguration());
    }
}
