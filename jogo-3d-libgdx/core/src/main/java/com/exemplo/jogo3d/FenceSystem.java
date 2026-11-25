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
 * Cercados de arame farpado em volta de algumas casas, com porteira de duas folhas.
 *
 * Cada folha abre e fecha sozinha. Para abrir a folha esquerda o personagem vai até ela; para a
 * direita ele tem que ir até o lado direito. Ao abrir, o personagem anda junto da ponta da folha
 * enquanto ela gira para fora (até 90°). A folha fechada bloqueia a passagem.
 */
public class FenceSystem {

    static final float ENCL_HALF_W = 10f;   // 20 m de largura (eixo X local)
    static final float ENCL_HALF_D = 8f;    // 16 m de profundidade (eixo Z local)
    static final float MODULE = 4f;         // comprimento de um trecho de cerca
    static float updateRadius = 40f; // dentro deste raio o arame é simulado (ajustado pela qualidade)
    static float renderRadius = 50f; // dentro deste raio a cerca é desenhada (ajustado pela qualidade)
    static final float WALL_MARGIN = 0.06f; // folga de colisão além do raio do jogador

    static final float LEAF = 2f;           // cada folha tem 2 m (a porteira tem 4 m)
    static final float STAND_DIST = 1.3f;   // distância do personagem até a folha durante a abertura
    static final float PROMPT_DIST = 2.4f;  // a partir daqui aparece o botão
    static final float OPEN_DEG = 90f;      // abertura final
    static final float CLEAR_DEG = 80f;     // acima disso a folha não bloqueia mais

    // Linha do tempo da operação (segundos)
    static final float T_WALK = 0.9f, T_REACH = 1.5f, T_END = 3.4f;

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

    /** Porteira de duas folhas. Folha 0 = esquerda (dobradiça em x=-2), folha 1 = direita (x=+2). */
    static final class Gate {
        final Matrix4 world = new Matrix4();
        final Matrix4 inv;
        final float yawDeg;
        final ModelInstance[] leaves;
        final float[] angle = {0f, 0f};   // graus: 0 = fechada, 90 = aberta

        Gate(Matrix4 world, float yawDeg, ModelInstance left, ModelInstance right) {
            this.world.set(world);
            this.inv = new Matrix4(world).inv();
            this.yawDeg = yawDeg;
            this.leaves = new ModelInstance[]{left, right};
            updateLeaves();
        }

        /** Dobradiça da folha, em coordenadas locais da porteira. */
        static Vector3 hinge(int leaf) {
            return new Vector3(leaf == 0 ? -LEAF : LEAF, 0f, 0f);
        }

        /** Direção da folha no ângulo a (graus). A folha fechada aponta para o centro. */
        static Vector3 dir(int leaf, float a) {
            float r = a * MathUtils.degreesToRadians;
            return new Vector3(leaf == 0 ? MathUtils.cos(r) : -MathUtils.cos(r), 0f, MathUtils.sin(r));
        }

        /** Normal da folha pelo lado de fora da porteira (+z quando fechada). */
        static Vector3 normal(int leaf, float a) {
            Vector3 d = dir(leaf, a);
            return leaf == 0 ? new Vector3(-d.z, 0f, d.x) : new Vector3(d.z, 0f, -d.x);
        }

        /** Ponto no meio da folha (onde o personagem alcança). */
        static Vector3 mid(int leaf, float a) {
            return hinge(leaf).add(dir(leaf, a).scl(LEAF / 2f));
        }

        /** Ponto local da ponta livre da folha. */
        static Vector3 tip(int leaf, float a) {
            return hinge(leaf).add(dir(leaf, a).scl(LEAF));
        }

        Vector3 toWorld(Vector3 local) {
            return new Vector3(local).mul(world);
        }

        void updateLeaves() {
            for (int i = 0; i < 2; i++) {
                Vector3 h = hinge(i);
                // Folha esquerda: a geometria aponta para +x; direita: gira 180° para apontar para -x
                float rot = i == 0 ? -angle[i] : 180f + angle[i];
                leaves[i].transform.set(world).translate(h.x, h.y, h.z).rotate(Vector3.Y, rot);
            }
        }

        Vector3 latchWorld(int leaf) {
            return toWorld(mid(leaf, angle[leaf]));
        }
    }

    /** Opção mostrada na tela: abrir ou fechar uma folha, perto dela. */
    static final class Prompt {
        final Gate gate;
        final int leaf;
        final boolean open;

        Prompt(Gate gate, int leaf, boolean open) {
            this.gate = gate;
            this.leaf = leaf;
            this.open = open;
        }

        String label() {
            String lado = leaf == 0 ? "ESQUERDO" : "DIREITO";
            return (open ? "FECHAR" : "ABRIR") + " LADO " + lado;
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

    // Operação em andamento (uma folha por vez)
    private Gate activeGate = null;
    private int activeLeaf = 0;
    private float opFrom, opTo, opT, opSide, opReach, opFacing;
    private final Vector3 opStart = new Vector3();

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

    /** Porteira no vão central da frente, com as duas folhas fechadas. */
    private void addGate(World world, Matrix4 enclosure, float yawDeg) {
        Vector3 c = tmpA.set(0f, 0f, ENCL_HALF_D).mul(enclosure);
        float y = world.heightAt(c.x, c.z);
        Matrix4 gw = new Matrix4().setToTranslation(c.x, y, c.z).rotate(Vector3.Y, yawDeg);
        gates.add(new Gate(gw, yawDeg, new ModelInstance(leafPadlockModel), new ModelInstance(leafModel)));
    }

    // ---------- Porteira: interação ----------

    /** Botão a mostrar perto de uma folha (abrir se fechada, fechar se aberta), ou null. */
    public Prompt nearPrompt(Vector3 p) {
        if (activeGate != null) return null;
        Prompt best = null;
        float bestD = PROMPT_DIST * PROMPT_DIST;
        for (int g = 0; g < gates.size; g++) {
            Gate gate = gates.get(g);
            for (int leaf = 0; leaf < 2; leaf++) {
                Vector3 m = gate.latchWorld(leaf);
                float dx = p.x - m.x, dz = p.z - m.z;
                float d = dx * dx + dz * dz;
                if (d < bestD) {
                    bestD = d;
                    best = new Prompt(gate, leaf, gate.angle[leaf] >= CLEAR_DEG);
                }
            }
        }
        return best;
    }

    // Som da porteira: toca quando a folha começa a girar
    private static com.badlogic.gdx.audio.Sound gateSound;
    private static boolean gateSoundLoaded = false;
    private boolean gateSoundPlayed = false;

    private static void playGateSound() {
        if (!gateSoundLoaded) {
            gateSoundLoaded = true;
            try {
                gateSound = com.badlogic.gdx.Gdx.audio.newSound(com.badlogic.gdx.Gdx.files.internal("audio/porteira.mp3"));
            } catch (RuntimeException e) {
                gateSound = null;   // sem som: o jogo continua
            }
        }
        if (gateSound != null) gateSound.play(0.9f);
    }

    /** Começa a operação da folha escolhida: o personagem vai até ela e a move. */
    public void startOperation(Prompt pr, Player player) {
        if (activeGate != null) return;
        Gate g = pr.gate;
        activeGate = g;
        activeLeaf = pr.leaf;
        opFrom = g.angle[pr.leaf];
        opTo = pr.open ? 0f : OPEN_DEG;
        opT = 0f;
        opReach = 0f;
        gateSoundPlayed = false;
        // Fica do lado em que o personagem está
        Vector3 rel = tmpB.set(player.pos).mul(g.inv);
        Vector3 n = Gate.normal(pr.leaf, opFrom);
        opSide = (rel.x * n.x + rel.z * n.z) >= 0f ? 1f : -1f;
        opStart.set(player.pos);
        opFacing = player.facing;
    }

    public boolean isBusy() {
        return activeGate != null;
    }

    /** Braço esticado nesta hora (0..1), para o personagem. */
    public float reach() {
        return activeGate != null ? opReach : 0f;
    }

    /** Ponto em que o personagem fica, ao lado da folha no ângulo a (mundo). */
    private Vector3 standWorld(Gate g, int leaf, float a) {
        Vector3 local = Gate.mid(leaf, a).add(Gate.normal(leaf, a).scl(STAND_DIST * opSide));
        return g.toWorld(local);
    }

    private void advance(float dt, Player player) {
        Gate g = activeGate;
        int leaf = activeLeaf;
        opT += dt;
        if (!gateSoundPlayed && opT >= T_REACH) {
            gateSoundPlayed = true;
            playGateSound();
        }

        // Caminha até a folha, do lado em que estava
        float walk = smooth(Math.min(opT / T_WALK, 1f));
        Vector3 target = standWorld(g, leaf, opFrom);
        Vector3 pos = (opT < T_WALK) ? tmpC.set(opStart).lerp(target, walk) : null;

        // Folha: fica parada, depois gira enquanto o personagem acompanha a ponta
        float a;
        if (opT < T_REACH) a = opFrom;
        else a = opFrom + (opTo - opFrom) * smooth(Math.min((opT - T_REACH) / (T_END - T_REACH), 1f));
        g.angle[leaf] = a;
        g.updateLeaves();

        if (pos == null) pos = standWorld(g, leaf, a);   // acompanha a folha enquanto ela abre
        player.pos.set(pos);
        player.pos.y = worldRef.heightAt(player.pos.x, player.pos.z);

        // Olha para o meio da folha
        Vector3 mid = g.latchWorld(leaf);
        float fx = mid.x - player.pos.x, fz = mid.z - player.pos.z;
        float facing = MathUtils.atan2(fx, fz);
        player.facing = facing;
        player.speed = 0f;
        player.grounded = true;

        // Braço: estica até a folha, segura enquanto ela gira, depois solta
        if (opT < T_WALK) opReach = 0f;
        else if (opT < T_REACH) opReach = smooth((opT - T_WALK) / (T_REACH - T_WALK));
        else if (opT < T_END - 0.5f) opReach = 1f;
        else opReach = 1f - smooth(Math.min((opT - (T_END - 0.5f)) / 0.5f, 1f));

        if (opT >= T_END) {
            g.angle[leaf] = opTo;
            g.updateLeaves();
            activeGate = null;
            opReach = 0f;
        }
    }

    // ---------- Loop ----------

    /** Atualiza a operação (se houver), os trechos perto do jogador e a lista do que será desenhado. */
    public void update(float dt, Player player) {
        if (activeGate != null) advance(dt, player);

        visible.clear();
        for (int i = 0; i < pieces.size; i++) {
            Piece p = pieces.get(i);
            float dx = p.x - player.pos.x, dz = p.z - player.pos.z;
            float d2 = dx * dx + dz * dz;
            if (d2 < updateRadius * updateRadius) p.fence.update(dt);
            if (d2 < renderRadius * renderRadius) visible.addAll(p.fence.instances);
        }
        for (int i = 0; i < gates.size; i++) {
            visible.add(gates.get(i).leaves[0]);
            visible.add(gates.get(i).leaves[1]);
        }
    }

    /** Desenha a cerca visível (chame dentro de modelBatch.begin/end). */
    public void render(ModelBatch batch, Environment environment) {
        batch.render(visible, environment);
    }

    /** Empurra o jogador (círculo no plano XZ) para fora dos trechos e das folhas fechadas. */
    /** Verdadeiro se o ponto está encostado num trecho de cerca (para a câmera não atravessar). */
    public boolean blocks(Vector3 p) {
        for (int i = 0; i < segments.size; i++) {
            float[] s = segments.get(i);
            float sx = s[2] - s[0], sz = s[3] - s[1];
            float len2 = sx * sx + sz * sz;
            if (len2 < 1e-9f) continue;
            float t = Math.max(0f, Math.min(1f, ((p.x - s[0]) * sx + (p.z - s[1]) * sz) / len2));
            float dx = p.x - (s[0] + sx * t), dz = p.z - (s[1] + sz * t);
            if (dx * dx + dz * dz < 0.15f * 0.15f && p.y < 1.8f) return true;
        }
        return false;
    }

    public void resolveCollisions(Vector3 p, float playerRadius) {
        float min = playerRadius + WALL_MARGIN;
        for (int i = 0; i < segments.size; i++) {
            float[] s = segments.get(i);
            pushOut(p, s[0], s[1], s[2], s[3], min);
        }
        for (int g = 0; g < gates.size; g++) {
            Gate gate = gates.get(g);
            for (int leaf = 0; leaf < 2; leaf++) {
                Vector3 a = gate.toWorld(Gate.hinge(leaf));
                Vector3 b = gate.toWorld(Gate.tip(leaf, gate.angle[leaf]));
                pushOut(p, a.x, a.z, b.x, b.z, min);
            }
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

    /** Folha da porteira em coordenadas locais: dobradiça na origem, folha de 2 m para +x. */
    private static Model buildLeafModel(boolean padlock) {
        ModelBuilder mb = new ModelBuilder();
        mb.begin();
        MeshPartBuilder pb = mb.part("madeira", GL20.GL_TRIANGLES, Usage.Position | Usage.Normal,
                new Material(ColorAttribute.createDiffuse(0.36f, 0.24f, 0.13f, 1f)));
        for (float y : new float[]{0.25f, 0.75f, 1.25f}) {
            pb.box(LEAF / 2f, y, 0f, LEAF, 0.07f, 0.06f);
        }
        for (float x : new float[]{0.1f, 0.55f, 1.0f, 1.45f, 1.9f}) {
            pb.box(x, 0.75f, 0f, 0.06f, 1.5f, 0.06f);
        }
        if (padlock) {
            MeshPartBuilder pl = mb.part("cadeado", GL20.GL_TRIANGLES, Usage.Position | Usage.Normal,
                    new Material(ColorAttribute.createDiffuse(0.62f, 0.5f, 0.22f, 1f)));
            pl.box(1.9f, 1.0f, 0.09f, 0.12f, 0.14f, 0.07f);
        }
        return mb.end();
    }
}
