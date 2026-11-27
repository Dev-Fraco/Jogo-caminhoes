package com.exemplo.jogo3d;

import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.graphics.Camera;
import com.badlogic.gdx.graphics.GL20;
import com.badlogic.gdx.graphics.PerspectiveCamera;
import com.badlogic.gdx.graphics.Pixmap;
import com.badlogic.gdx.graphics.Texture;
import com.badlogic.gdx.graphics.g2d.TextureRegion;
import com.badlogic.gdx.graphics.g3d.Environment;
import com.badlogic.gdx.graphics.g3d.ModelBatch;
import com.badlogic.gdx.graphics.glutils.FrameBuffer;
import com.badlogic.gdx.math.collision.BoundingBox;
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
            "GRANADA", "GRANADA DE FUMAÇA", "GRANADA ATORDOANTE", "MOCHILA", "LENHA"};
    private static final String[] FILES = {"medkit", "bandagem", "analgesico", "injecao", "energetico",
            "granada", "granada_fumaca", "granada_atordoante", "mochila", "lenha"};
    static final int LENHA = 9;   // sobrevivência: pega do chão e vira fogueira
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
    static final int BACKPACK = 8;
    static final int CAP_BASE = 12, CAP_BACKPACK = 30;   // itens que cabem sem e com a mochila
    private final FrameBuffer[] iconFbo = new FrameBuffer[FILES.length];
    final TextureRegion[] icons = new TextureRegion[FILES.length];

    Items() {
        for (int i = 0; i < FILES.length; i++) {
            models[i] = i == LENHA ? Props.lenha() : ModelIO.load("models/itens/" + FILES[i] + ".g3dj");
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

    /** Lenha espalhada pelo sertão (no lugar aberto, como os demais). */
    void scatterSurvival(World w, Random rnd) {
        for (int i = 0; i < 40; i++) {
            float[] p = w.openSpot(rnd);
            drop(w, LENHA, p[0], p[1], rnd);
        }
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
        for (int i = 0; i < 90; i++) {
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

    /** Loot de um inimigo morto: 1 ou 2 itens (kit, bandagem, analgésico, energético, granada) perto do corpo. */
    void loot(World w, float x, float z, Random rnd) {
        int[] tabela = {0, 0, 1, 1, 2, 4, 5};   // kit e bandagem são os mais comuns
        int n = rnd.nextFloat() < 0.25f ? 2 : 1;
        for (int k = 0; k < n; k++) {
            float ox = (rnd.nextFloat() * 2f - 1f) * 0.6f, oz = (rnd.nextFloat() * 2f - 1f) * 0.6f;
            drop(w, tabela[rnd.nextInt(tabela.length)], x + ox, z + oz, rnd);
        }
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

    Model model(int type) { return models[type]; }

    /** Itens carregados (a mochila em si não conta). */
    int carried() {
        int n = 0;
        for (int i = 0; i < bag.length; i++) if (i != BACKPACK) n += bag[i];
        return n;
    }

    int capacity() { return bag[BACKPACK] > 0 ? CAP_BACKPACK : CAP_BASE; }

    /** Pega e põe na mochila. Devolve false se não couber. */
    boolean pickUp(Pickup g, World w) {
        if (g.type == BACKPACK && bag[BACKPACK] > 0) return false;   // já tem mochila
        if (g.type != BACKPACK && carried() >= capacity()) return false;
        ground.removeValue(g, true);
        w.instances.removeValue(g.inst, true);
        bag[g.type]++;
        return true;
    }

    /** Gasta um item da mochila. */
    void consume(int type) {
        if (bag[type] > 0) bag[type]--;
    }

    /** Larga tudo (ao morrer). */
    void clearBag() {
        for (int i = 0; i < bag.length; i++) bag[i] = 0;
    }

    /**
     * Desenha cada item numa textura pequena (ícone 3D de verdade, visto de lado e de cima).
     * Chamado no início e quando o app volta do segundo plano (o Android apaga as texturas).
     */
    void renderIcons(ModelBatch batch, Environment env) {
        for (int i = 0; i < FILES.length; i++) {
            if (iconFbo[i] == null) iconFbo[i] = new FrameBuffer(Pixmap.Format.RGBA8888, 128, 128, true);
            icons[i] = renderIcon(batch, env, models[i], iconFbo[i], 35f);
        }
    }

    /** Desenha um modelo numa textura (ícone), enquadrado pelo tamanho dele. Usado também pelas armas. */
    static TextureRegion renderIcon(ModelBatch batch, Environment env, Model model, FrameBuffer fbo, float yawDeg) {
        int w = fbo.getWidth(), h = fbo.getHeight();
        PerspectiveCamera cam = new PerspectiveCamera(30f, w, h);
        BoundingBox bb = new BoundingBox();
        Vector3 c = new Vector3(), dim = new Vector3();
        ModelInstance mi = new ModelInstance(model);
        mi.transform.idt().rotate(Vector3.Y, yawDeg);
        mi.calculateBoundingBox(bb);
        bb.mul(mi.transform);
        bb.getCenter(c);
        bb.getDimensions(dim);
        float r = (w > h ? Math.max(dim.y, Math.max(dim.x, dim.z) * h / w) : dim.len()) * 0.5f;
        aim(cam, c, w > h ? r * 1.2f : r);
        fbo.begin();
        Gdx.gl.glViewport(0, 0, w, h);
        Gdx.gl.glClearColor(0f, 0f, 0f, 0f);
        Gdx.gl.glClear(GL20.GL_COLOR_BUFFER_BIT | GL20.GL_DEPTH_BUFFER_BIT);
        batch.begin(cam);
        batch.render(mi, env);
        batch.end();
        fbo.end();
        Texture t = fbo.getColorBufferTexture();
        t.setFilter(Texture.TextureFilter.Linear, Texture.TextureFilter.Linear);
        TextureRegion reg = new TextureRegion(t);
        reg.flip(false, true);
        Gdx.gl.glViewport(0, 0, Gdx.graphics.getBackBufferWidth(), Gdx.graphics.getBackBufferHeight());
        return reg;
    }

    private static void aim(Camera cam, Vector3 c, float r) {
        float dist = r / (float) Math.sin(Math.toRadians(15.0)) * 1.05f;
        cam.position.set(c).add(new Vector3(0f, 0.35f, 1f).nor().scl(dist));
        cam.lookAt(c);
        cam.up.set(Vector3.Y);
        cam.near = dist * 0.1f;
        cam.far = dist * 3f;
        cam.update();
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
        for (FrameBuffer f : iconFbo) if (f != null) f.dispose();
    }
}
