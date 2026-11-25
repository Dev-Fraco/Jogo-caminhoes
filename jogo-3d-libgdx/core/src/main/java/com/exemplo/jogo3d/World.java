package com.exemplo.jogo3d;

import com.badlogic.gdx.graphics.Color;
import com.badlogic.gdx.graphics.GL20;
import com.badlogic.gdx.graphics.VertexAttributes.Usage;
import com.badlogic.gdx.graphics.g3d.Material;
import com.badlogic.gdx.graphics.g3d.Model;
import com.badlogic.gdx.graphics.g3d.ModelInstance;
import com.badlogic.gdx.graphics.g3d.attributes.ColorAttribute;
import com.badlogic.gdx.graphics.g3d.utils.MeshPartBuilder;
import com.badlogic.gdx.graphics.g3d.utils.MeshPartBuilder.VertexInfo;
import com.badlogic.gdx.graphics.g3d.utils.ModelBuilder;
import com.badlogic.gdx.math.MathUtils;
import com.badlogic.gdx.math.Matrix4;
import com.badlogic.gdx.math.Quaternion;
import com.badlogic.gdx.math.Vector3;
import com.badlogic.gdx.utils.Array;

import java.util.Random;

/**
 * Mundo do sertão: relevo com subidas e descidas, chão de caatinga seca,
 * árvores mortas, cactos, casas redondas de palha/taipa e pedras.
 * Tudo é gerado por código (sem arquivos de modelo).
 */
public class World {

    static final float SIZE = 180f;          // tamanho do terreno (metros)
    static final float HALF = SIZE / 2f;
    static final int GRID = 64;              // células por lado (64 = limite seguro de vértices)
    static final float SPAWN_CLEAR = 9f;     // área plana no ponto de nascimento

    /** Objeto com colisão circular (casa, cacto, árvore, pedra). */
    static class Obstacle {
        final float x, z, radius, baseY, height;
        Obstacle(float x, float z, float radius, float baseY, float height) {
            this.x = x;
            this.z = z;
            this.radius = radius;
            this.baseY = baseY;
            this.height = height;
        }
    }

    /** Todas as instâncias que devem ser desenhadas (terreno + cenário). */
    final Array<ModelInstance> instances = new Array<>();
    final Array<Obstacle> obstacles = new Array<>();

    private Model terrainModel;
    private Model unitCylinder;
    private Model unitSphere;

    /** Altura do terreno em (x, z). Plana perto do spawn, colinas ao redor. */
    public float heightAt(float x, float z) {
        float h = 2.8f * MathUtils.sin(x * 0.040f + 0.7f) * MathUtils.cos(z * 0.035f - 0.3f)
                + 1.7f * MathUtils.sin(x * 0.100f - z * 0.070f + 2.1f)
                + 0.8f * MathUtils.sin(x * 0.230f + 1.7f) * MathUtils.sin(z * 0.190f + 0.4f);
        float r = (float) Math.sqrt(x * x + z * z);
        float t = MathUtils.clamp((r - SPAWN_CLEAR) / 14f, 0f, 1f);
        float flat = t * t * (3f - 2f * t); // suavização
        return h * flat;
    }

    private Vector3 normalAt(float x, float z) {
        float e = 0.5f;
        float dhdx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2f * e);
        float dhdz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2f * e);
        return new Vector3(-dhdx, 1f, -dhdz).nor();
    }

    private Color colorAt(float x, float z, Vector3 n) {
        float var = 0.5f + 0.5f * (float) Math.sin(x * 0.37 + z * 0.21) * (float) Math.sin(x * 0.13 - z * 0.29);
        Color c = new Color(0.80f, 0.68f, 0.45f, 1f).lerp(new Color(0.60f, 0.55f, 0.34f, 1f), var);
        float steep = 1f - n.y; // 0 = plano, maior = mais íngreme
        if (steep > 0.10f) {
            c.lerp(new Color(0.46f, 0.36f, 0.27f, 1f), MathUtils.clamp((steep - 0.10f) * 3f, 0f, 1f));
        }
        return c;
    }

    private VertexInfo vertex(float x, float z) {
        Vector3 n = normalAt(x, z);
        return new VertexInfo()
                .setPos(x, heightAt(x, z), z)
                .setNor(n.x, n.y, n.z)
                .setCol(colorAt(x, z, n));
    }

    public void create() {
        ModelBuilder mb = new ModelBuilder();

        // Terreno com cores por vértice
        mb.begin();
        MeshPartBuilder part = mb.part("terrain", GL20.GL_TRIANGLES,
                Usage.Position | Usage.Normal | Usage.ColorPacked, new Material());
        float step = SIZE / GRID;
        for (int i = 0; i < GRID; i++) {
            for (int j = 0; j < GRID; j++) {
                float x0 = -HALF + i * step, x1 = x0 + step;
                float z0 = -HALF + j * step, z1 = z0 + step;
                VertexInfo a = vertex(x0, z0), b = vertex(x1, z0);
                VertexInfo c = vertex(x1, z1), d = vertex(x0, z1);
                part.triangle(a, b, c);
                part.triangle(a, c, d);
            }
        }
        terrainModel = mb.end();
        instances.add(new ModelInstance(terrainModel));

        // Primitivas reutilizadas (tamanho unitário; escala no transform)
        unitCylinder = mb.createCylinder(1f, 1f, 1f, 12, new Material(), Usage.Position | Usage.Normal);
        unitSphere = mb.createSphere(1f, 1f, 1f, 14, 10, new Material(), Usage.Position | Usage.Normal);

        Random rnd = new Random(7L);
        for (int i = 0; i < 26; i++) addHut(rnd);
        for (int i = 0; i < 30; i++) addDeadTree(rnd);
        for (int i = 0; i < 16; i++) addCactus(rnd);
        for (int i = 0; i < 25; i++) addRock(rnd);
    }

    /** Escolhe um ponto aleatório fora da área de nascimento. */
    private float[] randomSpot(Random rnd, float margin) {
        float x, z;
        do {
            x = (rnd.nextFloat() * 2f - 1f) * (HALF - margin);
            z = (rnd.nextFloat() * 2f - 1f) * (HALF - margin);
        } while (Math.sqrt(x * x + z * z) < 14f);
        return new float[]{x, z};
    }

    private ModelInstance inst(Model m, Color c, Matrix4 t) {
        ModelInstance mi = new ModelInstance(m);
        mi.materials.get(0).set(ColorAttribute.createDiffuse(c));
        mi.transform.set(t);
        return mi;
    }

    private void addHut(Random rnd) {
        float[] p = randomSpot(rnd, 12f);
        float x = p[0], z = p[1];
        float y = heightAt(x, z);
        float r = 2.0f + rnd.nextFloat() * 0.8f;   // raio da casa
        float h = 2.2f + rnd.nextFloat() * 0.8f;   // altura da parede

        // Parede de taipa (cilindro)
        instances.add(inst(unitCylinder, new Color(0.84f, 0.73f, 0.55f, 1f),
                new Matrix4().setToTranslation(x, y + h / 2f, z).scale(r * 2f, h, r * 2f)));
        // Telhado de palha em cúpula
        instances.add(inst(unitSphere, new Color(0.58f, 0.46f, 0.26f, 1f),
                new Matrix4().setToTranslation(x, y + h, z).scale(r * 2.3f, r * 1.1f, r * 2.3f)));
        obstacles.add(new Obstacle(x, z, r + 0.2f, y, h));
    }

    private void addDeadTree(Random rnd) {
        float[] p = randomSpot(rnd, 8f);
        float x = p[0], z = p[1];
        float y = heightAt(x, z);
        float h = 3.5f + rnd.nextFloat() * 2.5f;
        float r = 0.16f + rnd.nextFloat() * 0.08f;
        Color bark = new Color(0.42f, 0.37f, 0.31f, 1f);

        // Tronco seco e sem folhas
        instances.add(inst(unitCylinder, bark,
                new Matrix4().setToTranslation(x, y + h / 2f, z).scale(r * 2f, h, r * 2f)));

        // Galhos secos, tortos, subindo e se abrindo
        int branches = 3 + rnd.nextInt(3);
        for (int b = 0; b < branches; b++) {
            float t = 0.45f + rnd.nextFloat() * 0.5f;
            Vector3 origin = new Vector3(x, y + h * t, z);
            float ang = rnd.nextFloat() * MathUtils.PI2;
            float tilt = 0.5f + rnd.nextFloat() * 0.6f;
            Vector3 dir = new Vector3(
                    MathUtils.cos(ang) * MathUtils.sin(tilt), MathUtils.cos(tilt), MathUtils.sin(ang) * MathUtils.sin(tilt));
            float len = 1.1f + rnd.nextFloat() * 1.2f;
            addBranch(origin, dir, len, r * 0.45f, bark);
        }

        obstacles.add(new Obstacle(x, z, r * 2.5f, y, h));
    }

    private void addBranch(Vector3 origin, Vector3 dir, float len, float w, Color color) {
        Vector3 mid = new Vector3(dir).scl(len / 2f).add(origin);
        Quaternion q = new Quaternion().setFromCross(Vector3.Y, dir);
        Matrix4 t = new Matrix4().set(mid, q).scale(w * 2f, len, w * 2f);
        instances.add(inst(unitCylinder, color, t));
    }

    private void addCactus(Random rnd) {
        float[] p = randomSpot(rnd, 8f);
        float x = p[0], z = p[1];
        float y = heightAt(x, z);
        float h = 2.2f + rnd.nextFloat() * 1.6f;
        float r = 0.32f;
        Color green = new Color(0.30f, 0.48f, 0.28f, 1f);

        instances.add(inst(unitCylinder, green,
                new Matrix4().setToTranslation(x, y + h / 2f, z).scale(r * 2f, h, r * 2f)));
        // Um ou dois braços arredondados
        if (rnd.nextBoolean()) {
            float side = rnd.nextBoolean() ? 1f : -1f;
            float bh = h * 0.55f;
            addBranch(new Vector3(x, y + bh, z), new Vector3(side, 0.6f, 0f).nor(), 0.9f, r * 0.7f, green);
        }
        obstacles.add(new Obstacle(x, z, r + 0.25f, y, h));
    }

    private void addRock(Random rnd) {
        float[] p = randomSpot(rnd, 6f);
        float x = p[0], z = p[1];
        float y = heightAt(x, z);
        float s = 0.8f + rnd.nextFloat() * 1.4f;
        instances.add(inst(unitSphere, new Color(0.56f, 0.51f, 0.46f, 1f),
                new Matrix4().setToTranslation(x, y + s * 0.3f, z).scale(s * 1.4f, s * 0.9f, s * 1.2f)));
        obstacles.add(new Obstacle(x, z, s * 0.7f, y, s * 0.9f));
    }

    /** Empurra o jogador (círculo) para fora de qualquer obstáculo que ele esteja tocando. */
    public void resolveCollisions(Vector3 p, float playerRadius) {
        for (int k = 0; k < obstacles.size; k++) {
            Obstacle o = obstacles.get(k);
            if (p.y > o.baseY + o.height) continue; // passou por cima do obstáculo
            float dx = p.x - o.x, dz = p.z - o.z;
            float min = o.radius + playerRadius;
            float d2 = dx * dx + dz * dz;
            if (d2 < min * min && d2 > 1e-6f) {
                float d = (float) Math.sqrt(d2);
                float push = (min - d) / d;
                p.x += dx * push;
                p.z += dz * push;
            }
        }
    }

    public void dispose() {
        terrainModel.dispose();
        unitCylinder.dispose();
        unitSphere.dispose();
    }
}
