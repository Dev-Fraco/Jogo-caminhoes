package com.exemplo.jogo3d;

import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.graphics.GL20;
import com.badlogic.gdx.graphics.VertexAttributes.Usage;
import com.badlogic.gdx.graphics.g3d.Environment;
import com.badlogic.gdx.graphics.g3d.Material;
import com.badlogic.gdx.graphics.g3d.Model;
import com.badlogic.gdx.graphics.g3d.ModelBatch;
import com.badlogic.gdx.graphics.g3d.ModelInstance;
import com.badlogic.gdx.graphics.g3d.attributes.ColorAttribute;
import com.badlogic.gdx.graphics.g3d.loader.G3dModelLoader;
import com.badlogic.gdx.graphics.g3d.utils.MeshPartBuilder;
import com.badlogic.gdx.graphics.g3d.utils.ModelBuilder;
import com.badlogic.gdx.math.Matrix4;
import com.badlogic.gdx.math.Vector3;
import com.badlogic.gdx.utils.Array;
import com.badlogic.gdx.utils.JsonReader;

/**
 * Cercados de arame farpado em volta das casas, com porteira.
 *
 * Cada cercado é um retângulo de 20 m x 16 m (espaço para os animais), feito com trechos de 4 m.
 * A casa fica no centro; a porteira fica no lado da frente (+z local), onde está a porta.
 * O cercado inteiro gira junto (yaw em múltiplos de 90°).
 *
 * - desenha só os trechos perto do jogador (simulação e desenho), para não pesar no celular;
 * - o jogador colide com os trechos (a porteira fica aberta, sem colisão);
 * - as porteiras são modelos próprios (duas folhas abertas para fora), feitos em código.
 */
public class FenceSystem {

    static final float ENCL_HALF_W = 10f;   // 20 m de largura (eixo X local)
    static final float ENCL_HALF_D = 8f;    // 16 m de profundidade (eixo Z local)
    static final float MODULE = 4f;         // comprimento de um trecho de cerca
    static final float UPDATE_RADIUS = 40f; // dentro deste raio o arame é simulado
    static final float RENDER_RADIUS = 50f; // dentro deste raio a cerca é desenhada
    static final float WALL_MARGIN = 0.06f; // folga de colisão além do raio do jogador

    /** Trecho de cerca com sua posição no mundo (para decidir se simula e desenha). */
    static final class Piece {
        final BarbedWireFence fence;
        final float x, z;

        Piece(BarbedWireFence fence, float x, float z) {
            this.fence = fence;
            this.x = x;
            this.z = z;
        }
    }

    private Model baseModel;
    private Model gateModel;
    private final Array<Piece> pieces = new Array<>();
    private final Array<ModelInstance> gates = new Array<>();
    private final Array<float[]> segments = new Array<>();   // {ax, az, bx, bz} no mundo
    private final Array<ModelInstance> visible = new Array<>();
    private final Matrix4 tmpMatrix = new Matrix4();
    private final Vector3 tmpA = new Vector3();
    private final Vector3 tmpB = new Vector3();

    /** Carrega os modelos (uma vez). */
    public void create() {
        baseModel = new G3dModelLoader(new JsonReader()).loadModel(Gdx.files.internal("models/cerca_base.g3dj"));
        gateModel = buildGateModel();
    }

    /**
     * Cria um cercado de 20 m x 16 m centrado em (ex, ez), girado em yawDeg.
     * O terreno de cada trecho é seguido pela altura do mundo.
     */
    public void addEnclosure(World world, float ex, float ez, float yawDeg) {
        Matrix4 enclosure = new Matrix4().setToTranslation(ex, 0f, ez).rotate(Vector3.Y, yawDeg);

        // Lados: frente (+z, com porteira no centro), fundo (-z), esquerda e direita (-x e +x)
        for (int i = -2; i <= 2; i++) {
            float lx = i * MODULE;
            if (i == 0) addGate(world, enclosure, lx, ENCL_HALF_D, yawDeg);
            else addPiece(world, enclosure, lx, ENCL_HALF_D, yawDeg, 0f);
            addPiece(world, enclosure, lx, -ENCL_HALF_D, yawDeg, 0f);
        }
        for (int i = -1; i <= 1; i += 2) {
            float lz = i * 6f, lz2 = i * 2f;
            addPiece(world, enclosure, -ENCL_HALF_W, lz, yawDeg, -90f);
            addPiece(world, enclosure, ENCL_HALF_W, lz, yawDeg, -90f);
            addPiece(world, enclosure, -ENCL_HALF_W, lz2, yawDeg, -90f);
            addPiece(world, enclosure, ENCL_HALF_W, lz2, yawDeg, -90f);
        }
    }

    private void addPiece(World world, Matrix4 enclosure, float lx, float lz, float yawDeg, float localYaw) {
        Vector3 c = tmpA.set(lx, 0f, lz).mul(enclosure);
        float y = world.heightAt(c.x, c.z);
        float worldYaw = yawDeg + localYaw;
        BarbedWireFence fence = new BarbedWireFence(baseModel, c.x, y, c.z, worldYaw);
        pieces.add(new Piece(fence, c.x, c.z));

        // Colisão: o trecho inteiro, de um mourão ao outro
        Matrix4 m = new Matrix4().setToTranslation(c.x, y, c.z).rotate(Vector3.Y, worldYaw);
        Vector3 a = new Vector3(-MODULE / 2f, 0f, 0f).mul(m);
        Vector3 b = new Vector3(MODULE / 2f, 0f, 0f).mul(m);
        segments.add(new float[]{a.x, a.z, b.x, b.z});
    }

    /** Porteira no vão central da frente: duas folhas abertas para fora, passagem livre de 4 m. */
    private void addGate(World world, Matrix4 enclosure, float lx, float lz, float yawDeg) {
        Vector3 c = tmpA.set(lx, 0f, lz).mul(enclosure);
        float y = world.heightAt(c.x, c.z);
        Matrix4 m = new Matrix4().setToTranslation(c.x, y, c.z).rotate(Vector3.Y, yawDeg);
        ModelInstance gate = new ModelInstance(gateModel);
        gate.transform.set(m);
        gates.add(gate);
    }

    /** Atualiza só os trechos perto do jogador e prepara a lista do que será desenhado. */
    public void update(float dt, Vector3 player) {
        visible.clear();
        for (int i = 0; i < pieces.size; i++) {
            Piece p = pieces.get(i);
            float dx = p.x - player.x, dz = p.z - player.z;
            float d2 = dx * dx + dz * dz;
            if (d2 < UPDATE_RADIUS * UPDATE_RADIUS) p.fence.update(dt);
            if (d2 < RENDER_RADIUS * RENDER_RADIUS) visible.addAll(p.fence.instances);
        }
        visible.addAll(gates);
    }

    /** Desenha a cerca visível (chame dentro de modelBatch.begin/end). */
    public void render(ModelBatch batch, Environment environment) {
        batch.render(visible, environment);
    }

    /** Empurra o jogador (círculo no plano XZ) para fora dos trechos de cerca. */
    public void resolveCollisions(Vector3 p, float playerRadius) {
        float min = playerRadius + WALL_MARGIN;
        for (int i = 0; i < segments.size; i++) {
            float[] s = segments.get(i);
            float sx = s[2] - s[0], sz = s[3] - s[1];
            float len2 = sx * sx + sz * sz;
            float t = ((p.x - s[0]) * sx + (p.z - s[1]) * sz) / len2;
            t = Math.max(0f, Math.min(1f, t));
            float qx = s[0] + sx * t, qz = s[1] + sz * t;
            float dx = p.x - qx, dz = p.z - qz;
            float d2 = dx * dx + dz * dz;
            if (d2 >= min * min) continue;
            float d = (float) Math.sqrt(d2);
            if (d < 1e-5f) {
                // Jogador exatamente sobre o trecho: empurra para o lado normal do trecho
                float nl = (float) Math.sqrt(len2);
                dx = -sz / nl;
                dz = sx / nl;
                d = 1f;
            } else {
                dx /= d;
                dz /= d;
            }
            p.x = qx + dx * min;
            p.z = qz + dz * min;
        }
    }

    public int pieceCount() {
        return pieces.size;
    }

    public void dispose() {
        for (int i = 0; i < pieces.size; i++) pieces.get(i).fence.dispose();
        pieces.clear();
        if (baseModel != null) baseModel.dispose();
        if (gateModel != null) gateModel.dispose();
    }

    /** Porteira em coordenadas locais: vão de 4 m em X, folhas de 2 m para +z (fora do cercado). */
    private static Model buildGateModel() {
        ModelBuilder mb = new ModelBuilder();
        mb.begin();
        MeshPartBuilder pb = mb.part("porteira", GL20.GL_TRIANGLES, Usage.Position | Usage.Normal,
                new Material(ColorAttribute.createDiffuse(0.36f, 0.24f, 0.13f, 1f)));
        float[] hinges = {-MODULE / 2f + 0.05f, MODULE / 2f - 0.05f};
        for (float hx : hinges) {
            // Travessas horizontais ao longo da folha (eixo Z)
            for (float y : new float[]{0.25f, 0.75f, 1.25f}) {
                pb.box(hx, y, 1f, 0.06f, 0.07f, 2f);
            }
            // Ripas verticais
            for (float z : new float[]{0.1f, 0.55f, 1.0f, 1.45f, 1.9f}) {
                pb.box(hx, 0.75f, z, 0.06f, 1.5f, 0.06f);
            }
        }
        return mb.end();
    }
}
