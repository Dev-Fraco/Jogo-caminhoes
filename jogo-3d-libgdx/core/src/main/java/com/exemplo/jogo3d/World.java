package com.exemplo.jogo3d;

import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.graphics.Color;
import com.badlogic.gdx.graphics.GL20;
import com.badlogic.gdx.graphics.Texture;
import com.badlogic.gdx.graphics.VertexAttributes.Usage;
import com.badlogic.gdx.graphics.g3d.Material;
import com.badlogic.gdx.graphics.g3d.Model;
import com.badlogic.gdx.graphics.g3d.ModelInstance;
import com.badlogic.gdx.graphics.g3d.attributes.ColorAttribute;
import com.badlogic.gdx.graphics.g3d.utils.AnimationController;
import com.badlogic.gdx.graphics.g3d.attributes.TextureAttribute;
import com.badlogic.gdx.graphics.g3d.loader.ObjLoader;
import com.badlogic.gdx.graphics.g3d.loader.G3dModelLoader;
import com.badlogic.gdx.graphics.g3d.utils.MeshPartBuilder;
import com.badlogic.gdx.utils.JsonReader;
import com.badlogic.gdx.graphics.g3d.utils.MeshPartBuilder.VertexInfo;
import com.badlogic.gdx.graphics.g3d.utils.ModelBuilder;
import com.badlogic.gdx.math.MathUtils;
import com.badlogic.gdx.math.Matrix4;
import com.badlogic.gdx.math.Quaternion;
import com.badlogic.gdx.math.Vector3;
import com.badlogic.gdx.utils.Array;
import com.badlogic.gdx.utils.JsonValue;

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

    /** Casa colocada no mapa: transformação e inversa, para checar colisão no sistema da casa. */
    static class House {
        final Matrix4 t, inv;
        House(Matrix4 t) { this.t = t; this.inv = new Matrix4(t).inv(); }
    }
    final Array<House> houses = new Array<>();
    /** Cercados de arame farpado em volta das casas (com porteira). */
    final FenceSystem fences = new FenceSystem();
    private final Array<float[]> enclosureCenters = new Array<>();
    /** Caixas das paredes da casa (coordenadas locais), lidas de models/casa_taipa_colisao.json. */
    private final Array<float[]> wallBoxes = new Array<>();

    private Model terrainModel;
    private Model casaModel;   // casa de taipa (modelo real importado)
    private Model troughModel; // cocho de madeira (1,84 m)
    private Model postModel;   // morão de madeira, para amarrar o animal
    private Model cartModel;   // carroça de madeira (2,2 x 2,8 m)
    private Model horseModel;  // cavalo (estático, 1,72 m de altura)
    private Model donkeyModel; // donkey (1,86 m de comprimento)
    private Model ropeModel;   // corda do donkey até o morão (criada na hora)
    private ModelInstance donkeyInstance;
    private AnimationController donkeyAnim;
    /** Montarias do mundo: o donkey do estábulo e os cavalos (cada um pode ser montado). */
    final Array<Riding.Mount> mounts = new Array<>();
    private ModelInstance ropeInstance;
    private final Vector3 donkeyStart = new Vector3();
    private float donkeyStartFacingDeg = 0f;
    private Texture dirtTexture;
    // Açude seco e cacimba (escolhidos em create, antes do terreno)
    private boolean hasDam = false, hasWell = false;
    private float damX, damZ, wellX, wellZ;
    private Texture crackTexture;
    private Model damModel, wellModel;
    private final Array<Model> loaded = new Array<>();

    /** Altura do terreno em (x, z). Plana perto do spawn, colinas ao redor. */
    public float heightAt(float x, float z) {
        float h = 2.8f * MathUtils.sin(x * 0.040f + 0.7f) * MathUtils.cos(z * 0.035f - 0.3f)
                + 1.7f * MathUtils.sin(x * 0.100f - z * 0.070f + 2.1f)
                + 0.8f * MathUtils.sin(x * 0.230f + 1.7f) * MathUtils.sin(z * 0.190f + 0.4f);
        float r = (float) Math.sqrt(x * x + z * z);
        float t = MathUtils.clamp((r - SPAWN_CLEAR) / 14f, 0f, 1f);
        float flat = t * t * (3f - 2f * t);
        float edge = Math.max(Math.abs(x), Math.abs(z));
        float k = MathUtils.clamp((edge - 40f) / 40f, 0f, 1f);
        k = k * k * (3f - 2f * k);
        float corners = 16f * k * (0.6f + 0.4f * MathUtils.sin(x * 0.07f + 0.5f) * MathUtils.cos(z * 0.06f - 0.9f));
        float y = h * flat + corners;
        if (hasDam) {
            // Açude: fundo rebaixado 35 cm, com as bordas subindo suavemente
            float d = (float) Math.sqrt((x - damX) * (x - damX) + (z - damZ) * (z - damZ));
            float w = d <= 2.6f ? 1f : d >= 3.8f ? 0f : (3.8f - d) / 1.2f;
            y -= 0.35f * w * w * (3f - 2f * w);
        }
        return y;
    }

    /** Verdadeiro se o retângulo da célula toca o círculo (cx, cz, r). */
    private static boolean cellTouchesCircle(float x0, float z0, float x1, float z1, float cx, float cz, float r) {
        float dx = Math.max(Math.max(x0 - cx, 0f), cx - x1);
        float dz = Math.max(Math.max(z0 - cz, 0f), cz - z1);
        return dx * dx + dz * dz < r * r;
    }

    private boolean nearWellOrDam(float x, float z, float margin) {
        if (hasWell && Math.hypot(x - wellX, z - wellZ) < margin) return true;
        return hasDam && Math.hypot(x - damX, z - damZ) < margin;
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

    /** Escolhe o lugar do açude e da cacimba: longe do início e um do outro. */
    private void choosePlacesForLandmarks() {
        Random r = new Random(20261125L);
        for (int t = 0; t < 400 && (!hasDam || !hasWell); t++) {
            float x = (r.nextFloat() * 2f - 1f) * 70f, z = (r.nextFloat() * 2f - 1f) * 70f;
            if (Math.hypot(x, z) < 30f) continue;
            if (!hasDam) {
                if (!flatAround(x, z, 4f, 1.0f)) continue;   // açude em lugar plano
                damX = x; damZ = z; hasDam = true;
            } else if (!hasWell && Math.hypot(x - damX, z - damZ) > 30f && flatAround(x, z, 4f, 1.4f)) {
                wellX = x; wellZ = z; hasWell = true;
            }
        }
    }

    /** Verdadeiro se o terreno num raio 'r' varia no máximo 'maxRange' metros. */
    private boolean flatAround(float x, float z, float r, float maxRange) {
        float mn = 1e9f, mx = -1e9f;
        for (int i = 0; i < 8; i++) {
            float a = MathUtils.PI2 * i / 8f;
            float h = heightAt(x + r * MathUtils.cos(a), z + r * MathUtils.sin(a));
            mn = Math.min(mn, h);
            mx = Math.max(mx, h);
        }
        float c = heightAt(x, z);
        mn = Math.min(mn, c);
        mx = Math.max(mx, c);
        return mx - mn <= maxRange;
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
        crackTexture = new Texture(Gdx.files.internal("textures/cracks.jpg"));
        crackTexture.setWrap(Texture.TextureWrap.Repeat, Texture.TextureWrap.Repeat);
        choosePlacesForLandmarks();

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
                // Boca da cacimba: sai do terreno toda célula que toca o círculo do poço (a plataforma cobre a borda)
                if (hasWell && cellTouchesCircle(x0, z0, x1, z1, wellX, wellZ, Landmarks.WELL_R)) continue;
                VertexInfo a = vertex(x0, z0), b = vertex(x1, z0);
                VertexInfo c = vertex(x1, z1), d = vertex(x0, z1);
                // ordem anti-horária vista de cima (para a face aparecer)
                part.triangle(a, c, b);
                part.triangle(a, d, c);
            }
        }
        terrainModel = mb.end();
        instances.add(new ModelInstance(terrainModel));

        // Açude seco com rachaduras e cacimba funda com água no fundo
        if (hasDam) {
            damModel = Landmarks.buildDam(this, damX, damZ, crackTexture);
            instances.add(new ModelInstance(damModel));
        }
        if (hasWell) {
            wellModel = Landmarks.buildWell(this, wellX, wellZ);
            instances.add(new ModelInstance(wellModel));
            obstacles.add(new Obstacle(wellX, wellZ, Landmarks.WELL_OUT + 0.3f, heightAt(wellX, wellZ), 1.0f));
        }


        // Objetos 3D reais (modelos CC0 convertidos para .obj)
        Model cactus = loadModel("models/cactus.obj");
        Model rockLarge = loadModel("models/rock_large.obj");
        Model rockSmall = loadModel("models/rock_small.obj");
        Model stump = loadModel("models/stump.obj");
        Model log = loadModel("models/log.obj");
        Model bush = loadModel("models/bush.obj");

        Random rnd = new Random(7L);
        casaModel = new G3dModelLoader(new JsonReader()).loadModel(Gdx.files.internal("models/casa_taipa.g3dj"));
        JsonValue boxes = new JsonReader().parse(Gdx.files.internal("models/casa_taipa_colisao.json"));
        for (JsonValue b = boxes.child; b != null; b = b.next) {
            wallBoxes.add(new float[]{b.getFloat("minX"), b.getFloat("maxX"), b.getFloat("minY"), b.getFloat("maxY"), b.getFloat("minZ"), b.getFloat("maxZ")});
        }
        fences.create();
        troughModel = new G3dModelLoader(new JsonReader()).loadModel(Gdx.files.internal("models/cocho.g3dj"));
        postModel = buildPostModel();
        cartModel = new G3dModelLoader(new JsonReader()).loadModel(Gdx.files.internal("models/carroca.g3dj"));
        horseModel = new G3dModelLoader(new JsonReader()).loadModel(Gdx.files.internal("models/horse.g3dj"));
        donkeyModel = new G3dModelLoader(new JsonReader()).loadModel(Gdx.files.internal("models/donkey.g3dj"));
        for (int i = 0; i < 8; i++) addEnclosedHouse(rnd);
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
     * Coloca a casa de taipa (modelo real, ~8,4 m x 6,4 m, porta na frente) num ponto plano e com rotação aleatória.
     * É um objeto independente: pode ser posicionado em qualquer lugar do mapa.
     */
    private void addEnclosedHouse(Random rnd) {
        float bestX = 0f, bestZ = 0f, bestRange = 1e9f;
        for (int t = 0; t < 80; t++) {
            float[] p = randomSpot(rnd, 14f);
            if (Math.hypot(p[0], p[1]) < 20.0) continue;          // longe do início
            if (nearWellOrDam(p[0], p[1], 16f)) continue;         // longe do açude e da cacimba
            boolean near = false;
            for (int k = 0; k < enclosureCenters.size; k++) {
                float[] c = enclosureCenters.get(k);
                if (Math.hypot(p[0] - c[0], p[1] - c[1]) < 34.0) near = true;   // cercados não se encostam
            }
            if (near) continue;
            float range = flatRange(p[0], p[1]);
            if (range < bestRange) { bestRange = range; bestX = p[0]; bestZ = p[1]; }
            if (range < 0.5f) break;
        }
        enclosureCenters.add(new float[]{bestX, bestZ});

        // Casa no centro do cercado, com a porta voltada para a porteira (frente +z)
        float yaw = rnd.nextInt(4) * 90f;
        float y = heightAt(bestX, bestZ);
        Matrix4 t = new Matrix4().setToTranslation(bestX, y, bestZ).rotate(Vector3.Y, yaw);
        ModelInstance house = new ModelInstance(casaModel);
        house.transform.set(t);
        instances.add(house);
        houses.add(new House(t));

        fences.addEnclosure(this, bestX, bestZ, yaw);

        // Primeiro cercado: estábulo, com morão e cocho do lado esquerdo (dentro do cercado)
        if (houses.size == 1) addStable(bestX, y, bestZ, yaw);

        // Carroça em cada cercado, ao lado da casa (dentro do cercado, frente = +z)
        Matrix4 enc = new Matrix4().setToTranslation(bestX, y, bestZ).rotate(Vector3.Y, yaw);
        Vector3 c = new Vector3(6f, 0f, -3f).mul(enc);
        ModelInstance cart = new ModelInstance(cartModel);
        cart.transform.setToTranslation(c.x, heightAt(c.x, c.z), c.z).rotate(Vector3.Y, yaw);
        instances.add(cart);
        obstacles.add(new Obstacle(c.x, c.z, 1.5f, heightAt(c.x, c.z), 1.8f));

        // Cavalo em só algumas casas (3ª, 6ª e 8ª), parado dentro do cercado
        if (houses.size == 3 || houses.size == 6 || houses.size == 8) {
            Vector3 h = new Vector3(-5f, 0f, 3f).mul(enc);
            ModelInstance horse = new ModelInstance(horseModel);
            horse.transform.setToTranslation(h.x, heightAt(h.x, h.z), h.z).rotate(Vector3.Y, yaw);
            instances.add(horse);
            AnimationController horseAnim = new AnimationController(horse);
            horseAnim.animate("Idle", -1, 1f, null, 0.2f);
            mounts.add(new Riding.Mount(horse, horseAnim, null, new Vector3(h.x, 0f, h.z), yaw,
                    1.55f, 0.0f, 0.67f, 1.8f, 4.5f, true, -0.9f, 1.42f));
        }
    }

    /**
     * Estábulo do primeiro cercado (coordenadas locais do cercado, frente = +z):
     * morão à esquerda, cocho na frente dele e o donkey amarrado pelo pescoço ao morão, com a cabeça sobre o cocho.
     */
    private void addStable(float ex, float ey, float ez, float yaw) {
        Matrix4 enc = new Matrix4().setToTranslation(ex, ey, ez).rotate(Vector3.Y, yaw);
        Vector3 p = new Vector3(-7.2f, 0f, -3.2f).mul(enc);
        ModelInstance post = new ModelInstance(postModel);
        post.transform.setToTranslation(p.x, heightAt(p.x, p.z), p.z).rotate(Vector3.Y, yaw);
        instances.add(post);
        obstacles.add(new Obstacle(p.x, p.z, 0.2f, heightAt(p.x, p.z), 1.6f));

        Vector3 t = new Vector3(-5.5f, 0f, -5f).mul(enc);
        ModelInstance trough = new ModelInstance(troughModel);
        trough.transform.setToTranslation(t.x, heightAt(t.x, t.z), t.z).rotate(Vector3.Y, yaw);
        instances.add(trough);
        obstacles.add(new Obstacle(t.x, t.z, 0.9f, heightAt(t.x, t.z), 0.9f));

        // Donkey: o modelo tem a cabeça em +z e o centro em z = 0,33; gira 180° para olhar o cocho
        // Focinho sobre o centro do cocho: na pose de comer o focinho fica 0,77 m à frente da origem do modelo
        Vector3 d = new Vector3(-5.5f, 0f, -4.23f).mul(enc);
        ModelInstance donkey = new ModelInstance(donkeyModel);
        donkey.transform.setToTranslation(d.x, heightAt(d.x, d.z), d.z).rotate(Vector3.Y, yaw + 180f);
        instances.add(donkey);
        donkeyInstance = donkey;
        donkeyAnim = new AnimationController(donkey);
        donkeyAnim.animate("Eat", -1, 1f, null, 0.2f);
        donkeyStart.set(d);
        donkeyStartFacingDeg = yaw + 180f;
        mounts.add(new Riding.Mount(donkey, donkeyAnim, ropeInstance, new Vector3(d.x, 0f, d.z), yaw + 180f,
                1.22f, 0.1f, 0.75f, 1.4f, 2.6f, false, -0.6f, 1.26f));

        // Corda: do topo do morão até o pescoço do donkey, com um pouco de folga
        Vector3 top = new Vector3(p.x, heightAt(p.x, p.z) + 1.45f, p.z);
        Vector3 head = new Vector3(0f, 1.25f, 0.72f).mul(donkey.transform);   // ponto do cabresto na cabeça
        ropeModel = buildRope(top, head);
        ModelInstance rope = new ModelInstance(ropeModel);
        instances.add(rope);
        ropeInstance = rope;
    }

    /** Corda com folga: polilinha caindo um pouco no meio, feita de pequenos prismas. */
    private static Model buildRope(Vector3 a, Vector3 b) {
        ModelBuilder mb = new ModelBuilder();
        mb.begin();
        MeshPartBuilder pb = mb.part("corda", GL20.GL_TRIANGLES, Usage.Position | Usage.Normal,
                new Material(ColorAttribute.createDiffuse(0.62f, 0.5f, 0.3f, 1f)));
        int n = 10;
        float len = a.dst(b);
        float sag = Math.max(0.15f, 0.12f * len);
        Vector3 prev = null;
        for (int i = 0; i <= n; i++) {
            float t = i / (float) n;
            Vector3 q = new Vector3(a).lerp(b, t);
            q.y -= sag * 4f * t * (1f - t);
            if (prev != null) {
                Vector3 dir = new Vector3(q).sub(prev);
                float l = dir.len();
                Vector3 mid = new Vector3(prev).add(q).scl(0.5f);
                Quaternion rot = new Quaternion().setFromCross(Vector3.Z, dir.nor());
                Matrix4 m = new Matrix4().set(mid, rot).scale(0.025f, 0.025f, l);
                pb.box(m);
            }
            prev = q;
        }
        return mb.end();
    }

    // Acesso ao donkey para o sistema de montaria (Riding)
    ModelInstance getDonkey() { return donkeyInstance; }
    AnimationController getDonkeyAnim() { return donkeyAnim; }
    ModelInstance getRope() { return ropeInstance; }
    Vector3 getDonkeyStart() { return donkeyStart; }
    float getDonkeyStartFacingDeg() { return donkeyStartFacingDeg; }

    /** Morão: poste de madeira de 1,6 m, com um pequeno topo. */
    private static Model buildPostModel() {
        ModelBuilder b = new ModelBuilder();
        b.begin();
        MeshPartBuilder pb = b.part("morao", GL20.GL_TRIANGLES, Usage.Position | Usage.Normal,
                new Material(ColorAttribute.createDiffuse(0.33f, 0.21f, 0.11f, 1f)));
        pb.box(0f, 0.8f, 0f, 0.16f, 1.6f, 0.16f);
        pb.box(0f, 1.62f, 0f, 0.22f, 0.06f, 0.22f);
        return b.end();
    }

    /** Diferença de altura dentro da área do cercado (20 m x 16 m): quanto menor, mais plano. */
    private float flatRange(float cx, float cz) {
        float mn = 1e9f, mx = -1e9f;
        for (int i = -2; i <= 2; i++) {
            for (int j = -2; j <= 2; j++) {
                float h = heightAt(cx + i * 5f, cz + j * 4f);
                mn = Math.min(mn, h);
                mx = Math.max(mx, h);
            }
        }
        return mx - mn;
    }

    /** Inclinação aproximada do terreno numa área de 6 m (quanto menor, mais plano). */
    private float slopeAt(float x, float z) {
        float e = 3f;
        return Math.abs(heightAt(x + e, z) - heightAt(x - e, z)) / (2f * e)
                + Math.abs(heightAt(x, z + e) - heightAt(x, z - e)) / (2f * e);
    }

    /** Empurra o jogador (círculo) para fora de qualquer obstáculo que ele esteja tocando. */
    /** Empurra o ponto (plano XZ) para fora de um segmento, à distância mínima 'min'. */
    private static void pushOutSegment(Vector3 p, float ax, float az, float bx, float bz, float min) {
        float sx = bx - ax, sz = bz - az;
        float len2 = sx * sx + sz * sz;
        if (len2 < 1e-9f) return;
        float t = Math.max(0f, Math.min(1f, ((p.x - ax) * sx + (p.z - az) * sz) / len2));
        float qx = ax + sx * t, qz = az + sz * t;
        float dx = p.x - qx, dz = p.z - qz;
        float d2 = dx * dx + dz * dz;
        if (d2 >= min * min) return;
        float d = (float) Math.sqrt(d2);
        if (d < 1e-5f) { dx = -sz; dz = sx; d = (float) Math.sqrt(len2); }
        p.x = qx + dx / d * min;
        p.z = qz + dz / d * min;
    }

    public void resolveCollisions(Vector3 p, float playerRadius) {
        resolveCollisionsExcept(p, playerRadius, null);
    }

    /** Como resolveCollisions, mas ignora a cápsula de uma montaria (usado pelo próprio animal). */
    void resolveCollisionsExcept(Vector3 p, float playerRadius, Riding.Mount skip) {
        fences.resolveCollisions(p, playerRadius);   // arame farpado dos cercados
        // Corpo dos animais (cavalos e donkey): cápsula ao longo do corpo, que acompanha o animal
        for (int i = 0; i < mounts.size; i++) {
            Riding.Mount mt = mounts.get(i);
            if (mt == skip) continue;
            Vector3 a = new Vector3(0f, 0f, mt.zMin).mul(mt.inst.transform);
            Vector3 b = new Vector3(0f, 0f, mt.zMax).mul(mt.inst.transform);
            pushOutSegment(p, a.x, a.z, b.x, b.z, playerRadius + 0.32f);
        }
        // Paredes das casas: entra pela abertura da porta, não pelas paredes
        for (int h = 0; h < houses.size; h++) {
            House house = houses.get(h);
            Vector3 l = new Vector3(p).mul(house.inv);   // posição no sistema da casa
            if (l.y > 3.4f) continue;                    // acima das paredes (~3,2 m)
            for (int k = 0; k < wallBoxes.size; k++) {
                float[] b = wallBoxes.get(k);
                float minX = b[0] - playerRadius, maxX = b[1] + playerRadius;
                float minZ = b[4] - playerRadius, maxZ = b[5] + playerRadius;
                if (l.x > minX && l.x < maxX && l.z > minZ && l.z < maxZ && l.y >= b[2] - 0.05f && l.y < b[3]) {
                    float left = l.x - minX, right = maxX - l.x, back = l.z - minZ, front = maxZ - l.z;
                    float m = Math.min(Math.min(left, right), Math.min(back, front));
                    if (m == left) l.x = minX;
                    else if (m == right) l.x = maxX;
                    else if (m == back) l.z = minZ;
                    else l.z = maxZ;
                }
            }
            p.set(l).mul(house.t);                       // volta para o mundo
        }
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
        if (crackTexture != null) crackTexture.dispose();
        if (damModel != null) damModel.dispose();
        if (wellModel != null) wellModel.dispose();
        fences.dispose();
        troughModel.dispose();
        postModel.dispose();
        cartModel.dispose();
        horseModel.dispose();
        donkeyModel.dispose();
        if (ropeModel != null) ropeModel.dispose();
        dirtTexture.dispose();
        for (int i = 0; i < loaded.size; i++) loaded.get(i).dispose();
    }
}
