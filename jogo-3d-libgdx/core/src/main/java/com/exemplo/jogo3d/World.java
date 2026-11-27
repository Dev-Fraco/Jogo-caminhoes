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
import com.badlogic.gdx.graphics.g3d.attributes.BlendingAttribute;
import com.badlogic.gdx.graphics.g3d.attributes.TextureAttribute;
import com.badlogic.gdx.graphics.g3d.loader.ObjLoader;
import com.badlogic.gdx.graphics.g3d.loader.G3dModelLoader;
import com.badlogic.gdx.graphics.g3d.utils.MeshPartBuilder;
import com.badlogic.gdx.utils.JsonReader;
import com.badlogic.gdx.graphics.g3d.utils.MeshPartBuilder.VertexInfo;
import com.badlogic.gdx.graphics.g3d.utils.ModelBuilder;
import com.badlogic.gdx.math.MathUtils;
import com.badlogic.gdx.utils.IntArray;
import com.badlogic.gdx.math.Matrix4;
import com.badlogic.gdx.math.Quaternion;
import com.badlogic.gdx.math.Vector3;
import com.badlogic.gdx.math.collision.BoundingBox;
import com.badlogic.gdx.utils.Array;
import com.badlogic.gdx.utils.JsonValue;

import java.util.Random;

/**
 * Mundo do sertão: relevo com subidas e descidas, chão de terra seca com textura,
 * e objetos 3D reais (cactos, pedras, tocos e troncos, CC0 da Kenney/Quaternius).
 * Casas redondas são provisórias (ainda sem modelo real).
 */
public class World {

    static final float SIZE = 1140f;         // lado do mapa (m): área ≈ 10× a de antes (360 m)
    static final float HALF = SIZE / 2f;
    static final int CHUNKS = 6;             // o terreno é feito em 6 x 6 pedaços (cada um dentro do limite de vértices)
    static final int GRID = 48;              // células por lado de cada pedaço (4 vértices por célula: menos memória)
    static final float ROAD_HALF = 3.5f;     // estrada de barro: meia largura (7 m), no eixo x (z = 0)
    static final float ROAD_SHOULDER = 30f;  // faixa em que o terreno se ajusta suavemente à estrada (larga: em encosta a estrada não vira degrau)
    static final float HOUSE_Z = 30f;        // casas ao lado da estrada (distância do eixo)
    static final float TOWN_X = 100f;        // cidade: centro (onde a estrada é quase reta)
    static final float TOWN_Z = roadZ(TOWN_X);

    /** Perto de um poço (dá para beber água). */
    boolean nearWater(Vector3 p) {
        if (hasWell && Math.hypot(p.x - wellX, p.z - wellZ) < Landmarks.WELL_OUT + 1.6f) return true;
        if (hasDam && Math.hypot(p.x - damX, p.z - damZ) < 4.2f) return true;   // o açude (água rala do fundo)
        return town != null && Math.hypot(p.x - TOWN_X, p.z - town.wellZ()) < 2.8f;
    }

    /** Acende uma fogueira no ponto (chamas e fumaça). */
    void lightFire(Vector3 p) {
        float y = groundAt(p.x, p.z);
        fire.addSource(new Vector3(p.x, y + 0.25f, p.z), new Vector3(p.x, y + 3.5f, p.z));
    }

    /** Dentro da área da cidade (casas, praça e roçado). */
    static boolean inTown(float x, float z) {
        return Math.abs(x - TOWN_X) < 48f && Math.abs(z - TOWN_Z - 5f) < 52f;
    }

    /** Caixa de colisão (casas feitas em código): transformação e meias medidas. */
    static class Box {
        final Matrix4 t, inv;
        final float hx, hz, h;
        Box(Matrix4 t, float hx, float hz, float h) {
            this.t = new Matrix4(t);
            this.inv = new Matrix4(t).inv();
            this.hx = hx;
            this.hz = hz;
            this.h = h;
        }
    }
    final Array<Box> boxes = new Array<>();
    Town town;
    Airplane airplane;
    Weapons weapons;
    Items items;

    /** Ponto livre no mapa (fora da estrada, dos cercados e da cidade). */
    float[] openSpot(Random rnd) { return randomSpot(rnd, 8f); }

    /** Sempre desenhado (não sai pela distância de desenho): avião, que voa alto e longe. */
    void alwaysDraw(ModelInstance mi) {
        instances.add(mi);
        terrainParts.add(mi);
    }
    private Model pocoModel;
    private float townH = Float.NaN;

    private float townHeight() {
        if (Float.isNaN(townH)) townH = baseHeight(TOWN_X, TOWN_Z);
        return townH;
    }
    static final float SPAWN_CLEAR = 9f;     // área plana no ponto de nascimento
    static final float TEXTURE_TILE = 14f;    // metros por repetição da textura de terra

    /** Objeto com colisão circular. */
    static class Obstacle {
        final float x, z, radius, baseY, height;
        Surface surface = Surface.MADEIRA;   // árvores, cactos, bancos, carroças; poço e pedras são PEDRA
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
    final java.util.HashMap<ModelInstance, float[]> terrainBox = new java.util.HashMap<>();

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
    private Model cartModel;   // carroça de madeira (2,2 x 2,8 m)
    // Enfeites das casas, árvores secas e fogo
    final Array<HouseDecor> decors = new Array<>();
    private Model stoveModel, benchModel, doorModel, treeModel, pole, floorModel;
    private Fire fire;
    /** Pedaços do terreno e a estrada: estes são sempre desenhados (a origem deles não serve para o corte por distância). */
    private final Array<ModelInstance> terrainParts = new Array<>();
    boolean isTerrainPart(ModelInstance mi) { return terrainParts.contains(mi, true); }
    private Texture dirtTexture;
    // Açude seco e cacimba (escolhidos em create, antes do terreno)
    boolean hasDam = false, hasWell = false;
    float damX, damZ, wellX, wellZ;
    // Cemitério (escolhido antes do terreno, que fica plano embaixo dele)
    boolean hasCem = false;
    float cemX, cemZ, cemH, cemYaw;          // centro, altura do chão e giro (0 = portão para -z)
    static final float CEM_HW = 10.67f, CEM_HD = 10.67f;
    static final float CEM_BLEND = 24f;      // metros em que o aterro volta ao relevo natural
    int cemColliders;
    float campX, campZ;                      // acampamento de retirantes (nomes no mapa)
    private Texture crackTexture;
    private Model damModel, wellModel, guardModel, signModel;
    private Texture signTexture;
    private final Array<Model> loaded = new Array<>();

    /** Pedaço de terreno na frente da câmera? Os outros objetos (estrada, rio, avião) sempre são desenhados. */
    boolean terrainVisible(ModelInstance mi, com.badlogic.gdx.graphics.Camera cam) {
        float[] b = terrainBox.get(mi);
        if (b == null) return true;
        return cam.frustum.boundsInFrustum(b[0], b[1], b[2], b[3], b[4], b[5]);
    }

    // Grade espacial dos obstáculos: a colisão olha só as células perto do ponto (são centenas de objetos)
    private static final float CELL = 16f;
    private static final int CELLS = (int) Math.ceil(SIZE / CELL);
    private IntArray[] cells = new IntArray[CELLS * CELLS];
    private final IntArray near = new IntArray();
    private boolean gridDirty = true;
    private float maxObsRadius = 0f;

    /** Dano num muro atingido por tiro: quebra (e some) quando a vida chega a zero. */
    void damageObstacle(Obstacle o, float dmg) {
        for (int i = 0; i < walls.size; i++) {
            StoneWall w = walls.get(i);
            if (w.cols.contains(o, true)) {
                w.hp -= dmg;
                if (w.hp <= 0f) removeWall(w);
                return;
            }
        }
    }

    /** Acrescenta um obstáculo (carroça, por exemplo) e marca a grade para refazer. */
    void addObstacle(Obstacle o) {
        obstacles.add(o);
        gridDirty = true;
    }

    void removeObstacle(Obstacle o) {
        obstacles.removeValue(o, true);
        gridDirty = true;
    }

    private static int cellIndex(float v) {
        return MathUtils.clamp((int) Math.floor((v + HALF) / CELL), 0, CELLS - 1);
    }

    private void rebuildGrid() {
        java.util.Arrays.fill(cells, null);
        maxObsRadius = 0f;
        for (int i = 0; i < obstacles.size; i++) {
            Obstacle o = obstacles.get(i);
            maxObsRadius = Math.max(maxObsRadius, o.radius);
            int x0 = cellIndex(o.x - o.radius), x1 = cellIndex(o.x + o.radius);
            int z0 = cellIndex(o.z - o.radius), z1 = cellIndex(o.z + o.radius);
            for (int cx = x0; cx <= x1; cx++) {
                for (int cz = z0; cz <= z1; cz++) {
                    int c = cx * CELLS + cz;
                    if (cells[c] == null) cells[c] = new IntArray(4);
                    cells[c].add(i);
                }
            }
        }
        gridDirty = false;
    }

    /** Obstáculos num quadrado de raio r em torno de (x, z) → lista `near` (pode repetir; é inofensivo). */
    private void nearObstacles(float x, float z, float r) {
        if (gridDirty) rebuildGrid();
        near.clear();
        int x0 = cellIndex(x - r), x1 = cellIndex(x + r), z0 = cellIndex(z - r), z1 = cellIndex(z + r);
        for (int cx = x0; cx <= x1; cx++) {
            for (int cz = z0; cz <= z1; cz++) {
                IntArray a = cells[cx * CELLS + cz];
                if (a != null) for (int k = 0; k < a.size; k++) near.add(a.get(k));
            }
        }
    }

    private float maxObstacleRadius() {
        if (gridDirty) rebuildGrid();
        return maxObsRadius;
    }

    // Grade de alturas (a cada ALT_PASSO m): o relevo é calculado uma vez e depois só se interpola
    static final float ALT_PASSO = 3f;
    static final int ALT_N = (int) (SIZE / ALT_PASSO) + 1;
    private float[] alturas;        // ALT_N x ALT_N (linha = z)
    private float[] perfilEstrada;  // altura suave da estrada em cada coluna da grade

    /** Altura do terreno em (x, z): interpolação da grade (rápida, usada o jogo inteiro). */
    public float heightAt(float x, float z) {
        if (training) return 0f;   // treino: chão reto
        if (alturas == null) return computeHeight(x, z);
        float fx = MathUtils.clamp((x + HALF) / ALT_PASSO, 0f, ALT_N - 1.001f);
        float fz = MathUtils.clamp((z + HALF) / ALT_PASSO, 0f, ALT_N - 1.001f);
        int i = (int) fx, j = (int) fz;
        float tx = fx - i, tz = fz - j;
        float a = alturas[j * ALT_N + i], b = alturas[j * ALT_N + i + 1];
        float c = alturas[(j + 1) * ALT_N + i], d = alturas[(j + 1) * ALT_N + i + 1];
        return (a + (b - a) * tx) * (1f - tz) + (c + (d - c) * tx) * tz;
    }

    /** Monta a grade de alturas do mundo (depois de escolher e proteger os lugares). */
    void montaRelevo() {
        townH = Float.NaN;   // a altura da vila é recalculada com as zonas protegidas
        perfilEstrada = new float[ALT_N];
        float sig = 35f / ALT_PASSO;
        int raio = (int) (3f * sig) + 1;
        for (int i = 0; i < ALT_N; i++) {
            float soma = 0f, pesos = 0f;
            for (int k = -raio; k <= raio; k++) {
                int ii = MathUtils.clamp(i + k, 0, ALT_N - 1);
                float xk = -HALF + ii * ALT_PASSO;
                float w = (float) Math.exp(-(k * k) / (2f * sig * sig));
                soma += w * baseHeight(xk, roadZ(xk));
                pesos += w;
            }
            // dentro dos lugares protegidos a estrada segue o chão plano deles, não a média de fora
            float crua = baseHeight(-HALF + i * ALT_PASSO, roadZ(-HALF + i * ALT_PASSO));
            float f = Relevo.fator(-HALF + i * ALT_PASSO, roadZ(-HALF + i * ALT_PASSO));
            perfilEstrada[i] = crua + (soma / pesos - crua) * f;
        }
        alturas = new float[ALT_N * ALT_N];
        for (int j = 0; j < ALT_N; j++)
            for (int i = 0; i < ALT_N; i++)
                alturas[j * ALT_N + i] = computeHeight(-HALF + i * ALT_PASSO, -HALF + j * ALT_PASSO);
    }

    /** Altura mínima e máxima da grade dentro de um retângulo (para a caixa de desenho do pedaço). */
    private float[] minMaxAlturas(float x0, float z0, float x1, float z1) {
        int i0 = MathUtils.clamp((int) Math.floor((x0 + HALF) / ALT_PASSO), 0, ALT_N - 1);
        int i1 = MathUtils.clamp((int) Math.ceil((x1 + HALF) / ALT_PASSO), 0, ALT_N - 1);
        int j0 = MathUtils.clamp((int) Math.floor((z0 + HALF) / ALT_PASSO), 0, ALT_N - 1);
        int j1 = MathUtils.clamp((int) Math.ceil((z1 + HALF) / ALT_PASSO), 0, ALT_N - 1);
        float mn = 1e9f, mx = -1e9f;
        for (int j = j0; j <= j1; j++)
            for (int i = i0; i <= i1; i++) {
                float h = alturas[j * ALT_N + i];
                mn = Math.min(mn, h);
                mx = Math.max(mx, h);
            }
        return new float[]{mn, mx};
    }

    /** Altura da estrada em x (perfil suave: a estrada não tem degraus nem ladeiras fortes). */
    private float roadBase(float x) {
        if (perfilEstrada == null) return baseHeight(x, roadZ(x));
        float f = MathUtils.clamp((x + HALF) / ALT_PASSO, 0f, ALT_N - 1.001f);
        int i = (int) f;
        float t = f - i;
        return perfilEstrada[i] + (perfilEstrada[i + 1] - perfilEstrada[i]) * t;
    }

    /** Inclinação local (subida por metro) numa escala de 3 m. */
    float declive(float x, float z) {
        float e = 3f;
        float dx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2f * e);
        float dz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2f * e);
        return (float) Math.sqrt(dx * dx + dz * dz);
    }

    /** Dá para ir de (x0, z0) a (x1, z1) num passo? Subida mais íngreme que ~43° é paredão. */
    boolean podeAndar(float x0, float z0, float x1, float z1) {
        float len = (float) Math.hypot(x1 - x0, z1 - z0);
        float dy = heightAt(x1, z1) - heightAt(x0, z0);
        return dy <= 0.95f * len + 0.02f;
    }

    /** Altura completa do terreno (relevo, estrada, vila, cemitério): usada para montar a grade. */
    private float computeHeight(float x, float z) {
        float rz = roadZ(x);
        float road = roadBase(x);
        float t = MathUtils.clamp((Math.abs(z - rz) - ROAD_HALF) / ROAD_SHOULDER, 0f, 1f);
        float w = t * t * (3f - 2f * t);
        float base = baseHeight(x, z);
        float y = road + (base - road) * w;
        if (w < 1f) y -= pothole(x, z);   // buracos e lombadas só na estrada
        // Cidade: chão plano, com transição suave para o relevo em volta
        float tdx = Math.max(Math.abs(x - TOWN_X) - 42f, 0f), tdz = Math.max(Math.abs(z - TOWN_Z - 5f) - 45f, 0f);
        float td = (float) Math.sqrt(tdx * tdx + tdz * tdz);
        if (td < 16f) {
            float tt = td / 16f, s = tt * tt * (3f - 2f * tt), th = townHeight();
            y = th + (y - th) * s;
        }
        // Lugares planos (cemitério e galpão de treino): chão reto no meio, aterro suave em volta
        if (hasCem) y = padBlend(x, z, y, cemX, cemZ, CEM_HW, CEM_HD, cemH);
        return y;
    }

    // Buracos (e algumas lombadas) na estrada: posição, raio e profundidade (negativa = lombada)
    private static final float[] POT_X, POT_Z, POT_R, POT_D;
    static {
        java.util.Random r = new java.util.Random(1915L);
        float[] px = new float[200], pz = new float[200], pr = new float[200], pd = new float[200];
        int n = 0;
        for (float x = -HALF + 30f; x < HALF - 30f && n < 200; x += 6f + r.nextFloat() * 6f) {
            if (Math.abs(x) < 12f) continue;   // perto do início a estrada é lisa
            px[n] = x;
            pz[n] = roadZ(x) + (r.nextFloat() * 2f - 1f) * 2.3f;
            pr[n] = 0.7f + r.nextFloat() * 0.6f;
            pd[n] = r.nextFloat() < 0.72f ? 0.14f + r.nextFloat() * 0.16f : -(0.08f + r.nextFloat() * 0.08f);
            n++;
        }
        POT_X = java.util.Arrays.copyOf(px, n);
        POT_Z = java.util.Arrays.copyOf(pz, n);
        POT_R = java.util.Arrays.copyOf(pr, n);
        POT_D = java.util.Arrays.copyOf(pd, n);
    }

    /** Profundidade do buraco (ou altura negativa da lombada) em (x, z). */
    static float pothole(float x, float z) {
        float sum = 0f;
        for (int i = 0; i < POT_X.length; i++) {
            float r = POT_R[i], dx = x - POT_X[i];
            if (dx > r || dx < -r) continue;
            float dz = z - POT_Z[i];
            if (dz > r || dz < -r) continue;
            float d = (float) Math.sqrt(dx * dx + dz * dz);
            if (d >= r) continue;
            float t = 1f - d / r;
            sum += POT_D[i] * t * t * (3f - 2f * t);
        }
        return sum;
    }

    /** Linha central da estrada: curvas que passam pela origem (spawn). */
    static float roadZ(float x) {
        return 40f * MathUtils.sin(x * 0.011f) + 14f * MathUtils.sin(x * 0.027f);
    }

    /** Eixo do rio seco: corre no sentido z e cruza a estrada. */
    static float riverX(float z) {
        return -70f + 15f * MathUtils.sin(z * 0.025f);
    }

    /** Relevo natural com as zonas protegidas, o açude e o rio seco. */
    private float baseHeight(float x, float z) {
        float y = Relevo.base(x, z);
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
        if (town != null) y = Math.max(y, town.floorAt(x, z));   // piso da praça
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
        return normalAt(x, z, new Vector3());
    }

    Vector3 normalAt(float x, float z, Vector3 out) {
        float e = 0.5f;
        float dhdx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2f * e);
        float dhdz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2f * e);
        return out.set(-dhdx, 1f, -dhdz).nor();
    }

    private final float[] tintRgb = new float[3];
    private final float[] pesosClima = new float[Clima.values().length];

    /** Tom por vértice: quase branco (a textura já traz a cor); só escurece as encostas. */
    private Color tintAt(float x, float z, Vector3 n) {
        float steep = 1f - n.y;
        float shade = 1f - MathUtils.clamp((steep - 0.10f) * 0.6f, 0f, 0.25f);
        Regions.tint(x, z, tintRgb);
        // Neve e lama têm cor própria na textura: a cor da região só aparece no deserto (com a transição)
        Clima.pesos(x, z, pesosClima);
        float d = pesosClima[Clima.DESERTO.ordinal()];
        float r = 1f + (tintRgb[0] - 1f) * d, g = 1f + (tintRgb[1] - 1f) * d, b = 1f + (tintRgb[2] - 1f) * d;
        return new Color(shade * r, shade * g, shade * b, 1f);
    }

    /** Escolhe o lugar do açude e da cacimba: longe do início e um do outro. */
    private void choosePlacesForLandmarks() {
        Random r = new Random(20261125L);
        for (int t = 0; t < 400 && (!hasDam || !hasWell); t++) {
            float x = (r.nextFloat() * 2f - 1f) * 150f, z = (r.nextFloat() * 2f - 1f) * 130f;
            if (Math.abs(z - roadZ(x)) < 50f) continue;      // fora da faixa da estrada e das casas
            if (Math.hypot(x - TOWN_X, z - TOWN_Z) < 75f) continue;   // longe da cidade
            if (Math.hypot(x, z) < 30f) continue;
            if (!hasDam) {
                if (!flatAround(x, z, 4f, 1.0f)) continue;   // açude em lugar plano
                damX = x; damZ = z; hasDam = true;
            } else if (!hasWell && Math.hypot(x - damX, z - damZ) > 30f && flatAround(x, z, 4f, 1.4f)) {
                wellX = x; wellZ = z; hasWell = true;
            }
        }
        chooseCemetery();
    }

    /** Lugar do cemitério: sertão longe da estrada, da vila e dos outros locais, no trecho mais plano. */
    private void chooseCemetery() {
        // Lugar plano: o que menos varia de altura num raio de 30 m (o aterro de 24 m fica suave)
        Random r = new Random(19150402L);
        float best = 1e9f;
        for (int t = 0; t < 500; t++) {
            float x = (r.nextFloat() * 2f - 1f) * (HALF - 80f), z = (r.nextFloat() * 2f - 1f) * (HALF - 80f);
            if (Regions.at(x, z) != Regions.Region.SERTAO) continue;
            if (Math.abs(z - roadZ(x)) < 90f || Math.abs(x - riverX(z)) < 30f) continue;
            if (Math.hypot(x - TOWN_X, z - TOWN_Z) < 150f || Math.hypot(x, z) < 60f) continue;
            if (nearWellOrDam(x, z, 50f) || Regions.farmDist(x, z) < 60f) continue;
            float mn = 1e9f, mx = -1e9f;
            for (int i = -4; i <= 4; i++) for (int j = -4; j <= 4; j++) {
                float h = Relevo.bruto(x + i * 3.75f, z + j * 3.75f);
                mn = Math.min(mn, h);
                mx = Math.max(mx, h);
            }
            if (mx - mn < best) {
                best = mx - mn;
                cemX = x;
                cemZ = z;
            }
        }
        hasCem = best < 1e8f;
        if (hasCem) {
            // Altura do chão do cercado = média da área onde ficam as covas, antes de aplainar
            float sum = 0f;
            int n = 0;
            for (float lx = -10f; lx <= 10.01f; lx += 2f) for (float lz = -10f; lz <= 10.01f; lz += 2f) {
                sum += Relevo.bruto(cemX + lx, cemZ + lz);
                n++;
            }
            cemH = sum / n;
        }
        // portão voltado para o lado da estrada
        cemYaw = roadZ(cemX) < cemZ ? 0f : 180f;
    }

    /** Altura de um lugar plano: 'ph' dentro do retângulo (hw x hd, mais 2 m), aterro suave em CEM_BLEND. */
    private static float padBlend(float x, float z, float y, float px, float pz, float hw, float hd, float ph) {
        float cdx = Math.max(Math.abs(x - px) - hw - 2f, 0f), cdz = Math.max(Math.abs(z - pz) - hd - 2f, 0f);
        float cd = (float) Math.sqrt(cdx * cdx + cdz * cdz);
        if (cd >= CEM_BLEND) return y;
        float ct = cd / CEM_BLEND, cs = ct * ct * (3f - 2f * ct);
        return ph + (y - ph) * cs;
    }

    /** Dentro (ou a 'margin' metros) do cemitério. */
    boolean nearCemetery(float x, float z, float margin) {
        return hasCem && Math.abs(x - cemX) < CEM_HW + margin && Math.abs(z - cemZ) < CEM_HD + margin;
    }

    /** Verdadeiro se o terreno num raio 'r' varia no máximo 'maxRange' metros. */
    private boolean flatAround(float x, float z, float r, float maxRange) {
        float mn = 1e9f, mx = -1e9f;
        for (int i = 0; i < 8; i++) {
            float a = MathUtils.PI2 * i / 8f;
            float h = Relevo.bruto(x + r * MathUtils.cos(a), z + r * MathUtils.sin(a));
            mn = Math.min(mn, h);
            mx = Math.max(mx, h);
        }
        float c = Relevo.bruto(x, z);
        mn = Math.min(mn, c);
        mx = Math.max(mx, c);
        return mx - mn <= maxRange;
    }

    /** Texturas do chão de cada clima (carregadas na primeira vez). */
    private final java.util.EnumMap<Clima, Texture> climaTextures = new java.util.EnumMap<>(Clima.class);

    /** Peso de um clima num ponto (0 a 1). */
    private float pesoClima(float x, float z, Clima c) {
        Clima.pesos(x, z, pesosClima);
        return pesosClima[c.ordinal()];
    }

    private Texture climaTexture(Clima c) {
        Texture t = climaTextures.get(c);
        if (t == null) {
            t = new Texture(Gdx.files.internal(c.arquivo));
            t.setWrap(Texture.TextureWrap.Repeat, Texture.TextureWrap.Repeat);
            climaTextures.put(c, t);
        }
        return t;
    }

    /** Vértice da lâmina do rio: 35 cm acima do leito no centro; na borda desce até o terreno (não flutua). */
    private VertexInfo aguaVertice(float x, float z, float centroX) {
        float chao = heightAt(x, z);
        float y = Math.min(heightAt(centroX, z) + 0.35f, chao + 0.02f);
        return new VertexInfo().setPos(x, y, z).setNor(0f, 1f, 0f);
    }

    /** Altura da lâmina do rio no ponto (x, z) do centro do leito: para testes. */
    float alturaAgua(float x, float z) {
        return heightAt(x, z) + 0.35f;
    }

    private VertexInfo vertex(float x, float z) {
        return vertexCamada(x, z, 1f, 0f);
    }

    /** Vértice do terreno. 'alfa' é a transparência da camada de mistura; 'subir' desloca um pouco para cima. */
    private VertexInfo vertexCamada(float x, float z, float alfa, float subir) {
        Vector3 n = normalAt(x, z);
        Color c = tintAt(x, z, n);
        c.a = alfa;
        return new VertexInfo()
                .setPos(x, heightAt(x, z) - (Math.abs(z - roadZ(x)) < ROAD_HALF ? 0.45f : 0f) + subir, z)
                .setNor(n.x, n.y, n.z)
                .setCol(c)
                .setUV(x / TEXTURE_TILE, z / TEXTURE_TILE);
    }

    /** Mundo do battle royale (false) ou do treinamento (true: só galpão, bonecos e caixa de armas). */
    final boolean training;

    World() { this(false); }

    World(boolean training) { this.training = training; }

    // ---------- Modo treinamento ----------
    static final float SHED_HW = 25f, SHED_HD = 12f, SHED_H = 8f;  // galpão fechado: 50 x 24 m, 8 m de altura
    static final float TRAIN_PLAYER_X = 0f, TRAIN_PLAYER_Z = -6f;  // onde o jogador nasce, virado para o fundo
    static final float TRAIN_DUMMY_Z = 6f;                          // os bonecos ficam no fundo do galpão
    static final float TRAIN_BOX_X = 18f, TRAIN_BOX_Z = -9f;        // caixa de equipamentos, dentro do galpão
    static final float TRAIN_LIMIT = 60f;                          // o treino acaba numa cerca invisível

    /** Galpão, chão, caixa de equipamentos e limite. Sem terreno, cidade, casas nem avião. */
    private void buildTraining() {
        loadWallModel();   // o muro de proteção também funciona no treino
        ModelBuilder mb = new ModelBuilder();
        long attrs = Usage.Position | Usage.Normal | Usage.TextureCoordinates;
        Color wood = new Color(0.45f, 0.30f, 0.18f, 1f), woodDark = new Color(0.30f, 0.19f, 0.11f, 1f);
        Color metal = new Color(0.55f, 0.56f, 0.58f, 1f), metalDark = new Color(0.27f, 0.28f, 0.30f, 1f);
        Color olive = new Color(0.33f, 0.37f, 0.22f, 1f);
        // Chão de terra (textura repetida)
        dirtTexture = new Texture(Gdx.files.internal("textures/ground_basecolor.jpg"));
        dirtTexture.setWrap(Texture.TextureWrap.Repeat, Texture.TextureWrap.Repeat);
        TextureAttribute tex = TextureAttribute.createDiffuse(dirtTexture);
        tex.scaleU = 40f;
        tex.scaleV = 40f;
        Model ground = mb.createBox(2 * TRAIN_LIMIT, 0.2f, 2 * TRAIN_LIMIT, new Material(tex), attrs);
        loaded.add(ground);
        ModelInstance gi = new ModelInstance(ground);
        gi.transform.setToTranslation(0f, -0.1f, 0f);
        instances.add(gi);
        // Piso de tábuas
        addTrainVisual(mb, attrs, 2 * SHED_HW, 0.08f, 2 * SHED_HD, 0f, 0.04f, 0f, wood);
        // Paredes fechadas por todos os lados (sem porta): metal no fundo e na frente, madeira nos lados
        float t = 0.3f;
        addTrainWall(mb, attrs, 0f, SHED_HD, 2 * SHED_HW, t, false, 0f, SHED_H, metal);
        addTrainWall(mb, attrs, 0f, -SHED_HD, 2 * SHED_HW, t, false, 0f, SHED_H, metal);
        addTrainWall(mb, attrs, -SHED_HW, 0f, 2 * SHED_HD, t, true, 0f, SHED_H, wood);
        addTrainWall(mb, attrs, SHED_HW, 0f, 2 * SHED_HD, t, true, 0f, SHED_H, wood);
        // Cobertura de metal e estrutura: vigas de metal e pilares de madeira (só visual)
        addTrainWall(mb, attrs, 0f, 0f, 2 * SHED_HW + 1f, 2 * SHED_HD + 1f, false, SHED_H, SHED_H + 0.25f, metalDark);
        for (float x = -20f; x <= 20.01f; x += 5f) addTrainVisual(mb, attrs, 0.25f, 0.4f, 2 * SHED_HD, x, SHED_H - 0.3f, 0f, metal);
        for (float z = -SHED_HD; z <= SHED_HD + 0.01f; z += 4f) addTrainVisual(mb, attrs, 2 * SHED_HW, 0.4f, 0.25f, 0f, SHED_H - 0.3f, z, metal);
        for (float x : new float[]{-SHED_HW, SHED_HW, -12.5f, 12.5f}) for (float z : new float[]{-SHED_HD, SHED_HD})
            addTrainVisual(mb, attrs, 0.45f, SHED_H, 0.45f, x, SHED_H / 2f, z, woodDark);
        // Prateleira de equipamentos (modelo real, em metros): colisão do tamanho dela
        shelfModel = ModelIO.load("models/prateleira.g3dj");
        loaded.add(shelfModel);
        ModelInstance shelf = new ModelInstance(shelfModel);
        shelf.transform.setToTranslation(TRAIN_BOX_X, 0f, TRAIN_BOX_Z);
        instances.add(shelf);
        boxes.add(new Box(new Matrix4().setToTranslation(TRAIN_BOX_X, 0f, TRAIN_BOX_Z), SHELF_HD, SHELF_HL, SHELF_H));
        // Cerca invisível em volta do treino (colisão e tiro)
        float L = TRAIN_LIMIT;
        boxes.add(new Box(new Matrix4().setToTranslation(-L, 0f, 0f).rotate(Vector3.Y, 90f), L, 0.5f, 6f));   // lado oeste (corre em z)
        boxes.add(new Box(new Matrix4().setToTranslation(L, 0f, 0f).rotate(Vector3.Y, 90f), L, 0.5f, 6f));    // lado leste
        boxes.add(new Box(new Matrix4().setToTranslation(0f, 0f, -L), L, 0.5f, 6f));   // lado sul (corre em x)
        boxes.add(new Box(new Matrix4().setToTranslation(0f, 0f, L), L, 0.5f, 6f));    // lado norte
        // Armas e itens (sem nada espalhado), fogo sem fontes
        fire = new Fire();
        weapons = new Weapons();
        placeShelfWeapons();
        items = new Items();
    }

    // Prateleira: meias medidas do modelo (profundidade em x, comprimento em z, altura em y)
    static final float SHELF_HD = 0.6f, SHELF_HL = 1.62f, SHELF_H = 2.54f;
    // Topo de cada tábua usada (níveis de baixo) e espaçamento entre as armas do mesmo nível
    static final float[] SHELF_LEVELS = {0.24f, 0.94f, 1.68f};
    static final float SHELF_SLOT = 0.9f;
    static final int SHELF_PER_LEVEL = 3;
    private Model shelfModel;

    /**
     * Arma deitada sobre a tábua: cano paralelo à profundidade, centrada no nível e na linha, sem flutuar
     * (a base do modelo encosta na tábua). Três níveis, três armas por nível, espaçamento uniforme.
     */
    private void placeShelfWeapons() {
        Model[] ms = weapons.models();
        BoundingBox bb = new BoundingBox();
        int n = Math.min(ms.length, SHELF_LEVELS.length * SHELF_PER_LEVEL);
        for (int type = 0; type < n; type++) {
            int level = type / SHELF_PER_LEVEL, col = type % SHELF_PER_LEVEL;
            int inLevel = Math.min(SHELF_PER_LEVEL, n - level * SHELF_PER_LEVEL);
            float zSlot = (col - (inLevel - 1) / 2f) * SHELF_SLOT;
            ms[type].calculateBoundingBox(bb);
            float cx = (bb.min.x + bb.max.x) / 2f, cz = (bb.min.z + bb.max.z) / 2f;
            float y = SHELF_LEVELS[level] - bb.min.y + 0.005f;
            // Gira 90° em Y: o eixo do cano (z) vira x; o centro do modelo cai sobre (TRAIN_BOX_X, zSlot)
            Matrix4 t = new Matrix4().setToTranslation(TRAIN_BOX_X - cz, y, TRAIN_BOX_Z + zSlot + cx).rotate(Vector3.Y, 90f);
            ModelInstance mi = new ModelInstance(ms[type]);
            mi.transform.set(t);
            instances.add(mi);
        }
    }

    private void addTrainVisual(ModelBuilder mb, long attrs, float w, float h, float d, float x, float y, float z, Color c) {
        Model m = mb.createBox(w, h, d, new Material(ColorAttribute.createDiffuse(c)), attrs);
        loaded.add(m);
        ModelInstance mi = new ModelInstance(m);
        mi.transform.setToTranslation(x, y, z);
        instances.add(mi);
    }

    /** Parede do galpão: visual e colisão (Box com base em y0). */
    private void addTrainWall(ModelBuilder mb, long attrs, float cx, float cz, float len, float thick, boolean alongZ,
                              float y0, float y1, Color c) {
        float h = y1 - y0, yaw = alongZ ? 90f : 0f;
        Matrix4 t = new Matrix4().setToTranslation(cx, y0, cz).rotate(Vector3.Y, yaw);
        boxes.add(new Box(t, len / 2f, thick / 2f, h));
        Model m = mb.createBox(len, h, thick, new Material(ColorAttribute.createDiffuse(c)), attrs);
        loaded.add(m);
        ModelInstance mi = new ModelInstance(m);
        mi.transform.set(t).translate(0f, h / 2f, 0f);
        instances.add(mi);
    }

    public void create() {
        if (training) {
            buildTraining();
            return;
        }
        dirtTexture = new Texture(Gdx.files.internal("textures/ground_basecolor.jpg"));
        dirtTexture.setWrap(Texture.TextureWrap.Repeat, Texture.TextureWrap.Repeat);
        crackTexture = new Texture(Gdx.files.internal("textures/cracks.jpg"));
        crackTexture.setWrap(Texture.TextureWrap.Repeat, Texture.TextureWrap.Repeat);
        choosePlacesForLandmarks();
        // Relevo: lugares importantes ficam planos; o resto é o relevo natural (montes, vales, platôs)
        Relevo.limpa();
        Relevo.protege(0f, 0f, 60f, 40f);                       // nascimento
        Relevo.protege(TOWN_X, TOWN_Z, 110f, 70f);              // vila
        for (int f = 0; f < Regions.FARM_X.length; f++) Relevo.protege(Regions.FARM_X[f], Regions.FARM_Z[f], 35f, 50f);
        if (hasCem) cemH = Relevo.protege(cemX, cemZ, 40f, 45f);   // cemitério: o chão do cercado é a mesma altura do relevo protegido
        if (hasDam) Relevo.protege(damX, damZ, 16f, 30f);       // açude
        if (hasWell) Relevo.protege(wellX, wellZ, 10f, 25f);    // cacimba
        for (float[] c : casasDaEstrada()) Relevo.protege(c[0], c[1], 22f, 40f);   // casas da estrada
        montaRelevo();

        ModelBuilder mb = new ModelBuilder();

        // Terreno em pedaços (2 x 2): textura de terra + cor por altura/inclinação
        float chunk = SIZE / CHUNKS;
        float step = chunk / GRID;
        for (int ci = 0; ci < CHUNKS; ci++) {
            for (int cj = 0; cj < CHUNKS; cj++) {
                mb.begin();
                // Cada pedaço usa a textura do clima do centro dele; as bordas recebem as camadas de mistura abaixo
                Clima clima = Clima.quadrante(-HALF + (ci + 0.5f) * chunk, -HALF + (cj + 0.5f) * chunk);
                MeshPartBuilder part = mb.part("terrain", GL20.GL_TRIANGLES,
                        Usage.Position | Usage.Normal | Usage.ColorPacked | Usage.TextureCoordinates,
                        new Material(TextureAttribute.createDiffuse(climaTexture(clima))));
                for (int i = 0; i < GRID; i++) {
                    for (int j = 0; j < GRID; j++) {
                        float x0 = -HALF + ci * chunk + i * step, x1 = x0 + step;
                        float z0 = -HALF + cj * chunk + j * step, z1 = z0 + step;
                        // Boca da cacimba: sai do terreno toda célula que toca o círculo do poço (a plataforma cobre a borda)
                        if (hasWell && cellTouchesCircle(x0, z0, x1, z1, wellX, wellZ, Landmarks.WELL_R)) continue;
                        // quad da célula (o culling de faces está desligado, então a ordem não importa)
                        part.rect(vertex(x0, z0), vertex(x1, z0), vertex(x1, z1), vertex(x0, z1));
                    }
                }
                Model m = mb.end();
                terrainModels.add(m);
                ModelInstance mi = new ModelInstance(m);
                instances.add(mi);
                terrainParts.add(mi);
                // caixa do pedaço (centro e meias-dimensões): só desenha se estiver na frente da câmera
                float[] mm = minMaxAlturas(-HALF + ci * chunk, -HALF + cj * chunk, -HALF + (ci + 1) * chunk, -HALF + (cj + 1) * chunk);
                float[] caixa = {-HALF + ci * chunk + chunk / 2f, (mm[0] + mm[1]) / 2f, -HALF + cj * chunk + chunk / 2f,
                        chunk / 2f + 1f, (mm[1] - mm[0]) / 2f + 4f, chunk / 2f + 1f};
                terrainBox.put(mi, caixa);
                // Transição: a textura de cada clima vizinho entra por cima, com transparência nas bordas
                for (Clima outro : Clima.values()) {
                    if (outro == clima) continue;
                    mb.begin();
                    MeshPartBuilder mix = mb.part("mistura", GL20.GL_TRIANGLES,
                            Usage.Position | Usage.Normal | Usage.ColorPacked | Usage.TextureCoordinates,
                            new Material(TextureAttribute.createDiffuse(climaTexture(outro)),
                                    new BlendingAttribute(GL20.GL_SRC_ALPHA, GL20.GL_ONE_MINUS_SRC_ALPHA)));
                    boolean algum = false;
                    for (int i = 0; i < GRID; i++) {
                        for (int j = 0; j < GRID; j++) {
                            float x0 = -HALF + ci * chunk + i * step, x1 = x0 + step;
                            float z0 = -HALF + cj * chunk + j * step, z1 = z0 + step;
                            if (hasWell && cellTouchesCircle(x0, z0, x1, z1, wellX, wellZ, Landmarks.WELL_R)) continue;
                            float a0 = pesoClima(x0, z0, outro), a1 = pesoClima(x1, z0, outro);
                            float a2 = pesoClima(x1, z1, outro), a3 = pesoClima(x0, z1, outro);
                            if (Math.max(Math.max(a0, a1), Math.max(a2, a3)) < 0.004f) continue;
                            mix.rect(vertexCamada(x0, z0, a0, 0.02f), vertexCamada(x1, z0, a1, 0.02f),
                                    vertexCamada(x1, z1, a2, 0.02f), vertexCamada(x0, z1, a3, 0.02f));
                            algum = true;
                        }
                    }
                    Model mm2 = mb.end();
                    if (!algum) { mm2.dispose(); continue; }
                    terrainModels.add(mm2);
                    ModelInstance mi2 = new ModelInstance(mm2);
                    instances.add(mi2);
                    terrainParts.add(mi2);
                    terrainBox.put(mi2, caixa);
                }
            }
        }

        // Rio raso: lâmina de água de 35 cm sobre o leito do rio (só visual: dá para atravessar a pé, como num vau)
        mb.begin();
        MeshPartBuilder agua = mb.part("agua", GL20.GL_TRIANGLES, Usage.Position | Usage.Normal,
                new Material(ColorAttribute.createDiffuse(0.22f, 0.42f, 0.55f, 1f),
                        new BlendingAttribute(GL20.GL_SRC_ALPHA, GL20.GL_ONE_MINUS_SRC_ALPHA)));
        float margemAgua = 4.5f;   // meia largura da lâmina (o leito tem 4,5 m de meia largura)
        for (float z = -HALF; z < HALF - 0.01f; z += 3f) {
            float z1 = Math.min(z + 3f, HALF);
            float x0 = riverX(z), x1 = riverX(z1);
            agua.rect(aguaVertice(x0 - margemAgua, z, x0), aguaVertice(x0 + margemAgua, z, x0),
                    aguaVertice(x1 + margemAgua, z1, x1), aguaVertice(x1 - margemAgua, z1, x1));
        }
        Model aguaModel = mb.end();
        loaded.add(aguaModel);
        instances.add(new ModelInstance(aguaModel));

        // Estrada de barro: faixa plana no eixo x, sobre o terreno (segmentos de 2 m)
        mb.begin();
        MeshPartBuilder road = mb.part("road", GL20.GL_TRIANGLES, Usage.Position | Usage.Normal | Usage.ColorPacked,
                new Material(ColorAttribute.createDiffuse(1f, 1f, 1f, 1f)));
        int cols = 6;   // 1 m ao longo e ~1,2 m na largura: os buracos aparecem
        for (int i = 0; i < (int) SIZE; i++) {
            float x0 = -HALF + i, x1 = x0 + 1f;
            float z0 = roadZ(x0), z1 = roadZ(x1);
            for (int j = 0; j < cols; j++) {
                float o0 = -ROAD_HALF + 2f * ROAD_HALF * j / cols, o1 = -ROAD_HALF + 2f * ROAD_HALF * (j + 1) / cols;
                VertexInfo a = roadVertex(x0, z0 + o0), b = roadVertex(x1, z1 + o0);
                VertexInfo c = roadVertex(x1, z1 + o1), d = roadVertex(x0, z0 + o1);
                road.triangle(a, c, b);
                road.triangle(a, d, c);
            }
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
            Model real = ModelIO.load("models/poco/poco.g3dj");
            pocoModel = real;
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
            Obstacle wellObs = new Obstacle(wellX, wellZ, Landmarks.WELL_OUT + 0.3f, heightAt(wellX, wellZ), 1.0f);
            wellObs.surface = Surface.PEDRA;
            obstacles.add(wellObs);
        }


        // Objetos 3D reais (modelos CC0 convertidos para .obj)
        Model rockLarge = loadModel("models/rock_large.obj");
        Model rockSmall = loadModel("models/rock_small.obj");
        Model stump = loadModel("models/stump.obj");
        Model log = loadModel("models/log.obj");

        Random rnd = new Random(7L);
        casaModel = ModelIO.load("models/casa_taipa.g3dj");
        JsonValue boxes = new JsonReader().parse(Gdx.files.internal("models/casa_taipa_colisao.json"));
        for (JsonValue b = boxes.child; b != null; b = b.next) {
            wallBoxes.add(new float[]{b.getFloat("minX"), b.getFloat("maxX"), b.getFloat("minY"), b.getFloat("maxY"), b.getFloat("minZ"), b.getFloat("maxZ")});
        }
        fences.create();
        loadWallModel();
        stoveModel = ModelIO.load("models/fogao.g3dj");
        floorModel = HouseDecor.buildFloor();
        loaded.add(floorModel);
        benchModel = ModelIO.load("models/banco.g3dj");
        doorModel = HouseDecor.buildDoor();
        loaded.add(doorModel);
        treeModel = ModelIO.load("models/arvore_seca.g3dj");
        pole = ModelIO.load("models/arvore_pole.g3dj");
        fire = new Fire();
        cactusModels = new Model[]{
                ModelIO.load("models/cactus0.g3dj"),
                ModelIO.load("models/cactus1.g3dj"),
                ModelIO.load("models/cactus2.g3dj")};
        cartModel = ModelIO.load("models/carroca.g3dj");
        // Casas ao lado da estrada (lugares protegidos no relevo, ver casasDaEstrada)
        for (float[] c : casasDaEstrada()) addEnclosedHouse(rnd, c[0], c[1], c[2]);
        // Cidade: casas de bairro e de taipa, pracinha com poço e capela, roçado (os moradores vêm depois)
        if (pocoModel == null) {
            pocoModel = ModelIO.load("models/poco/poco.g3dj");
            loaded.add(pocoModel);
        }
        town = new Town(this, casaModel, benchModel, treeModel, pocoModel);
        town.build();
        // Avião do battle royale: voa sobre o mapa com turbulência, turbinas girando e rastros de vento
        airplane = new Airplane();
        alwaysDraw(airplane.plane);
        for (ModelInstance f : airplane.fans) alwaysDraw(f);
        // Pedras grandes nas margens da estrada (trechos difíceis de passar)
        for (int i = 0; i < 14; i++) {
            float x = (rnd.nextFloat() * 2f - 1f) * 150f;
            if (inTown(x, roadZ(x))) continue;   // a estrada da cidade fica livre
            float side = rnd.nextBoolean() ? 1f : -1f;
            float cz = roadZ(x) + side * (ROAD_HALF + 4f + rnd.nextFloat() * 4f);
            for (int k = 0; k < 3; k++) {
                float px = x + (rnd.nextFloat() - 0.5f) * 5f, pz = cz + (rnd.nextFloat() - 0.5f) * 3f;
                if (!nearEnclosure(px, pz)) addRockAt(rockLarge, px, pz, 2.2f, 0.9f);
            }
        }
        // Objetos do cenário: o mapa dobrou, então dobrou a quantidade
        for (int i = 0; i < 216; i++) addCactus(rnd);   // ×6: o mapa tem 10× a área
        for (int i = 0; i < 54; i++) addTree(rnd, true);
        for (int i = 0; i < 42; i++) addTree(rnd, false);
        for (int i = 0; i < 72; i++) addProp(rnd, rockLarge, 2.2f, 0.9f, 1f);
        for (int i = 0; i < 96; i++) addProp(rnd, rockSmall, 2.2f, 0.45f, 1f);
        // Madeira morta: tocos e troncos caídos (no lugar das árvores mortas, que ainda não temos modelo)
        for (int i = 0; i < 108; i++) addProp(rnd, stump, 2.6f, 0.35f, 1f);
        for (int i = 0; i < 72; i++) addProp(rnd, log, 2.6f, 1.2f, 1f);
        // Fazendas abandonadas: casa de taipa, cocho vazio, carroça parada, curral de madeira e tocos da roça morta
        Model fenceSeg = Props.cerca();
        loaded.add(fenceSeg);
        Model cochoModel = ModelIO.load("models/cocho.g3dj");
        loaded.add(cochoModel);
        for (int f = 0; f < Regions.FARM_X.length; f++) {
            float fx = Regions.FARM_X[f], fz = Regions.FARM_Z[f];
            float yaw = rnd.nextFloat() * 360f;
            addEnclosedHouse(rnd, fx, fz, yaw);
            placeStatic(cochoModel, fx + 9f, fz + 3f, yaw, 1.0f, 0.9f);
            placeStatic(cartModel, fx - 8f, fz - 6f, yaw + 40f, 1.3f, 2.2f);
            addCorral(fx + 20f, fz - 12f, fenceSeg);
            for (int k = 0; k < 8; k++) {
                float a = rnd.nextFloat() * MathUtils.PI2, d = 14f + rnd.nextFloat() * 22f;
                float sx = fx + MathUtils.cos(a) * d, sz = fz + MathUtils.sin(a) * d;
                if (declive(sx, sz) > 0.45f) continue;   // toco não fica pendurado numa encosta
                placeStatic(stump, sx, sz, rnd.nextFloat() * 360f, 2.6f, 0.35f);
            }
        }
        addPlacesAndPlants(rnd);
        addTrailsCracksBirds(rnd);
        // Armas espalhadas: dentro das casas, na frente das casas da cidade e soltas pelo mapa
        weapons = new Weapons();
        weapons.scatter(this, rnd);
        // Itens: cura, energético, granadas e mochila
        items = new Items();
        items.scatter(this, rnd);
        items.scatterSurvival(this, rnd);
    }

    // ---------- Muro de pedra e taipa (botão PAREDE) ----------
    private static final float WALL_BACK = 0.55f; // o jogador fica este tanto dentro do U, da boca para o fundo
    final Array<StoneWall> walls = new Array<>();
    private Model wallModel;
    private float[][] wallCircles;                // [x, z, raio] em coordenadas do muro

    private void loadWallModel() {
        wallModel = ModelIO.load("models/parede_taipa.g3dj");
        loaded.add(wallModel);
        JsonValue cs = new JsonReader().parse(Gdx.files.internal("models/parede_taipa_colisao.json")).get("circulos");
        wallCircles = new float[cs.size][];
        int i = 0;
        for (JsonValue c = cs.child; c != null; c = c.next, i++)
            wallCircles[i] = new float[]{c.getFloat(0), c.getFloat(1), c.getFloat(2)};
    }

    /** Onde um muro ficaria: centro da boca do U, giro e base. */
    static final class WallSpot {
        float x, z, yawDeg, groundY;
    }


    /**
     * Onde o muro ficaria com a boca do U 'dist' metros à frente do jogador (dist 0 = jogador dentro do U).
     * Sem restrição: pode ser posto em qualquer lugar, inclusive dentro de outros muros, e sempre cabe.
     * Devolve null (o aviso não existe mais).
     */
    String wallSpot(float px, float pz, float yawRad, float dist, WallSpot out) {
        if (wallCircles == null) return "MURO NÃO CARREGOU";
        float fx = MathUtils.sin(yawRad), fz = MathUtils.cos(yawRad);
        out.x = px + fx * (dist - WALL_BACK);     // origem do modelo: boca do U
        out.z = pz + fz * (dist - WALL_BACK);
        out.yawDeg = MathUtils.radiansToDegrees * yawRad + 180f;
        float c = MathUtils.cosDeg(out.yawDeg), s = MathUtils.sinDeg(out.yawDeg);
        // Base: o chão mais baixo sob a pegada; o lado mais alto fica enterrado, sem vão
        float lo = Float.MAX_VALUE, hi = -Float.MAX_VALUE;
        for (float lx = -2.2f; lx <= 2.2f; lx += 0.4f) for (float lz = -2.0f; lz <= 0.2f; lz += 0.4f) {
            float h = heightAt(out.x + lx * c + lz * s, out.z - lx * s + lz * c);
            lo = Math.min(lo, h);
            hi = Math.max(hi, h);
        }
        out.groundY = lo;
        return null;
    }

    /** Põe o muro no lugar calculado por wallSpot (já sabendo que cabe). */
    void placeWallSpot(WallSpot s) {
        float c = MathUtils.cosDeg(s.yawDeg), sn = MathUtils.sinDeg(s.yawDeg);
        StoneWall w = new StoneWall(wallModel, s.x, s.groundY, s.z, s.yawDeg);
        instances.add(w.mi);
        for (float[] k : wallCircles) {
            Obstacle o = new Obstacle(s.x + k[0] * c + k[1] * sn, s.z - k[0] * sn + k[1] * c, k[2], s.groundY, StoneWall.HEIGHT);
            o.surface = Surface.PEDRA;
            addObstacle(o);
            w.cols.add(o);
        }
        walls.add(w);
    }

    /** Toque no botão: o muro na frente do jogador, com ele dentro do U. Devolve null ou o aviso. */
    String placeWall(float px, float pz, float yawRad) {
        WallSpot s = new WallSpot();
        String aviso = wallSpot(px, pz, yawRad, 0f, s);
        if (aviso == null) placeWallSpot(s);
        return aviso;
    }

    /** Sombra do muro (ao segurar o botão): o mesmo modelo, meio transparente. */
    ModelInstance wallGhost() {
        if (wallModel == null) return null;
        ModelInstance g = new ModelInstance(wallModel);
        for (int i = 0; i < g.materials.size; i++)
            g.materials.get(i).set(new com.badlogic.gdx.graphics.g3d.attributes.BlendingAttribute(0.45f));
        return g;
    }

    /** Verde se cabe aqui, vermelho se não. */
    void tintWallGhost(ModelInstance g, boolean ok) {
        for (int i = 0; i < g.materials.size; i++)
            g.materials.get(i).set(com.badlogic.gdx.graphics.g3d.attributes.ColorAttribute.createDiffuse(
                    ok ? 0.4f : 1f, ok ? 1f : 0.25f, ok ? 0.4f : 0.25f, 1f));
    }

    /** Tira um muro: o modelo e a colisão. */
    void removeWall(StoneWall w) {
        instances.removeValue(w.mi, true);
        for (int i = 0; i < w.cols.size; i++) removeObstacle(w.cols.get(i));
        walls.removeValue(w, true);
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
        updateBirds(dt);
        if (town != null) town.update(dt);
        if (airplane != null) airplane.update(dt, cam);
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

    /**
     * Distância máxima da câmera ao personagem, sem atravessar paredes, árvores, cercas nem o chão.
     * 'dir' é unitário, do personagem para a câmera. Devolve no máximo 'maxDist'.
     */
    float cameraDistance(Vector3 pivot, Vector3 dir, float maxDist) {
        float step = 0.05f;   // passo fino: paredes finas não são pulas
        Vector3 p = new Vector3();
        for (float d = step; d <= maxDist; d += step) {
            p.set(pivot).mulAdd(dir, d);
            if (cameraBlocked(p)) return Math.max(0.15f, d - 0.2f);   // para antes da parede, pode chegar perto
        }
        return maxDist;
    }

    // ---------- Raio (tiros e linha de visão) ----------
    private final Vector3 rayO = new Vector3(), rayD = new Vector3(), rayT = new Vector3();
    /** Material e normal (aprox.) do primeiro impacto do último raycast. */
    Surface hitSurface = Surface.TERRA;
    Obstacle hitObstacle = null;   // obstáculo (parede, cerca...) atingido pelo último raio, ou null
    final Vector3 hitNormal = new Vector3(0f, 1f, 0f);

    /**
     * Distância até o primeiro obstáculo sólido no raio (chão, paredes das casas, casas da cidade,
     * árvores/pedras/poço). Devolve maxDist se nada bloquear. Sem criar objetos (roda a cada tiro).
     * dir precisa estar normalizado.
     */
    float raycast(Vector3 origin, Vector3 dir, float maxDist) {
        float best = maxDist;
        Surface surf = Surface.TERRA;
        Obstacle bestOb = null;
        // Paredes das casas de taipa: caixas no sistema da casa
        for (int k = 0; k < houses.size; k++) {
            House h = houses.get(k);
            rayO.set(origin).mul(h.inv);
            rayT.set(origin).add(dir).mul(h.inv);
            rayD.set(rayT).sub(rayO);   // a casa não tem escala: continua com comprimento 1
            for (int w = 0; w < wallBoxes.size; w++) {
                float[] b = wallBoxes.get(w);
                float t = slab(rayO, rayD, b[0], b[1], b[2], b[3], b[4], b[5], best);
                if (t < best) { best = t; surf = Surface.BARRO; bestOb = null; }   // taipa: barro e madeira
            }
        }
        // Casas da cidade feitas em código
        for (int k = 0; k < boxes.size; k++) {
            Box bx = boxes.get(k);
            rayO.set(origin).mul(bx.inv);
            rayT.set(origin).add(dir).mul(bx.inv);
            rayD.set(rayT).sub(rayO);
            float t = slab(rayO, rayD, -bx.hx, bx.hx, 0f, bx.h, -bx.hz, bx.hz, best);
            if (t < best) { best = t; surf = Surface.PEDRA; bestOb = null; }   // casas da cidade: alvenaria caiada
        }
        // Obstáculos: cilindros em pé
        for (int k = 0; k < obstacles.size; k++) {
            Obstacle ob = obstacles.get(k);
            float ox = origin.x - ob.x, oz = origin.z - ob.z;
            float a = dir.x * dir.x + dir.z * dir.z;
            if (a < 1e-8f) continue;
            float b = ox * dir.x + oz * dir.z, c = ox * ox + oz * oz - ob.radius * ob.radius;
            float disc = b * b - a * c;
            if (disc < 0f) continue;
            float t = (-b - (float) Math.sqrt(disc)) / a;
            if (t < 0f) t = c < 0f ? 0f : -1f;   // começou dentro
            if (t < 0f || t >= best) continue;
            float y = origin.y + dir.y * t;
            if (y >= ob.baseY && y <= ob.baseY + ob.height) { best = t; surf = ob.surface; bestOb = ob; }
        }
        // Chão: anda em passos e refina
        float step = 0.6f, prev = 0f;
        for (float t = step; t < best + step; t += step) {
            float tt = Math.min(t, best);
            float x = origin.x + dir.x * tt, z = origin.z + dir.z * tt, y = origin.y + dir.y * tt;
            if (y < heightAt(x, z)) {
                float lo = prev, hi = tt;
                for (int i = 0; i < 8; i++) {
                    float m = (lo + hi) * 0.5f;
                    if (origin.y + dir.y * m < heightAt(origin.x + dir.x * m, origin.z + dir.z * m)) hi = m;
                    else lo = m;
                }
                if (hi < best) { hitSurface = Surface.TERRA; hitObstacle = null; }
                else { hitSurface = surf; hitObstacle = bestOb; }
                float gh = Math.min(best, hi);
                if (hi < best) normalAt(origin.x + dir.x * gh, origin.z + dir.z * gh, hitNormal);
                else hitNormal.set(-dir.x, 0f, -dir.z).nor();
                return gh;
            }
            prev = tt;
            if (tt >= best) break;
        }
        hitSurface = surf;
        hitObstacle = bestOb;
        hitNormal.set(-dir.x, 0f, -dir.z);
        if (hitNormal.len2() < 1e-6f) hitNormal.set(0f, 1f, 0f); else hitNormal.nor();
        return best;
    }

    /** Raio contra caixa alinhada (método das placas). Devolve a entrada ou Float.MAX_VALUE. */
    private static float slab(Vector3 o, Vector3 d, float x0, float x1, float y0, float y1, float z0, float z1, float max) {
        float tmin = 0f, tmax = max;
        // eixo x
        if (Math.abs(d.x) < 1e-8f) { if (o.x < x0 || o.x > x1) return Float.MAX_VALUE; }
        else {
            float t1 = (x0 - o.x) / d.x, t2 = (x1 - o.x) / d.x;
            if (t1 > t2) { float k = t1; t1 = t2; t2 = k; }
            tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
            if (tmin > tmax) return Float.MAX_VALUE;
        }
        // eixo y
        if (Math.abs(d.y) < 1e-8f) { if (o.y < y0 || o.y > y1) return Float.MAX_VALUE; }
        else {
            float t1 = (y0 - o.y) / d.y, t2 = (y1 - o.y) / d.y;
            if (t1 > t2) { float k = t1; t1 = t2; t2 = k; }
            tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
            if (tmin > tmax) return Float.MAX_VALUE;
        }
        // eixo z
        if (Math.abs(d.z) < 1e-8f) { if (o.z < z0 || o.z > z1) return Float.MAX_VALUE; }
        else {
            float t1 = (z0 - o.z) / d.z, t2 = (z1 - o.z) / d.z;
            if (t1 > t2) { float k = t1; t1 = t2; t2 = k; }
            tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
            if (tmin > tmax) return Float.MAX_VALUE;
        }
        return tmin;
    }

    /** Linha de visão livre entre dois pontos. */
    boolean lineOfSight(Vector3 a, Vector3 b) {
        float len = a.dst(b);
        if (len < 1e-3f) return true;
        rayT.set(b).sub(a).scl(1f / len);
        losDir.set(rayT);
        return raycast(a, losDir, len) >= len - 0.05f;
    }
    private final Vector3 losDir = new Vector3();

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
        for (int k = 0; k < boxes.size; k++) {
            Box bx = boxes.get(k);
            Vector3 l = new Vector3(p).mul(bx.inv);
            if (Math.abs(l.x) < bx.hx && Math.abs(l.z) < bx.hz && l.y > 0f && l.y < bx.h) return true;
        }
        nearObstacles(p.x, p.z, maxObstacleRadius());
        for (int q = 0; q < near.size; q++) {
            Obstacle ob = obstacles.get(near.get(q));
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
    /** Um ponto aleatório numa das regiões pedidas (tenta algumas vezes; senão, qualquer ponto). */
    private float[] spotIn(Random rnd, float margin, Regions.Region a, Regions.Region b) {
        float[] p = null;
        for (int t = 0; t < 30; t++) {
            p = randomSpot(rnd, margin);
            Regions.Region r = Regions.at(p[0], p[1]);
            if (r == a || r == b) return p;
        }
        return p;
    }

    // Contagens das plantas e dos locais (para os testes)
    int mandacaruCount, xiqueCount, macambiraCount, crossCount, tentCount;

    /** Ponto de caatinga longe da estrada (e de casas) para um local de exploração. */
    private float[] farFromRoad(Random rnd, float minDist) {
        float[] p = null;
        for (int t = 0; t < 60; t++) {
            p = spotIn(rnd, 20f, Regions.Region.SERTAO, Regions.Region.SERRA);
            if (Math.abs(p[1] - roadZ(p[0])) > minDist && !nearLandmark(p[0], p[1])) break;
        }
        return p;
    }

    /** Plantas do sertão (mandacaru, xique-xique, macambira), cemitério rural e acampamento de retirantes. */
    private void addPlacesAndPlants(Random rnd) {
        Model mand = Props.mandacaru(), xq = Props.xique(), mac = Props.macambira();
        Model tent = Props.tent();
        for (Model m : new Model[]{mand, xq, mac, tent}) loaded.add(m);
        for (int i = 0; i < 70; i++) {
            float[] p = spotIn(rnd, 8f, Regions.Region.SERTAO, Regions.Region.SERRA);
            placeStatic(mand, p[0], p[1], rnd.nextFloat() * 360f, 0.9f + 0.3f * rnd.nextFloat(), 0.5f);
            mandacaruCount++;
        }
        for (int i = 0; i < 70; i++) {
            float[] p = spotIn(rnd, 8f, Regions.Region.SERTAO, Regions.Region.SERRA);
            placeStatic(xq, p[0], p[1], rnd.nextFloat() * 360f, 0.9f + 0.2f * rnd.nextFloat(), 0f);
            xiqueCount++;
        }
        for (int i = 0; i < 90; i++) {
            float[] p = spotIn(rnd, 8f, Regions.Region.SERTAO, Regions.Region.SERRA);
            placeStatic(mac, p[0], p[1], rnd.nextFloat() * 360f, 0.9f + 0.3f * rnd.nextFloat(), 0f);
            macambiraCount++;
        }
        addCemetery();
        // Acampamento de retirantes: três tendas em volta de uma fogueira
        float[] camp = farFromRoad(rnd, 120f);
        campX = camp[0];
        campZ = camp[1];
        for (int k = 0; k < 3; k++) {
            float a = k * MathUtils.PI2 / 3f + 0.4f;
            placeStatic(tent, camp[0] + MathUtils.cos(a) * 4.5f, camp[1] + MathUtils.sin(a) * 4.5f,
                    a * MathUtils.radiansToDegrees, 1f, 0.9f);
            tentCount++;
        }
        float fy = heightAt(camp[0], camp[1]);
        fire.addSource(new Vector3(camp[0], fy + 0.3f, camp[1]), new Vector3(camp[0], fy + 3.5f, camp[1]));
    }

    // Trilhas, solo rachado e pássaros
    int trailCount, crackCount, birdCount;
    private final java.util.ArrayList<float[]> birdOrbit = new java.util.ArrayList<>();   // cx, cz, raio, vel. angular, fase, altura
    private final java.util.ArrayList<ModelInstance> birdInst = new java.util.ArrayList<>();

    /** Trilha de terra: faixa estreita de cada fazenda até a estrada, com leve curva. */
    private void addTrailsCracksBirds(Random rnd) {
        ModelBuilder mb = new ModelBuilder();
        mb.begin();
        MeshPartBuilder tr = mb.part("trail", GL20.GL_TRIANGLES, Usage.Position | Usage.Normal | Usage.ColorPacked,
                new Material(ColorAttribute.createDiffuse(1f, 1f, 1f, 1f)));
        for (int f = 0; f < Regions.FARM_X.length; f++) {
            float fx = Regions.FARM_X[f], fz = Regions.FARM_Z[f];
            float rx = fx, rz = roadZ(fx);
            int n = 80;
            for (int i = 0; i < n; i++) {
                float t0 = i / (float) n, t1 = (i + 1) / (float) n;
                float x0 = MathUtils.lerp(fx, rx, t0) + 6f * MathUtils.sin(t0 * MathUtils.PI2 + f);
                float z0 = MathUtils.lerp(fz, rz, t0);
                float x1 = MathUtils.lerp(fx, rx, t1) + 6f * MathUtils.sin(t1 * MathUtils.PI2 + f);
                float z1 = MathUtils.lerp(fz, rz, t1);
                float dx = x1 - x0, dz = z1 - z0, len = (float) Math.sqrt(dx * dx + dz * dz);
                if (len < 1e-4f) continue;
                float px = -dz / len * 1.2f, pz = dx / len * 1.2f;   // meia largura: 1,2 m
                tr.rect(trailVertex(x0 + px, z0 + pz), trailVertex(x1 + px, z1 + pz), trailVertex(x1 - px, z1 - pz), trailVertex(x0 - px, z0 - pz));
            }
            trailCount++;
        }
        Model tm = mb.end();
        loaded.add(tm);
        ModelInstance ti = new ModelInstance(tm);
        instances.add(ti);
        terrainParts.add(ti);

        // Solo rachado: manchas com a textura de rachaduras, transparentes, no sertão
        mb.begin();
        MeshPartBuilder cr = mb.part("cracks", GL20.GL_TRIANGLES, Usage.Position | Usage.Normal | Usage.TextureCoordinates,
                new Material(TextureAttribute.createDiffuse(crackTexture),
                        new com.badlogic.gdx.graphics.g3d.attributes.BlendingAttribute(GL20.GL_SRC_ALPHA, GL20.GL_ONE_MINUS_SRC_ALPHA, 0.42f)));
        for (int k = 0; k < 25; k++) {
            float[] p = spotIn(rnd, 30f, Regions.Region.SERTAO, Regions.Region.SERTAO);
            float cx = p[0], cz = p[1], h = 7f;
            cr.rect(crackVertex(cx - h, cz - h, 0f, 0f), crackVertex(cx + h, cz - h, 1f, 0f),
                    crackVertex(cx + h, cz + h, 1f, 1f), crackVertex(cx - h, cz + h, 0f, 1f));
            crackCount++;
        }
        Model cm = mb.end();
        loaded.add(cm);
        ModelInstance ci = new ModelInstance(cm);
        instances.add(ci);
        terrainParts.add(ci);

        // Pássaros (urubus) circulando alto sobre o sertão
        Model bm;
        mb.begin();
        MeshPartBuilder bp = mb.part("bird", GL20.GL_TRIANGLES, Usage.Position | Usage.Normal,
                new Material(ColorAttribute.createDiffuse(0.12f, 0.10f, 0.09f, 1f)));
        bp.box(0.25f, 0.14f, 0.8f);
        bp.setVertexTransform(new com.badlogic.gdx.math.Matrix4().translate(0f, 0.02f, 0f));
        bp.box(2.2f, 0.03f, 0.35f);
        bp.setVertexTransform(new com.badlogic.gdx.math.Matrix4());
        bm = mb.end();
        loaded.add(bm);
        for (int i = 0; i < 8; i++) {
            float[] p = spotIn(rnd, 30f, Regions.Region.SERTAO, Regions.Region.SERRA);
            float rad = 60f + rnd.nextFloat() * 100f;
            float vel = (0.12f + rnd.nextFloat() * 0.1f) * (rnd.nextBoolean() ? 1f : -1f);
            birdOrbit.add(new float[]{p[0], p[1], rad, vel, rnd.nextFloat() * MathUtils.PI2, 70f + rnd.nextFloat() * 30f});
            ModelInstance bi = new ModelInstance(bm);
            birdInst.add(bi);
            instances.add(bi);
            birdCount++;
        }
    }

    private VertexInfo trailVertex(float x, float z) {
        return new VertexInfo().setPos(x, heightAt(x, z) + 0.05f, z).setNor(0f, 1f, 0f).setCol(0.66f, 0.55f, 0.38f, 1f);
    }

    private VertexInfo crackVertex(float x, float z, float u, float v) {
        Vector3 n = normalAt(x, z);
        return new VertexInfo().setPos(x, heightAt(x, z) + 0.06f, z).setNor(n.x, n.y, n.z).setUV(u, v);
    }

    /** Pássaros: giram em círculo e ajustam a direção ao trajeto. */
    private void updateBirds(float dt) {
        for (int i = 0; i < birdOrbit.size(); i++) {
            float[] o = birdOrbit.get(i);
            o[4] += o[3] * dt;
            float x = o[0] + MathUtils.cos(o[4]) * o[2], z = o[1] + MathUtils.sin(o[4]) * o[2];
            float y = o[5] + 2f * MathUtils.sin(o[4] * 3f);
            float tx = -MathUtils.sin(o[4]) * o[3], tz = MathUtils.cos(o[4]) * o[3];   // direção do voo
            birdInst.get(i).transform.setToTranslation(x, y, z).rotate(Vector3.Y, MathUtils.atan2(tx, tz) * MathUtils.radiansToDegrees);
        }
    }

    // Currais das fazendas: cercado de 14 m com porteira de 6 m no lado sul
    int corralCount, corralFenceCount;
    float firstCorralX, firstCorralZ;

    private void addCorral(float cx, float cz, Model seg) {
        if (corralCount == 0) { firstCorralX = cx; firstCorralZ = cz; }
        float h = 7f;
        for (int i = -3; i <= 3; i++) {
            float o = 2f * i;
            placeStatic(seg, cx + o, cz + h, 0f, 1f, 0.7f);             // lado norte
            corralFenceCount++;
            if (Math.abs(i) > 1) {                                       // lado sul: porteira no meio (6 m)
                placeStatic(seg, cx + o, cz - h, 0f, 1f, 0.7f);
                corralFenceCount++;
            }
            placeStatic(seg, cx + h, cz + o, 90f, 1f, 0.7f);             // lado leste
            placeStatic(seg, cx - h, cz + o, 90f, 1f, 0.7f);             // lado oeste
            corralFenceCount += 2;
        }
        corralCount++;
    }

    /**
     * Cemitério montado com as peças importadas (cerca e portão antigos, lápides, cruzes de madeira,
     * covas, cruzeiro e caixões): um modelo só, com a colisão lida de models/cemiterio_colisao.json
     * (coordenadas do cemitério: portão em z = 0, fundo em z = 'fundo').
     */
    private void addCemetery() {
        if (!hasCem) return;
        Model m = ModelIO.load("models/cemiterio.g3dj");
        loaded.add(m);
        JsonValue j = new JsonReader().parse(Gdx.files.internal("models/cemiterio_colisao.json"));
        float depth = j.getFloat("fundo");
        float cos = MathUtils.cosDeg(cemYaw), sin = MathUtils.sinDeg(cemYaw);
        // origem do modelo (meio do portão): centro menos meio fundo, girado
        float ox = cemX - sin * depth / 2f, oz = cemZ - cos * depth / 2f;
        ModelInstance mi = new ModelInstance(m);
        mi.transform.setToTranslation(ox, cemH, oz).rotate(Vector3.Y, cemYaw);
        instances.add(mi);
        for (JsonValue c = j.get("colisao").child; c != null; c = c.next) {
            float lx = c.getFloat(0), lz = c.getFloat(1);
            float wx = ox + lx * cos + lz * sin, wz = oz - lx * sin + lz * cos;
            Obstacle o = new Obstacle(wx, wz, c.getFloat(2), cemH, c.getFloat(3));
            String k = c.getString(4);
            o.surface = k.equals("M") ? Surface.METAL : k.equals("W") ? Surface.MADEIRA : Surface.PEDRA;
            addObstacle(o);
            cemColliders++;
        }
        crossCount = j.getInt("tumulos");
    }

    /** Objeto estático com colisão circular (carroça parada, cocho, toco). */
    private void placeStatic(Model m, float x, float z, float yawDeg, float scale, float radius) {
        float y = heightAt(x, z);
        ModelInstance mi = new ModelInstance(m);
        mi.transform.setToTranslation(x, y, z).rotate(Vector3.Y, yawDeg).scale(scale, scale, scale);
        instances.add(mi);
        if (radius > 0f) addObstacle(new Obstacle(x, z, radius, y, 1.5f));
    }

    private float[] randomSpot(Random rnd, float margin) {
        float x, z;
        do {
            x = (rnd.nextFloat() * 2f - 1f) * (HALF - margin);
            z = (rnd.nextFloat() * 2f - 1f) * (HALF - margin);
        } while (Math.sqrt(x * x + z * z) < 14f || Math.abs(z - roadZ(x)) < ROAD_HALF + 6f
                || Math.abs(x - riverX(z)) < 6f || nearEnclosure(x, z) || inTown(x, z) || nearCemetery(x, z, 6f)
                || declive(x, z) > 0.45f);
        return new float[]{x, z};
    }

    /** Pedra grande num ponto escolhido, com colisão. */
    private void addRockAt(Model model, float x, float z, float scale, float radius) {
        float y = heightAt(x, z);
        ModelInstance mi = new ModelInstance(model);
        mi.transform.setToTranslation(x, y, z).scale(scale, scale, scale);
        instances.add(mi);
        Obstacle rock = new Obstacle(x, z, radius, y, 1.5f);
        rock.surface = Surface.PEDRA;
        obstacles.add(rock);
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
        float dark = MathUtils.clamp(pothole(x, z) / 0.3f, 0f, 1f) * 0.4f;   // fundo do buraco mais escuro
        Vector3 n = normalAt(x, z);
        return new VertexInfo().setPos(x, heightAt(x, z) + 0.04f, z).setNor(n.x, n.y, n.z)
                .setCol(0.50f * (1f - dark), 0.38f * (1f - dark), 0.26f * (1f - dark), 1f);
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
            p = spotIn(rnd, 6f, Regions.Region.SERTAO, Regions.Region.SERRA);
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
            p = spotIn(rnd, 8f, Regions.Region.FONTE, Regions.Region.ESTRADA);
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
        if (nearWellOrDam(x, z, 10f) || nearCemetery(x, z, 12f)) return true;
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
    /** Lugares das casas ao lado da estrada: x, z e direção (graus). Sempre longe uma da outra, porta para a estrada. */
    static float[][] casasDaEstrada() {
        final float[][] spots = {
                {-30f, 1f}, {30f, -1f}, {-90f, -1f}, {-150f, 1f}, {150f, -1f},
                {-30f, -1f}, {30f, 1f}, {-90f, 1f}, {-150f, -1f}, {150f, 1f}};   // x = 90: lugar da cidade
        float[][] out = new float[spots.length][];
        for (int i = 0; i < spots.length; i++) {
            float hx = spots[i][0], hz = roadZ(hx) + spots[i][1] * HOUSE_Z;
            if (Math.abs(hx - riverX(hz)) < 14f) hx += 22f;   // não encosta no leito do rio
            out[i] = new float[]{hx, hz, spots[i][1] > 0f ? 180f : 0f};
        }
        return out;
    }

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
        HouseDecor dec = new HouseDecor(t, yaw, stoveModel, benchModel, doorModel);
        decors.add(dec);
        instances.add(dec.stove);
        instances.add(dec.bench);
        instances.add(dec.door);
        fire.addSource(dec.flameSource(), dec.smokeSource());
        // Colisão: o fogão (2,4 m, encostado na parede) e o banco
        Vector3 s0 = new Vector3(1.8f, 0f, -2.48f).mul(t), s1 = new Vector3(3.3f, 0f, -2.48f).mul(t);
        Obstacle st0 = new Obstacle(s0.x, s0.z, 0.5f, heightAt(s0.x, s0.z), 1.3f), st1 = new Obstacle(s1.x, s1.z, 0.5f, heightAt(s1.x, s1.z), 1.3f);
        st0.surface = Surface.METAL;   // fogão a lenha de ferro
        st1.surface = Surface.METAL;
        obstacles.add(st0);
        obstacles.add(st1);
        Vector3 bc = new Vector3(HouseDecor.BENCH_X, 0f, HouseDecor.BENCH_Z).mul(t);
        obstacles.add(new Obstacle(bc.x, bc.z, 0.35f, heightAt(bc.x, bc.z), 0.6f));

        // (sem cercado: as casas ficam abertas para o battle royale)

        // Carroça decorativa ao lado da casa (parada, sem reboque): colisão só na caixa
        Matrix4 enc = new Matrix4().setToTranslation(bestX, y, bestZ).rotate(Vector3.Y, yaw);
        Vector3 c = new Vector3(6f, 0f, -3f).mul(enc);
        ModelInstance cart = new ModelInstance(cartModel);
        cart.transform.setToTranslation(c.x, heightAt(c.x, c.z), c.z).rotate(Vector3.Y, yaw).scale(1.3f, 1.3f, 1.3f);
        instances.add(cart);
        obstacles.add(new Obstacle(c.x, c.z, 1.9f, heightAt(c.x, c.z), 2.2f));
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

    public void resolveCollisions(Vector3 p, float playerRadius) {
        fences.resolveCollisions(p, playerRadius);   // arame farpado dos cercados
        for (int i = 0; i < decors.size; i++) decors.get(i).resolveDoor(p, playerRadius);   // portas fechadas
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
        // Casas da cidade feitas em código: caixa
        for (int k = 0; k < boxes.size; k++) {
            Box bx = boxes.get(k);
            Vector3 l = new Vector3(p).mul(bx.inv);
            if (l.y < -0.2f || l.y > bx.h) continue;   // só colide na altura da caixa (o teto do galpão não empurra o chão)
            float ex = bx.hx + playerRadius, ez = bx.hz + playerRadius;
            if (Math.abs(l.x) < ex && Math.abs(l.z) < ez) {
                if (ex - Math.abs(l.x) < ez - Math.abs(l.z)) l.x = l.x >= 0f ? ex : -ex;
                else l.z = l.z >= 0f ? ez : -ez;
                p.set(l).mul(bx.t);
            }
        }
        nearObstacles(p.x, p.z, playerRadius + maxObstacleRadius());
        for (int q = 0; q < near.size; q++) {
            Obstacle o = obstacles.get(near.get(q));
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
        // Cada modelo sai da memória uma única vez (alguns estão em mais de uma lista); falha num não para o resto
        java.util.Set<Model> done = java.util.Collections.newSetFromMap(new java.util.IdentityHashMap<Model, Boolean>());
        java.util.List<Model> all = new java.util.ArrayList<>();
        for (int i = 0; i < terrainModels.size; i++) all.add(terrainModels.get(i));
        all.add(casaModel);
        all.add(cartModel);
        all.add(damModel);
        all.add(guardModel);
        all.add(signModel);
        all.add(wellModel);
        all.add(stoveModel);
        all.add(benchModel);
        all.add(treeModel);
        all.add(pole);
        all.add(floorModel);
        all.add(doorModel);
        if (cactusModels != null) all.addAll(java.util.Arrays.asList(cactusModels));
        for (int i = 0; i < loaded.size; i++) all.add(loaded.get(i));
        for (Model m : all) {
            if (m != null && done.add(m)) {
                try { m.dispose(); } catch (Throwable ignored) { }
            }
        }
        disposeQuietly(town);
        disposeQuietly(airplane);
        disposeQuietly(weapons);
        disposeQuietly(items);
        disposeQuietly(fences);
        disposeQuietly(fire);
        if (crackTexture != null) crackTexture.dispose();
        if (signTexture != null) signTexture.dispose();
        if (dirtTexture != null) dirtTexture.dispose();
        for (Texture t : climaTextures.values()) t.dispose();
        climaTextures.clear();
    }

    private static void disposeQuietly(Object o) {
        try {
            if (o instanceof Town) ((Town) o).dispose();
            else if (o instanceof Airplane) ((Airplane) o).dispose();
            else if (o instanceof Weapons) ((Weapons) o).dispose();
            else if (o instanceof Items) ((Items) o).dispose();
            else if (o instanceof FenceSystem) ((FenceSystem) o).dispose();
            else if (o instanceof Fire) ((Fire) o).dispose();
        } catch (Throwable ignored) { }
    }
}
