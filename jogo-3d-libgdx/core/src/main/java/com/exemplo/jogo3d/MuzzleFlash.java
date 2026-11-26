package com.exemplo.jogo3d;

import com.badlogic.gdx.graphics.GL20;
import com.badlogic.gdx.graphics.VertexAttributes;
import com.badlogic.gdx.graphics.g3d.Environment;
import com.badlogic.gdx.graphics.g3d.Material;
import com.badlogic.gdx.graphics.g3d.Model;
import com.badlogic.gdx.graphics.g3d.ModelInstance;
import com.badlogic.gdx.graphics.g3d.attributes.BlendingAttribute;
import com.badlogic.gdx.graphics.g3d.attributes.ColorAttribute;
import com.badlogic.gdx.graphics.g3d.attributes.IntAttribute;
import com.badlogic.gdx.graphics.g3d.environment.PointLight;
import com.badlogic.gdx.graphics.g3d.utils.ModelBuilder;
import com.badlogic.gdx.math.MathUtils;
import com.badlogic.gdx.math.Quaternion;
import com.badlogic.gdx.math.Vector3;
import com.badlogic.gdx.utils.Array;

/**
 * Saída do tiro pelo cano: clarão de pólvora (dois elipsoides cruzados), faíscas, fumaça discreta e um
 * lampejo de luz. Tudo sai da PONTA DO CANO e segue a arma (posição e direção do cano a cada quadro).
 * O tamanho e a forma variam com a categoria (pistola pequena, espingarda larga, precisão comprida).
 * Elementos em pool de tamanho fixo (sem criar objetos por tiro).
 */
final class MuzzleFlash {
    private static final int SMOKE = 8, SPARKS = 14;
    private final Model flashModel, smokeModel, sparkModel;
    private final ModelInstance flashA, flashB;
    private final BlendingAttribute flashBlendA, flashBlendB;
    private float flashT, flashDur = 0.05f, flashScale = 1f, flashWide = 1f;

    private final ModelInstance[] smoke = new ModelInstance[SMOKE];
    private final BlendingAttribute[] smokeBlend = new BlendingAttribute[SMOKE];
    private final Vector3[] smokePos = new Vector3[SMOKE], smokeVel = new Vector3[SMOKE];
    private final float[] smokeAge = new float[SMOKE], smokeLife = new float[SMOKE];
    private int smokeNext;

    private final ModelInstance[] spark = new ModelInstance[SPARKS];
    private final Vector3[] sparkPos = new Vector3[SPARKS], sparkVel = new Vector3[SPARKS];
    private final float[] sparkAge = new float[SPARKS], sparkLife = new float[SPARKS];
    private int sparkNext;

    private PointLight light;
    private float lightPower = 0f;
    private final Array<ModelInstance> draw = new Array<>();
    private final Quaternion q = new Quaternion();
    private final Vector3 v = new Vector3(), sc = new Vector3();
    int shots = 0;   // clarões disparados (testes)

    MuzzleFlash(Environment env) {
        ModelBuilder mb = new ModelBuilder();
        long attr = VertexAttributes.Usage.Position | VertexAttributes.Usage.Normal;
        flashModel = mb.createSphere(1f, 1f, 1f, 10, 8, new Material(ColorAttribute.createDiffuse(1f, 0.85f, 0.45f, 1f),
                ColorAttribute.createEmissive(1f, 0.75f, 0.3f, 1f), new BlendingAttribute(GL20.GL_SRC_ALPHA, GL20.GL_ONE, 0.95f),
                IntAttribute.createCullFace(GL20.GL_NONE)), attr);
        smokeModel = mb.createSphere(1f, 1f, 1f, 8, 6, new Material(ColorAttribute.createDiffuse(0.72f, 0.70f, 0.66f, 1f),
                new BlendingAttribute(GL20.GL_SRC_ALPHA, GL20.GL_ONE_MINUS_SRC_ALPHA, 0f), IntAttribute.createCullFace(GL20.GL_NONE)), attr);
        sparkModel = mb.createBox(1f, 1f, 1f, new Material(ColorAttribute.createDiffuse(1f, 0.8f, 0.4f, 1f),
                ColorAttribute.createEmissive(1f, 0.7f, 0.25f, 1f)), attr);
        flashA = new ModelInstance(flashModel);
        flashB = new ModelInstance(flashModel);
        flashBlendA = (BlendingAttribute) flashA.materials.get(0).get(BlendingAttribute.Type);
        flashBlendB = (BlendingAttribute) flashB.materials.get(0).get(BlendingAttribute.Type);
        for (int i = 0; i < SMOKE; i++) {
            smoke[i] = new ModelInstance(smokeModel);
            smokeBlend[i] = (BlendingAttribute) smoke[i].materials.get(0).get(BlendingAttribute.Type);
            smokePos[i] = new Vector3();
            smokeVel[i] = new Vector3();
            smokeAge[i] = smokeLife[i] = 1f;
        }
        for (int i = 0; i < SPARKS; i++) {
            spark[i] = new ModelInstance(sparkModel);
            sparkPos[i] = new Vector3();
            sparkVel[i] = new Vector3();
            sparkAge[i] = sparkLife[i] = 1f;
        }
        // Lampejo de luz: só em qualidade média ou alta (mantido sempre no ambiente, apagado, para não recompilar shader)
        if (env != null && Settings.quality >= 1) {
            light = new PointLight().set(1f, 0.7f, 0.35f, 0f, -200f, 0f, 0f);
            env.add(light);
        }
    }

    /** Um tiro: clarão, faíscas e fumaça saindo do cano. */
    void fire(Vector3 muzzle, Vector3 barrel, WeaponConfig c) {
        shots++;
        WeaponConfig.Category cat = c.category;
        flashScale = c.flash;
        flashWide = cat == WeaponConfig.Category.ESPINGARDA ? 1.8f : cat == WeaponConfig.Category.PRECISAO ? 0.7f : 1f;
        flashDur = cat == WeaponConfig.Category.ESPINGARDA || cat == WeaponConfig.Category.PRECISAO ? 0.07f : 0.045f;
        flashT = flashDur;
        lightPower = 12f * c.flash;
        int nSpark = cat == WeaponConfig.Category.ESPINGARDA ? 6 : cat == WeaponConfig.Category.PISTOLA ? 2 : 3;
        for (int i = 0; i < nSpark; i++) {
            int k = sparkNext++ % SPARKS;
            sparkPos[k].set(muzzle).mulAdd(barrel, 0.04f);
            sparkVel[k].set(barrel).scl(MathUtils.random(3f, 7f)).add(MathUtils.random(-1.6f, 1.6f), MathUtils.random(-0.6f, 1.6f), MathUtils.random(-1.6f, 1.6f));
            sparkAge[k] = 0f;
            sparkLife[k] = MathUtils.random(0.10f, 0.22f);
        }
        int nSmoke = cat == WeaponConfig.Category.ESPINGARDA || cat == WeaponConfig.Category.PRECISAO ? 2 : 1;
        for (int i = 0; i < nSmoke; i++) {
            int k = smokeNext++ % SMOKE;
            smokePos[k].set(muzzle).mulAdd(barrel, 0.12f);
            smokeVel[k].set(barrel).scl(MathUtils.random(0.5f, 1.4f)).add(MathUtils.random(-0.2f, 0.2f), MathUtils.random(0.25f, 0.6f), MathUtils.random(-0.2f, 0.2f));
            smokeAge[k] = 0f;
            smokeLife[k] = MathUtils.random(0.6f, 1.0f);
        }
        place(muzzle, barrel);
    }

    private void place(Vector3 muzzle, Vector3 barrel) {
        q.setFromCross(Vector3.Z, barrel);
        float len = 0.30f * flashScale, w = 0.085f * flashScale * flashWide;
        v.set(muzzle).mulAdd(barrel, len * 0.45f);
        flashA.transform.set(v, q, sc.set(w, w, len));
        // o segundo elipsoide cruza o primeiro (formato de estrela), girado 90° em torno do cano
        Quaternion q2 = new Quaternion().setFromAxis(barrel, 90f).mul(q);
        flashB.transform.set(v, q2, sc.set(w, w * 0.75f, len * 0.8f));
    }

    /** A cada quadro: segue o cano, avança faíscas e fumaça, apaga a luz. */
    void update(float dt, Vector3 muzzle, Vector3 barrel) {
        if (flashT > 0f) {
            flashT -= dt;
            float k = Math.max(0f, flashT / flashDur);
            flashBlendA.opacity = 0.95f * k;
            flashBlendB.opacity = 0.8f * k;
            if (muzzle != null) place(muzzle, barrel);
        }
        for (int i = 0; i < SPARKS; i++) {
            if (sparkAge[i] >= sparkLife[i]) continue;
            sparkAge[i] += dt;
            sparkVel[i].y -= 9.8f * dt;
            sparkPos[i].mulAdd(sparkVel[i], dt);
            float s = 0.014f * (1f - sparkAge[i] / sparkLife[i]);
            spark[i].transform.setToTranslation(sparkPos[i]).scale(s, s, s * 4f);
        }
        for (int i = 0; i < SMOKE; i++) {
            if (smokeAge[i] >= smokeLife[i]) continue;
            smokeAge[i] += dt;
            smokePos[i].mulAdd(smokeVel[i], dt);
            smokeVel[i].scl(1f - Math.min(1f, dt * 2.2f));
            float t = smokeAge[i] / smokeLife[i];
            float r = 0.05f + 0.20f * (float) Math.sqrt(t);
            smokeBlend[i].opacity = 0.32f * (1f - t) * Math.min(1f, smokeAge[i] * 12f);
            smoke[i].transform.setToTranslation(smokePos[i]).scale(r * 2f, r * 2f, r * 2f);
        }
        if (light != null) {
            if (flashT > 0f && muzzle != null) {
                light.position.set(muzzle).mulAdd(barrel, 0.3f);
                light.intensity = lightPower * Math.max(0f, flashT / flashDur);
            } else {
                light.intensity = 0f;
                light.position.set(0f, -200f, 0f);
            }
        }
    }

    boolean flashing() { return flashT > 0f; }

    /** Posição do clarão (testes: precisa estar na ponta do cano). */
    Vector3 flashPosition(Vector3 out) { return flashA.transform.getTranslation(out); }

    Array<ModelInstance> instances() {
        draw.clear();
        if (flashT > 0f) {
            draw.add(flashA);
            draw.add(flashB);
        }
        for (int i = 0; i < SPARKS; i++) if (sparkAge[i] < sparkLife[i]) draw.add(spark[i]);
        for (int i = 0; i < SMOKE; i++) if (smokeAge[i] < smokeLife[i]) draw.add(smoke[i]);
        return draw;
    }

    void dispose() {
        flashModel.dispose();
        smokeModel.dispose();
        sparkModel.dispose();
    }
}
