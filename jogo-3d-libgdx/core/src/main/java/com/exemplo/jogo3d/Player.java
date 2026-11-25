package com.exemplo.jogo3d;

import com.badlogic.gdx.math.MathUtils;
import com.badlogic.gdx.math.Vector3;

/**
 * Física do jogador: andar, correr, virar e pular.
 *
 * Regras que evitam os engasgos:
 * - Quando está no chão, o personagem SEGUE o relevo (y = altura do terreno), sem acumular
 *   velocidade de queda. Assim não "voa" a cada quadro em descidas.
 * - Só fica "no ar" se estiver acima do chão além de uma tolerância (degrau).
 * - A velocidade cresce e diminui suavemente (aceleração), e o personagem vira para onde anda.
 * - Tudo usa delta time real (dt), com o passo limitado para não explodir em lag.
 */
public class Player {

    // ---------- Ajustes (metros e segundos) ----------
    public static final float WALK_SPEED = 2.2f;     // velocidade de caminhada (joystick leve)
    public static final float RUN_SPEED = 5.5f;      // velocidade de corrida (joystick no máximo)
    public static final float ACCEL = 12f;           // aceleração (m/s²): começa e para suave
    public static final float TURN_SPEED = 10f;      // quão rápido o personagem vira
    public static final float GRAVITY = 18f;
    public static final float JUMP_VELOCITY = 6.5f;
    public static final float GROUND_TOLERANCE = 0.3f; // degrau que ainda conta como chão
    public static final float JUMP_BUFFER = 0.15f;   // aperta pular um pouco antes de cair: ainda pula
    public static final float RADIUS = 0.35f;
    public static final float FOLLOW_SPEED = 12f;    // m/s máx. para subir/descer acompanhando o chão
    public static final float MAX_DT = 0.05f;

    // ---------- Estado ----------
    public final Vector3 pos = new Vector3();
    public float verticalVel = 0f;
    public boolean grounded = true;
    public float facing = 0f;         // direção para onde o personagem olha (radianos)
    public float speed = 0f;          // velocidade horizontal atual (m/s)
    private float jumpBuffer = 0f;

    public void spawn(float x, float z, float groundY) {
        pos.set(x, groundY, z);
        verticalVel = 0f;
        grounded = true;
    }

    /**
     * @param inX  entrada horizontal (-1 esquerda, +1 direita), relativa à tela/câmera
     * @param inY  entrada para frente (+1 frente, -1 trás)
     * @param camYaw direção da câmera (radianos); o movimento é relativo a ela
     * @param jumpPressed true no quadro em que o botão de pular foi apertado
     */
    public void update(float dtRaw, float inX, float inY, float camYaw, boolean jumpPressed, boolean runHeld, World world) {
        float dt = Math.min(dtRaw, MAX_DT);

        // 1) Direção desejada, relativa à câmera
        float fx = MathUtils.sin(camYaw), fz = MathUtils.cos(camYaw);   // frente da câmera
        float rx = -fz, rz = fx;                                       // direita da câmera
        float dx = fx * inY + rx * inX;
        float dz = fz * inY + rz * inX;
        float inMag = Math.min(1f, (float) Math.sqrt(inX * inX + inY * inY));
        float len = (float) Math.sqrt(dx * dx + dz * dz);
        if (len > 1e-4f) { dx /= len; dz /= len; }

        // 2) Velocidade alvo pela força do comando (joystick leve = anda, forte = corre)
        float targetSpeed;
        if (runHeld) {
            // Botão de correr: corre sem precisar do analógico (na direção da câmera, ou do analógico se ele estiver sendo usado)
            if (inMag <= 0.02f) { dx = fx; dz = fz; }
            targetSpeed = RUN_SPEED;
        } else {
            targetSpeed = inMag <= 0.02f ? 0f
                : MathUtils.lerp(WALK_SPEED, RUN_SPEED, MathUtils.clamp((inMag - 0.3f) / 0.7f, 0f, 1f));
        }
        speed = approach(speed, targetSpeed, ACCEL * dt);

        // 3) Anda e desvia de obstáculos
        if (speed > 0.001f) {
            pos.x += dx * speed * dt;
            pos.z += dz * speed * dt;
            world.resolveCollisions(pos, RADIUS);

            // Vira suavemente para onde anda (não gira sozinho ao parar)
            float targetYaw = (float) Math.atan2(dx, dz);
            float k = 1f - (float) Math.exp(-TURN_SPEED * dt);
            facing = lerpAngle(facing, targetYaw, k);
        }

        // Limita ao terreno
        float half = World.HALF - 2f;
        pos.x = MathUtils.clamp(pos.x, -half, half);
        pos.z = MathUtils.clamp(pos.z, -half, half);

        // 4) Pulo com "buffer": aperta um pouco antes de tocar o chão e ainda pula
        if (jumpPressed) jumpBuffer = JUMP_BUFFER;
        else jumpBuffer = Math.max(0f, jumpBuffer - dt);

        float groundY = world.heightAt(pos.x, pos.z);

        if (grounded && jumpBuffer > 0f) {
            verticalVel = JUMP_VELOCITY;
            grounded = false;
            jumpBuffer = 0f;
        }

        // 5) Vertical: no chão acompanha o relevo; no ar aplica gravidade
        if (grounded && verticalVel <= 0f && pos.y - groundY <= GROUND_TOLERANCE) {
            // Acompanha o terreno com velocidade limitada: sem saltos bruscos em encostas
            pos.y = moveToward(pos.y, groundY, FOLLOW_SPEED * dt);
            verticalVel = 0f;
        } else {
            grounded = false;
            verticalVel -= GRAVITY * dt;
            pos.y += verticalVel * dt;
            if (verticalVel <= 0f && pos.y <= groundY) {  // pousou
                pos.y = groundY;
                verticalVel = 0f;
                grounded = true;
            }
        }
    }

    private static float moveToward(float current, float target, float maxDelta) {
        if (current < target) return Math.min(target, current + maxDelta);
        return Math.max(target, current - maxDelta);
    }

    private static float approach(float current, float target, float maxDelta) {
        if (current < target) return Math.min(target, current + maxDelta);
        return Math.max(target, current - maxDelta);
    }

    /** Interpolação de ângulo pelo menor caminho. */
    static float lerpAngle(float from, float to, float t) {
        float diff = to - from;
        while (diff > MathUtils.PI) diff -= MathUtils.PI2;
        while (diff < -MathUtils.PI) diff += MathUtils.PI2;
        return from + diff * t;
    }
}
