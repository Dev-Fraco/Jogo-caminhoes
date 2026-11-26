package com.exemplo.jogo3d;

import com.badlogic.gdx.graphics.GL20;
import com.badlogic.gdx.graphics.VertexAttributes;
import com.badlogic.gdx.graphics.g3d.Material;
import com.badlogic.gdx.graphics.g3d.Model;
import com.badlogic.gdx.graphics.g3d.attributes.ColorAttribute;
import com.badlogic.gdx.graphics.g3d.attributes.IntAttribute;
import com.badlogic.gdx.graphics.g3d.utils.MeshPartBuilder;
import com.badlogic.gdx.graphics.g3d.utils.ModelBuilder;
import com.badlogic.gdx.math.Matrix4;

/**
 * Plantas e objetos do sertão feitos por geometria procedural (sem arte externa): mandacaru,
 * xique-xique, macambira, cruz de cemitério, montículo de túmulo e tenda de lona dos retirantes.
 * Os modelos são criados uma vez e compartilhados por todas as instâncias.
 */
final class Props {
    private static final long ATTR = VertexAttributes.Usage.Position | VertexAttributes.Usage.Normal;

    private Props() {}

    private static Material mat(float r, float g, float b) {
        return new Material(ColorAttribute.createDiffuse(r, g, b, 1f), IntAttribute.createCullFace(GL20.GL_NONE));
    }

    /** Cilindro em (x, y, z) com a altura e a largura dadas, inclinado em graus (eixo x). */
    private static void stem(MeshPartBuilder p, float x, float y, float z, float rx, float rz, float w, float h, float tiltX, float tiltZ) {
        p.setVertexTransform(new Matrix4().translate(x, y, z).rotate(1f, 0f, 0f, tiltX).rotate(0f, 0f, 1f, tiltZ));
        p.cylinder(w, h, w, 8);
        p.setVertexTransform(new Matrix4());
    }

    /** Mandacaru: tronco grosso verde-azulado, com dois braços que sobem. ~2,6 m. */
    static Model mandacaru() {
        ModelBuilder mb = new ModelBuilder();
        mb.begin();
        MeshPartBuilder body = mb.part("body", GL20.GL_TRIANGLES, ATTR, mat(0.30f, 0.48f, 0.34f));
        stem(body, 0f, 0f, 0f, 0f, 0f, 0.36f, 2.4f, 0f, 0f);
        stem(body, 0.2f, 0.9f, 0f, 0f, 0f, 0.24f, 0.9f, 0f, -55f);   // braço direito
        stem(body, 0.5f, 1.25f, 0f, 0f, 0f, 0.24f, 1.0f, 0f, -10f);  // braço direito, subindo
        stem(body, -0.2f, 1.0f, 0f, 0f, 0f, 0.24f, 0.8f, 0f, 55f);  // braço esquerdo
        stem(body, -0.45f, 1.45f, 0f, 0f, 0f, 0.22f, 0.9f, 0f, 10f); // braço esquerdo, subindo
        Model m = mb.end();
        return m;
    }

    /** Xique-xique: feixe de colunas finas, verde-acinzentadas, ~1,8 m. */
    static Model xique() {
        ModelBuilder mb = new ModelBuilder();
        mb.begin();
        MeshPartBuilder p = mb.part("col", GL20.GL_TRIANGLES, ATTR, mat(0.44f, 0.58f, 0.40f));
        float[][] c = {{0f, 0f, 1.8f}, {0.22f, 0.1f, 1.3f}, {-0.2f, 0.15f, 1.5f}, {0.1f, -0.2f, 1.1f}, {-0.12f, -0.18f, 1.2f}};
        for (float[] k : c) stem(p, k[0], 0f, k[1], 0f, 0f, 0.13f, k[2], 0f, 0f);
        return mb.end();
    }

    /** Macambira: tufo de folhas em ponta (cones), cinza-esverdeado, ~0,9 m. */
    static Model macambira() {
        ModelBuilder mb = new ModelBuilder();
        mb.begin();
        MeshPartBuilder p = mb.part("leaf", GL20.GL_TRIANGLES, ATTR, mat(0.52f, 0.56f, 0.38f));
        for (int i = 0; i < 9; i++) {
            float a = i * 40f, r = 0.12f + (i % 3) * 0.08f;
            p.setVertexTransform(new Matrix4().translate((float) Math.cos(Math.toRadians(a)) * r, 0f, (float) Math.sin(Math.toRadians(a)) * r)
                    .rotate(1f, 0f, 0f, 14f * (i % 2 == 0 ? 1f : -1f)));
            p.cone(0.16f, 0.85f - (i % 3) * 0.1f, 0.16f, 5);
        }
        p.setVertexTransform(new Matrix4());
        return mb.end();
    }

    /** Cruz de madeira de cemitério rural, ~1,3 m. */
    static Model cross() {
        ModelBuilder mb = new ModelBuilder();
        mb.begin();
        MeshPartBuilder p = mb.part("wood", GL20.GL_TRIANGLES, ATTR, mat(0.40f, 0.29f, 0.17f));
        p.setVertexTransform(new Matrix4().translate(0f, 0.65f, 0f));
        p.box(0.09f, 1.3f, 0.09f);
        p.setVertexTransform(new Matrix4().translate(0f, 0.95f, 0f));
        p.box(0.55f, 0.08f, 0.09f);
        p.setVertexTransform(new Matrix4());
        return mb.end();
    }

    /** Montículo de terra de túmulo (baixo e largo). */
    static Model mound() {
        ModelBuilder mb = new ModelBuilder();
        mb.begin();
        MeshPartBuilder p = mb.part("earth", GL20.GL_TRIANGLES, ATTR, mat(0.56f, 0.44f, 0.30f));
        p.setVertexTransform(new Matrix4().translate(0f, 0.12f, 0f));
        p.box(1.7f, 0.24f, 0.7f);
        p.setVertexTransform(new Matrix4());
        return mb.end();
    }

    /** Trecho de cerca de madeira: 2 m de comprimento (ao longo de x), dois travessões e três estacas. */
    static Model cerca() {
        ModelBuilder mb = new ModelBuilder();
        mb.begin();
        MeshPartBuilder p = mb.part("cerca", GL20.GL_TRIANGLES, ATTR, mat(0.46f, 0.34f, 0.20f));
        p.setVertexTransform(new Matrix4().translate(0f, 0.45f, 0f));
        p.box(2f, 0.09f, 0.07f);
        p.setVertexTransform(new Matrix4().translate(0f, 0.85f, 0f));
        p.box(2f, 0.09f, 0.07f);
        for (float x = -1f; x <= 1.01f; x += 1f) {
            p.setVertexTransform(new Matrix4().translate(x, 0.55f, 0f));
            p.box(0.12f, 1.1f, 0.12f);
        }
        p.setVertexTransform(new Matrix4());
        return mb.end();
    }

    /** Feixe de lenha seca (toras empilhadas), ~0,4 m. */
    static Model lenha() {
        ModelBuilder mb = new ModelBuilder();
        mb.begin();
        MeshPartBuilder p = mb.part("lenha", GL20.GL_TRIANGLES, ATTR, mat(0.42f, 0.30f, 0.18f));
        for (int i = 0; i < 4; i++) {
            p.setVertexTransform(new Matrix4().translate(0f, 0.06f + (i / 2) * 0.12f, (i % 2 == 0 ? -0.07f : 0.07f))
                    .rotate(0f, 1f, 0f, 90f).rotate(0f, 0f, 1f, 90f));
            p.cylinder(0.11f, 0.5f, 0.11f, 8);
        }
        p.setVertexTransform(new Matrix4());
        return mb.end();
    }

    /** Fruta do xique-xique (vermelha, sobre a haste verde), ~0,3 m. */
    static Model fruta() {
        ModelBuilder mb = new ModelBuilder();
        mb.begin();
        MeshPartBuilder fruit = mb.part("fruta", GL20.GL_TRIANGLES, ATTR, mat(0.80f, 0.24f, 0.22f));
        fruit.setVertexTransform(new Matrix4().translate(0f, 0.12f, 0f));
        fruit.cylinder(0.18f, 0.16f, 0.18f, 10);
        MeshPartBuilder haste = mb.part("haste", GL20.GL_TRIANGLES, ATTR, mat(0.40f, 0.55f, 0.36f));
        haste.setVertexTransform(new Matrix4().translate(0f, 0.02f, 0f));
        haste.cylinder(0.05f, 0.2f, 0.05f, 6);
        return mb.end();
    }

    /** Tenda de lona dos retirantes: cone de lona sobre uma base de paus. ~2,2 m. */
    static Model tent() {
        ModelBuilder mb = new ModelBuilder();
        mb.begin();
        MeshPartBuilder lona = mb.part("lona", GL20.GL_TRIANGLES, ATTR, mat(0.80f, 0.75f, 0.62f));
        lona.setVertexTransform(new Matrix4().translate(0f, 0.9f, 0f));
        lona.cone(2.2f, 1.8f, 2.2f, 6);
        MeshPartBuilder pau = mb.part("pau", GL20.GL_TRIANGLES, ATTR, mat(0.36f, 0.26f, 0.16f));
        pau.setVertexTransform(new Matrix4().translate(0f, 0.45f, 0f));
        pau.cylinder(0.07f, 0.9f, 0.07f, 6);
        pau.setVertexTransform(new Matrix4());
        return mb.end();
    }
}
