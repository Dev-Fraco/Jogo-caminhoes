package com.exemplo.jogo3d;

import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.graphics.Color;
import com.badlogic.gdx.graphics.GL20;
import com.badlogic.gdx.graphics.Texture;
import com.badlogic.gdx.graphics.VertexAttributes.Usage;
import com.badlogic.gdx.graphics.g3d.Material;
import com.badlogic.gdx.graphics.g3d.Model;
import com.badlogic.gdx.graphics.g3d.ModelInstance;
import com.badlogic.gdx.graphics.g3d.attributes.TextureAttribute;
import com.badlogic.gdx.graphics.g3d.loader.ObjLoader;
import com.badlogic.gdx.graphics.g3d.loader.G3dModelLoader;
import com.badlogic.gdx.graphics.g3d.utils.MeshPartBuilder;
import com.badlogic.gdx.utils.JsonReader;
import com.badlogic.gdx.graphics.g3d.utils.MeshPartBuilder.VertexInfo;
import com.badlogic.gdx.graphics.g3d.utils.ModelBuilder;
import com.badlogic.gdx.math.MathUtils;
import com.badlogic.gdx.math.Matrix4;
import com.badlogic.gdx.math.Vector3;
import com.badlogic.gdx.utils.Array;

import java.util.Random;

/**
 * Mundo do sertão: relevo com subidas e descidas, chão de terra seca com textura,
 * e objetos 3D reais (cactos, pedras, tocos e troncos, CC0 da Kenney/Quaternius).
 * Casas redondas são provisórias (ainda sem modelo real).
 */
public class World {

    static final float SIZE = 180f;          // tamanho do terreno (metros)
    static final float HALF = SIZE / 2f;
    static final int GRID = 64;              // células por lado (64 = limite seguro de vértices)
    static final float SPAWN_CLEAR = 9f;     // área plana no ponto de nascimento
    static final float TEXTURE_TILE = 14f;    // metros por repetição da textura de terra

    /** Objeto com colisão circular. */
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
    private Model casaModel;   // casa de taipa (modelo real importado)
    private Texture dirtTexture;
    private final Array<Model> loaded = new Array<>();

    /** Altura do terreno em (x, z). Plana perto do spawn, colinas ao redor. */
    public float heightAt(float x, float z) {
        float h = 2.8f * MathUtils.sin(x * 0.040f + 0.7f) * MathUtils.cos(z * 0.035f - 0.3f)
                + 1.7f * MathUtils.sin(x * 0.100f - z * 0.070f + 2.1f)
                + 0.8f * MathUtils.sin(x * 0.230f + 1.7f) * MathUtils.sin(z * 0.190f + 0.4f);
        float r = (float) Math.sqrt(x * x + z * z);
        float t = MathUtils.clamp((r - SPAWN_CLEAR) / 14f, 0f, 1f);
        float flat = t * t * (3f - 2f * t);
        return h * flat;
    }

    private Vector3 normalAt(float x, float z) {
        float e = 0.5f;
        float dhdx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2f * e);
        float dhdz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2f * e);
        return new Vector3(-dhdx, 1f, -dhdz).nor();
    }

    /** Tom por vértice: quase branco (a textura já traz a cor); só escurece as encostas. */
    private Color tintAt(float x, float z, Vector3 n) {
        float steep = 1f - n.y;
        float shade = 1f - MathUtils.clamp((steep - 0.10f) * 0.6f, 0f, 0.25f);
        return new Color(shade, shade, shade, 1f);
    }

    private VertexInfo vertex(float x, float z) {
        Vector3 n = normalAt(x, z);
        return new VertexInfo()
                .setPos(x, heightAt(x, z), z)
                .setNor(n.x, n.y, n.z)
                .setCol(tintAt(x, z, n))
                .setUV(x / TEXTURE_TILE, z / TEXTURE_TILE);
    }

    public void create() {
        dirtTexture = new Texture(Gdx.files.internal("textures/ground_basecolor.jpg"));
        dirtTexture.setWrap(Texture.TextureWrap.Repeat, Texture.TextureWrap.Repeat);

        ModelBuilder mb = new ModelBuilder();

        // Terreno: textura de terra + cor por altura/inclinação
        mb.begin();
        MeshPartBuilder part = mb.part("terrain", GL20.GL_TRIANGLES,
                Usage.Position | Usage.Normal | Usage.ColorPacked | Usage.TextureCoordinates,
                new Material(TextureAttribute.createDiffuse(dirtTexture)));
        float step = SIZE / GRID;
        for (int i = 0; i < GRID; i++) {
            for (int j = 0; j < GRID; j++) {
                float x0 = -HALF + i * step, x1 = x0 + step;
                float z0 = -HALF + j * step, z1 = z0 + step;
                VertexInfo a = vertex(x0, z0), b = vertex(x1, z0);
                VertexInfo c = vertex(x1, z1), d = vertex(x0, z1);
                // ordem anti-horária vista de cima (para a face aparecer)
                part.triangle(a, c, b);
                part.triangle(a, d, c);
            }
        }
        terrainModel = mb.end();
        instances.add(new ModelInstance(terrainModel));


        // Objetos 3D reais (modelos CC0 convertidos para .obj)
        Model cactus = loadModel("models/cactus.obj");
        Model rockLarge = loadModel("models/rock_large.obj");
        Model rockSmall = loadModel("models/rock_small.obj");
        Model stump = loadModel("models/stump.obj");
        Model log = loadModel("models/log.obj");
        Model bush = loadModel("models/bush.obj");

        Random rnd = new Random(7L);
        casaModel = new G3dModelLoader(new JsonReader()).loadModel(Gdx.files.internal("models/casa_taipa.g3dj"));
        for (int i = 0; i < 8; i++) addHouse(rnd);
        for (int i = 0; i < 18; i++) addProp(rnd, cactus, 3.2f, 0.45f, 1.0f + 0.2f * rnd.nextFloat());
        for (int i = 0; i < 12; i++) addProp(rnd, rockLarge, 2.2f, 0.9f, 1f);
        for (int i = 0; i < 16; i++) addProp(rnd, rockSmall, 2.2f, 0.45f, 1f);
        // Madeira morta: tocos e troncos caídos (no lugar das árvores mortas, que ainda não temos modelo)
        for (int i = 0; i < 18; i++) addProp(rnd, stump, 2.6f, 0.35f, 1f);
        for (int i = 0; i < 12; i++) addProp(rnd, log, 2.6f, 1.2f, 1f);
        for (int i = 0; i < 20; i++) addProp(rnd, bush, 2.4f, 0f, 1f);
    }

    private Model loadModel(String path) {
        Model m = new ObjLoader().loadModel(Gdx.files.internal(path));
        loaded.add(m);
        return m;
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

    /**
     * Coloca um modelo real no terreno.
     * @param scale escala aplicada ao modelo
     * @param collisionRadius raio de colisão (0 = sem colisão, ex.: troncos deitados)
     */
    private void addProp(Random rnd, Model model, float scale, float collisionRadius, float sizeJitter) {
        float[] p = randomSpot(rnd, 6f);
        float x = p[0], z = p[1];
        float y = heightAt(x, z);
        float rot = rnd.nextFloat() * MathUtils.PI2;
        float s = scale * sizeJitter;

        ModelInstance mi = new ModelInstance(model);
        mi.transform.setToTranslation(x, y, z).rotate(Vector3.Y, rot * MathUtils.radiansToDegrees).scale(s, s, s);
        instances.add(mi);

        if (collisionRadius > 0f) {
            obstacles.add(new Obstacle(x, z, collisionRadius * sizeJitter, y, 1.5f));
        }
    }

    private ModelInstance inst(Model m, Color c, Matrix4 t) {
        ModelInstance mi = new ModelInstance(m);
        mi.materials.get(0).set(com.badlogic.gdx.graphics.g3d.attributes.ColorAttribute.createDiffuse(c));
        mi.transform.set(t);
        return mi;
    }

    /**
     * Coloca a casa de taipa (modelo real, 6 m x 4 m) num ponto plano e com rotação aleatória.
     * É um objeto independente: pode ser posicionado em qualquer lugar do mapa.
     */
    private void addHouse(Random rnd) {
        float bestX = 0f, bestZ = 0f, bestSlope = 1e9f;
        for (int t = 0; t < 40; t++) {
            float[] p = randomSpot(rnd, 14f);
            float slope = slopeAt(p[0], p[1]);
            if (slope < bestSlope) { bestSlope = slope; bestX = p[0]; bestZ = p[1]; }
            if (slope < 0.12f) break;
        }
        float y = heightAt(bestX, bestZ);
        float yaw = rnd.nextFloat() * 360f;

        ModelInstance house = new ModelInstance(casaModel);
        house.transform.setToTranslation(bestX, y, bestZ).rotate(Vector3.Y, yaw);
        instances.add(house);
        // Colisão aproximada da casa (círculo cobrindo as paredes)
        obstacles.add(new Obstacle(bestX, bestZ, 3.8f, y, 3.7f));
    }

    /** Inclinação aproximada do terreno numa área de 6 m (quanto menor, mais plano). */
    private float slopeAt(float x, float z) {
        float e = 3f;
        return Math.abs(heightAt(x + e, z) - heightAt(x - e, z)) / (2f * e)
                + Math.abs(heightAt(x, z + e) - heightAt(x, z - e)) / (2f * e);
    }

    /** Empurra o jogador (círculo) para fora de qualquer obstáculo que ele esteja tocando. */
    public void resolveCollisions(Vector3 p, float playerRadius) {
        for (int k = 0; k < obstacles.size; k++) {
            Obstacle o = obstacles.get(k);
            if (p.y > o.baseY + o.height) continue;
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
        casaModel.dispose();
        dirtTexture.dispose();
        for (int i = 0; i < loaded.size; i++) loaded.get(i).dispose();
    }
}
