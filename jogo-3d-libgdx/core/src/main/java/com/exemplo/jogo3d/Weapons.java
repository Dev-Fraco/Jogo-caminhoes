package com.exemplo.jogo3d;

import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.graphics.g3d.Model;
import com.badlogic.gdx.graphics.g3d.ModelInstance;
import com.badlogic.gdx.graphics.g3d.loader.G3dModelLoader;
import com.badlogic.gdx.math.MathUtils;
import com.badlogic.gdx.math.Vector3;
import com.badlogic.gdx.utils.Array;
import com.badlogic.gdx.utils.JsonReader;

import java.util.Random;

/**
 * Armas do battle royale: seis fuzis espalhados no chão (dentro das casas, na frente das casas da
 * cidade e soltos pelo mapa). Perto de uma, dá para pegar; a arma fica na mão direita do personagem.
 */
final class Weapons {
    static final String[] NAMES = {"AKM", "AUG", "GROZA", "M16A4", "M416", "SCAR-L"};
    private static final String[] FILES = {"akm", "aug", "groza", "m16a4", "m416", "scarl"};
    private static final float PICK_RANGE = 1.8f;

    /** Arma no chão. */
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
    private int heldType = -1;
    private ModelInstance held;
    private final Vector3 hand = new Vector3();

    Weapons() {
        for (int i = 0; i < FILES.length; i++) {
            models[i] = new G3dModelLoader(new JsonReader()).loadModel(Gdx.files.internal("models/armas/" + FILES[i] + ".g3dj"));
        }
    }

    boolean armed() { return heldType >= 0; }

    String heldName() { return heldType >= 0 ? NAMES[heldType] : ""; }

    /** Espalha as armas: dentro das casas de taipa, na frente das casas da cidade e soltas pelo mapa. */
    void scatter(World w, Random rnd) {
        // Dentro das casas de taipa (roça e cidade): canto livre do cômodo, longe do fogão e da rede
        for (int i = 0; i < w.houses.size; i++) {
            Vector3 p = new Vector3(-2.4f, 0f, -1.5f).mul(w.houses.get(i).t);
            drop(w, rnd.nextInt(FILES.length), p.x, p.z, rnd);
        }
        // Na calçada, na frente das casas da cidade feitas em código (e da capela)
        for (int i = 0; i < w.boxes.size; i++) {
            World.Box b = w.boxes.get(i);
            if (b.hx < 2f) continue;   // torre do sino
            Vector3 p = new Vector3(b.hx * 0.45f, 0f, b.hz + 1.0f).mul(b.t);
            drop(w, rnd.nextInt(FILES.length), p.x, p.z, rnd);
        }
        // Soltas pelo mapa
        for (int i = 0; i < 16; i++) {
            float[] p = w.openSpot(rnd);
            drop(w, rnd.nextInt(FILES.length), p[0], p[1], rnd);
        }
    }

    /** Põe uma arma deitada de lado no chão. */
    private void drop(World w, int type, float x, float z, Random rnd) {
        float y = w.groundAt(x, z);
        ModelInstance mi = new ModelInstance(models[type]);
        mi.transform.setToTranslation(x, y + 0.04f, z).rotate(Vector3.Y, rnd.nextFloat() * 360f).rotate(Vector3.Z, 90f);
        w.instances.add(mi);
        ground.add(new Pickup(type, mi, x, y, z));
    }

    /** Arma no chão ao alcance (a mais perto), ou null. */
    Pickup nearest(Vector3 p) {
        Pickup best = null;
        float bd = PICK_RANGE * PICK_RANGE;
        for (int i = 0; i < ground.size; i++) {
            Pickup g = ground.get(i);
            float dx = g.pos.x - p.x, dz = g.pos.z - p.z, dy = g.pos.y - p.y;
            float d = dx * dx + dz * dz;
            if (d < bd && Math.abs(dy) < 1.5f) {
                bd = d;
                best = g;
            }
        }
        return best;
    }

    /** Pega a arma do chão; se já tinha uma, a antiga fica no chão no lugar. */
    void pickUp(Pickup g, World w, Character ch, Player player) {
        ground.removeValue(g, true);
        w.instances.removeValue(g.inst, true);
        if (heldType >= 0) {
            ch.instances.removeValue(held, true);
            Random r = new Random();
            drop(w, heldType, player.pos.x + 0.6f * MathUtils.sin(player.facing + 1.2f),
                    player.pos.z + 0.6f * MathUtils.cos(player.facing + 1.2f), r);
        }
        heldType = g.type;
        held = new ModelInstance(models[heldType]);
        ch.instances.add(held);
        ch.setArmed(true);
    }

    /** A arma na mão direita: cano para a frente; baixa ao andar, reta ao mirar parado. */
    void update(Character ch, Player player) {
        if (held == null) return;
        ch.handWorld(false, hand);
        float down = player.speed > 0.25f ? 28f : 4f;
        held.transform.setToTranslation(hand).rotate(Vector3.Y, player.facing * MathUtils.radiansToDegrees)
                .rotate(Vector3.X, down);
    }

    void dispose() {
        for (Model m : models) if (m != null) m.dispose();
    }
}
