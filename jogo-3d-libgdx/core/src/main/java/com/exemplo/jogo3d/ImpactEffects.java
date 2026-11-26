package com.exemplo.jogo3d;

import com.badlogic.gdx.graphics.GL20;
import com.badlogic.gdx.graphics.VertexAttributes;
import com.badlogic.gdx.graphics.g3d.Material;
import com.badlogic.gdx.graphics.g3d.Model;
import com.badlogic.gdx.graphics.g3d.ModelInstance;
import com.badlogic.gdx.graphics.g3d.attributes.BlendingAttribute;
import com.badlogic.gdx.graphics.g3d.attributes.ColorAttribute;
import com.badlogic.gdx.graphics.g3d.attributes.IntAttribute;
import com.badlogic.gdx.graphics.g3d.utils.ModelBuilder;
import com.badlogic.gdx.math.MathUtils;
import com.badlogic.gdx.math.Quaternion;
import com.badlogic.gdx.math.Vector3;
import com.badlogic.gdx.utils.Array;

/**
 * Efeitos de impacto por material, leves e em pool (limite fixo, o mais antigo é reaproveitado):
 * - TERRA: nuvem de poeira e grãos de areia; marca escura no chão.
 * - MADEIRA: lascas claras voando e um fiapo de pó; marca de furo.
 * - PEDRA: pó claro, lascas cinza e uma faísca; arranhão claro.
 * - BARRO (taipa): pó avermelhado e torrões; marca escura.
 * - METAL: faíscas fortes.
 * - CARNE: gotas escuras e uma névoa curta (sem marca).
 * As marcas ficam alguns segundos e somem aos poucos (máx. 24).
 */
final class ImpactEffects {
    private static final int PUFFS = 24, CHIPS = 40, DECALS = 24;
    private static final float DECAL_LIFE = 25f;

    private static final class P {
        final ModelInstance inst;
        final ColorAttribute color;
        final BlendingAttribute blend;
        final Vector3 pos = new Vector3(), vel = new Vector3(), size = new Vector3();
        float age = 1f, life = 1f, r0, r1, grow, alpha, grav, spin;
        final Vector3 axis = new Vector3(Vector3.X);
        boolean puff;

        P(Model m, boolean puff) {
            this.puff = puff;
            inst = new ModelInstance(m);
            Material mat = inst.materials.get(0);
            color = (ColorAttribute) mat.get(ColorAttribute.Diffuse);
            blend = (BlendingAttribute) mat.get(BlendingAttribute.Type);
        }
        boolean active() { return age < life; }
    }

    private final Model puffModel, chipModel, decalModel;
    private final P[] puffs = new P[PUFFS], chips = new P[CHIPS], decals = new P[DECALS];
    private int puffNext, chipNext, decalNext;
    private final float[] decalAge = new float[DECALS];
    private final Array<ModelInstance> draw = new Array<>();
    private final World world;
    private final Vector3 t1 = new Vector3(), t2 = new Vector3(), tmpV = new Vector3();
    private final Quaternion q = new Quaternion();
    int spawned = 0;   // partículas criadas (testes)

    ImpactEffects(World world) {
        this.world = world;
        ModelBuilder mb = new ModelBuilder();
        long attr = VertexAttributes.Usage.Position | VertexAttributes.Usage.Normal;
        puffModel = mb.createSphere(1f, 1f, 1f, 8, 6, new Material(ColorAttribute.createDiffuse(0.6f, 0.5f, 0.36f, 1f),
                new BlendingAttribute(GL20.GL_SRC_ALPHA, GL20.GL_ONE_MINUS_SRC_ALPHA, 0f), IntAttribute.createCullFace(GL20.GL_NONE)), attr);
        chipModel = mb.createBox(1f, 1f, 1f, new Material(ColorAttribute.createDiffuse(0.6f, 0.5f, 0.36f, 1f),
                new BlendingAttribute(GL20.GL_SRC_ALPHA, GL20.GL_ONE_MINUS_SRC_ALPHA, 1f)), attr);
        decalModel = mb.createCylinder(1f, 0.01f, 1f, 10, new Material(ColorAttribute.createDiffuse(0.1f, 0.08f, 0.06f, 1f),
                new BlendingAttribute(GL20.GL_SRC_ALPHA, GL20.GL_ONE_MINUS_SRC_ALPHA, 0f)), attr);
        for (int i = 0; i < PUFFS; i++) puffs[i] = new P(puffModel, true);
        for (int i = 0; i < CHIPS; i++) chips[i] = new P(chipModel, false);
        for (int i = 0; i < DECALS; i++) {
            decals[i] = new P(decalModel, false);
            decalAge[i] = DECAL_LIFE;
        }
    }

    /** Impacto no ponto p, com a normal n da superfície (para onde saem os fragmentos). */
    void hit(Surface s, Vector3 p, Vector3 n) {
        switch (s) {
            case TERRA:
                puff(p, n, 3, 0.55f, 0.46f, 0.32f, 0.5f, 0.9f);
                chip(p, n, 4, 0.60f, 0.50f, 0.36f, 0.025f, 0.025f, 0.025f, 3f);
                decal(p, n, 0.07f, 0.22f, 0.17f, 0.11f, 0.45f);
                break;
            case MADEIRA:
                chip(p, n, 6, 0.72f, 0.55f, 0.34f, 0.012f, 0.012f, 0.09f, 3.5f);   // lascas finas e compridas
                puff(p, n, 1, 0.62f, 0.50f, 0.34f, 0.25f, 0.5f);
                decal(p, n, 0.05f, 0.12f, 0.08f, 0.05f, 0.85f);
                break;
            case PEDRA:
                puff(p, n, 2, 0.82f, 0.80f, 0.76f, 0.45f, 0.7f);
                chip(p, n, 4, 0.70f, 0.68f, 0.64f, 0.02f, 0.02f, 0.02f, 4f);
                chip(p, n, 2, 1.0f, 0.85f, 0.45f, 0.008f, 0.008f, 0.03f, 7f);   // faíscas
                decal(p, n, 0.08f, 0.72f, 0.70f, 0.66f, 0.7f);
                break;
            case BARRO:
                puff(p, n, 3, 0.62f, 0.38f, 0.26f, 0.55f, 1.0f);
                chip(p, n, 5, 0.52f, 0.32f, 0.22f, 0.035f, 0.03f, 0.035f, 2.5f);   // torrões
                decal(p, n, 0.08f, 0.25f, 0.14f, 0.09f, 0.55f);
                break;
            case METAL:
                chip(p, n, 6, 1.0f, 0.85f, 0.45f, 0.007f, 0.007f, 0.045f, 8f);
                decal(p, n, 0.04f, 0.15f, 0.15f, 0.16f, 0.8f);
                break;
            default:   // CARNE
                chip(p, n, 3, 0.45f, 0.05f, 0.04f, 0.018f, 0.018f, 0.018f, 2.5f);
                puff(p, n, 1, 0.42f, 0.06f, 0.05f, 0.2f, 0.35f);
                break;
        }
    }

    private void spray(Vector3 n, float speed, Vector3 out) {
        out.set(n).scl(speed * MathUtils.random(0.5f, 1f))
                .add(MathUtils.random(-1f, 1f) * speed * 0.45f, MathUtils.random(0f, 1f) * speed * 0.45f, MathUtils.random(-1f, 1f) * speed * 0.45f);
    }

    private void puff(Vector3 p, Vector3 n, int count, float r, float g, float b, float size, float life) {
        for (int i = 0; i < count; i++) {
            P e = puffs[puffNext++ % PUFFS];
            e.pos.set(p).mulAdd(n, 0.05f);
            spray(n, 0.9f, e.vel);
            e.vel.y += 0.35f;
            e.age = 0f;
            e.life = life * MathUtils.random(0.8f, 1.15f);
            e.r0 = 0.03f;
            e.r1 = size * 0.5f * MathUtils.random(0.7f, 1.1f);
            e.grow = 5f;
            e.alpha = 0.55f;
            e.grav = 0f;
            e.color.color.set(r, g, b, 1f);
            e.blend.opacity = 0f;
            spawned++;
        }
    }

    private void chip(Vector3 p, Vector3 n, int count, float r, float g, float b, float sx, float sy, float sz, float speed) {
        for (int i = 0; i < count; i++) {
            P e = chips[chipNext++ % CHIPS];
            e.pos.set(p).mulAdd(n, 0.03f);
            spray(n, speed, e.vel);
            e.age = 0f;
            e.life = MathUtils.random(0.45f, 0.9f);
            e.size.set(sx, sy, sz);
            e.alpha = 1f;
            e.grav = 9.8f;
            e.spin = MathUtils.random(200f, 900f);
            e.axis.set(MathUtils.random(-1f, 1f), MathUtils.random(-1f, 1f), MathUtils.random(-1f, 1f));
            if (e.axis.len2() < 1e-3f) e.axis.set(1f, 0f, 0f);
            e.axis.nor();
            e.color.color.set(r, g, b, 1f);
            e.blend.opacity = 1f;
            spawned++;
        }
    }

    private void decal(Vector3 p, Vector3 n, float radius, float r, float g, float b, float alpha) {
        int k = decalNext++ % DECALS;
        P e = decals[k];
        q.setFromCross(Vector3.Y, n);
        tmpV.set(p).mulAdd(n, 0.02f);
        e.inst.transform.set(tmpV, q, t1.set(radius * 2f, 1f, radius * 2f));
        e.color.color.set(r, g, b, 1f);
        e.alpha = alpha;
        e.blend.opacity = alpha;
        decalAge[k] = 0f;
    }

    void update(float dt) {
        for (int i = 0; i < PUFFS; i++) {
            P e = puffs[i];
            if (!e.active()) continue;
            e.age += dt;
            if (!e.active()) continue;
            e.pos.mulAdd(e.vel, dt);
            e.vel.scl(1f - Math.min(1f, dt * 2.5f));
            float t = e.age / e.life;
            float r = e.r1 + (e.r0 - e.r1) * (float) Math.exp(-e.age * e.grow);
            e.blend.opacity = e.alpha * (1f - t) * Math.min(1f, e.age * 20f);
            e.inst.transform.setToTranslation(e.pos).scale(r * 2f, r * 2f, r * 2f);
        }
        for (int i = 0; i < CHIPS; i++) {
            P e = chips[i];
            if (!e.active()) continue;
            e.age += dt;
            if (!e.active()) continue;
            e.vel.y -= e.grav * dt;
            e.pos.mulAdd(e.vel, dt);
            float gy = world.groundAt(e.pos.x, e.pos.z);
            if (e.pos.y < gy) {   // bateu no chão: para
                e.pos.y = gy;
                e.vel.setZero();
                e.spin = 0f;
            }
            float t = e.age / e.life;
            e.blend.opacity = t > 0.7f ? (1f - t) / 0.3f : 1f;
            e.inst.transform.setToTranslation(e.pos).rotate(e.axis, e.spin * e.age).scale(e.size.x, e.size.y, e.size.z);
        }
        for (int i = 0; i < DECALS; i++) {
            if (decalAge[i] >= DECAL_LIFE) continue;
            decalAge[i] += dt;
            float left = DECAL_LIFE - decalAge[i];
            decals[i].blend.opacity = decals[i].alpha * Math.min(1f, left / 5f);
        }
    }

    Array<ModelInstance> instances() {
        draw.clear();
        for (int i = 0; i < PUFFS; i++) if (puffs[i].active()) draw.add(puffs[i].inst);
        for (int i = 0; i < CHIPS; i++) if (chips[i].active()) draw.add(chips[i].inst);
        for (int i = 0; i < DECALS; i++) if (decalAge[i] < DECAL_LIFE) draw.add(decals[i].inst);
        return draw;
    }

    int activeCount() {
        int n = 0;
        for (P e : puffs) if (e.active()) n++;
        for (P e : chips) if (e.active()) n++;
        for (int i = 0; i < DECALS; i++) if (decalAge[i] < DECAL_LIFE) n++;
        return n;
    }

    void dispose() {
        puffModel.dispose();
        chipModel.dispose();
        decalModel.dispose();
    }
}
