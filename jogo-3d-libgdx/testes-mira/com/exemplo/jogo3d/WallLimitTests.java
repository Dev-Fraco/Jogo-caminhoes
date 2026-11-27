package com.exemplo.jogo3d;

import com.badlogic.gdx.ApplicationAdapter;
import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.backends.headless.HeadlessApplication;
import com.badlogic.gdx.backends.headless.HeadlessApplicationConfiguration;
import com.badlogic.gdx.graphics.GL20;

import java.lang.reflect.Proxy;

/** Limite de paredes de proteção: 7 colocadas; a oitava faz sumir a primeira (modelo e colisão). */
public class WallLimitTests extends ApplicationAdapter {
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
        System.out.println("== Limite de 7 paredes de proteção ==");
        World w = new World();
        w.create();
        check("limite é 7 paredes", World.MAX_WALLS == 7, "" + World.MAX_WALLS);
        float px = 0f, pz = 0f;
        for (int i = 0; i < 7; i++) {
            w.placeWall(px + i * 12f, pz, 0f);
        }
        check("7 paredes colocadas ficam no mundo", w.walls.size == 7, "" + w.walls.size);
        StoneWall primeira = w.walls.first();
        w.placeWall(px + 7 * 12f, pz, 0f);
        check("a oitava parede entra e o total continua 7", w.walls.size == 7, "" + w.walls.size);
        check("a primeira (mais antiga) some", !w.walls.contains(primeira, true), "");
        check("e a primeira some do mundo (modelo tirado)", !w.instances.contains(primeira.mi, true), "");
        boolean colisaoSaiu = true;
        for (int i = 0; i < primeira.cols.size; i++) if (w.obstacles.contains(primeira.cols.get(i), true)) colisaoSaiu = false;
        check("a colisão da primeira também sai", colisaoSaiu && primeira.cols.size > 0, "colisões da primeira: " + primeira.cols.size);
        for (int i = 0; i < 5; i++) w.placeWall(px + (8 + i) * 12f, pz, 0f);
        check("muitas paredes: sempre no máximo 7", w.walls.size == 7, "" + w.walls.size);
    }

    public static void main(String[] args) {
        new HeadlessApplication(new WallLimitTests(), new HeadlessApplicationConfiguration());
    }
}
