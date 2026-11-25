package com.exemplo.jogo3d;

import com.badlogic.gdx.graphics.GL20;
import com.badlogic.gdx.graphics.Texture;
import com.badlogic.gdx.graphics.VertexAttributes.Usage;
import com.badlogic.gdx.graphics.g3d.Material;
import com.badlogic.gdx.graphics.g3d.Model;
import com.badlogic.gdx.graphics.g3d.attributes.ColorAttribute;
import com.badlogic.gdx.graphics.g3d.attributes.TextureAttribute;
import com.badlogic.gdx.graphics.g3d.utils.MeshPartBuilder;
import com.badlogic.gdx.graphics.g3d.utils.MeshPartBuilder.VertexInfo;
import com.badlogic.gdx.graphics.g3d.utils.ModelBuilder;
import com.badlogic.gdx.math.MathUtils;

/**
 * Marcos do sertão: açude seco com rachaduras e cacimba funda com um pouco de água no fundo.
 *
 * A cacimba tem 18 m de fundo (cerca de 10 vezes a altura do personagem). A boca fica no chão,
 * com uma mureta de pedra em volta; o terreno ao redor é recortado para mostrar o poço.
 */
final class Landmarks {

    static final float WELL_R = 2.0f;        // raio da boca do poço (parede interna)
    static final float WELL_OUT = 4.2f;      // raio externo da plataforma de pedra (cobre a borda recortada)
    static final float WELL_DEPTH = 18f;     // profundidade (≈ 10x a altura do personagem)
    static final float WELL_CURB = 0.6f;     // altura da mureta acima do chão
    static final float WATER_Y = 17.4f;      // a água fica a 17,4 m abaixo do chão
    static final float WATER_R = 1.85f;
    static final float DAM_R = 2.8f;         // raio do fundo rachado do açude

    private static final int SEG = 28;

    private Landmarks() {}

    /** Fundo rachado do açude: disco que segue o relevo rebaixado do açude. */
    static Model buildDam(World w, float cx, float cz, Texture cracks) {
        ModelBuilder mb = new ModelBuilder();
        mb.begin();
        Material mat = new Material(TextureAttribute.createDiffuse(cracks));
        MeshPartBuilder pb = mb.part("fundo_rachado", GL20.GL_TRIANGLES,
                Usage.Position | Usage.Normal | Usage.TextureCoordinates, mat);
        int rings = 8;
        VertexInfo center = vert(w, cx, cz, cx, cz);
        for (int s = 0; s < SEG; s++) {
            VertexInfo a = ring(w, cx, cz, DAM_R / rings, s);
            VertexInfo b = ring(w, cx, cz, DAM_R / rings, s + 1);
            pb.triangle(center, a, b);
        }
        for (int k = 1; k < rings; k++) {
            float r0 = DAM_R * k / rings, r1 = DAM_R * (k + 1) / rings;
            for (int s = 0; s < SEG; s++) {
                VertexInfo a = ring(w, cx, cz, r0, s), b = ring(w, cx, cz, r0, s + 1);
                VertexInfo c = ring(w, cx, cz, r1, s + 1), d = ring(w, cx, cz, r1, s);
                pb.triangle(a, d, c);
                pb.triangle(a, c, b);
            }
        }
        return mb.end();
    }

    /** Cacimba: poço de 18 m (parede interna), mureta de pedra e um pouco de água no fundo. */
    static Model buildWell(World w, float cx, float cz) {
        ModelBuilder mb = new ModelBuilder();
        mb.begin();
        float y0 = w.heightAt(cx, cz);
        MeshPartBuilder shaft = mb.part("poco", GL20.GL_TRIANGLES, Usage.Position | Usage.Normal,
                new Material(ColorAttribute.createDiffuse(0.50f, 0.45f, 0.38f, 1f)));
        // Parede interna: normais apontando para o centro, para ser vista de dentro do poço
        for (int s = 0; s < SEG; s++) {
            float a0 = MathUtils.PI2 * s / SEG, a1 = MathUtils.PI2 * (s + 1) / SEG;
            VertexInfo topA = wallVert(w, cx, cz, WELL_R, a0, IN, WELL_CURB);
            VertexInfo topB = wallVert(w, cx, cz, WELL_R, a1, IN, WELL_CURB);
            VertexInfo botA = wallVert(w, cx, cz, WELL_R, a0, IN, -WELL_DEPTH);
            VertexInfo botB = wallVert(w, cx, cz, WELL_R, a1, IN, -WELL_DEPTH);
            shaft.triangle(topA, botA, botB);
            shaft.triangle(topA, botB, topB);
        }

        MeshPartBuilder curb = mb.part("mureta", GL20.GL_TRIANGLES, Usage.Position | Usage.Normal,
                new Material(ColorAttribute.createDiffuse(0.62f, 0.57f, 0.49f, 1f)));
        for (int s = 0; s < SEG; s++) {
            float a0 = MathUtils.PI2 * s / SEG, a1 = MathUtils.PI2 * (s + 1) / SEG;
            // Topo da mureta (anel entre WELL_R e WELL_OUT)
            VertexInfo i0 = wallVert(w, cx, cz, WELL_R, a0, UP, WELL_CURB);
            VertexInfo i1 = wallVert(w, cx, cz, WELL_R, a1, UP, WELL_CURB);
            VertexInfo o0 = wallVert(w, cx, cz, WELL_OUT, a0, UP, WELL_CURB);
            VertexInfo o1 = wallVert(w, cx, cz, WELL_OUT, a1, UP, WELL_CURB);
            curb.triangle(i0, o0, o1);
            curb.triangle(i0, o1, i1);
            // Parede externa da mureta, até o chão
            VertexInfo og0 = wallVert(w, cx, cz, WELL_OUT, a0, OUT, -0.4f);
            VertexInfo og1 = wallVert(w, cx, cz, WELL_OUT, a1, OUT, -0.4f);
            curb.triangle(o0, og0, og1);
            curb.triangle(o0, og1, o1);
        }

        MeshPartBuilder water = mb.part("agua", GL20.GL_TRIANGLES, Usage.Position | Usage.Normal,
                new Material(ColorAttribute.createDiffuse(0.12f, 0.26f, 0.30f, 1f)));
        VertexInfo wc = new VertexInfo().setPos(cx, y0 - WATER_Y, cz).setNor(0f, 1f, 0f);
        for (int s = 0; s < SEG; s++) {
            float a0 = MathUtils.PI2 * s / SEG, a1 = MathUtils.PI2 * (s + 1) / SEG;
            VertexInfo p0 = new VertexInfo().setPos(cx + WATER_R * MathUtils.cos(a0), y0 - WATER_Y, cz + WATER_R * MathUtils.sin(a0)).setNor(0f, 1f, 0f);
            VertexInfo p1 = new VertexInfo().setPos(cx + WATER_R * MathUtils.cos(a1), y0 - WATER_Y, cz + WATER_R * MathUtils.sin(a1)).setNor(0f, 1f, 0f);
            water.triangle(wc, p0, p1);
        }
        return mb.end();
    }

    // ---------- Auxiliares ----------

    /** Ponto do disco do açude no anel 'r' e ângulo 'seg', seguindo o relevo. */
    private static VertexInfo ring(World w, float cx, float cz, float r, int seg) {
        float a = MathUtils.PI2 * seg / SEG;
        return vert(w, cx, cz, cx + r * MathUtils.cos(a), cz + r * MathUtils.sin(a));
    }

    private static VertexInfo vert(World w, float cx, float cz, float x, float z) {
        float y = w.heightAt(x, z) + 0.03f;   // um pouco acima do fundo, para não brigar com o terreno
        return new VertexInfo()
                .setPos(x, y, z)
                .setNor(0f, 1f, 0f)
                .setUV((x - cx) / (2f * DAM_R) + 0.5f, (z - cz) / (2f * DAM_R) + 0.5f);
    }

    /** Normais: 0 = para dentro (parede do poço), 1 = para fora (mureta), 2 = para cima (topo). */
    private static final int IN = 0, OUT = 1, UP = 2;

    /** Ponto de uma parede ou da mureta: raio 'r', ângulo 'a', altura relativa ao chão 'dy'. */
    private static VertexInfo wallVert(World w, float cx, float cz, float r, float a, int normal, float dy) {
        float x = cx + r * MathUtils.cos(a), z = cz + r * MathUtils.sin(a);
        float ground = w.heightAt(x, z);
        float nx = 0f, ny = 0f, nz = 0f;
        if (normal == IN) { nx = -MathUtils.cos(a); nz = -MathUtils.sin(a); }
        else if (normal == OUT) { nx = MathUtils.cos(a); nz = MathUtils.sin(a); }
        else ny = 1f;
        return new VertexInfo().setPos(x, ground + dy, z).setNor(nx, ny, nz);
    }
}
