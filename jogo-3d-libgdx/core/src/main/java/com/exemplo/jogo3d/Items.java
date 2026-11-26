package com.exemplo.jogo3d;

import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.graphics.g3d.Model;
import com.badlogic.gdx.graphics.g3d.ModelInstance;
import com.badlogic.gdx.graphics.g3d.loader.G3dModelLoader;
import com.badlogic.gdx.math.Vector3;
import com.badlogic.gdx.utils.Array;
import com.badlogic.gdx.utils.JsonReader;

import java.util.Random;

/**
 * Itens do battle royale espalhados para pegar: cura (kit médico, bandagem, analgésico, injeção),
 * energético, granadas (fragmentação, fumaça, atordoante) e mochila. Pegando, vão para a mochila.
 */
final class Items {
    static final String[] NAMES = {"KIT MÉDICO", "BANDAGEM", "ANALGÉSICO", "INJEÇÃO", "ENERGÉTICO",
            "GRANADA", "GRANADA DE FUMAÇA", "GRANADA ATORDOANTE", "MOCHILA"};
    private static final String[] FILES = {"medkit", "bandagem", "analgesico", "injecao", "energetico",
            "granada", "granada_fumaca", "granada_atordoante", "mochila"};
    private static final float PICK_RANGE = 1.6f;

    static final class Pickup {
        final int type;
        final ModelInstance inst;
        final Vector3 pos = new Vector3();

        Pickup(int type, ModelInstance inst, float x, float y, float z) {
            this.type = type;
            this.inst = inst;
            pos.set(x, y, z);
        }
    }

    private final Model[] models = new Model[FILES.length];
    final Array<Pickup> ground = new Array<>();
    final int[] bag = new int[FILES.length];   // quantos de cada na mochila

    Items() {
        for (int i = 0; i < FILES.length; i++) {
            models[i] = new G3dModelLoader(new JsonReader()).loadModel(Gdx.files.internal("models/itens/" + FILES[i] + ".g3dj"));
        }
    }

    /** Sorteia um item: cura e energético são mais comuns, mochila é rara. */
    private static int roll(Random r) {
        float f = r.nextFloat();
        if (f < 0.14f) return 0;
        if (f < 0.32f) return 1;
        if (f < 0.44f) return 2;
        if (f < 0.52f) return 3;
        if (f < 0.68f) return 4;
        if (f < 0.80f) return 5;
        if (f < 0.88f) return 6;
        if (f < 0.95f) return 7;
        return 8;
    }

    /** Espalha os itens: dentro das casas de taipa, na frente das casas da cidade e soltos pelo mapa. */
    void scatter(World w, Random rnd) {
        for (int i = 0; i < w.houses.size; i++) {
            Vector3 p = new Vector3(1.4f, 0f, 1.5f).mul(w.houses.get(i).t);
            drop(w, roll(rnd), p.x, p.z, rnd);
        }
        for (int i = 0; i < w.boxes.size; i++) {
            World.Box b = w.boxes.get(i);
            if (b.hx < 2f) continue;
            Vector3 p = new Vector3(-b.hx * 0.45f, 0f, b.hz + 1.0f).mul(b.t);
            drop(w, roll(rnd), p.x, p.z, rnd);
        }
        for (int i = 0; i < 30; i++) {
            float[] p = w.openSpot(rnd);
            drop(w, roll(rnd), p[0], p[1], rnd);
        }
    }

    private void drop(World w, int type, float x, float z, Random rnd) {
        float y = w.groundAt(x, z);
        ModelInstance mi = new ModelInstance(models[type]);
        mi.transform.setToTranslation(x, y, z).rotate(Vector3.Y, rnd.nextFloat() * 360f);
        w.instances.add(mi);
        ground.add(new Pickup(type, mi, x, y, z));
    }

    Pickup nearest(Vector3 p) {
        Pickup best = null;
        float bd = PICK_RANGE * PICK_RANGE;
        for (int i = 0; i < ground.size; i++) {
            Pickup g = ground.get(i);
            float dx = g.pos.x - p.x, dz = g.pos.z - p.z;
            float d = dx * dx + dz * dz;
            if (d < bd && Math.abs(g.pos.y - p.y) < 1.5f) {
                bd = d;
                best = g;
            }
        }
        return best;
    }

    /** Pega e põe na mochila. */
    void pickUp(Pickup g, World w) {
        ground.removeValue(g, true);
        w.instances.removeValue(g.inst, true);
        bag[g.type]++;
    }

    /** Resumo da mochila, ex.: "KIT MÉDICO 1 · ENERGÉTICO 2". */
    String summary() {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < bag.length; i++) {
            if (bag[i] == 0) continue;
            if (sb.length() > 0) sb.append("  ·  ");
            sb.append(NAMES[i]).append(' ').append(bag[i]);
        }
        return sb.toString();
    }

    void dispose() {
        for (Model m : models) if (m != null) m.dispose();
    }
}
