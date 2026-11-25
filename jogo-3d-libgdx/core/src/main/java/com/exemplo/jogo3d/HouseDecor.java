package com.exemplo.jogo3d;

import com.badlogic.gdx.graphics.GL20;
import com.badlogic.gdx.graphics.VertexAttributes.Usage;
import com.badlogic.gdx.graphics.g3d.Material;
import com.badlogic.gdx.graphics.g3d.Model;
import com.badlogic.gdx.graphics.g3d.ModelInstance;
import com.badlogic.gdx.graphics.g3d.attributes.ColorAttribute;
import com.badlogic.gdx.graphics.g3d.utils.MeshPartBuilder;
import com.badlogic.gdx.graphics.g3d.utils.ModelBuilder;
import com.badlogic.gdx.graphics.g3d.utils.MeshPartBuilder.VertexInfo;
import com.badlogic.gdx.math.MathUtils;
import com.badlogic.gdx.math.Matrix4;
import com.badlogic.gdx.math.Vector3;

/**
 * Enfeites de uma casa: fogão de lenha encostado na parede de fundo (com fogo e fumaça),
 * rede armada de parede a parede, banco do lado de fora e porta de madeira com botão para abrir.
 *
 * Coordenadas da casa: frente = +z (porta), parede de fundo em z = -2,85 (lado de dentro),
 * paredes laterais em x = ±3,85, parede da frente em z = 2,85. Porta: vão de x -2,5 a -1,25.
 */
final class HouseDecor {

    // Porta
    static final float DOOR_HINGE_X = -2.5f, DOOR_Z = 3.02f, DOOR_W = 1.25f, DOOR_H = 2.2f;
    static final float DOOR_SPEED = 90f / 0.8f;    // graus por segundo
    static final float OPEN_DEG = 90f, CLEAR_DEG = 80f;
    // Rede e deitar
    // Centro da rede na casa: longe do fogão (parede de fundo) e no meio do cômodo
    static final float HAMMOCK_CZ = 0.3f, HAMMOCK_ANCHOR_Y = 1.9f;
    static final float HAMMOCK_HALF = 3.85f, HAMMOCK_SAG = 0.55f, HAMMOCK_HALF_W = 0.75f;
    // Altura do pano da rede no centro (o pano fica por volta de 1,6 m do chão)
    static final float LIE_Y = 1.35f;   // barriga do pano (centro da rede)
    static final float LIE_RANGE = 1.8f;
    // Fogão e banco
    static final float STOVE_X = 2.5f, STOVE_Z = -2.48f;
    static final float BENCH_X = 2.7f, BENCH_Z = 4.4f, BENCH_SCALE = 1.33f;

    enum Lie { FREE, LYING_IN, LYING, GETTING_UP }

    /** Altura do pano da rede no ponto x (a barriga fica no meio). */
    static float hammockY(float x) {
        return HAMMOCK_ANCHOR_Y - HAMMOCK_SAG * (1f - (x * x) / (HAMMOCK_HALF * HAMMOCK_HALF));
    }

    /** Rede: pano com barriga entre duas pontas presas nas paredes laterais. Origem no centro, eixo x = corda. */
    static Model buildHammock() {
        ModelBuilder mb = new ModelBuilder();
        mb.begin();
        MeshPartBuilder pb = mb.part("pano", GL20.GL_TRIANGLES, Usage.Position | Usage.Normal,
                new Material(ColorAttribute.createDiffuse(0.78f, 0.66f, 0.45f, 1f)));
        int n = 24;
        for (int i = 0; i < n; i++) {
            float x0 = -HAMMOCK_HALF + 2f * HAMMOCK_HALF * i / n, x1 = -HAMMOCK_HALF + 2f * HAMMOCK_HALF * (i + 1) / n;
            float y0 = hammockY(x0), y1 = hammockY(x1);
            VertexInfo a = new VertexInfo().setPos(x0, y0, -HAMMOCK_HALF_W).setNor(0f, 1f, 0f);
            VertexInfo b = new VertexInfo().setPos(x1, y1, -HAMMOCK_HALF_W).setNor(0f, 1f, 0f);
            VertexInfo c = new VertexInfo().setPos(x1, y1, HAMMOCK_HALF_W).setNor(0f, 1f, 0f);
            VertexInfo d = new VertexInfo().setPos(x0, y0, HAMMOCK_HALF_W).setNor(0f, 1f, 0f);
            pb.triangle(a, b, c);
            pb.triangle(a, c, d);
        }
        MeshPartBuilder ph = mb.part("ganchos", GL20.GL_TRIANGLES, Usage.Position | Usage.Normal,
                new Material(ColorAttribute.createDiffuse(0.2f, 0.14f, 0.08f, 1f)));
        ph.box(HAMMOCK_HALF + 0.08f, HAMMOCK_ANCHOR_Y, 0f, 0.16f, 0.16f, 0.5f);
        ph.box(-HAMMOCK_HALF - 0.08f, HAMMOCK_ANCHOR_Y, 0f, 0.16f, 0.16f, 0.5f);
        return mb.end();
    }

    /** Piso de terra batida da casa (interior), para esconder o terreno por baixo. */
    static Model buildFloor() {
        ModelBuilder mb = new ModelBuilder();
        mb.begin();
        MeshPartBuilder pb = mb.part("piso", GL20.GL_TRIANGLES, Usage.Position | Usage.Normal,
                new Material(ColorAttribute.createDiffuse(0.55f, 0.42f, 0.28f, 1f)));
        float x = 3.85f, z = 2.85f, y = 0.03f;
        VertexInfo a = new VertexInfo().setPos(-x, y, -z).setNor(0f, 1f, 0f);
        VertexInfo b = new VertexInfo().setPos(x, y, -z).setNor(0f, 1f, 0f);
        VertexInfo c = new VertexInfo().setPos(x, y, z).setNor(0f, 1f, 0f);
        VertexInfo d = new VertexInfo().setPos(-x, y, z).setNor(0f, 1f, 0f);
        pb.triangle(a, b, c);
        pb.triangle(a, c, d);
        return mb.end();
    }

    /** Folha de porta de madeira: dobradiça na origem, 1,25 m para +x, 2,2 m de altura. */
    static Model buildDoor() {
        ModelBuilder mb = new ModelBuilder();
        mb.begin();
        MeshPartBuilder pb = mb.part("porta", GL20.GL_TRIANGLES, Usage.Position | Usage.Normal,
                new Material(ColorAttribute.createDiffuse(0.34f, 0.21f, 0.11f, 1f)));
        float t = 0.06f;
        // Tábuas verticais
        for (int i = 0; i < 5; i++) {
            float x = DOOR_W * (i + 0.5f) / 5f;
            pb.box(x, DOOR_H / 2f, 0f, DOOR_W / 5f - 0.01f, DOOR_H, t);
        }
        // Travessas (duas por cima e por baixo)
        for (float y : new float[]{0.2f, DOOR_H / 2f, DOOR_H - 0.2f}) {
            pb.box(DOOR_W / 2f, y, 0f, DOOR_W, 0.09f, t + 0.02f);
        }
        // Botão/ferrolho do lado de fora (cor de metal)
        MeshPartBuilder pm = mb.part("ferrolho", GL20.GL_TRIANGLES, Usage.Position | Usage.Normal,
                new Material(ColorAttribute.createDiffuse(0.55f, 0.5f, 0.4f, 1f)));
        pm.box(DOOR_W - 0.15f, 1.05f, t / 2f + 0.02f, 0.1f, 0.14f, 0.04f);
        return mb.end();
    }

    final Matrix4 house;          // transformação da casa no mundo
    final float yawDeg;
    final ModelInstance stove, hammock, bench, door;
    private final Matrix4 tmp = new Matrix4();
    private final Vector3 v = new Vector3();

    // Porta
    float doorAngle = 0f, doorTarget = 0f;
    // Rede
    Lie lie = Lie.FREE;
    float lieT = 0f;
    float swing = 0f;

    HouseDecor(Matrix4 house, float yawDeg, Model stoveModel, Model hammockModel, Model benchModel, Model doorModel) {
        this.house = new Matrix4(house);
        this.yawDeg = yawDeg;
        // Fogão: o comprimento (eixo z do modelo) vai para o eixo x, encostado na parede de fundo
        stove = new ModelInstance(stoveModel);
        stove.transform.set(house).translate(STOVE_X, 0f, STOVE_Z).rotate(Vector3.Y, 90f);
        // Rede: a corda mais longa fica no eixo x, de parede a parede
        hammock = new ModelInstance(hammockModel);   // rede feita em código (buildHammock)
        // Banco do lado de fora, à frente, à direita da porta
        bench = new ModelInstance(benchModel);
        bench.transform.set(house).translate(BENCH_X, 0f, BENCH_Z).scale(BENCH_SCALE, BENCH_SCALE, BENCH_SCALE);
        // Porta: folha de madeira presa no batente esquerdo
        door = new ModelInstance(doorModel);
        updateDoor();
        updateHammock();
    }

    // ---------- Porta ----------

    void toggleDoor() {
        doorTarget = doorTarget == 0f ? OPEN_DEG : 0f;
    }

    boolean doorOpen() {
        return doorAngle >= CLEAR_DEG;
    }

    /** Centro da porta (mundo), para o botão aparecer perto dela. */
    Vector3 doorCenter() {
        return v.set(DOOR_HINGE_X + DOOR_W / 2f, 1f, DOOR_Z).mul(house);
    }

    /** Ponto da porta (mundo): dobradiça e ponta, no ângulo a. */
    private Vector3 doorTip(float a) {
        float r = a * MathUtils.degreesToRadians;
        return new Vector3(DOOR_HINGE_X + DOOR_W * MathUtils.cos(r), 0f, DOOR_Z + DOOR_W * MathUtils.sin(r)).mul(house);
    }

    private Vector3 doorHinge() {
        return new Vector3(DOOR_HINGE_X, 0f, DOOR_Z).mul(house);
    }

    private void updateDoor() {
        // Folha: a geometria aponta para +x; abre para fora (+z) girando em torno da dobradiça
        door.transform.set(house).translate(DOOR_HINGE_X, 0f, DOOR_Z).rotate(Vector3.Y, -doorAngle);
    }

    /** Empurra o jogador para fora da porta, enquanto ela estiver fechada (ou quase). */
    void resolveDoor(Vector3 p, float playerRadius) {
        if (doorAngle >= CLEAR_DEG) return;
        Vector3 a = doorHinge(), b = doorTip(doorAngle);
        pushOut(p, a.x, a.z, b.x, b.z, playerRadius + 0.06f);
    }

    static void pushOut(Vector3 p, float ax, float az, float bx, float bz, float min) {
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

    // ---------- Rede ----------

    /** Matriz da rede: centrada no meio da casa, com a corda no eixo x e balançando em torno das ancoragens. */
    private void updateHammock() {
        // Ângulo que alinha a corda da rede (de -139,7°) com o eixo x da casa.
        // Depois de girar, o centro do modelo fica em (0,04; -1,78): desloca para o centro desejado.
        float phi = -139.7f;
        // Pontas presas em (±3,85; 1,9) no centro da rede; balança de lado, em torno da linha das pontas
        tmp.set(house).translate(0f, HAMMOCK_ANCHOR_Y, HAMMOCK_CZ).rotate(Vector3.X, swing * MathUtils.radiansToDegrees);
        hammock.transform.set(tmp);
    }

    /** Ponto onde a pessoa deitada fica (mundo). */
    Vector3 lieSpot() {
        return v.set(0f, LIE_Y, HAMMOCK_CZ).mul(house);
    }

    /** Direção da cabeça quando deitada: ao longo da rede (eixo x da casa). */
    float lieFacing() {
        return (yawDeg + 90f) * MathUtils.degreesToRadians;
    }

    boolean nearHammock(Vector3 p) {
        Vector3 c = lieSpot();
        float dx = p.x - c.x, dz = p.z - c.z;
        return dx * dx + dz * dz < LIE_RANGE * LIE_RANGE;
    }

    // ---------- Fogão ----------

    /** Fonte das chamas (nas bocas) e da fumaça (topo da chaminé), no mundo. */
    Vector3 flameSource() {
        return new Vector3(0.05f, 1.23f, 0.29f).mul(stove.transform);
    }

    Vector3 smokeSource() {
        return new Vector3(-0.02f, 5.7f, -0.9f).mul(stove.transform);
    }

    // ---------- Atualização ----------

    void update(float dt) {
        // Porta anda até o ângulo desejado
        if (doorAngle != doorTarget) {
            float step = DOOR_SPEED * dt;
            doorAngle = doorAngle < doorTarget ? Math.min(doorTarget, doorAngle + step) : Math.max(doorTarget, doorAngle - step);
            updateDoor();
        }
        // Balanço da rede (quando alguém está deitado)
        if (lie == Lie.LYING) {
            lieT += dt;
            swing = 0.2f * MathUtils.sin(lieT * (MathUtils.PI2 / 3.2f));
        } else if (lie == Lie.FREE || lie == Lie.GETTING_UP) {
            swing *= Math.max(0f, 1f - 2.5f * dt);
        }
        updateHammock();
    }
}
