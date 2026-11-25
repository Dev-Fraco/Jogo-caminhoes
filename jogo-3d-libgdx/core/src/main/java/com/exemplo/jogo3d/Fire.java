package com.exemplo.jogo3d;

import com.badlogic.gdx.graphics.GL20;
import com.badlogic.gdx.graphics.PerspectiveCamera;
import com.badlogic.gdx.graphics.Mesh;
import com.badlogic.gdx.graphics.VertexAttribute;
import com.badlogic.gdx.graphics.VertexAttributes;
import com.badlogic.gdx.graphics.g3d.Material;
import com.badlogic.gdx.graphics.g3d.Model;
import com.badlogic.gdx.graphics.g3d.ModelInstance;
import com.badlogic.gdx.graphics.g3d.attributes.BlendingAttribute;
import com.badlogic.gdx.graphics.g3d.model.MeshPart;
import com.badlogic.gdx.graphics.g3d.model.Node;
import com.badlogic.gdx.graphics.g3d.model.NodePart;
import com.badlogic.gdx.graphics.glutils.ShaderProgram;
import com.badlogic.gdx.math.MathUtils;
import com.badlogic.gdx.math.Vector3;

/**
 * Fogo e fumaça em partículas: quadros voltados para a câmera, desenhados com transparência.
 * Chamas sobem e somem depressa (laranja, depois vermelho); a fumaça sobe devagar, cinza, e se espalha.
 */
final class Fire {

    static final int MAX = 220;             // partículas ao mesmo tempo
    private static final float FLAME_RATE = 12f;   // por segundo, por fogão
    private static final float SMOKE_RATE = 2f;

    private final float[] px = new float[MAX], py = new float[MAX], pz = new float[MAX];
    private final float[] vx = new float[MAX], vy = new float[MAX], vz = new float[MAX];
    private final float[] age = new float[MAX], life = new float[MAX], size0 = new float[MAX], size1 = new float[MAX];
    private final boolean[] smoke = new boolean[MAX];
    private final boolean[] alive = new boolean[MAX];
    private final float[] verts = new float[MAX * 4 * 7];   // x,y,z + r,g,b,a por vértice, 4 por quadro
    private final short[] idx = new short[MAX * 6];
    private final Mesh mesh;
    private final ModelInstance instance;
    private final Model model;
    private final Vector3 right = new Vector3(), up = new Vector3(), dir = new Vector3();
    private final Vector3 tmp = new Vector3();
    private float flameAcc = 0f, smokeAcc = 0f;
    private int next = 0;
    private float clock = 0f;

    /** Fontes (fogões): flamas no fogo e fumaça na boca da chaminé. Coordenadas do mundo. */
    private final java.util.ArrayList<Vector3> flames = new java.util.ArrayList<>();
    private final java.util.ArrayList<Vector3> smokes = new java.util.ArrayList<>();

    Fire() {
        for (int q = 0; q < MAX; q++) {
            int b = q * 4;
            idx[q * 6] = (short) b;
            idx[q * 6 + 1] = (short) (b + 1);
            idx[q * 6 + 2] = (short) (b + 2);
            idx[q * 6 + 3] = (short) (b + 2);
            idx[q * 6 + 4] = (short) (b + 3);
            idx[q * 6 + 5] = (short) b;
        }
        mesh = new Mesh(false, MAX * 4, MAX * 6,
                new VertexAttribute(VertexAttributes.Usage.Position, 3, ShaderProgram.POSITION_ATTRIBUTE),
                new VertexAttribute(VertexAttributes.Usage.ColorUnpacked, 4, ShaderProgram.COLOR_ATTRIBUTE));
        mesh.setIndices(idx);
        model = new Model();
        model.meshes.add(mesh);
        MeshPart part = new MeshPart("fogo", mesh, 0, MAX * 6, GL20.GL_TRIANGLES);
        model.meshParts.add(part);
        Material mat = new Material(new BlendingAttribute(GL20.GL_SRC_ALPHA, GL20.GL_ONE_MINUS_SRC_ALPHA));
        model.materials.add(mat);
        Node node = new Node();
        node.id = "fogo";
        NodePart np = new NodePart();
        np.meshPart = part;
        np.material = mat;
        node.parts.add(np);
        model.nodes.add(node);
        instance = new ModelInstance(model);
    }

    ModelInstance instance() { return instance; }

    /** Adiciona um fogão: flamas em 'fire' e fumaça em 'smokeTop' (coordenadas do mundo). */
    void addSource(Vector3 fire, Vector3 smokeTop) {
        flames.add(new Vector3(fire));
        smokes.add(new Vector3(smokeTop));
    }

    void update(float dt, PerspectiveCamera cam) {
        clock += dt;
        int n = flames.size();
        if (n > 0) {
            flameAcc += FLAME_RATE * n * dt;
            while (flameAcc >= 1f) { flameAcc -= 1f; spawn(false); }
            smokeAcc += SMOKE_RATE * n * dt;
            while (smokeAcc >= 1f) { smokeAcc -= 1f; spawn(true); }
        }
        for (int q = 0; q < MAX; q++) {
            if (!alive[q]) continue;
            age[q] += dt;
            if (age[q] >= life[q]) { alive[q] = false; continue; }
            float wind = smoke[q] ? 0.35f : 0f;
            px[q] += (vx[q] + wind * (age[q] / life[q])) * dt;
            py[q] += vy[q] * dt;
            pz[q] += vz[q] * dt;
        }
        build(cam);
    }

    private void spawn(boolean isSmoke) {
        int q = -1;
        for (int k = 0; k < MAX; k++) {
            int c = (next + k) % MAX;
            if (!alive[c]) { q = c; break; }
        }
        if (q < 0) return;
        next = (q + 1) % MAX;
        alive[q] = true;
        age[q] = 0f;
        smoke[q] = isSmoke;
        int src = MathUtils.random(flames.size() - 1);
        if (isSmoke) {
            Vector3 smokeSrc = smokes.get(src);
            px[q] = smokeSrc.x + MathUtils.random(-0.08f, 0.08f);
            py[q] = smokeSrc.y;
            pz[q] = smokeSrc.z + MathUtils.random(-0.08f, 0.08f);
            vx[q] = MathUtils.random(-0.05f, 0.1f);
            vy[q] = MathUtils.random(0.5f, 0.8f);
            vz[q] = MathUtils.random(-0.05f, 0.05f);
            life[q] = MathUtils.random(2.8f, 4.0f);
            size0[q] = 0.25f;
            size1[q] = 1.4f;
        } else {
            Vector3 flameSrc = flames.get(src);
            px[q] = flameSrc.x + MathUtils.random(-0.12f, 0.12f);
            py[q] = flameSrc.y;
            pz[q] = flameSrc.z + MathUtils.random(-0.12f, 0.12f);
            vx[q] = MathUtils.random(-0.15f, 0.15f);
            vy[q] = MathUtils.random(1.2f, 2.0f);
            vz[q] = MathUtils.random(-0.15f, 0.15f);
            life[q] = MathUtils.random(0.45f, 0.8f);
            size0[q] = 0.22f;
            size1[q] = 0.08f;
        }
    }

    private static final int[] CORNER = {-1, -1, 1, -1, 1, 1, -1, 1};

    /** Monta os quadros voltados para a câmera, com cor e transparência por idade. */
    private void build(PerspectiveCamera cam) {
        dir.set(cam.direction).nor();
        right.set(dir).crs(cam.up).nor();
        up.set(right).crs(dir).nor();
        int v = 0;
        for (int q = 0; q < MAX; q++) {
            float cx = px[q], cy = py[q], cz = pz[q];
            float s, r, g, b, a;
            if (!alive[q]) {
                s = 0f; r = g = b = 0f; a = 0f;
                cx = cy = cz = 0f;
            } else {
                float t = Math.min(1f, age[q] / life[q]);
                s = size0[q] + (size1[q] - size0[q]) * t;
                if (smoke[q]) {
                    float shade = 0.55f + 0.2f * t;
                    r = shade; g = shade; b = shade * 0.98f;
                    a = 0.45f * (1f - t);
                } else {
                    // laranja no começo, vermelho e apagado no fim
                    r = 1f; g = 0.75f - 0.55f * t; b = 0.2f * (1f - t);
                    a = 0.9f * (1f - t);
                }
            }
            for (int c = 0; c < 4; c++) {
                float ox = CORNER[c * 2] * s, oy = CORNER[c * 2 + 1] * s;
                float x = cx + right.x * ox + up.x * oy;
                float y = cy + right.y * ox + up.y * oy;
                float z = cz + right.z * ox + up.z * oy;
                verts[v++] = x; verts[v++] = y; verts[v++] = z;
                verts[v++] = r; verts[v++] = g; verts[v++] = b; verts[v++] = a;
            }
        }
        mesh.setVertices(verts);
    }

    void dispose() {
        mesh.dispose();
    }
}
