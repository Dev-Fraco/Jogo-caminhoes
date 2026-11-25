package com.exemplo.jogo3d;

import com.badlogic.gdx.graphics.GL20;
import com.badlogic.gdx.graphics.Mesh;
import com.badlogic.gdx.graphics.VertexAttribute;
import com.badlogic.gdx.graphics.VertexAttributes;
import com.badlogic.gdx.graphics.g3d.Material;
import com.badlogic.gdx.graphics.g3d.Model;
import com.badlogic.gdx.graphics.g3d.ModelInstance;
import com.badlogic.gdx.graphics.g3d.attributes.ColorAttribute;
import com.badlogic.gdx.graphics.g3d.model.MeshPart;
import com.badlogic.gdx.graphics.g3d.model.Node;
import com.badlogic.gdx.graphics.g3d.model.NodePart;
import com.badlogic.gdx.graphics.glutils.ShaderProgram;
import com.badlogic.gdx.math.MathUtils;
import com.badlogic.gdx.math.Matrix4;
import com.badlogic.gdx.math.Vector3;
import com.badlogic.gdx.utils.Array;

/**
 * Um trecho de cerca de arame farpado (4 m), com arames simulados.
 *
 * Porta de fence_wire_physics_threejs.js para libGDX:
 * - o modelo estático (mourões, grampos, terreno) é compartilhado entre todos os trechos;
 * - cada vão de arame é uma corrente Verlet presa nos mourões, com vento e gravidade leve;
 * - arames e farpas são desenhados como linhas em uma malha dinâmica, atualizada a cada quadro.
 *
 * Coordenadas locais: X ao longo do trecho, Y para cima, Z em profundidade (metros).
 * O trecho tem 5 mourões em X = -2, -1, 0, 1, 2 (o centro fica na origem local).
 */
public class BarbedWireFence {

    // Mesmos parâmetros do JS original
    static final float[] POST_XS = {-2f, -1f, 0f, 1f, 2f};
    static final float[] ROW_HEIGHTS = {1.39f, 1.12f, 0.85f, 0.58f};
    static final int NODES = 12;
    static final int ITERATIONS = 7;
    static final float DAMPING = 0.985f;
    static final float GRAVITY_SCALE = 0.045f;
    static final float WIND = 0.13f;
    static final float FIXED_STEP = 1f / 60f;
    static final float GROUND_Y = 0.035f;
    static final float WIRE_OFFSET_Z = 0.0045f;
    static final float SAG = 0.022f;
    static final float BARB_SPACING = 0.17f;
    static final float BARB_LENGTH = 0.082f;

    /** Vão de arame entre dois mourões: 'p' são as posições atuais dos nós. */
    static final class Bay {
        final float x0, x1, height;
        final Vector3[] p = new Vector3[NODES + 1];
        final Vector3[] prev = new Vector3[NODES + 1];
        final float[] rest = new float[NODES];

        Bay(float x0, float x1, float height) {
            this.x0 = x0;
            this.x1 = x1;
            this.height = height;
            for (int i = 0; i <= NODES; i++) {
                float t = i / (float) NODES;
                p[i] = new Vector3(x0 + (x1 - x0) * t, height - SAG * MathUtils.sin(MathUtils.PI * t), 0f);
                prev[i] = new Vector3(p[i]);
            }
            for (int i = 0; i < NODES; i++) rest[i] = p[i].dst(p[i + 1]) * 1.0015f;
        }
    }

    /** Farpa presa num ponto de um vão, de um lado do arame. */
    static final class Barb {
        final int bay;
        final float t;
        final int side;

        Barb(int bay, float t, int side) {
            this.bay = bay;
            this.t = t;
            this.side = side;
        }
    }

    /** Instâncias para desenhar: modelo estático do trecho e os arames. */
    public final Array<ModelInstance> instances = new Array<>();

    private final ModelInstance baseInstance;
    private final Model wireModel;
    private final ModelInstance wireInstance;
    private final Mesh wireMesh;
    private final float[] vertices;

    private final Array<Bay> bays = new Array<>();
    private final Array<Barb> barbs = new Array<>();
    private final Matrix4 placement = new Matrix4();

    private final Vector3 tmpA = new Vector3();
    private final Vector3 tmpDir = new Vector3();
    private final Vector3 tmpNormal = new Vector3();
    private final Vector3 tmpSide = new Vector3();
    private final Vector3 tmpBarb = new Vector3();
    private final Vector3 tmpStart = new Vector3();
    private final Vector3 tmpEnd = new Vector3();

    private float time = 0f;
    private float accumulator = 0f;
    private boolean disposed = false;

    /**
     * @param baseModel modelo estático compartilhado (models/cerca_base.g3dj); não é descartado aqui
     * @param x, y, z posição da base do trecho no mundo
     * @param yawDeg rotação em torno do eixo Y, em graus (0 = trecho ao longo do eixo X)
     */
    public BarbedWireFence(Model baseModel, float x, float y, float z, float yawDeg) {
        baseInstance = new ModelInstance(baseModel);

        // Vãos de arame: 4 fileiras x 4 vãos
        for (int row = 0; row < ROW_HEIGHTS.length; row++) {
            for (int bay = 0; bay < POST_XS.length - 1; bay++) {
                bays.add(new Bay(POST_XS[bay], POST_XS[bay + 1], ROW_HEIGHTS[row]));
            }
        }

        // Farpas em pares ao longo de cada vão
        for (int row = 0; row < ROW_HEIGHTS.length; row++) {
            for (int bay = 0; bay < POST_XS.length - 1; bay++) {
                float x0 = POST_XS[bay], x1 = POST_XS[bay + 1], span = x1 - x0;
                int bayIndex = row * (POST_XS.length - 1) + bay;
                for (float xx = x0 + BARB_SPACING * 0.5f; xx < x1 - BARB_SPACING * 0.35f; xx += BARB_SPACING) {
                    float t = (xx - x0) / span;
                    barbs.add(new Barb(bayIndex, t, 1));
                    barbs.add(new Barb(bayIndex, t, -1));
                }
            }
        }

        // Dois arames por segmento e uma linha por farpa: 2 vértices por linha, 3 floats por vértice
        int lines = bays.size * NODES * 2 + barbs.size;
        vertices = new float[lines * 2 * 3];

        wireMesh = new Mesh(false, lines * 2, 0,
                new VertexAttribute(VertexAttributes.Usage.Position, 3, ShaderProgram.POSITION_ATTRIBUTE));

        // Modelo com uma parte de linhas; sem normais, o material é desenhado com a cor fixa
        wireModel = new Model();
        wireModel.meshes.add(wireMesh);
        MeshPart part = new MeshPart("cerca_arame", wireMesh, 0, lines * 2, GL20.GL_LINES);
        wireModel.meshParts.add(part);
        Material metal = new Material(ColorAttribute.createDiffuse(0.30f, 0.29f, 0.27f, 1f));
        wireModel.materials.add(metal);
        Node node = new Node();
        node.id = "cerca_arame";
        NodePart nodePart = new NodePart();
        nodePart.meshPart = part;
        nodePart.material = metal;
        node.parts.add(nodePart);
        wireModel.nodes.add(node);
        wireInstance = new ModelInstance(wireModel);

        setPlacement(x, y, z, yawDeg);
        instances.add(baseInstance);
        instances.add(wireInstance);
        writeVertices();
    }

    /** Posiciona o trecho no mundo (base e arames). */
    public void setPlacement(float x, float y, float z, float yawDeg) {
        placement.setToTranslation(x, y, z).rotate(Vector3.Y, yawDeg);
        baseInstance.transform.set(placement);
        wireInstance.transform.set(placement);
    }

    /** Avança a simulação e atualiza as linhas dos arames. Chame uma vez por quadro. */
    public void update(float deltaSeconds) {
        if (disposed) return;
        float dt = MathUtils.clamp(deltaSeconds, 0f, 0.05f);
        accumulator += dt;
        while (accumulator >= FIXED_STEP) {
            step(FIXED_STEP);
            accumulator -= FIXED_STEP;
        }
        writeVertices();
    }

    private void step(float dt) {
        time += dt;
        float windX = MathUtils.sin(time * 1.7f) * WIND;
        float windZ = MathUtils.cos(time * 1.15f) * WIND * 0.7f;

        for (int bi = 0; bi < bays.size; bi++) {
            Bay bay = bays.get(bi);
            Vector3[] p = bay.p;
            Vector3[] prev = bay.prev;

            // Verlet com gravidade leve e vento lateral; os extremos ficam presos nos mourões
            for (int i = 1; i < p.length - 1; i++) {
                Vector3 n = p[i];
                Vector3 q = prev[i];
                float vx = (n.x - q.x) * DAMPING;
                float vy = (n.y - q.y) * DAMPING;
                float vz = (n.z - q.z) * DAMPING;
                q.set(n);
                n.x += vx + windX * dt * dt;
                n.y += vy - 9.81f * GRAVITY_SCALE * dt * dt;
                n.z += vz + windZ * dt * dt;
                if (n.y < GROUND_Y) n.y = GROUND_Y;
            }

            // Restrições de comprimento: o arame fica esticado entre os mourões
            for (int it = 0; it < ITERATIONS; it++) {
                p[0].set(bay.x0, bay.height, 0f);
                p[NODES].set(bay.x1, bay.height, 0f);
                for (int i = 0; i < NODES; i++) {
                    Vector3 a = p[i];
                    Vector3 c = p[i + 1];
                    float dx = c.x - a.x, dy = c.y - a.y, dz = c.z - a.z;
                    float distance = Math.max((float) Math.sqrt(dx * dx + dy * dy + dz * dz), 1e-8f);
                    float error = (distance - bay.rest[i]) / distance;
                    boolean aFixed = i == 0;
                    boolean cFixed = i + 1 == NODES;
                    if (aFixed && !cFixed) {
                        c.x += dx * -error; c.y += dy * -error; c.z += dz * -error;
                    } else if (!aFixed && cFixed) {
                        a.x += dx * error; a.y += dy * error; a.z += dz * error;
                    } else if (!aFixed) {
                        a.x += dx * error * 0.5f; a.y += dy * error * 0.5f; a.z += dz * error * 0.5f;
                        c.x += dx * -error * 0.5f; c.y += dy * -error * 0.5f; c.z += dz * -error * 0.5f;
                    }
                }
            }
        }
    }

    private int writeIndex = 0;

    private void writeVertices() {
        writeIndex = 0;
        // Dois arames por segmento, deslocados em Z (como no JS)
        for (int bi = 0; bi < bays.size; bi++) {
            Bay bay = bays.get(bi);
            for (int i = 0; i < NODES; i++) {
                tmpStart.set(bay.p[i]).add(0f, 0f, -WIRE_OFFSET_Z);
                tmpEnd.set(bay.p[i + 1]).add(0f, 0f, -WIRE_OFFSET_Z);
                writeLine(tmpStart, tmpEnd);
                tmpStart.set(bay.p[i]).add(0f, 0f, WIRE_OFFSET_Z);
                tmpEnd.set(bay.p[i + 1]).add(0f, 0f, WIRE_OFFSET_Z);
                writeLine(tmpStart, tmpEnd);
            }
        }

        // Farpas: acompanham o arame e apontam para fora, de um lado e do outro
        for (int bi = 0; bi < barbs.size; bi++) {
            Barb barb = barbs.get(bi);
            Bay bay = bays.get(barb.bay);
            float f = barb.t * NODES;
            int idx = Math.min(NODES - 1, (int) Math.floor(f));
            float localT = f - idx;
            tmpA.set(bay.p[idx]).lerp(bay.p[idx + 1], localT);
            tmpDir.set(bay.p[idx + 1]).sub(bay.p[idx]).nor();
            // normal = (0,0,1) sem a componente ao longo do arame
            tmpNormal.set(0f, 0f, 1f).mulAdd(tmpDir, -tmpDir.z).nor();
            tmpSide.set(tmpDir).crs(tmpNormal).nor();
            tmpBarb.set(tmpNormal).scl(0.62f)
                    .mulAdd(tmpSide, barb.side * 0.28f)
                    .mulAdd(tmpDir, barb.side * 0.48f)
                    .nor();
            tmpA.mulAdd(tmpNormal, 0.004f);
            tmpStart.set(tmpA).mulAdd(tmpBarb, -BARB_LENGTH * 0.5f);
            tmpEnd.set(tmpA).mulAdd(tmpBarb, BARB_LENGTH * 0.5f);
            writeLine(tmpStart, tmpEnd);
        }

        wireMesh.setVertices(vertices);
    }

    private void writeLine(Vector3 a, Vector3 b) {
        vertices[writeIndex++] = a.x;
        vertices[writeIndex++] = a.y;
        vertices[writeIndex++] = a.z;
        vertices[writeIndex++] = b.x;
        vertices[writeIndex++] = b.y;
        vertices[writeIndex++] = b.z;
    }

    public void dispose() {
        if (disposed) return;
        disposed = true;
        wireMesh.dispose();
    }
}
