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

/** Alvo parado ao lado do cemitério (para ajustar a mira) e o mundo: cemitério, plantas, acampamento, trilhas e pássaros. */
public class TargetBotTests extends ApplicationAdapter {
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
        Model jake = ModelIO.load("models/jake/jake.g3dj");
        Enemies en = new Enemies(w, jake, null);
        check("só um alvo no mundo", en.list.size == 1 && Enemies.COUNT == 1, "" + en.list.size);
        Enemy t = en.list.get(0);

        // fica ao lado do cemitério, de frente para ele
        float dc = (float) Math.hypot(t.pos.x - w.cemX, t.pos.z - w.cemZ);
        check("alvo ao lado do cemitério (fora da cerca, perto)", w.hasCem && dc > World.CEM_HW && dc < World.CEM_HW + 12f,
                String.format("%.1f m do centro do cemitério", dc));
        float toCem = MathUtils.atan2(w.cemX - t.pos.x, w.cemZ - t.pos.z);
        float dface = Math.abs(((t.facing - toCem) % MathUtils.PI2 + 3 * MathUtils.PI) % MathUtils.PI2 - MathUtils.PI);
        check("alvo de frente para o cemitério", dface < 0.05f, String.format("erro %.3f rad", dface));

        // parado: não anda nem atira, mesmo com o jogador perto
        PerspectiveCamera cam = new PerspectiveCamera(67, 1920, 1080);
        cam.position.set(t.pos.x - 6f, t.pos.y + 1.6f, t.pos.z);
        cam.lookAt(t.pos.x, t.pos.y + 1f, t.pos.z);
        cam.update();
        Vector3 start = new Vector3(t.pos);
        Vector3 player = new Vector3(t.pos.x - 6f, t.pos.y, t.pos.z);
        int shots = 0;
        for (int f = 0; f < 15 * 30; f++) {
            en.update(1f / 30f, w, player, null, 0f, 0, cam, 90f);
            shots += en.shots.size;
        }
        check("fica parado 15 s", t.pos.dst(start) < 0.01f, String.format("andou %.3f m", t.pos.dst(start)));
        check("não atira", shots == 0, shots + " tiros");

        // leva tiro sem morrer: sempre de pé para a próxima rajada
        float hp = t.health;
        boolean died = t.damage(500f, player);
        check("leva tiro e não morre", t.alive() && !died && t.health == hp, String.format("vida %.0f", t.health));

        // a mira acerta o alvo
        Vector3 aimEye = new Vector3(t.pos.x - 8f, t.pos.y + 1.4f, t.pos.z);
        Vector3 aimDir = new Vector3(t.pos.x, t.pos.y + 1.0f, t.pos.z).sub(aimEye).nor();
        Hitbox.Hit aimHit = new Hitbox.Hit();
        en.nextFrame();
        Enemy h = en.raycast(aimEye, aimDir, 50f, false, aimHit);
        check("o tiro na direção do alvo acerta", h == t && aimHit.t > 0f && aimHit.t < 50f, aimHit.region == null ? "sem região" : aimHit.region.toString());

        // mundo: cemitério, plantas e pontos do sertão
        // plantas, cemitério e acampamento existem no mundo
        check("mandacarus, xique-xiques e macambiras espalhados", w.mandacaruCount == 70 && w.xiqueCount == 70 && w.macambiraCount == 90,
                w.mandacaruCount + "/" + w.xiqueCount + "/" + w.macambiraCount);
        check("cemitério montado: 24 túmulos", w.hasCem && w.crossCount == 24, "" + w.crossCount);
        check("cemitério: colisão de cerca, portão, lápides e caixões", w.cemColliders == 250, "" + w.cemColliders);
        {
            float sn = MathUtils.sinDeg(w.cemYaw), cs = MathUtils.cosDeg(w.cemYaw);
            float maxDev = 0f;
            for (float a2 = -11f; a2 <= 11f; a2 += 1f) for (float b2 = -11f; b2 <= 11f; b2 += 1f)
                maxDev = Math.max(maxDev, Math.abs(w.heightAt(w.cemX + a2, w.cemZ + b2) - w.cemH));
            check("cemitério: chão plano dentro do cercado", maxDev < 0.01f, String.format("desvio %.3f m", maxDev));
            int strays = 0;
            for (World.Obstacle o : w.obstacles)
                if (Math.abs(o.x - w.cemX) < 9.5f && Math.abs(o.z - w.cemZ) < 9.5f && o.radius > 0.45f) strays++;
            check("cemitério: sem cacto, árvore ou pedra dentro", strays == 0, strays + " obstáculos grandes");
            // entra pelo portão: anda do lado de fora até o centro
            Vector3 p = new Vector3(w.cemX - sn * (World.CEM_HD + 4f), 0f, w.cemZ - cs * (World.CEM_HD + 4f));
            for (int f = 0; f < 400; f++) { p.x += sn * 0.05f; p.z += cs * 0.05f; w.resolveCollisions(p, 0.35f); }
            float inside = (p.x - w.cemX) * sn + (p.z - w.cemZ) * cs + World.CEM_HD;   // distância do portão para dentro
            check("cemitério: dá para entrar pelo portão e andar no corredor", inside > 12f, String.format("%.1f m para dentro", inside));
            // pela lateral a cerca segura
            Vector3 q = new Vector3(w.cemX + cs * (World.CEM_HW + 3f), 0f, w.cemZ - sn * (World.CEM_HW + 3f));
            for (int f = 0; f < 200; f++) { q.x -= cs * 0.05f; q.z += sn * 0.05f; w.resolveCollisions(q, 0.35f); }
            float side = (float) Math.hypot(q.x - w.cemX, q.z - w.cemZ);
            check("cemitério: a cerca não deixa atravessar", side > World.CEM_HW, String.format("%.1f m do centro", side));
            Vector3 eye = new Vector3(p.x, w.cemH + 1.0f, p.z);
            float hit = w.raycast(eye, new Vector3(sn, 0f, cs), 30f);
            check("cemitério: lápides/cruzeiro param tiro no corredor", hit < 20f, String.format("%.1f m", hit));
            // Lugar plano: o relevo em 30 m em volta é pequeno, e o aterro até 24 m do cercado é suave
            float rel = 0f, slope = 0f;
            for (float a3 = 0f; a3 < 6.28f; a3 += 0.1f) for (float d3 = 0f; d3 <= 30f; d3 += 2f) {
                float hx = w.cemX + (float) Math.cos(a3) * d3, hz = w.cemZ + (float) Math.sin(a3) * d3;
                rel = Math.max(rel, Math.abs(w.heightAt(hx, hz) - w.cemH));
            }
            for (float d4 = World.CEM_HW + 2f; d4 < World.CEM_HW + World.CEM_BLEND; d4 += 0.5f) {
                float g = Math.abs(w.heightAt(w.cemX + d4 + 0.5f, w.cemZ) - w.heightAt(w.cemX + d4, w.cemZ)) / 0.5f;
                slope = Math.max(slope, g);
            }
            check("cemitério: o relevo em 30 m em volta é pequeno", rel < 6f, String.format("desvio máx %.1f m", rel));
            check("cemitério: o aterro até 24 m é suave", slope < 0.35f, String.format("inclinação máx %.2f", slope));
            Places pl = new Places(w);
            int named = 0;
            for (int qi = 0; qi < pl.list.size; qi++) if (pl.list.get(qi).name != null && !pl.list.get(qi).name.isEmpty()) named++;
            check("lugares do mapa com nome", named == pl.list.size && pl.list.size >= 10, named + " nomes");
            System.out.printf("  cemitério em (%.0f, %.0f) altura %.1f giro %.0f%n", w.cemX, w.cemZ, w.cemH, w.cemYaw);
        }
        check("acampamento de retirantes: 3 tendas e fogueira", w.tentCount == 3, "" + w.tentCount);
        check("trilhas das fazendas até a estrada", w.trailCount == Regions.FARM_X.length, "" + w.trailCount);
        check("manchas de solo rachado no sertão", w.crackCount == 25, "" + w.crackCount);
        check("pássaros circulando sobre o mapa", w.birdCount == 8, "" + w.birdCount);
    }

    public static void main(String[] args) {
        new HeadlessApplication(new TargetBotTests(), new HeadlessApplicationConfiguration());
    }
}
