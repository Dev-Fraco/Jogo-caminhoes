package com.exemplo.jogo3d;

import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.graphics.Color;
import com.badlogic.gdx.graphics.GL20;
import com.badlogic.gdx.graphics.Mesh;
import com.badlogic.gdx.graphics.PerspectiveCamera;
import com.badlogic.gdx.graphics.VertexAttribute;
import com.badlogic.gdx.graphics.VertexAttributes;
import com.badlogic.gdx.graphics.VertexAttributes.Usage;
import com.badlogic.gdx.graphics.g3d.Material;
import com.badlogic.gdx.graphics.g3d.Model;
import com.badlogic.gdx.graphics.g3d.ModelInstance;
import com.badlogic.gdx.graphics.g3d.attributes.BlendingAttribute;
import com.badlogic.gdx.graphics.g3d.attributes.ColorAttribute;
import com.badlogic.gdx.graphics.g3d.attributes.DepthTestAttribute;
import com.badlogic.gdx.graphics.g3d.loader.G3dModelLoader;
import com.badlogic.gdx.graphics.g3d.model.MeshPart;
import com.badlogic.gdx.graphics.g3d.model.Node;
import com.badlogic.gdx.graphics.g3d.model.NodePart;
import com.badlogic.gdx.graphics.g3d.utils.MeshPartBuilder;
import com.badlogic.gdx.graphics.g3d.utils.MeshPartBuilder.VertexInfo;
import com.badlogic.gdx.graphics.g3d.utils.ModelBuilder;
import com.badlogic.gdx.graphics.g3d.utils.shapebuilders.BoxShapeBuilder;
import com.badlogic.gdx.graphics.glutils.ShaderProgram;
import com.badlogic.gdx.math.MathUtils;
import com.badlogic.gdx.math.Matrix4;
import com.badlogic.gdx.math.Vector3;
import com.badlogic.gdx.utils.JsonReader;

/**
 * Avião do battle royale (avião de passageiros de 4 turbinas, 32 m).
 *
 * Voo: dá voltas largas em torno do mapa (raio variando entre 150 e 180 m). Mira um ponto à frente na rota com velocidade de curva
 * limitada; a inclinação das asas vem da própria curva (curva coordenada: tan(inclinação) = v·giro/g),
 * com atraso. A altitude fica numa mola com amortecimento.
 * Turbulência: ruído suave (soma de ondas) + bolsões de turbulência forte de tempos em tempos,
 * que sacodem a altura, o balanço das asas e o nariz.
 * Turbinas: ventilador com pás girando na entrada de cada uma.
 * Vento: rastros nas pontas das asas e atrás das turbinas, e linhas de vento passando pelo avião.
 */
final class Airplane {
    // Rota: volta larga em torno do mapa, com o raio variando (as curvas apertam e abrem)
    private static final float PATH_R = 165f, PATH_AMP = 15f, ALT = 170f;   // alto: dá tempo de queda livre antes do paraquedas
    static final float SPEED = 24f;
    private static final float LOOKAHEAD = 55f, MAX_YAW_RATE = 0.18f, GRAVITY = 9.8f;
    // Medidas do modelo convertido (nariz em +z, origem no centro)
    private static final float[][] FANS = {{5.599f, -0.949f, 6.525f}, {10.142f, -0.949f, 3.676f},
            {-5.599f, -0.949f, 6.527f}, {-10.142f, -0.949f, 3.673f}};
    private static final float FAN_R = 0.85f;
    private static final float[][] WINGTIPS = {{16.3f, 1.3f, -3.2f}, {-16.3f, 1.3f, -3.2f}};
    private static final float ENGINE_LEN = 3.6f;

    final ModelInstance plane;
    final ModelInstance[] fans = new ModelInstance[4];
    private final Model planeModel, fanModel;

    // Estado do voo
    final Vector3 pos = new Vector3();
    private float heading, yawRate, roll, pitch, vy, pathT;
    private float time, fanAngle;
    private float pocket = 0f, pocketTimer = 6f;       // bolsão de turbulência
    private final float[] phase = new float[9];
    private final Matrix4 tmpM = new Matrix4();
    private final Vector3 tmp = new Vector3(), tmp2 = new Vector3();

    // Efeitos de vento (malha transparente, refeita todo quadro)
    private static final int TRAILS = 6, TRAIL_PTS = 44, STREAKS = 40;
    private static final float TRAIL_DT = 0.05f;
    private static final int MAX_QUADS = TRAILS * (TRAIL_PTS - 1) + STREAKS;
    private final float[][] trailX = new float[TRAILS][TRAIL_PTS], trailY = new float[TRAILS][TRAIL_PTS], trailZ = new float[TRAILS][TRAIL_PTS];
    private final float[][] trailAge = new float[TRAILS][TRAIL_PTS];
    private final int[] trailCount = new int[TRAILS];
    private float trailClock = 0f;
    private final float[] stX = new float[STREAKS], stY = new float[STREAKS], stZ = new float[STREAKS];
    private final Mesh fxMesh;
    private final Model fxModel;
    private final ModelInstance fx;
    private final float[] verts = new float[MAX_QUADS * 4 * 7];
    private int quads;

    Airplane() {
        planeModel = new G3dModelLoader(new JsonReader()).loadModel(Gdx.files.internal("models/aviao/aviao.g3dj"));
        plane = new ModelInstance(planeModel);
        fanModel = buildFan();
        for (int i = 0; i < 4; i++) fans[i] = new ModelInstance(fanModel);
        for (int i = 0; i < phase.length; i++) phase[i] = MathUtils.random(MathUtils.PI2);
        for (int i = 0; i < STREAKS; i++) respawnStreak(i, true);

        short[] idx = new short[MAX_QUADS * 6];
        for (int q = 0; q < MAX_QUADS; q++) {
            int b = q * 4;
            idx[q * 6] = (short) b; idx[q * 6 + 1] = (short) (b + 1); idx[q * 6 + 2] = (short) (b + 2);
            idx[q * 6 + 3] = (short) (b + 2); idx[q * 6 + 4] = (short) (b + 3); idx[q * 6 + 5] = (short) b;
        }
        fxMesh = new Mesh(false, MAX_QUADS * 4, MAX_QUADS * 6,
                new VertexAttribute(VertexAttributes.Usage.Position, 3, ShaderProgram.POSITION_ATTRIBUTE),
                new VertexAttribute(VertexAttributes.Usage.ColorUnpacked, 4, ShaderProgram.COLOR_ATTRIBUTE));
        fxMesh.setIndices(idx);
        fxModel = new Model();
        fxModel.meshes.add(fxMesh);
        MeshPart part = new MeshPart("vento", fxMesh, 0, MAX_QUADS * 6, GL20.GL_TRIANGLES);
        fxModel.meshParts.add(part);
        Material mat = new Material(new BlendingAttribute(GL20.GL_SRC_ALPHA, GL20.GL_ONE_MINUS_SRC_ALPHA),
                new DepthTestAttribute(GL20.GL_LEQUAL, false));
        fxModel.materials.add(mat);
        Node node = new Node();
        node.id = "vento";
        NodePart np = new NodePart();
        np.meshPart = part;
        np.material = mat;
        node.parts.add(np);
        fxModel.nodes.add(node);
        fx = new ModelInstance(fxModel);

        // Começa no ponto da rota, já apontando para a frente
        pathT = 0f;
        pathPoint(pathT, pos);
        pos.y = ALT;
        pathPoint(pathT + 0.01f, tmp);
        heading = MathUtils.atan2(tmp.x - pos.x, tmp.z - pos.z);
    }

    ModelInstance effects() { return fx; }

    /** Ponto da rota no parâmetro t (ângulo da volta). */
    private static Vector3 pathPoint(float t, Vector3 out) {
        float r = PATH_R + PATH_AMP * MathUtils.sin(3f * t);
        return out.set(r * MathUtils.sin(t), ALT, r * MathUtils.cos(t));
    }

    /** Metros de rota por unidade de t (para medir o ponto à frente em metros). */
    private float pathSpeed(float t) {
        pathPoint(t, tmp2);
        float x0 = tmp2.x, z0 = tmp2.z;
        pathPoint(t + 0.001f, tmp2);
        return Math.max(1f, (float) Math.sqrt((tmp2.x - x0) * (tmp2.x - x0) + (tmp2.z - z0) * (tmp2.z - z0)) / 0.001f);
    }

    /** Direção do voo (radianos) e velocidade, para o salto sair com o embalo do avião. */
    float heading() { return heading; }
    float verticalSpeed() { return vy; }

    /** Ruído suave: soma de três ondas com fases sorteadas. */
    private float noise(int k, float t) {
        return 0.55f * MathUtils.sin(1.3f * t + phase[k * 3]) + 0.3f * MathUtils.sin(2.9f * t + phase[k * 3 + 1])
                + 0.15f * MathUtils.sin(6.1f * t + phase[k * 3 + 2]);
    }

    void update(float dt, PerspectiveCamera cam) {
        dt = MathUtils.clamp(dt, 1e-4f, 1f / 20f);
        time += dt;

        // --- Turbulência: contínua + bolsões fortes que vão sumindo
        pocketTimer -= dt;
        if (pocketTimer <= 0f) {
            pocket = MathUtils.random(2.5f, 4.5f);
            pocketTimer = MathUtils.random(7f, 16f);
        }
        pocket *= (float) Math.exp(-dt / 1.6f);
        float intensity = 1f + pocket;

        // --- Rota: acha o ponto da rota mais perto do avião e mira um ponto à frente dele
        float best = pathT, bestD = Float.MAX_VALUE;
        for (int k = -10; k <= 30; k++) {
            float tt = pathT + k * 0.003f;
            pathPoint(tt, tmp);
            float d = (tmp.x - pos.x) * (tmp.x - pos.x) + (tmp.z - pos.z) * (tmp.z - pos.z);
            if (d < bestD) { bestD = d; best = tt; }
        }
        pathT = best;
        pathPoint(pathT + LOOKAHEAD / pathSpeed(pathT), tmp);
        float desired = MathUtils.atan2(tmp.x - pos.x, tmp.z - pos.z);
        float wantRate = MathUtils.clamp(wrap(desired - heading) * 1.2f, -MAX_YAW_RATE, MAX_YAW_RATE);
        yawRate += (wantRate - yawRate) * Math.min(1f, dt / 0.9f);          // o avião demora a entrar na curva
        heading += (yawRate + 0.01f * noise(2, time) * intensity) * dt;
        pos.x += MathUtils.sin(heading) * SPEED * dt;
        pos.z += MathUtils.cos(heading) * SPEED * dt;

        // --- Altitude: mola com amortecimento + rajadas verticais
        float gust = 2.2f * noise(0, time) * intensity;
        float ay = 0.6f * (ALT - pos.y) - 1.4f * vy + gust;
        vy += ay * dt;
        pos.y += vy * dt;

        // --- Atitude: inclinação da curva coordenada (com atraso) + sacudidas
        float bankTarget = -(float) Math.atan(SPEED * yawRate / GRAVITY);
        roll += (bankTarget - roll) * Math.min(1f, dt / 0.7f);
        float rollShake = 2.5f * MathUtils.degreesToRadians * noise(1, time * 1.4f) * intensity;
        pitch = (float) Math.atan2(vy, SPEED) + 1.2f * MathUtils.degreesToRadians * noise(2, time * 1.7f) * intensity;

        plane.transform.setToTranslation(pos)
                .rotate(Vector3.Y, heading * MathUtils.radiansToDegrees)
                .rotate(Vector3.X, -pitch * MathUtils.radiansToDegrees)
                .rotate(Vector3.Z, (roll + rollShake) * MathUtils.radiansToDegrees);

        // --- Turbinas girando (9 voltas por segundo)
        fanAngle = (fanAngle + 360f * 9f * dt) % 360f;
        for (int i = 0; i < 4; i++) {
            fans[i].transform.set(plane.transform).translate(FANS[i][0], FANS[i][1], FANS[i][2])
                    .rotate(Vector3.Z, i < 2 ? fanAngle : -fanAngle);
        }

        updateEffects(dt, cam);
    }

    // ------------------------------------------------------------------ efeitos de vento

    private void respawnStreak(int i, boolean anywhere) {
        stX[i] = MathUtils.random(-22f, 22f);
        stY[i] = MathUtils.random(-5f, 10f);
        stZ[i] = anywhere ? MathUtils.random(-24f, 30f) : MathUtils.random(26f, 32f);
    }

    private void updateEffects(float dt, PerspectiveCamera cam) {
        // Rastros: um ponto novo a cada TRAIL_DT, na ponta de cada asa e atrás de cada turbina
        for (int t = 0; t < TRAILS; t++) for (int p = 0; p < trailCount[t]; p++) trailAge[t][p] += dt;
        trailClock += dt;
        if (trailClock >= TRAIL_DT) {
            trailClock = 0f;
            for (int t = 0; t < TRAILS; t++) {
                if (t < 2) tmp.set(WINGTIPS[t][0], WINGTIPS[t][1], WINGTIPS[t][2]);
                else tmp.set(FANS[t - 2][0], FANS[t - 2][1], FANS[t - 2][2] - ENGINE_LEN);
                tmp.mul(plane.transform);
                for (int p = TRAIL_PTS - 1; p > 0; p--) {
                    trailX[t][p] = trailX[t][p - 1]; trailY[t][p] = trailY[t][p - 1]; trailZ[t][p] = trailZ[t][p - 1];
                    trailAge[t][p] = trailAge[t][p - 1];
                }
                trailX[t][0] = tmp.x; trailY[t][0] = tmp.y; trailZ[t][0] = tmp.z;
                trailAge[t][0] = 0f;
                trailCount[t] = Math.min(TRAIL_PTS, trailCount[t] + 1);
            }
        }
        // Linhas de vento: no sistema do avião, passam de frente para trás mais rápido que ele
        for (int i = 0; i < STREAKS; i++) {
            stZ[i] -= SPEED * 1.6f * dt;
            if (stZ[i] < -26f) respawnStreak(i, false);
        }

        quads = 0;
        Vector3 camPos = cam.position;
        for (int t = 0; t < TRAILS; t++) {
            boolean wing = t < 2;
            float life = TRAIL_DT * (TRAIL_PTS - 1);
            for (int p = 0; p < trailCount[t] - 1; p++) {
                float a0 = trailAge[t][p] / life, a1 = trailAge[t][p + 1] / life;
                float w0 = wing ? 0.15f + 0.9f * a0 : 0.5f + 3.0f * a0;
                float w1 = wing ? 0.15f + 0.9f * a1 : 0.5f + 3.0f * a1;
                float al0 = (wing ? 0.35f : 0.30f) * (1f - a0), al1 = (wing ? 0.35f : 0.30f) * (1f - a1);
                ribbon(trailX[t][p], trailY[t][p], trailZ[t][p], trailX[t][p + 1], trailY[t][p + 1], trailZ[t][p + 1],
                        w0, w1, al0, al1, camPos);
            }
        }
        for (int i = 0; i < STREAKS; i++) {
            tmp.set(stX[i], stY[i], stZ[i]).mul(plane.transform);
            tmp2.set(stX[i], stY[i], stZ[i] - 3.5f).mul(plane.transform);
            // mais visível no meio do caminho (aparece e some suavemente)
            float k = 1f - Math.abs((stZ[i] - 3f) / 29f);
            ribbon(tmp.x, tmp.y, tmp.z, tmp2.x, tmp2.y, tmp2.z, 0.05f, 0.03f, 0.22f * k, 0f, camPos);
        }
        for (int q = quads; q < MAX_QUADS; q++) for (int c = 0; c < 28; c++) verts[q * 28 + c] = 0f;
        fxMesh.setVertices(verts);
    }

    /** Faixa entre dois pontos, virada para a câmera, com largura e transparência em cada ponta. */
    private void ribbon(float x0, float y0, float z0, float x1, float y1, float z1,
                        float w0, float w1, float a0, float a1, Vector3 cam) {
        if (quads >= MAX_QUADS) return;
        float dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
        float vx = cam.x - x0, vy2 = cam.y - y0, vz = cam.z - z0;
        // lado = segmento x (ponto -> câmera)
        float sx = dy * vz - dz * vy2, sy = dz * vx - dx * vz, sz = dx * vy2 - dy * vx;
        float sl = (float) Math.sqrt(sx * sx + sy * sy + sz * sz);
        if (sl < 1e-5f) return;
        sx /= sl; sy /= sl; sz /= sl;
        int v = quads * 28;
        v = put(v, x0 - sx * w0, y0 - sy * w0, z0 - sz * w0, a0);
        v = put(v, x0 + sx * w0, y0 + sy * w0, z0 + sz * w0, a0);
        v = put(v, x1 + sx * w1, y1 + sy * w1, z1 + sz * w1, a1);
        put(v, x1 - sx * w1, y1 - sy * w1, z1 - sz * w1, a1);
        quads++;
    }

    private int put(int v, float x, float y, float z, float a) {
        verts[v++] = x; verts[v++] = y; verts[v++] = z;
        verts[v++] = 0.97f; verts[v++] = 0.97f; verts[v++] = 1f; verts[v++] = a;
        return v;
    }

    // ------------------------------------------------------------------ ventilador da turbina

    /** Ventilador: fundo escuro, 12 pás torcidas e cone central; gira em torno de z (frente da turbina). */
    private static Model buildFan() {
        ModelBuilder mb = new ModelBuilder();
        mb.begin();
        long attr = Usage.Position | Usage.Normal;
        MeshPartBuilder back = mb.part("fundo", GL20.GL_TRIANGLES, attr, new Material(ColorAttribute.createDiffuse(0.06f, 0.06f, 0.07f, 1f)));
        int seg = 20;
        VertexInfo c = new VertexInfo().setPos(0f, 0f, -0.08f).setNor(0f, 0f, 1f);
        for (int i = 0; i < seg; i++) {
            float a0 = MathUtils.PI2 * i / seg, a1 = MathUtils.PI2 * (i + 1) / seg;
            back.triangle(c, new VertexInfo().setPos(FAN_R * MathUtils.cos(a0), FAN_R * MathUtils.sin(a0), -0.08f).setNor(0f, 0f, 1f),
                    new VertexInfo().setPos(FAN_R * MathUtils.cos(a1), FAN_R * MathUtils.sin(a1), -0.08f).setNor(0f, 0f, 1f));
        }
        MeshPartBuilder blades = mb.part("pas", GL20.GL_TRIANGLES, attr, new Material(ColorAttribute.createDiffuse(0.72f, 0.73f, 0.76f, 1f)));
        Matrix4 m = new Matrix4();
        Vector3[] k = new Vector3[8];
        for (int b = 0; b < 12; b++) {
            m.idt().rotate(Vector3.Z, b * 30f).rotate(Vector3.X, 28f);   // gira para a posição e torce a pá
            float r0 = 0.12f, r1 = FAN_R * 0.97f, hw = 0.09f, ht = 0.012f;
            int n = 0;
            for (int ix = 0; ix < 2; ix++) for (int iy = 0; iy < 2; iy++) for (int iz = 0; iz < 2; iz++) {
                k[n++] = new Vector3(iy == 0 ? -hw : hw, ix == 0 ? r0 : r1, iz == 0 ? -ht : ht).mul(m);
            }
            // cantos na ordem do BoxShapeBuilder: 000, 010, 100, 110, 001, 011, 101, 111 (x = largura, y = raio)
            BoxShapeBuilder.build(blades, k[0], k[2], k[4], k[6], k[1], k[3], k[5], k[7]);
        }
        MeshPartBuilder spin = mb.part("cone", GL20.GL_TRIANGLES, attr, new Material(ColorAttribute.createDiffuse(0.9f, 0.9f, 0.92f, 1f)));
        float rb = FAN_R * 0.2f, tip = FAN_R * 0.38f;
        for (int i = 0; i < seg; i++) {
            float a0 = MathUtils.PI2 * i / seg, a1 = MathUtils.PI2 * (i + 1) / seg;
            Vector3 p0 = new Vector3(rb * MathUtils.cos(a0), rb * MathUtils.sin(a0), 0f);
            Vector3 p1 = new Vector3(rb * MathUtils.cos(a1), rb * MathUtils.sin(a1), 0f);
            Vector3 nrm = new Vector3(p1).sub(p0).crs(new Vector3(0f, 0f, tip).sub(p0)).nor();
            spin.triangle(new VertexInfo().setPos(p0).setNor(nrm), new VertexInfo().setPos(p1).setNor(nrm),
                    new VertexInfo().setPos(0f, 0f, tip).setNor(nrm));
        }
        return mb.end();
    }

    private static float wrap(float a) {
        while (a > MathUtils.PI) a -= MathUtils.PI2;
        while (a < -MathUtils.PI) a += MathUtils.PI2;
        return a;
    }

    void dispose() {
        planeModel.dispose();
        fanModel.dispose();
        fxMesh.dispose();
    }
}
