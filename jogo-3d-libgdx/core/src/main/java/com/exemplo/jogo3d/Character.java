package com.exemplo.jogo3d;

import com.badlogic.gdx.graphics.Color;
import com.badlogic.gdx.graphics.VertexAttributes.Usage;
import com.badlogic.gdx.graphics.g3d.Material;
import com.badlogic.gdx.graphics.g3d.Model;
import com.badlogic.gdx.graphics.g3d.ModelInstance;
import com.badlogic.gdx.graphics.g3d.attributes.ColorAttribute;
import com.badlogic.gdx.graphics.g3d.utils.ModelBuilder;
import com.badlogic.gdx.math.MathUtils;
import com.badlogic.gdx.math.Matrix4;
import com.badlogic.gdx.math.Vector3;
import com.badlogic.gdx.graphics.g3d.utils.MeshPartBuilder;
import com.badlogic.gdx.math.collision.BoundingBox;
import com.badlogic.gdx.utils.Array;

/**
 * Sertanejo feito de formas arredondadas (cápsulas e esferas), com chapéu de couro.
 * Medidas em metros: altura total ~1.95.
 * Braços e pernas balançam ao andar; ficam encolhidos no ar.
 */
public class Character {

    /** Uma peça do corpo. Se for membro (perna/braço), gira em torno do pivô. */
    private static class Part {
        final ModelInstance inst;
        final Vector3 pivot;   // ponto de articulação (ou centro, se estática)
        final float length;    // comprimento do membro (0 = peça estática)
        final boolean leg;     // true = perna, false = braço
        final int side;        // +1 direita, -1 esquerda
        Part(ModelInstance inst, Vector3 pivot, float length, boolean leg, int side) {
            this.inst = inst;
            this.pivot = pivot;
            this.length = length;
            this.leg = leg;
            this.side = side;
        }
    }

    final Array<ModelInstance> instances = new Array<>();
    private final Array<Part> parts = new Array<>();
    private final Array<Model> models = new Array<>();
    private final Matrix4 base = new Matrix4();
    private final Matrix4 tmp = new Matrix4();
    private float walkPhase = 0f;

    private static final Color SKIN = new Color(0.55f, 0.38f, 0.24f, 1f);
    private static final Color SHIRT = new Color(0.45f, 0.52f, 0.60f, 1f);
    private static final Color PANTS = new Color(0.36f, 0.28f, 0.20f, 1f);
    private static final Color BOOTS = new Color(0.20f, 0.14f, 0.10f, 1f);
    private static final Color LEATHER = new Color(0.52f, 0.38f, 0.22f, 1f);
    private static final Color HAIR = new Color(0.12f, 0.08f, 0.06f, 1f);

    public void create() {
        ModelBuilder mb = new ModelBuilder();

        // Corpo (estático, em relação ao jogador)
        addStatic(mb.createCapsule(0.2f, 0.4f, 16, mat(SHIRT), attr()), new Vector3(0f, 1.25f, 0f));
        addStatic(mb.createSphere(0.3f, 0.3f, 0.3f, 16, 12, mat(SKIN), attr()), new Vector3(0f, 1.80f, 0f));
        addStatic(mb.createSphere(0.31f, 0.12f, 0.31f, 16, 12, mat(HAIR), attr()), new Vector3(0f, 1.88f, -0.01f));
        addStatic(mb.createCylinder(0.8f, 0.03f, 0.8f, 20, mat(LEATHER), attr()), new Vector3(0f, 1.90f, 0f));
        addStatic(mb.createCylinder(0.42f, 0.22f, 0.42f, 18, mat(LEATHER), attr()), new Vector3(0f, 2.01f, 0f));

        // Pernas: pivô no quadril
        addLimb(mb, 0.09f, 0.77f, PANTS, new Vector3(-0.12f, 0.95f, 0f), true, -1);
        addLimb(mb, 0.09f, 0.77f, PANTS, new Vector3(0.12f, 0.95f, 0f), true, 1);

        // Braços: pivô no ombro
        addLimb(mb, 0.07f, 0.35f, SHIRT, new Vector3(-0.27f, 1.52f, 0f), false, -1);
        addLimb(mb, 0.07f, 0.35f, SHIRT, new Vector3(0.27f, 1.52f, 0f), false, 1);
    }

    private void addStatic(Model model, Vector3 center) {
        models.add(model);
        ModelInstance mi = new ModelInstance(model);
        instances.add(mi);
        parts.add(new Part(mi, center, 0f, false, 0));
    }

    private void addLimb(ModelBuilder mb, float radius, float height, Color color, Vector3 pivot,
                         boolean leg, int side) {
        Model model = mb.createCapsule(radius, height, 12, mat(color), attr());
        models.add(model);
        BoundingBox bb = new BoundingBox();
        model.calculateBoundingBox(bb);
        float length = bb.getHeight(); // comprimento total da cápsula
        ModelInstance mi = new ModelInstance(model);
        instances.add(mi);
        parts.add(new Part(mi, pivot, length, leg, side));
    }

    private static Material mat(Color c) {
        return new Material(ColorAttribute.createDiffuse(c));
    }

    private static long attr() {
        return Usage.Position | Usage.Normal;
    }

    /**
     * Atualiza a pose.
     * @param speed01 0 = parado, 1 = andando depressa
     * @param grounded se está no chão (no ar, os membros ficam encolhidos)
     */
    public void update(float x, float y, float z, float yawRad, float speed01, boolean grounded, float dt) {
        if (grounded && speed01 > 0.02f) {
            walkPhase += dt * speed01 * 10f;
        }
        base.setToTranslation(x, y, z).rotate(Vector3.Y, yawRad * MathUtils.radiansToDegrees);

        float swing = grounded ? MathUtils.sin(walkPhase) * 38f * speed01 : 0f;
        for (int i = 0; i < parts.size; i++) {
            Part p = parts.get(i);
            if (p.length <= 0f) {
                tmp.set(base).translate(p.pivot);
            } else {
                float angle;
                if (!grounded) {
                    angle = p.leg ? 18f : -55f;       // pernas dobradas, braços para cima
                } else {
                    angle = p.leg ? swing * p.side : -swing * p.side * 0.8f; // braços balançam em oposição
                }
                tmp.set(base).translate(p.pivot).rotate(Vector3.X, angle).translate(0f, -p.length / 2f, 0f);
            }
            p.inst.transform.set(tmp);
        }
    }

    public void dispose() {
        for (int i = 0; i < models.size; i++) models.get(i).dispose();
    }
}
