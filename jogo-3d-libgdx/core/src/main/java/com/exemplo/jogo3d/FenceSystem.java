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
import com.badlogic.gdx.math.MathUtils;
import com.badlogic.gdx.math.Matrix4;
import com.badlogic.gdx.math.Vector3;
import com.badlogic.gdx.utils.Array;
import com.badlogic.gdx.utils.JsonReader;

/**
 * Cercados de arame farpado em volta das casas, com porteira.
 *
 * Cada cercado é um retângulo de 20 m x 16 m, com trechos de 4 m. A porteira fica no lado da
 * frente (+z local, onde está a porta da casa) e começa FECHADA: as folhas bloqueiam a passagem.
 * Perto dela aparece o botão ABRIR PORTEIRA. Ao tocar, o personagem vai até a porteira, estica
 * o braço até o cadeado e puxa: as folhas abrem para fora até 90 graus.
 */
public class FenceSystem {

    static final float ENCL_HALF_W = 10f;   // 20 m de largura (eixo X local)
    static final float ENCL_HALF_D = 8f;    // 16 m de profundidade (eixo Z local)
    static final float MODULE = 4f;         // comprimento de um trecho de cerca
    static final float UPDATE_RADIUS = 40f; // dentro deste raio o arame é simulado
    static final float RENDER_RADIUS = 50f; // dentro deste raio a cerca é desenhada
    static final float WALL_MARGIN = 0.06f; // folga de colisão além do raio do jogador

    static final float GATE_LEAF = 2f;      // cada folha tem 2 m (a porteira tem 4 m)
    static final float STAND_DIST = 1.3f;   // distância do personagem até a porteira ao abrir
    static final float PROMPT_DIST = 2.4f;  // a partir daqui aparece o botão
    static final float OPEN_DEG = 90f;      // abertura final
    static final float CLEAR_DEG = 80f;     // acima disso as folhas não bloqueiam mais
    static final Vector3 LATCH_LOCAL = new Vector3(1.9f, 1.0f, 0.09f); // cadeado na ponta da folha esquerda

    // Linha do tempo da abertura (segundos)
    static final float T_WALK = 0.8f, T_REACH = 1.4f, T_PULL = 2.6f, T_END = 3.0f;

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

    /** Porteira: duas folhas que giram em torno das dobradiças nas extremidades do vão. */
    static final class Gate {
        final Matrix4 world = new Matrix4();
        final Matrix4 inv;
        final float cx, cy, cz, yawDeg;
        final ModelInstance left, right;
        float angle = 0f;     // graus: 0 = fechada, 90 = totalmente aberta
        int state = 0;        // 0 fechada, 1 abrindo, 2 aberta
        float t = 0f;
        float reach = 0f;     // 0..1: quanto o braço está esticado
        float side = 1f;      // +1 se o jogador abriu pelo lado de fora, -1 pelo lado de dentro
        float startFacing = 0f;
        final Vector3 start = new Vector3();

        Gate(Matrix4 world, float cx, float cy, float cz, float yawDeg, ModelInstance left, ModelInstance right) {
            this.world.set(world);
            this.inv = new Matrix4(world).inv();
            this.cx = cx;
            this.cy = cy;
            this.cz = cz;
            this.yawDeg = yawDeg;
            this.left = left;
            this.right = right;
            updateLeaves();
        }

        void updateLeaves() {
            left.transform.set(world).translate(-GATE_LEAF, 0f, 0f).rotate(Vector3.Y, -angle);
            right.transform.set(world).translate(GATE_LEAF, 0f, 0f).rotate(Vector3.Y, 180f + angle);
        }

        Vector3 latch() {
            return new Vector3(LATCH_LOCAL).mul(left.transform);
        }
    }

    private World worldRef;
    private Model baseModel;
    private Model leafModel;
    private Model leafPadlockModel;
    private final Array<Piece> pieces = new Array<>();
    private final Array<Gate> gates = new Array<>();
    private final Array<float[]> segments = new Array<>();   // {ax, az, bx, bz} no mundo, trechos fixos
    private final Array<ModelInstance> visible = new Array<>();
    private Gate active = null;
    private final Vector3 tmpA = new Vector3();
    private final Vector3 tmpB = new Vector3();
    private final Vector3 tmpC = new Vector3();

    /** Carrega os modelos (uma vez). */
    public void create() {
        baseModel = new G3dModelLoader(new JsonReader()).loadModel(Gdx.files.internal("models/cerca_base.g3dj"));
        leafModel = buildLeafModel(false);
        leafPadlockModel = buildLeafModel(true);
    }

    /**
     * Cria um cercado de 20 m x 16 m centrado em (ex, ez), girado em yawDeg.
     * O terreno de cada trecho é seguido pela altura do mundo.
     */
    public void addEnclosure(World world, float ex, float ez, float yawDeg) {
        worldRef = world;
        Matrix4 enclosure = new Matrix4().setToTranslation(ex, 0f, ez).rotate(Vector3.Y, yawDeg);

        // Frente (+z, com porteira no centro), fundo (-z)
        for (int i = -2; i <= 2; i++) {
            float lx = i * MODULE;
            if (i == 0) addGate(world, enclosure, yawDeg);
            else addPiece(world, enclosure, lx, ENCL_HALF_D, yawDeg, 0f);
            addPiece(world, enclosure, lx, -ENCL_HALF_D, yawDeg, 0f);
        }
        // Laterais (-x e +x), 4 trechos cada
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

    /** Porteira no vão central da frente, fechada. */
    private void addGate(World world, Matrix4 enclosure, float yawDeg) {
        Vector3 c = tmpA.set(0f, 0f, ENCL_HALF_D).mul(enclosure);
        float y = world.heightAt(c.x, c.z);
        Matrix4 gw = new Matrix4().setToTranslation(c.x, y, c.z).rotate(Vector3.Y, yawDeg);
        ModelInstance left = new ModelInstance(leafPadlockModel);
        ModelInstance right = new ModelInstance(leafModel);
        gates.add(new Gate(gw, c.x, y, c.z, yawDeg, left, right));
    }

    // ---------- Porteira: interação ----------

    /** Porteira fechada perto do jogador (para mostrar o botão), ou null. */
    public Gate nearClosedGate(Vector3 p) {
        Gate best = null;
        float bestD = PROMPT_DIST * PROMPT_DIST;
        for (int i = 0; i < gates.size; i++) {
            Gate g = gates.get(i);
            if (g.state != 0) continue;
            Vector3 l = g.latch();
            float dx = p.x - l.x, dz = p.z - l.z;
            float d = dx * dx + dz * dz;
            if (d < bestD) { bestD = d; best = g; }
        }
        return best;
    }

    /** Começa a abertura: o personagem vai até a porteira pelo lado em que está. */
    public void startOpening(Gate g, Player player) {
        if (active != null || g.state != 0) return;
        tmpB.set(player.pos).mul(g.inv);
        g.side = tmpB.z >= 0f ? 1f : -1f;
        g.start.set(player.pos);
        g.startFacing = player.facing;
        g.t = 0f;
        g.state = 1;
        active = g;
    }

    public boolean isBusy() {
        return active != null;
    }

    /** Braço esticado nesta hora (0..1), para o personagem. */
    public float reach() {
        return active != null ? active.reach : 0f;
    }

    /** Dentro da abertura: move o jogador, estica o braço e gira as folhas. */
    private void advance(float dt, Player player) {
        Gate g = active;
        g.t += dt;
        float yawRad = g.yawDeg * MathUtils.degreesToRadians;
        float targetFacing = yawRad + (g.side > 0f ? MathUtils.PI : 0f);

        // Caminha até o ponto em frente à porteira, do lado em que estava
        float walk = smooth(Math.min(g.t / T_WALK, 1f));
        tmpC.set(0f, 0f, g.side * STAND_DIST).mul(g.world);
        tmpB.set(g.start).lerp(tmpC, walk);
        player.pos.set(tmpB);
        player.pos.y = worldRef.heightAt(player.pos.x, player.pos.z);
        player.facing = g.startFacing + wrapAngle(targetFacing - g.startFacing) * walk;
        player.speed = 0f;
        player.grounded = true;

        // Braço: estica até o cadeado, segura enquanto puxa, depois solta
        if (g.t < T_WALK) g.reach = 0f;
        else if (g.t < T_REACH) g.reach = smooth((g.t - T_WALK) / (T_REACH - T_WALK));
        else if (g.t < T_PULL) g.reach = 1f;
        else g.reach = 1f - smooth(Math.min((g.t - T_PULL) / (T_END - T_PULL), 1f));

        // Folhas: abrem para fora depois que o cadeado foi puxado
        if (g.t < T_REACH) g.angle = 0f;
        else g.angle = OPEN_DEG * smooth(Math.min((g.t - T_REACH) / (T_END - T_REACH), 1f));
        g.updateLeaves();

        if (g.t >= T_END) {
            g.state = 2;
            g.angle = OPEN_DEG;
            g.reach = 0f;
            g.updateLeaves();
            active = null;
        }
    }

    // ---------- Loop ----------

    /** Atualiza a abertura (se houver), os trechos perto do jogador e prepara a lista do que será desenhado. */
    public void update(float dt, Player player) {
        if (active != null) advance(dt, player);

        visible.clear();
        for (int i = 0; i < pieces.size; i++) {
            Piece p = pieces.get(i);
            float dx = p.x - player.pos.x, dz = p.z - player.pos.z;
            float d2 = dx * dx + dz * dz;
            if (d2 < UPDATE_RADIUS * UPDATE_RADIUS) p.fence.update(dt);
            if (d2 < RENDER_RADIUS * RENDER_RADIUS) visible.addAll(p.fence.instances);
        }
        for (int i = 0; i < gates.size; i++) {
            visible.add(gates.get(i).left);
            visible.add(gates.get(i).right);
        }
    }

    /** Desenha a cerca visível (chame dentro de modelBatch.begin/end). */
    public void render(ModelBatch batch, Environment environment) {
        batch.render(visible, environment);
    }

    /** Empurra o jogador (círculo no plano XZ) para fora dos trechos e das folhas fechadas. */
    public void resolveCollisions(Vector3 p, float playerRadius) {
        float min = playerRadius + WALL_MARGIN;
        for (int i = 0; i < segments.size; i++) {
            float[] s = segments.get(i);
            pushOut(p, s[0], s[1], s[2], s[3], min);
        }
        for (int i = 0; i < gates.size; i++) {
            Gate g = gates.get(i);
            if (g.angle >= CLEAR_DEG) continue;
            float r = g.angle * MathUtils.degreesToRadians;
            // Folha esquerda: da dobradiça (-2,0) para +z conforme abre
            tmpA.set(-GATE_LEAF, 0f, 0f).mul(g.world);
            tmpB.set(-GATE_LEAF + GATE_LEAF * MathUtils.cos(r), 0f, GATE_LEAF * MathUtils.sin(r)).mul(g.world);
            pushOut(p, tmpA.x, tmpA.z, tmpB.x, tmpB.z, min);
            // Folha direita: da dobradiça (+2,0)
            tmpA.set(GATE_LEAF, 0f, 0f).mul(g.world);
            tmpB.set(GATE_LEAF - GATE_LEAF * MathUtils.cos(r), 0f, GATE_LEAF * MathUtils.sin(r)).mul(g.world);
            pushOut(p, tmpA.x, tmpA.z, tmpB.x, tmpB.z, min);
        }
    }

    private static void pushOut(Vector3 p, float ax, float az, float bx, float bz, float min) {
        float sx = bx - ax, sz = bz - az;
        float len2 = sx * sx + sz * sz;
        if (len2 < 1e-9f) return;
        float t = ((p.x - ax) * sx + (p.z - az) * sz) / len2;
        t = Math.max(0f, Math.min(1f, t));
        float qx = ax + sx * t, qz = az + sz * t;
        float dx = p.x - qx, dz = p.z - qz;
        float d2 = dx * dx + dz * dz;
        if (d2 >= min * min) return;
        float d = (float) Math.sqrt(d2);
        if (d < 1e-5f) {
            // Jogador exatamente sobre o trecho: empurra para o lado normal do trecho
            float nl = (float) Math.sqrt(len2);
            dx = -sz / nl;
            dz = sx / nl;
        } else {
            dx /= d;
            dz /= d;
        }
        p.x = qx + dx * min;
        p.z = qz + dz * min;
    }

    public void dispose() {
        for (int i = 0; i < pieces.size; i++) pieces.get(i).fence.dispose();
        pieces.clear();
        if (baseModel != null) baseModel.dispose();
        if (leafModel != null) leafModel.dispose();
        if (leafPadlockModel != null) leafPadlockModel.dispose();
    }

    private static float smooth(float x) {
        x = MathUtils.clamp(x, 0f, 1f);
        return x * x * (3f - 2f * x);
    }

    private static float wrapAngle(float a) {
        while (a > MathUtils.PI) a -= MathUtils.PI2;
        while (a < -MathUtils.PI) a += MathUtils.PI2;
        return a;
    }

    /** Folha da porteira em coordenadas locais: dobradiça na origem, folha de 2 m para +x. */
    private static Model buildLeafModel(boolean padlock) {
        ModelBuilder mb = new ModelBuilder();
        mb.begin();
        MeshPartBuilder pb = mb.part("madeira", GL20.GL_TRIANGLES, Usage.Position | Usage.Normal,
                new Material(ColorAttribute.createDiffuse(0.36f, 0.24f, 0.13f, 1f)));
        // Travessas ao longo da folha e ripas verticais
        for (float y : new float[]{0.25f, 0.75f, 1.25f}) {
            pb.box(GATE_LEAF / 2f, y, 0f, GATE_LEAF, 0.07f, 0.06f);
        }
        for (float x : new float[]{0.1f, 0.55f, 1.0f, 1.45f, 1.9f}) {
            pb.box(x, 0.75f, 0f, 0.06f, 1.5f, 0.06f);
        }
        if (padlock) {
            MeshPartBuilder pl = mb.part("cadeado", GL20.GL_TRIANGLES, Usage.Position | Usage.Normal,
                    new Material(ColorAttribute.createDiffuse(0.62f, 0.5f, 0.22f, 1f)));
            pl.box(LATCH_LOCAL.x, LATCH_LOCAL.y, LATCH_LOCAL.z, 0.12f, 0.14f, 0.07f);
        }
        return mb.end();
    }
}
