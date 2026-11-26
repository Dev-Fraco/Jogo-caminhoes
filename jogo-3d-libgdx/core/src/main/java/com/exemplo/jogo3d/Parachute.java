package com.exemplo.jogo3d;

import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.graphics.Mesh;
import com.badlogic.gdx.graphics.g3d.Model;
import com.badlogic.gdx.graphics.g3d.ModelInstance;
import com.badlogic.gdx.graphics.g3d.loader.G3dModelLoader;
import com.badlogic.gdx.math.MathUtils;
import com.badlogic.gdx.math.Vector3;
import com.badlogic.gdx.utils.JsonReader;

/**
 * Paraquedas: abre a 100 m do chão e desce como um paraquedas de verdade.
 *
 * Física: direção e velocidade de planeio controladas (analógico vira e acelera; o botão de correr
 * leva para a frente da câmera, mais rápido e descendo mais); freio automático perto do chão;
 * vento constante com rajadas.
 * Pêndulo: o paraquedista e o velame formam um pêndulo (~4,6 m), que inclina para dentro das curvas,
 * balança para trás ao acelerar e com as rajadas, e vai assentando (pouco amortecimento).
 * Animação: o velame abre com um pequeno estouro, o tecido ondula com o vento (mais nas pontas e no
 * bordo de fuga) e, no pouso, o velame cai para trás e some.
 */
final class Parachute {
    enum Phase { OFF, FLYING, COLLAPSING }

    static final float DEPLOY_HEIGHT = 100f;     // abre a 100 m do chão
    static final float HARNESS_Y = 1.45f;        // selete na altura dos ombros
    static final float PIVOT = 4.6f;             // do ombro ao centro do velame (eixo do pêndulo)
    private static final float GRAVITY = 9.8f;
    private static final float CANOPY_FROM = 3.2f, CANOPY_TO = 4.2f;   // faixa onde começa o tecido

    final ModelInstance inst;
    private final Model model;
    private final Mesh mesh;
    private final float[] base, work;
    private final int stride, count;

    Phase phase = Phase.OFF;
    float heading, speed, vy;
    private float turnRate, roll, rollV, pitch, pitchV, prevSpeed;
    private float openT, collapseT, time;
    private final Vector3 wind = new Vector3(1.2f, 0f, 0.6f);
    private final float[] ph = new float[6];
    private final Vector3 feet = new Vector3();

    Parachute() {
        model = new G3dModelLoader(new JsonReader()).loadModel(Gdx.files.internal("models/itens/paraquedas.g3dj"));
        inst = new ModelInstance(model);
        mesh = model.meshes.get(0);
        stride = mesh.getVertexSize() / 4;
        count = mesh.getNumVertices();
        base = new float[count * stride];
        mesh.getVertices(base);
        work = base.clone();
        for (int i = 0; i < ph.length; i++) ph[i] = MathUtils.random(MathUtils.PI2);
    }

    boolean active() { return phase != Phase.OFF; }
    boolean flying() { return phase == Phase.FLYING; }

    /** Abre: mantém a velocidade da queda, que o velame freia em ~1,5 s. */
    void deploy(Vector3 feetPos, float vx, float vyNow, float vz, float facing) {
        phase = Phase.FLYING;
        feet.set(feetPos);
        heading = facing;
        speed = (float) Math.sqrt(vx * vx + vz * vz);
        prevSpeed = speed;
        vy = vyNow;
        openT = 0f;
        roll = rollV = 0f;
        pitch = -0.35f;          // o tranco da abertura joga o corpo para a frente
        pitchV = 0f;
        turnRate = 0f;
    }

    /**
     * Um passo de voo. inX/inY = analógico; auto = botão de correr (vai para a frente da câmera, rápido).
     * Devolve true quando toca o chão.
     */
    boolean fly(float dt, float inX, float inY, float camYaw, boolean auto, float ground) {
        dt = MathUtils.clamp(dt, 1e-4f, 1f / 20f);
        time += dt;
        openT += dt;
        float fx = MathUtils.sin(camYaw), fz = MathUtils.cos(camYaw), rx = -fz, rz = fx;
        float mag = Math.min(1f, (float) Math.sqrt(inX * inX + inY * inY));
        float desired = heading, speedT, vyT;
        if (auto) {
            desired = camYaw;
            speedT = 12f;
            vyT = -7.5f;
        } else if (mag > 0.2f) {
            desired = MathUtils.atan2(inX * rx + inY * fx, inX * rz + inY * fz);
            speedT = 4f + 4f * mag;
            vyT = -(4f + 1.2f * mag);
        } else {
            speedT = 6f;
            vyT = -4.5f;
        }
        float h = feet.y - ground;
        if (h < 5f) {                         // freio perto do chão: chega devagar
            speedT *= 0.45f;
            vyT = -1.8f;
        }
        float rateT = MathUtils.clamp(wrap(desired - heading) * 1.5f, -0.9f, 0.9f);
        turnRate += (rateT - turnRate) * Math.min(1f, dt * 2f);
        heading += turnRate * dt;
        speed += (speedT - speed) * Math.min(1f, dt * 0.8f);
        vy += (vyT - vy) * Math.min(1f, dt * 1.3f);

        // Vento: constante + rajadas
        float gx = 1.4f * noise(0, time) , gz = 1.4f * noise(1, time * 0.8f);
        feet.x += (MathUtils.sin(heading) * speed + wind.x + gx) * dt;
        feet.z += (MathUtils.cos(heading) * speed + wind.z + gz) * dt;
        feet.y += vy * dt;
        feet.x = MathUtils.clamp(feet.x, -World.HALF + 2f, World.HALF - 2f);
        feet.z = MathUtils.clamp(feet.z, -World.HALF + 2f, World.HALF - 2f);

        // Pêndulo: inclina para dentro da curva; acelerar joga o corpo para trás; rajadas sacodem
        float w2 = GRAVITY / PIVOT, damp = 0.55f;
        float rollT = -(float) Math.atan(speed * turnRate / GRAVITY) + 0.05f * noise(2, time * 1.3f);
        rollV += (w2 * (rollT - roll) - damp * rollV) * dt;
        roll += rollV * dt;
        float accel = (speed - prevSpeed) / dt;
        prevSpeed = speed;
        pitchV += (-w2 * pitch - damp * pitchV - accel / PIVOT * 0.8f + 0.04f * noise(3, time)) * dt;
        pitch += pitchV * dt;

        ripple(dt, gx, gz);
        if (feet.y <= ground) {
            feet.y = ground;
            phase = Phase.COLLAPSING;
            collapseT = 0f;
            return true;
        }
        return false;
    }

    /** Depois do pouso: o velame cai para trás e some. */
    void updateCollapse(float dt) {
        collapseT += dt;
        if (collapseT > 1.8f) phase = Phase.OFF;
    }

    /** Posição dos pés do paraquedista. */
    Vector3 feet() { return feet; }

    float rollDeg() { return roll * MathUtils.radiansToDegrees; }
    float pitchDeg() { return pitch * MathUtils.radiansToDegrees; }

    /** Põe o velame no lugar: selete nos ombros, mesmo pêndulo do corpo, escala da abertura ou da queda. */
    void place() {
        float sx = 1f, sy = 1f, fall = 0f, back = 0f;
        if (phase == Phase.FLYING && openT < 1.1f) {
            // abre: cresce e "estoura" um pouco acima do tamanho final
            float t = openT / 1.1f;
            float e = 1f - (float) Math.pow(1f - t, 3f);
            float pop = 1f + 0.12f * MathUtils.sin(MathUtils.PI * t);
            sx = (0.12f + 0.88f * e) * pop;
            sy = (0.35f + 0.65f * e);
        } else if (phase == Phase.COLLAPSING) {
            float t = Math.min(1f, collapseT / 1.8f);
            fall = t * t * 4.5f;
            back = t * 75f;
            sx = 1f - 0.7f * t;
            sy = 1f - 0.8f * t;
        }
        inst.transform.setToTranslation(feet.x, feet.y + HARNESS_Y - fall * 0.2f, feet.z)
                .rotate(Vector3.Y, heading * MathUtils.radiansToDegrees)
                .translate(0f, PIVOT, 0f)
                .rotate(Vector3.X, -pitchDeg() - back)
                .rotate(Vector3.Z, rollDeg())
                .translate(0f, -PIVOT, 0f)
                .scale(sx, sy, sx);
    }

    /** Tecido do velame ondulando com o vento: mais nas pontas das asas e no bordo de fuga. */
    private void ripple(float dt, float gx, float gz) {
        float gust = 1f + 0.5f * Math.abs(noise(4, time * 1.5f)) + 0.1f * speed / 6f;
        for (int i = 0; i < count; i++) {
            int o = i * stride;
            float x = base[o], y = base[o + 1], z = base[o + 2];
            float k = MathUtils.clamp((y - CANOPY_FROM) / (CANOPY_TO - CANOPY_FROM), 0f, 1f);
            if (k <= 0f) {
                work[o] = x; work[o + 1] = y; work[o + 2] = z;
                continue;
            }
            k = k * k * (3f - 2f * k);
            float edge = 0.35f + 0.65f * Math.min(1f, Math.abs(x) / 3.6f) + 0.5f * Math.max(0f, -z / 2.3f);
            float a = 0.07f * gust * edge * k;
            float wave = MathUtils.sin(time * 5.5f + x * 1.7f + z * 1.1f + ph[5])
                    + 0.45f * MathUtils.sin(time * 11f - x * 3.1f + z * 2.3f);
            work[o] = x + a * 0.25f * MathUtils.sin(time * 4f + z * 2f);
            work[o + 1] = y + a * wave;
            work[o + 2] = z + a * 0.35f * wave;
        }
        mesh.setVertices(work);
    }

    /** Ruído suave (soma de ondas com fases sorteadas). */
    private float noise(int k, float t) {
        return 0.6f * MathUtils.sin(1.1f * t + ph[k]) + 0.4f * MathUtils.sin(2.7f * t + ph[(k + 3) % 6]);
    }

    private static float wrap(float a) {
        while (a > MathUtils.PI) a -= MathUtils.PI2;
        while (a < -MathUtils.PI) a += MathUtils.PI2;
        return a;
    }

    void dispose() { model.dispose(); }
}
