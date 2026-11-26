package com.exemplo.jogo3d;

import com.badlogic.gdx.graphics.g3d.ModelInstance;
import com.badlogic.gdx.graphics.g3d.model.Node;
import com.badlogic.gdx.math.MathUtils;
import com.badlogic.gdx.math.Vector3;

/**
 * Carroça de duas rodas com física:
 * - reboque: o eixo segue o ponto de engate no cavalo (as varas têm comprimento fixo),
 *   então a carroça faz a curva por trás do cavalo, como um reboque de verdade;
 * - rodas com gravidade: num buraco a roda cai, numa lombada ou borda é lançada para cima (a carroça pula);
 * - amortecedor: a caixa fica presa ao eixo por mola com amortecimento (altura e balanço lateral),
 *   com batente no fim do curso;
 * - inclinação: as varas ficam apoiadas no engate, então a caixa sobe e desce na frente com o cavalo;
 * - as rodas giram de acordo com a distância andada.
 */
final class Cart {
    // Medidas do modelo carroca.g3dj
    static final float AXLE_Y = 0.6253f, AXLE_Z = -0.223f;   // centro do eixo
    static final float WHEEL_R = 0.605f;                     // raio da roda
    static final float TRACK_HALF = 0.925f;                  // metade da distância entre as rodas
    private static final float TIP_DZ = 1.79f - AXLE_Z, TIP_DY = 0.09f - AXLE_Y;   // ponta das varas, a partir do eixo
    static final float TIP_LEN = (float) Math.sqrt(TIP_DZ * TIP_DZ + TIP_DY * TIP_DY);
    private static final float TIP_ANG = (float) Math.atan2(TIP_DY, TIP_DZ);     // no modelo as varas tocam o chão
    // Amortecedor (mola + amortecimento): cerca de 1,9 Hz, com pouca oscilação
    private static final float SPRING_K = 140f, SPRING_C = 11f, TRAVEL = 0.10f;
    private static final float ROLL_K = 110f, ROLL_C = 11f;
    private static final float GRAVITY = 9.8f;

    final ModelInstance inst;
    final Vector3 pos = new Vector3();   // eixo, na altura do chão
    boolean attached = false;
    World.Obstacle obstacle;              // colisão, enquanto a carroça está solta

    float ax, az, yaw;                    // eixo no mundo e direção (radianos)
    private final Node wheelL, wheelR;
    private final Vector3 wheelLBase = new Vector3(), wheelRBase = new Vector3();
    private final float[] wy = new float[2], wv = new float[2], wg = new float[2];   // altura, velocidade e chão de cada roda
    private float s, sv;                  // amortecedor: deslocamento da caixa em relação ao eixo
    private float roll, rollV;            // balanço lateral
    private float vAprev, spin;
    private final Vector3 tmp = new Vector3();

    Cart(ModelInstance inst, World.Obstacle obstacle) {
        this.inst = inst;
        this.obstacle = obstacle;
        wheelL = inst.getNode("rodaE");
        wheelR = inst.getNode("rodaD");
        if (wheelL != null) wheelLBase.set(wheelL.translation);
        if (wheelR != null) wheelRBase.set(wheelR.translation);
    }

    /** Parada no chão, apoiada nas varas (como no modelo), com o eixo em (x, z). */
    void setRest(World w, float x, float z, float yawRad) {
        ax = x;
        az = z;
        yaw = yawRad;
        float g = w.heightAt(x, z);
        inst.transform.setToTranslation(x, g, z).rotate(Vector3.Y, yaw * MathUtils.radiansToDegrees)
                .translate(0f, 0f, -AXLE_Z);
        pos.set(x, g, z);
        setWheels(0f);
    }

    /** Começa a ser puxada: rodas no chão e amortecedor em repouso. */
    void beginTow(World w) {
        float rx = MathUtils.cos(yaw), rz = -MathUtils.sin(yaw);
        for (int i = 0; i < 2; i++) {
            float side = i == 0 ? -1f : 1f;
            wg[i] = wheelGround(w, ax + rx * TRACK_HALF * side, az + rz * TRACK_HALF * side,
                    MathUtils.sin(yaw), MathUtils.cos(yaw));
            wy[i] = wg[i];
            wv[i] = 0f;
        }
        s = sv = roll = rollV = vAprev = 0f;
    }

    /** Um passo da física, com a carroça presa no ponto de engate (mundo). */
    void tow(float dt, Vector3 hitch, World w, Riding.Mount skip) {
        dt = MathUtils.clamp(dt, 1e-4f, 1f / 30f);

        // 1) Reboque: o eixo fica à distância das varas, atrás do engate
        float bodyY = (wy[0] + wy[1]) * 0.5f + s;
        float rise = MathUtils.clamp(hitch.y - bodyY, -TIP_LEN * 0.8f, TIP_LEN * 0.8f);
        float reach = (float) Math.sqrt(TIP_LEN * TIP_LEN - rise * rise);
        float dx = hitch.x - ax, dz = hitch.z - az;
        float d = (float) Math.sqrt(dx * dx + dz * dz);
        if (d > 1e-4f) {
            float fx = dx / d, fz = dz / d;
            tmp.set(hitch.x - fx * reach, 0f, hitch.z - fz * reach);
            w.resolveCollisionsExcept(tmp, 1.0f, skip);   // não atravessa paredes, cercas e pedras
            float moved = (tmp.x - ax) * fx + (tmp.z - az) * fz;
            spin += moved / WHEEL_R;                     // a roda gira pela distância andada
            ax = tmp.x;
            az = tmp.z;
            yaw = MathUtils.atan2(fx, fz);
        }

        // 2) Rodas: queda livre; no chão, acompanham a subida do terreno (que pode lançá-las para cima)
        float fwx = MathUtils.sin(yaw), fwz = MathUtils.cos(yaw);
        float rx = fwz, rz = -fwx;
        for (int i = 0; i < 2; i++) {
            float side = i == 0 ? -1f : 1f;
            float g = wheelGround(w, ax + rx * TRACK_HALF * side, az + rz * TRACK_HALF * side, fwx, fwz);
            wv[i] -= GRAVITY * dt;
            wy[i] += wv[i] * dt;
            if (wy[i] <= g) {
                // o pneu absorve parte do tranco: só 80% da subida do chão vira velocidade da roda
                float groundV = MathUtils.clamp((g - wg[i]) / dt, -6f, 6f) * 0.8f;
                wy[i] = g;
                float bounce = wv[i] < -1.5f ? -wv[i] * 0.2f : 0f;   // pancada forte: quica um pouco
                wv[i] = Math.max(bounce, groundV);
            }
            wg[i] = g;
        }

        // 3) Amortecedor: a caixa segue o eixo por uma mola; o tranco do eixo a faz balançar
        float yA = (wy[0] + wy[1]) * 0.5f, vA = (wv[0] + wv[1]) * 0.5f;
        float aA = MathUtils.clamp((vA - vAprev) / dt, -60f, 60f);
        vAprev = vA;
        sv += (-SPRING_K * s - SPRING_C * sv - aA) * dt;
        s += sv * dt;
        if (s > TRAVEL) { s = TRAVEL; if (sv > 0f) sv *= -0.3f; }      // batente
        if (s < -TRAVEL) { s = -TRAVEL; if (sv < 0f) sv *= -0.3f; }
        float rollTarget = (float) Math.atan2(wy[1] - wy[0], 2f * TRACK_HALF);
        rollV += (ROLL_K * (rollTarget - roll) - ROLL_C * rollV) * dt;
        roll += rollV * dt;

        // 4) Inclinação: a ponta das varas fica no engate
        bodyY = yA + s;
        float sinA = MathUtils.clamp((hitch.y - bodyY) / TIP_LEN, -0.9f, 0.9f);
        float pitch = (float) Math.asin(sinA) - TIP_ANG;

        // 5) Posição final da caixa (o eixo do modelo fica no eixo calculado)
        inst.transform.setToTranslation(ax, bodyY, az)
                .rotate(Vector3.Y, yaw * MathUtils.radiansToDegrees)
                .rotate(Vector3.X, -pitch * MathUtils.radiansToDegrees)
                .rotate(Vector3.Z, roll * MathUtils.radiansToDegrees)
                .translate(0f, -AXLE_Y, -AXLE_Z);
        pos.set(ax, yA - WHEEL_R, az);
        setWheels(s);
    }

    private static final float[] CONTACT = {-0.5f, -0.25f, 0f, 0.25f, 0.5f};

    /**
     * Altura do centro da roda apoiada no terreno: a roda é um círculo, então ela toca o ponto mais alto
     * sob ela (não afunda inteira num buraco menor que ela e sobe antes na borda).
     */
    private static float wheelGround(World w, float x, float z, float fx, float fz) {
        float best = -1e9f;
        for (float c : CONTACT) {
            float off = c * WHEEL_R;
            float h = w.heightAt(x + fx * off, z + fz * off) + (float) Math.sqrt(WHEEL_R * WHEEL_R - off * off);
            if (h > best) best = h;
        }
        return best;
    }

    /** Rodas: giram pela distância andada e ficam no eixo enquanto a caixa sobe e desce no amortecedor. */
    private void setWheels(float susp) {
        float deg = spin * MathUtils.radiansToDegrees;
        if (wheelL != null) {
            wheelL.translation.set(wheelLBase).sub(0f, susp, 0f);
            wheelL.rotation.set(Vector3.X, deg);
        }
        if (wheelR != null) {
            wheelR.translation.set(wheelRBase).sub(0f, susp, 0f);
            wheelR.rotation.set(Vector3.X, deg);
        }
        inst.calculateTransforms();
    }
}
