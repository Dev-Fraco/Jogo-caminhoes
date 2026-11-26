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
    // Munição de cada arma (fica com a arma ao trocar)
    private final int[] mag = new int[FILES.length], reserve = new int[FILES.length];
    float reloadT = 0f;          // > 0: recarregando (s restantes)
    private float cooldown = 0f;
    final Vector3 muzzle = new Vector3();
    boolean ads = false;         // mirando (o cano fica reto)

    Weapons() {
        for (int i = 0; i < FILES.length; i++) {
            models[i] = new G3dModelLoader(new JsonReader()).loadModel(Gdx.files.internal("models/armas/" + FILES[i] + ".g3dj"));
            mag[i] = WeaponConfig.BY_TYPE[i].magazine;
            reserve[i] = WeaponConfig.BY_TYPE[i].reserve;
        }
    }

    Model[] models() { return models; }

    private final com.badlogic.gdx.graphics.glutils.FrameBuffer[] iconFbo = new com.badlogic.gdx.graphics.glutils.FrameBuffer[FILES.length];
    final com.badlogic.gdx.graphics.g2d.TextureRegion[] icons = new com.badlogic.gdx.graphics.g2d.TextureRegion[FILES.length];

    /** Ícone de cada arma (de lado, cano para a direita) para o painel de munição. */
    void renderIcons(com.badlogic.gdx.graphics.g3d.ModelBatch batch, com.badlogic.gdx.graphics.g3d.Environment env) {
        for (int i = 0; i < FILES.length; i++) {
            if (iconFbo[i] == null)
                iconFbo[i] = new com.badlogic.gdx.graphics.glutils.FrameBuffer(com.badlogic.gdx.graphics.Pixmap.Format.RGBA8888, 256, 128, true);
            icons[i] = Items.renderIcon(batch, env, models[i], iconFbo[i], 90f);
        }
    }

    com.badlogic.gdx.graphics.g2d.TextureRegion icon() { return heldType >= 0 ? icons[heldType] : null; }

    /** Configuração da arma na mão (null se desarmado). */
    WeaponConfig config() { return heldType >= 0 ? WeaponConfig.BY_TYPE[heldType] : null; }

    int ammo() { return heldType >= 0 ? mag[heldType] : 0; }

    int reserveAmmo() { return heldType >= 0 ? reserve[heldType] : 0; }

    boolean reloading() { return reloadT > 0f; }

    float reloadProgress() {
        WeaponConfig c = config();
        return c == null || reloadT <= 0f ? 0f : 1f - reloadT / c.reloadTime;
    }

    /** Começa a recarregar (se der). */
    boolean startReload() {
        WeaponConfig c = config();
        if (c == null || reloadT > 0f || mag[heldType] >= c.magazine || reserve[heldType] <= 0) return false;
        reloadT = c.reloadTime;
        return true;
    }

    /** Tempo: cadência e recarga. */
    void tick(float dt) {
        cooldown = Math.max(0f, cooldown - dt);
        if (reloadT > 0f) {
            reloadT -= dt;
            if (reloadT <= 0f && heldType >= 0) {
                reloadT = 0f;
                int need = WeaponConfig.BY_TYPE[heldType].magazine - mag[heldType];
                int take = Math.min(need, reserve[heldType]);
                mag[heldType] += take;
                reserve[heldType] -= take;
            }
        }
    }

    /**
     * Tenta disparar. held = dedo no botão; pressed = acabou de apertar (armas sem automático só
     * atiram no toque). Devolve 1 se disparou, -1 se o pente está vazio (clique), 0 se não.
     */
    int tryFire(boolean held, boolean pressed) {
        WeaponConfig c = config();
        if (c == null || reloadT > 0f || cooldown > 0f) return 0;
        if (!(c.automatic ? held : pressed)) return 0;
        if (mag[heldType] <= 0) {
            cooldown = 0.3f;
            if (!startReload()) return -1;
            return -1;
        }
        mag[heldType]--;
        cooldown = c.fireInterval;
        return 1;
    }

    /** Larga tudo (ao morrer): volta desarmado. */
    void unequip(Character ch) {
        if (held != null) ch.instances.removeValue(held, true);
        held = null;
        heldType = -1;
        reloadT = 0f;
        ch.setArmed(false);
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
        reloadT = 0f;   // trocar de arma cancela a recarga
        held = new ModelInstance(models[heldType]);
        ch.instances.add(held);
        ch.setArmed(true);
    }

    /** A arma na mão direita: cano para a frente; baixa ao andar, reta ao mirar parado. */
    void update(Character ch, Player player) {
        if (held == null) return;
        ch.handWorld(false, hand);
        float down = ads ? 0f : player.speed > 0.25f ? 28f : 4f;
        if (reloadT > 0f) down = 40f;   // recarregando: cano para baixo
        held.transform.setToTranslation(hand).rotate(Vector3.Y, player.facing * MathUtils.radiansToDegrees)
                .rotate(Vector3.X, down);
        muzzle.set(hand).add(MathUtils.sin(player.facing) * 0.62f, 0.05f, MathUtils.cos(player.facing) * 0.62f);
    }

    void dispose() {
        for (Model m : models) if (m != null) m.dispose();
        for (com.badlogic.gdx.graphics.glutils.FrameBuffer f : iconFbo) if (f != null) f.dispose();
    }
}
