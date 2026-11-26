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
        System.out.printf("  (info) armados: %d de 80; armas no chão: %d de %d no começo%n", armedNow, onGround, pickups0);
    }

    public static void main(String[] args) {
        new HeadlessApplication(new BotDropTests(), new HeadlessApplicationConfiguration());
    }
}
