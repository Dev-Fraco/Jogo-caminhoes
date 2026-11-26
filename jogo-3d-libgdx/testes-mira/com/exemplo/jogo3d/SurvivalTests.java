package com.exemplo.jogo3d;

import com.badlogic.gdx.ApplicationAdapter;
import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.backends.headless.HeadlessApplication;
import com.badlogic.gdx.backends.headless.HeadlessApplicationConfiguration;
import com.badlogic.gdx.graphics.GL20;
import com.badlogic.gdx.math.Vector3;

import java.lang.reflect.Proxy;

/** Sobrevivência básica: fome, comer, descanso, fogueiras e os novos itens no mundo. */
public class SurvivalTests extends ApplicationAdapter {
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
        System.out.println("== Fome ==");
        Survival s = new Survival();
        for (int i = 0; i < 450; i++) s.update(1f, false);
        check("a fome cai 100 em 15 min (metade depois de 7,5 min)", Math.abs(s.hunger - 50f) < 1f, String.format("%.1f", s.hunger));
        s.hunger = 20f;
        check("comer a fruta restaura a fome", s.eat() && Math.abs(s.hunger - 55f) < 0.01f, String.format("%.1f", s.hunger));
        s.hunger = 100f;
        check("sem fome, a fruta não é gasta", !s.eat(), "");
        s.hunger = 0f;
        float h0 = s.health;
        for (int i = 0; i < 10; i++) s.update(1f, false);
        check("com fome zerada, a vida cai", s.health < h0, String.format("%.1f → %.1f", h0, s.health));

        System.out.println("== Descanso ==");
        Survival r = new Survival();
        r.health = 50f;
        r.restBonus = 2f;
        for (int i = 0; i < 5; i++) r.update(1f, false);
        check("descansando (rede/fogueira) a vida sobe", r.health > 55f, String.format("%.1f", r.health));
        r.hunger = 5f;
        float h1 = r.health;
        for (int i = 0; i < 5; i++) r.update(1f, false);
        check("com muita fome não recupera ao descansar", r.health <= h1 + 0.01f, String.format("%.1f", r.health));

        System.out.println("== Fogueiras e itens no mundo ==");
        World w = new World();
        w.create();
        Camp c = new Camp();
        check("acende fogueira 1", c.light(new Vector3(10f, 0f, 10f), w), "");
        check("acende fogueira 2", c.light(new Vector3(40f, 0f, 10f), w), "");
        check("acende fogueira 3", c.light(new Vector3(70f, 0f, 10f), w), "");
        check("não acende a 4ª (máximo 3)", !c.light(new Vector3(100f, 0f, 10f), w) && c.count() == 3, "" + c.count());
        check("aquece perto da fogueira", c.warmth(new Vector3(11f, 0f, 11f)) > 0f, "");
        check("não aquece longe das fogueiras", c.warmth(new Vector3(-200f, 0f, -200f)) == 0f, "");
        int lenha = 0, fruta = 0;
        for (int i = 0; i < w.items.ground.size; i++) {
            int t = w.items.ground.get(i).type;
            if (t == Items.LENHA) lenha++;
            if (t == Items.FRUTA) fruta++;
        }
        check("lenha e frutas do xique-xique espalhadas no mapa", lenha >= 30 && fruta >= 30, "lenha " + lenha + ", frutas " + fruta);
        System.out.println("== Currais e cercas ==");
        check("um curral em cada fazenda", w.corralCount == Regions.FARM_X.length, "" + w.corralCount);
        check("25 trechos de cerca por curral", w.corralFenceCount == 25 * w.corralCount, "" + w.corralFenceCount);
        float cx = w.firstCorralX, cz = w.firstCorralZ;
        com.badlogic.gdx.math.Vector3 onFence = new com.badlogic.gdx.math.Vector3(cx + 7f, 0f, cz + 1f);
        onFence.y = w.groundAt(onFence.x, onFence.z);
        com.badlogic.gdx.math.Vector3 q = new com.badlogic.gdx.math.Vector3(onFence);
        w.resolveCollisions(q, 0.35f);
        check("a cerca barra o jogador (lado leste): empurra para fora da linha", q.dst(onFence) > 0.02f, String.format("empurrado %.2f m", q.dst(onFence)));
        com.badlogic.gdx.math.Vector3 gate = new com.badlogic.gdx.math.Vector3(cx, w.groundAt(cx, cz - 7f), cz - 7f);
        com.badlogic.gdx.math.Vector3 g2 = new com.badlogic.gdx.math.Vector3(gate);
        w.resolveCollisions(g2, 0.35f);
        check("a porteira deixa passar (lado sul)", g2.dst(gate) < 0.05f, String.format("empurrado %.2f m", g2.dst(gate)));
        check("os itens têm nome", Items.NAMES[Items.LENHA].equals("LENHA") && Items.NAMES[Items.FRUTA].startsWith("FRUTA"), "");
    }

    public static void main(String[] args) {
        new HeadlessApplication(new SurvivalTests(), new HeadlessApplicationConfiguration());
    }
}
