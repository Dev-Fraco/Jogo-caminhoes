package com.exemplo.jogo3d;

import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.backends.headless.HeadlessApplication;
import com.badlogic.gdx.backends.headless.HeadlessApplicationConfiguration;
import com.badlogic.gdx.ApplicationAdapter;
import com.badlogic.gdx.graphics.GL20;
import com.badlogic.gdx.graphics.g3d.Model;
import com.badlogic.gdx.graphics.g3d.ModelInstance;
import com.badlogic.gdx.math.collision.BoundingBox;

import java.lang.reflect.Proxy;

/** Prateleira do treino: armas sobre as tábuas, dentro da prateleira, sem flutuar nem sobrepor. */
public class ShelfTests extends ApplicationAdapter {
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
        System.out.println("== Prateleira do treino ==");
        World w = new World(true);
        w.create();
        Model[] ms = w.weapons.models();
        BoundingBox[] boxes = new BoundingBox[ms.length];
        java.util.List<ModelInstance> placed = new java.util.ArrayList<>();
        for (ModelInstance mi : w.instances) {
            for (int t = 0; t < ms.length; t++) if (mi.model == ms[t]) placed.add(mi);
        }
        check("as 8 armas estão na prateleira", placed.size() == ms.length, "" + placed.size());
        float x0 = World.TRAIN_BOX_X - 0.58f, x1 = World.TRAIN_BOX_X + 0.58f;
        float z0 = World.TRAIN_BOX_Z - 1.5f, z1 = World.TRAIN_BOX_Z + 1.5f;
        boolean inside = true, onPlank = true, clear = true;
        int k = 0;
        for (ModelInstance mi : placed) {
            BoundingBox bb = new BoundingBox();
            mi.calculateBoundingBox(bb);
            bb.mul(mi.transform);   // a caixa sai em coordenadas locais: leva para o mundo
            boxes[k++] = bb;
            if (bb.min.x < x0 || bb.max.x > x1 || bb.min.z < z0 || bb.max.z > z1) inside = false;
            boolean sits = false;
            for (float lv : World.SHELF_LEVELS) if (Math.abs(bb.min.y - lv) < 0.02f) sits = true;
            if (!sits) onPlank = false;
        }
        check("todas dentro da prateleira (largura e comprimento)", inside, "");
        check("todas encostadas numa tábua (sem flutuar)", onPlank, "");
        for (int i = 0; i < boxes.length && clear; i++)
            for (int j = i + 1; j < boxes.length && clear; j++)
                if (boxes[i].intersects(boxes[j])) clear = false;
        check("nenhuma arma sobreposta a outra", clear, "");
        System.out.println("\nRESULTADO: " + pass + " ok, " + fail + " falhas");
        System.exit(fail == 0 ? 0 : 1);
    }

    public static void main(String[] args) {
        new HeadlessApplication(new ShelfTests(), new HeadlessApplicationConfiguration());
    }
}
