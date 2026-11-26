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

    static final float SIZE = 360f;          // tamanho do terreno (metros)
    static final float HALF = SIZE / 2f;
    static final int CHUNKS = 2;             // o terreno é feito em 2 x 2 pedaços (cada um dentro do limite de vértices)
    static final int GRID = 64;              // células por lado de cada pedaço
    static final float ROAD_HALF = 3.5f;     // estrada de barro: meia largura (7 m), no eixo x (z = 0)
    static final float ROAD_SHOULDER = 5f;   // faixa em que o terreno se ajusta suavemente à estrada
    static final float HOUSE_Z = 30f;        // casas ao lado da estrada (distância do eixo)
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

    private final Array<Model> terrainModels = new Array<>();
    private Model casaModel;   // casa de taipa (modelo real importado)
    private Model troughModel; // cocho de madeira (1,84 m)
    private Model postModel;   // morão de madeira, para amarrar o animal
    private Model cartModel;   // carroça de madeira (2,2 x 2,8 m)
    private Model horseModel;  // cavalo (estático, 1,72 m de altura)
    private Model donkeyModel; // donkey (1,86 m de comprimento)
    private Model ropeModel;   // corda do donkey até o morão (criada na hora)
    private ModelInstance donkeyInstance;
    private AnimationController donkeyAnim;
    // Enfeites das casas, árvores secas e fogo
    final Array<HouseDecor> decors = new Array<>();
    private Model stoveModel, hammockModel, benchModel, doorModel, treeModel, pole, floorModel;
    private Fire fire;
    /** Pedaços do terreno e a estrada: estes são sempre desenhados (a origem deles não serve para o corte por distância). */
    private final Array<ModelInstance> terrainParts = new Array<>();
    boolean isTerrainPart(ModelInstance mi) { return terrainParts.contains(mi, true); }
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
    private Model damModel, wellModel, guardModel, signModel;
    private Texture signTexture;
    private final Array<Model> loaded = new Array<>();

    /** Altura do terreno em (x, z). A estrada (z = 0) é plana, e o terreno se ajusta suavemente a ela. */
    public float heightAt(float x, float z) {
        float rz = roadZ(x);
        float road = baseHeight(x, rz);
        float t = MathUtils.clamp((Math.abs(z - rz) - ROAD_HALF) / ROAD_SHOULDER, 0f, 1f);
        float w = t * t * (3f - 2f * t);
        float base = baseHeight(x, z);
        return road + (base - road) * w;
    }

    /** Linha central da estrada: curvas que passam pela origem (spawn). */
    static float roadZ(float x) {
        return 40f * MathUtils.sin(x * 0.011f) + 14f * MathUtils.sin(x * 0.027f);
    }

    /** Eixo do rio seco: corre no sentido z e cruza a estrada. */
    static float riverX(float z) {
        return -70f + 15f * MathUtils.sin(z * 0.025f);
    }

    /** Relevo natural (sem a estrada): plano perto do spawn, colinas ao redor. */
    private float baseHeight(float x, float z) {
        float h = 2.8f * MathUtils.sin(x * 0.040f + 0.7f) * MathUtils.cos(z * 0.035f - 0.3f)
                + 1.7f * MathUtils.sin(x * 0.100f - z * 0.070f + 2.1f)
                + 0.8f * MathUtils.sin(x * 0.230f + 1.7f) * MathUtils.sin(z * 0.190f + 0.4f);
        float r = (float) Math.sqrt(x * x + z * z);
        float t = MathUtils.clamp((r - SPAWN_CLEAR) / 14f, 0f, 1f);
        float flat = t * t * (3f - 2f * t);
        float edge = Math.max(Math.abs(x), Math.abs(z));
        float k = MathUtils.clamp((edge - 80f) / 80f, 0f, 1f);
        k = k * k * (3f - 2f * k);
        float corners = 16f * k * (0.6f + 0.4f * MathUtils.sin(x * 0.07f + 0.5f) * MathUtils.cos(z * 0.06f - 0.9f));
        float y = h * flat + corners;
        if (hasDam) {
            // Açude: fundo rebaixado 35 cm, com as bordas subindo suavemente
            float d = (float) Math.sqrt((x - damX) * (x - damX) + (z - damZ) * (z - damZ));
            float w = d <= 2.6f ? 1f : d >= 3.8f ? 0f : (3.8f - d) / 1.2f;
            y -= 0.35f * w * w * (3f - 2f * w);
        }
        // Rio seco: leito de 4,5 m de meia largura, 2,2 m abaixo, com margens suaves
        float dr = Math.abs(x - riverX(z));
        float rise = MathUtils.clamp((dr - 4.5f) / 5f, 0f, 1f);
        y -= 2.2f * (1f - rise * rise * (3f - 2f * rise));
        return y;
    }

    /** Altura do chão para o personagem: o piso da casa, se ele estiver dentro de uma casa. */
    public float groundAt(float x, float z) {
        float y = heightAt(x, z);
        for (int k = 0; k < houses.size; k++) {
            House h = houses.get(k);
            Vector3 l = new Vector3(x, 0f, z).mul(h.inv);
            if (Math.abs(l.x) < 4.2f && Math.abs(l.z) < 3.2f) {
                float floorY = h.t.getTranslation(new Vector3()).y + 0.03f;
                return Math.max(y, floorY);
            }
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
            float x = (r.nextFloat() * 2f - 1f) * 150f, z = (r.nextFloat() * 2f - 1f) * 130f;
            if (Math.abs(z - roadZ(x)) < 50f) continue;      // fora da faixa da estrada e das casas
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

        // Terreno em pedaços (2 x 2): textura de terra + cor por altura/inclinação
        float chunk = SIZE / CHUNKS;
        float step = chunk / GRID;
        for (int ci = 0; ci < CHUNKS; ci++) {
            for (int cj = 0; cj < CHUNKS; cj++) {
                mb.begin();
                MeshPartBuilder part = mb.part("terrain", GL20.GL_TRIANGLES,
                        Usage.Position | Usage.Normal | Usage.ColorPacked | Usage.TextureCoordinates,
                        new Material(TextureAttribute.createDiffuse(dirtTexture)));
                for (int i = 0; i < GRID; i++) {
                    for (int j = 0; j < GRID; j++) {
                        float x0 = -HALF + ci * chunk + i * step, x1 = x0 + step;
                        float z0 = -HALF + cj * chunk + j * step, z1 = z0 + step;
                        // Boca da cacimba: sai do terreno toda célula que toca o círculo do poço (a plataforma cobre a borda)
                        if (hasWell && cellTouchesCircle(x0, z0, x1, z1, wellX, wellZ, Landmarks.WELL_R)) continue;
                        VertexInfo a = vertex(x0, z0), b = vertex(x1, z0);
                        VertexInfo c = vertex(x1, z1), d = vertex(x0, z1);
                        // ordem anti-horária vista de cima (para a face aparecer)
                        part.triangle(a, c, b);
                        part.triangle(a, d, c);
                    }
                }
                Model m = mb.end();
                terrainModels.add(m);
                ModelInstance mi = new ModelInstance(m);
                instances.add(mi);
                terrainParts.add(mi);
            }
        }

        // Estrada de barro: faixa plana no eixo x, sobre o terreno (segmentos de 2 m)
        mb.begin();
        MeshPartBuilder road = mb.part("road", GL20.GL_TRIANGLES, Usage.Position | Usage.Normal,
                new Material(com.badlogic.gdx.graphics.g3d.attributes.ColorAttribute.createDiffuse(0.50f, 0.38f, 0.26f, 1f)));
        for (int i = 0; i < (int) (SIZE / 2f); i++) {
            float x0 = -HALF + i * 2f, x1 = x0 + 2f;
            float z0 = roadZ(x0), z1 = roadZ(x1);
            VertexInfo a = roadVertex(x0, z0 - ROAD_HALF), b = roadVertex(x1, z1 - ROAD_HALF);
            VertexInfo c = roadVertex(x1, z1 + ROAD_HALF), d = roadVertex(x0, z0 + ROAD_HALF);
            road.triangle(a, c, b);
            road.triangle(a, d, c);
        }
        Model roadModel = mb.end();
        loaded.add(roadModel);
        ModelInstance roadInst = new ModelInstance(roadModel);
        instances.add(roadInst);
        terrainParts.add(roadInst);

        // Leito do rio seco: faixa de areia clara cruzando a estrada
        mb.begin();
        MeshPartBuilder bed = mb.part("riverbed", GL20.GL_TRIANGLES, Usage.Position | Usage.Normal,
                new Material(com.badlogic.gdx.graphics.g3d.attributes.ColorAttribute.createDiffuse(0.74f, 0.66f, 0.50f, 1f)));
        for (int j = 0; j < (int) (SIZE / 2f); j++) {
            float z0 = -HALF + j * 2f, z1 = z0 + 2f;
            float c0 = riverX(z0), c1 = riverX(z1);
            VertexInfo a = riverVertex(c0 - 4.5f, z0), b = riverVertex(c1 - 4.5f, z1);
            VertexInfo c = riverVertex(c1 + 4.5f, z1), d = riverVertex(c0 + 4.5f, z0);
            bed.triangle(a, c, b);
            bed.triangle(a, d, c);
        }
        Model bedModel = mb.end();
        loaded.add(bedModel);
        ModelInstance bedInst = new ModelInstance(bedModel);
        instances.add(bedInst);
        terrainParts.add(bedInst);

        // Açude seco com rachaduras e cacimba funda com água no fundo
        if (hasDam) {
            damModel = Landmarks.buildDam(this, damX, damZ, crackTexture);
            instances.add(new ModelInstance(damModel));
        }
        if (hasWell) {
            wellModel = Landmarks.buildWell(this, wellX, wellZ);
            instances.add(new ModelInstance(wellModel));
            // Poço real (modelo do MeshCraft3DArt): telhado, balde, manivela e anel de pedra, sobre a boca
            Model real = new G3dModelLoader(new JsonReader()).loadModel(Gdx.files.internal("models/poco/poco.g3dj"));
            loaded.add(real);
            ModelInstance realWell = new ModelInstance(real);
            realWell.transform.setToTranslation(wellX, heightAt(wellX, wellZ), wellZ);
            instances.add(realWell);
            // Proteção em volta da boca e placa de aviso, a 5,5 m do poço, virada para ele
            guardModel = Landmarks.buildGuard(this, wellX, wellZ);
            instances.add(new ModelInstance(guardModel));
            signTexture = new Texture(Gdx.files.internal("textures/placa_poco.png"));
            signTexture.setFilter(Texture.TextureFilter.Linear, Texture.TextureFilter.Linear);
            signModel = Landmarks.buildSign(signTexture);
            ModelInstance sign = new ModelInstance(signModel);
            float sx = wellX, sz = wellZ + 5.5f;
            // A frente da placa aponta para fora do poço (o poço fica no lado -z)
            sign.transform.setToTranslation(sx, heightAt(sx, sz), sz).rotate(Vector3.Y, 0f);
            instances.add(sign);
            obstacles.add(new Obstacle(sx, sz, 0.25f, heightAt(sx, sz), 2.0f));
            obstacles.add(new Obstacle(wellX, wellZ, Landmarks.WELL_OUT + 0.3f, heightAt(wellX, wellZ), 1.0f));
        }


        // Objetos 3D reais (modelos CC0 convertidos para .obj)
        Model rockLarge = loadModel("models/rock_large.obj");
        Model rockSmall = loadModel("models/rock_small.obj");
        Model stump = loadModel("models/stump.obj");
        Model log = loadModel("models/log.obj");

        Random rnd = new Random(7L);
        casaModel = new G3dModelLoader(new JsonReader()).loadModel(Gdx.files.internal("models/casa_taipa.g3dj"));
        JsonValue boxes = new JsonReader().parse(Gdx.files.internal("models/casa_taipa_colisao.json"));
        for (JsonValue b = boxes.child; b != null; b = b.next) {
            wallBoxes.add(new float[]{b.getFloat("minX"), b.getFloat("maxX"), b.getFloat("minY"), b.getFloat("maxY"), b.getFloat("minZ"), b.getFloat("maxZ")});
        }
        fences.create();
        troughModel = new G3dModelLoader(new JsonReader()).loadModel(Gdx.files.internal("models/cocho.g3dj"));
        stoveModel = new G3dModelLoader(new JsonReader()).loadModel(Gdx.files.internal("models/fogao.g3dj"));
        hammockModel = HouseDecor.buildHammock();
        loaded.add(hammockModel);
        floorModel = HouseDecor.buildFloor();
        loaded.add(floorModel);
        benchModel = new G3dModelLoader(new JsonReader()).loadModel(Gdx.files.internal("models/banco.g3dj"));
        doorModel = HouseDecor.buildDoor();
        loaded.add(doorModel);
        treeModel = new G3dModelLoader(new JsonReader()).loadModel(Gdx.files.internal("models/arvore_seca.g3dj"));
        pole = new G3dModelLoader(new JsonReader()).loadModel(Gdx.files.internal("models/arvore_pole.g3dj"));
        fire = new Fire();
        cactusModels = new Model[]{
                new G3dModelLoader(new JsonReader()).loadModel(Gdx.files.internal("models/cactus0.g3dj")),
                new G3dModelLoader(new JsonReader()).loadModel(Gdx.files.internal("models/cactus1.g3dj")),
                new G3dModelLoader(new JsonReader()).loadModel(Gdx.files.internal("models/cactus2.g3dj"))};
        postModel = buildPostModel();
        cartModel = new G3dModelLoader(new JsonReader()).loadModel(Gdx.files.internal("models/carroca.g3dj"));
        horseModel = new G3dModelLoader(new JsonReader()).loadModel(Gdx.files.internal("models/horse.g3dj"));
        donkeyModel = new G3dModelLoader(new JsonReader()).loadModel(Gdx.files.internal("models/donkey.g3dj"));
        // Casas ao lado da estrada, nos dois lados, sempre longe uma da outra; a porta fica voltada para a estrada
        final float[][] houseSpots = {
                {-30f, 1f}, {30f, -1f}, {-90f, -1f}, {90f, 1f}, {-150f, 1f}, {150f, -1f},
                {-30f, -1f}, {30f, 1f}, {-90f, 1f}, {90f, -1f}, {-150f, -1f}, {150f, 1f}};
        for (float[] s : houseSpots) {
            float hx = s[0], hz = roadZ(hx) + s[1] * HOUSE_Z;
            if (Math.abs(hx - riverX(hz)) < 14f) hx += 22f;   // não encosta no leito do rio
            addEnclosedHouse(rnd, hx, hz, s[1] > 0f ? 180f : 0f);
        }
        // Pedras grandes nas margens da estrada (trechos difíceis de passar)
        for (int i = 0; i < 14; i++) {
            float x = (rnd.nextFloat() * 2f - 1f) * 150f;
            float side = rnd.nextBoolean() ? 1f : -1f;
            float cz = roadZ(x) + side * (ROAD_HALF + 4f + rnd.nextFloat() * 4f);
            for (int k = 0; k < 3; k++) {
                float px = x + (rnd.nextFloat() - 0.5f) * 5f, pz = cz + (rnd.nextFloat() - 0.5f) * 3f;
                if (!nearEnclosure(px, pz)) addRockAt(rockLarge, px, pz, 2.2f, 0.9f);
            }
        }
        // Objetos do cenário: o mapa dobrou, então dobrou a quantidade
        for (int i = 0; i < 36; i++) addCactus(rnd);
        for (int i = 0; i < 18; i++) addTree(rnd, true);
        for (int i = 0; i < 14; i++) addTree(rnd, false);
        for (int i = 0; i < 24; i++) addProp(rnd, rockLarge, 2.2f, 0.9f, 1f);
        for (int i = 0; i < 32; i++) addProp(rnd, rockSmall, 2.2f, 0.45f, 1f);
        // Madeira morta: tocos e troncos caídos (no lugar das árvores mortas, que ainda não temos modelo)
        for (int i = 0; i < 36; i++) addProp(rnd, stump, 2.6f, 0.35f, 1f);
        for (int i = 0; i < 24; i++) addProp(rnd, log, 2.6f, 1.2f, 1f);
    }

    private Model loadModel(String path) {
        Model m = new ObjLoader().loadModel(Gdx.files.internal(path));
        loaded.add(m);
        return m;
    }

    /** Atualiza enfeites (porta, rede) e o fogo. Chame todo quadro. */
    public void update(float dt, com.badlogic.gdx.graphics.PerspectiveCamera cam) {
        for (int i = 0; i < decors.size; i++) decors.get(i).update(dt);
        fire.update(dt, cam);
    }

    /** Fogo e fumaça: desenhe com o ModelBatch (transparência). */
    ModelInstance fireInstance() { return fire.instance(); }

    /** Porta mais próxima do jogador (para mostrar o botão), ou null. */
    HouseDecor nearDoor(Vector3 p) {
        HouseDecor best = null;
        float bestD = 2.2f * 2.2f;
        for (int i = 0; i < decors.size; i++) {
            Vector3 c = decors.get(i).doorCenter();
            float dx = p.x - c.x, dz = p.z - c.z, d = dx * dx + dz * dz;
            if (d < bestD) { bestD = d; best = decors.get(i); }
        }
        return best;
    }

    /** Rede ao alcance do jogador (para mostrar DEITAR), ou null. */
    HouseDecor nearHammockFree(Vector3 p) {
        for (int i = 0; i < decors.size; i++) {
            HouseDecor d = decors.get(i);
            if (d.lie == HouseDecor.Lie.FREE && d.nearHammock(p)) return d;
        }
        return null;
    }

    /**
     * Distância máxima da câmera ao personagem, sem atravessar paredes, árvores, cercas nem o chão.
     * 'dir' é unitário, do personagem para a câmera. Devolve no máximo 'maxDist'.
     */
    float cameraDistance(Vector3 pivot, Vector3 dir, float maxDist) {
        float step = 0.12f;
        Vector3 p = new Vector3();
        for (float d = step; d <= maxDist; d += step) {
            p.set(pivot).mulAdd(dir, d);
            if (cameraBlocked(p)) return Math.max(0.6f, d - 0.3f);
        }
        return maxDist;
    }

    /** Ponto que a câmera não pode ocupar: chão, parede de casa, obstáculo ou cerca. */
    private boolean cameraBlocked(Vector3 p) {
        if (p.y < heightAt(p.x, p.z) + 0.15f) return true;
        for (int k = 0; k < houses.size; k++) {
            Vector3 l = new Vector3(p).mul(houses.get(k).inv);
            for (int w = 0; w < wallBoxes.size; w++) {
                float[] b = wallBoxes.get(w);
                if (l.x > b[0] - 0.05f && l.x < b[1] + 0.05f && l.y > b[2] && l.y < b[3] && l.z > b[4] - 0.05f && l.z < b[5] + 0.05f) return true;
            }
        }
        for (int o = 0; o < obstacles.size; o++) {
            Obstacle ob = obstacles.get(o);
            if (p.y < ob.baseY || p.y > ob.baseY + ob.height) continue;
            float dx = p.x - ob.x, dz = p.z - ob.z;
            if (dx * dx + dz * dz < ob.radius * ob.radius) return true;
        }
        return fences.blocks(p);
    }

    /** Verdadeiro se o ponto está dentro de alguma casa (para aproximar a câmera). */
    boolean insideHouse(Vector3 p) {
        for (int k = 0; k < houses.size; k++) {
            Vector3 l = new Vector3(p).mul(houses.get(k).inv);
            if (Math.abs(l.x) < 3.85f && Math.abs(l.z) < 2.85f && l.y > -0.2f && l.y < 3.2f) return true;
        }
        return false;
    }

    /** Escolhe um ponto aleatório fora da área de nascimento. */
    private float[] randomSpot(Random rnd, float margin) {
        float x, z;
        do {
            x = (rnd.nextFloat() * 2f - 1f) * (HALF - margin);
            z = (rnd.nextFloat() * 2f - 1f) * (HALF - margin);
        } while (Math.sqrt(x * x + z * z) < 14f || Math.abs(z - roadZ(x)) < ROAD_HALF + 6f
                || Math.abs(x - riverX(z)) < 6f || nearEnclosure(x, z));
        return new float[]{x, z};
    }

    /** Pedra grande num ponto escolhido, com colisão. */
    private void addRockAt(Model model, float x, float z, float scale, float radius) {
        float y = heightAt(x, z);
        ModelInstance mi = new ModelInstance(model);
        mi.transform.setToTranslation(x, y, z).scale(scale, scale, scale);
        instances.add(mi);
        obstacles.add(new Obstacle(x, z, radius, y, 1.5f));
    }

    /** Verdadeiro se o ponto está perto demais de um cercado (para não nascer objeto dentro dele). */
    private boolean nearEnclosure(float x, float z) {
        for (int k = 0; k < enclosureCenters.size; k++) {
            float[] c = enclosureCenters.get(k);
            if (Math.hypot(x - c[0], z - c[1]) < 16f) return true;
        }
        return false;
    }

    /** Vértice do leito do rio seco, um pouco acima do fundo. */
    private VertexInfo riverVertex(float x, float z) {
        return new VertexInfo().setPos(x, heightAt(x, z) + 0.03f, z).setNor(0f, 1f, 0f);
    }

    /** Vértice da estrada: plano, um pouco acima do terreno para não brigar com ele. */
    private VertexInfo roadVertex(float x, float z) {
        return new VertexInfo().setPos(x, heightAt(x, z) + 0.04f, z).setNor(0f, 1f, 0f);
    }

    /**
     * Coloca um modelo real no terreno.
     * @param scale escala aplicada ao modelo
     * @param collisionRadius raio de colisão (0 = sem colisão, ex.: troncos deitados)
     */
    // Cactos: três modelos (versões 0, 1 e 2), em escalas que deixam cada um com 3 a 4 m de altura.
    private static final float[] CACTUS_H = {6.19f, 8.19f, 8.56f};     // altura do modelo (unidades)
    private static final float[] CACTUS_HALF_W = {0.29f, 0.60f, 0.75f}; // meia largura do modelo
    private static final float[] CACTUS_SCALE = {0.55f, 0.42f, 0.40f};
    private Model[] cactusModels;

    private void addCactus(Random rnd) {
        int v = rnd.nextInt(3);
        float[] p = null;
        for (int t = 0; t < 60; t++) {
            p = randomSpot(rnd, 6f);
            if (!nearLandmark(p[0], p[1])) break;
        }
        float x = p[0], z = p[1];
        float y = heightAt(x, z);
        float s = CACTUS_SCALE[v] * (0.85f + 0.35f * rnd.nextFloat());
        float rot = rnd.nextFloat() * MathUtils.PI2;
        ModelInstance mi = new ModelInstance(cactusModels[v]);
        mi.transform.setToTranslation(x, y, z).rotate(Vector3.Y, rot * MathUtils.radiansToDegrees).scale(s, s, s);
        instances.add(mi);
        // Colisão pela largura real do cacto (com folga para o personagem), e altura do modelo
        float radius = Math.max(0.45f, CACTUS_HALF_W[v] * s + 0.25f);
        obstacles.add(new Obstacle(x, z, radius, y, CACTUS_H[v] * s));
    }

    /** Árvore seca (grande ou pequena), com o tronco como obstáculo. */
    private void addTree(Random rnd, boolean big) {
        float[] p = null;
        for (int t = 0; t < 60; t++) {
            p = randomSpot(rnd, 8f);
            if (!nearLandmark(p[0], p[1])) break;
        }
        float x = p[0], z = p[1];
        float y = heightAt(x, z);
        float rot = rnd.nextFloat() * MathUtils.PI2;
        float s = (big ? 1.0f : 1.0f) * (0.9f + 0.3f * rnd.nextFloat());
        ModelInstance mi = new ModelInstance(big ? treeModel : pole);
        mi.transform.setToTranslation(x, y, z).rotate(Vector3.Y, rot * MathUtils.radiansToDegrees).scale(s, s, s);
        instances.add(mi);
        obstacles.add(new Obstacle(x, z, big ? 0.45f : 0.3f, y, big ? 6.0f : 2.4f));
    }

    /** Perto de casa, cercado, poço ou açude: os cactos não nascem ali. */
    private boolean nearLandmark(float x, float z) {
        if (nearWellOrDam(x, z, 10f)) return true;
        for (int k = 0; k < enclosureCenters.size; k++) {
            float[] c = enclosureCenters.get(k);
            if (Math.hypot(x - c[0], z - c[1]) < 14f) return true;
        }
        return false;
    }

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
    private void addEnclosedHouse(Random rnd, float tx, float tz, float yaw) {
        // Perto do lugar combinado, escolhe o ponto mais plano para a casa
        float bestX = tx, bestZ = tz, bestRange = 1e9f;
        for (float dx = -4f; dx <= 4.01f; dx += 2f) {
            for (float dz = -3f; dz <= 3.01f; dz += 3f) {
                float range = flatRange(tx + dx, tz + dz);
                if (range < bestRange) { bestRange = range; bestX = tx + dx; bestZ = tz + dz; }
            }
        }
        enclosureCenters.add(new float[]{bestX, bestZ});

        // Casa no centro do cercado, com a porta voltada para a estrada (a porteira também)
        // Base da casa: no ponto mais alto da área, para o terreno não aparecer dentro dela
        float y = -1e9f;
        Matrix4 probe = new Matrix4().setToTranslation(bestX, 0f, bestZ).rotate(Vector3.Y, yaw);
        for (float lx = -4.2f; lx <= 4.21f; lx += 1.4f) for (float lz = -3.2f; lz <= 3.21f; lz += 1.6f) {
            Vector3 w = new Vector3(lx, 0f, lz).mul(probe);
            y = Math.max(y, heightAt(w.x, w.z));
        }
        Matrix4 t = new Matrix4().setToTranslation(bestX, y, bestZ).rotate(Vector3.Y, yaw);
        ModelInstance house = new ModelInstance(casaModel);
        house.transform.set(t);
        instances.add(house);
        // Alicerce: bloco de pedra do chão mais baixo da casa até o piso (a casa não flutua)
        float minX = 1e9f, maxX = -1e9f, minZ = 1e9f, maxZ = -1e9f;
        for (int k = 0; k < wallBoxes.size; k++) {
            float[] wb = wallBoxes.get(k);
            minX = Math.min(minX, wb[0]); maxX = Math.max(maxX, wb[1]);
            minZ = Math.min(minZ, wb[4]); maxZ = Math.max(maxZ, wb[5]);
        }
        float minG = 1e9f;
        for (float lx = -4.2f; lx <= 4.21f; lx += 1.4f) for (float lz = -3.2f; lz <= 3.21f; lz += 1.6f) {
            Vector3 w = new Vector3(lx, 0f, lz).mul(probe);
            minG = Math.min(minG, heightAt(w.x, w.z));
        }
        float fh = y - (minG - 0.3f);
        if (fh > 0.05f && maxX > minX) {
            ModelBuilder fb = new ModelBuilder();
            Model fm = fb.createBox(maxX - minX + 0.4f, fh, maxZ - minZ + 0.4f,
                    new Material(ColorAttribute.createDiffuse(0.55f, 0.47f, 0.38f, 1f)), Usage.Position | Usage.Normal);
            loaded.add(fm);
            ModelInstance fi = new ModelInstance(fm);
            fi.transform.set(t).translate((minX + maxX) / 2f, -fh / 2f, (minZ + maxZ) / 2f);
            instances.add(fi);
        }
        ModelInstance floor = new ModelInstance(floorModel);
        floor.transform.set(t);
        instances.add(floor);
        houses.add(new House(t));

        // Enfeites: fogão (com fogo e fumaça), rede, banco e porta
        HouseDecor dec = new HouseDecor(t, yaw, stoveModel, hammockModel, benchModel, doorModel);
        decors.add(dec);
        instances.add(dec.stove);
        instances.add(dec.hammock);
        instances.add(dec.bench);
        instances.add(dec.door);
        fire.addSource(dec.flameSource(), dec.smokeSource());
        // Colisão: o fogão (2,4 m, encostado na parede) e o banco
        Vector3 s0 = new Vector3(1.8f, 0f, -2.48f).mul(t), s1 = new Vector3(3.3f, 0f, -2.48f).mul(t);
        obstacles.add(new Obstacle(s0.x, s0.z, 0.5f, heightAt(s0.x, s0.z), 1.3f));
        obstacles.add(new Obstacle(s1.x, s1.z, 0.5f, heightAt(s1.x, s1.z), 1.3f));
        Vector3 bc = new Vector3(HouseDecor.BENCH_X, 0f, HouseDecor.BENCH_Z).mul(t);
        obstacles.add(new Obstacle(bc.x, bc.z, 0.35f, heightAt(bc.x, bc.z), 0.6f));

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
                    2.33f, 0.0f, 1.0f, 1.8f, 9f, true, -1.31f, 2.13f));
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
        Vector3 d = new Vector3(-5.5f, 0f, -3.84f).mul(enc);
        ModelInstance donkey = new ModelInstance(donkeyModel);
        donkey.transform.setToTranslation(d.x, heightAt(d.x, d.z), d.z).rotate(Vector3.Y, yaw + 180f);
        instances.add(donkey);
        donkeyInstance = donkey;
        donkeyAnim = new AnimationController(donkey);
        donkeyAnim.animate("Eat", -1, 1f, null, 0.2f);
        donkeyStart.set(d);
        donkeyStartFacingDeg = yaw + 180f;
        mounts.add(new Riding.Mount(donkey, donkeyAnim, ropeInstance, new Vector3(d.x, 0f, d.z), yaw + 180f,
                1.83f, 0.15f, 1.13f, 1.4f, 2.6f, false, -0.9f, 1.89f));

        // Corda: do topo do morão até o pescoço do donkey, com um pouco de folga
        Vector3 top = new Vector3(p.x, heightAt(p.x, p.z) + 1.45f, p.z);
        Vector3 head = new Vector3(0f, 1.875f, 1.08f).mul(donkey.transform);   // ponto do cabresto na cabeça (1,5x)
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
        for (int i = 0; i < decors.size; i++) decors.get(i).resolveDoor(p, playerRadius);   // portas fechadas
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
        for (Model m : terrainModels) m.dispose();
        casaModel.dispose();
        if (crackTexture != null) crackTexture.dispose();
        if (damModel != null) damModel.dispose();
        if (guardModel != null) guardModel.dispose();
        if (signModel != null) signModel.dispose();
        if (signTexture != null) signTexture.dispose();
        if (wellModel != null) wellModel.dispose();
        fences.dispose();
        if (fire != null) fire.dispose();
        for (Model m : new Model[]{stoveModel, hammockModel, benchModel, treeModel, pole}) if (m != null) m.dispose();
        troughModel.dispose();
        postModel.dispose();
        cartModel.dispose();
        for (Model m : cactusModels) m.dispose();
        horseModel.dispose();
        donkeyModel.dispose();
        if (ropeModel != null) ropeModel.dispose();
        dirtTexture.dispose();
        for (int i = 0; i < loaded.size; i++) loaded.get(i).dispose();
    }
}
