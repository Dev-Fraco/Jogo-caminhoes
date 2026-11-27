package com.exemplo.jogo3d;

import com.badlogic.gdx.math.MathUtils;
import com.badlogic.gdx.math.Vector3;

/**
 * Assistência de mira. Cada quadro calcula uma correção (dYaw, dPitch) que o Main soma à câmera.
 *
 * Partes:
 * - Atração: ao apertar o tiro, com o alvo no cone, a mira vai para a BARRIGA. Segurando, a força abdominal
 *   e a assistência horizontal puxam devagar. A força é SnapRange × queda por distância × assist da categoria.
 * - Limite de velocidade: a correção total (horizontal + vertical juntas) nunca passa de maxDegPerSec da
 *   categoria × dt. Isso impede o salto: o início do tiro vira um movimento progressivo.
 * - Tracking: soma a velocidade angular do alvo (× tracking da categoria), para a mira acompanhar um alvo
 *   que se move, sem ficar atrás dele.
 * - Freio (friction): ao se aproximar do centro do alvo, a sensibilidade manual diminui (campo `friction`,
 *   usado pelo Main no quadro seguinte). Nunca abaixo do piso AimTuning.frictionFloor, para o jogador
 *   continuar movimentando a mira livremente.
 * - Resistência vertical: o movimento do dedo para cima volta na fração configurada (AimSettings).
 *
 * A sensibilidade do jogador não muda; a assistência só soma correções.
 */
final class AimAssist {
    /** dt máximo usado nos cálculos: depois de um travamento, a correção não dá um salto grande. */
    static final float DT_MAX = 0.05f;
    /** Velocidade angular (rad/s) a partir da qual o alvo é considerado em movimento (≈1,7°/s). */
    static final float TRACKING_MOV_RAD = 0.03f;
    /** Movimento do dedo menor que isto (rad/quadro, ≈0,01°) é ruído numérico, não dedo: a resistência ignora. */
    static final float RUIDO_DEDO = 2e-4f;

    float dYaw, dPitch;        // correção deste quadro (radianos) para somar à câmera
    float friction = 1f;       // multiplicador da sensibilidade manual para o próximo quadro (1 = sem freio)
    boolean active;            // para o indicador discreto na mira
    float strengthNow;         // 0..1 (intensidade visual do indicador)
    /** Alcance da arma em uso (m): a queda por distância vai de 0 a este valor. Atualizado pelo Main a cada quadro. */
    float alcance = 70f;
    /** Multiplicador do tracking (1 = normal). Só os testes mudam; o jogo usa 1. */
    float trackingScale = 1f;

    private final Vector3 v = new Vector3();
    private float lastPitch;   // inclinação ao fim do último quadro (para saber o movimento do dedo)
    private boolean havePitch;
    private Enemy lastTarget;  // alvo do quadro anterior (para medir a velocidade angular dele)
    private boolean haveLast;
    private float lastTYaw, lastElev;          // ângulos do alvo no quadro anterior
    private float omegaYaw, omegaPitch;        // velocidade angular suavizada do alvo (rad/s)
    private float glideT;                      // tempo restante do deslizamento do início do tiro

    /** Esquece o movimento anterior (ao trocar de alvo ou de mira à força). */
    void reset() { havePitch = false; haveLast = false; lastTarget = null; glideT = 0f; }

    /**
     * Força da atração depois dos parâmetros da mira: SnapRange (taxa, 0 a 1) e DistFalloff (queda com a distância,
     * 0 a 1: no alcance máximo a força vale (1 - falloff)). Com os padrões (snap 1, falloff 0) é a força de sempre.
     */
    static float forca(float base, float dist, float range, float snap, float falloff) {
        float fracDist = MathUtils.clamp(dist / Math.max(1f, range), 0f, 1f);
        return base * snap * (1f - falloff * fracDist);
    }

    /** Passo máximo deste quadro (rad): maxDegPerSec da categoria × dt. Depende do tempo, então não muda com o FPS. */
    static float passoMaximo(float maxDegPerSec, float dt) {
        return (float) Math.toRadians(maxDegPerSec) * dt;
    }

    /** Multiplicador do freio: 1 longe do alvo; cai conforme a proximidade × friction da categoria; nunca abaixo do piso. */
    static float freio(float catFriction, float proximidade, float piso) {
        return MathUtils.clamp(1f - catFriction * MathUtils.clamp(proximidade, 0f, 1f), piso, 1f);
    }

    /**
     * @param dtRaw     tempo do quadro (s)
     * @param yaw       direção da câmera (frente = (sin yaw, 0, cos yaw))
     * @param pitch     inclinação (positivo = câmera por cima); elevação da mira = -pitch
     * @param firing    segurando o tiro
     * @param firePress acabou de apertar o tiro
     */
    void update(float dtRaw, Vector3 cam, Vector3 dir, float yaw, float pitch, Enemy target, WeaponConfig.Category cat,
                boolean firing, boolean firePress, boolean ads) {
        dYaw = 0f;
        dPitch = 0f;
        friction = 1f;
        active = false;
        strengthNow = Math.max(0f, strengthNow - dtRaw * 4f);
        // Sem tiro apertado, não há referência: o próximo tiro começa do zero (salto de mira não conta como dedo)
        if (!firing) havePitch = false;
        // Movimento do dedo neste quadro (inclinação que mudou desde o último quadro, sem a nossa correção)
        float userDelta = havePitch ? MathUtils.clamp(pitch - lastPitch, -0.3f, 0.3f) : 0f;
        havePitch = true;
        if (!AimSettings.assistOn || target == null || !target.alive() || !firing || dtRaw <= 0f) {
            lastPitch = pitch;
            haveLast = false;
            lastTarget = null;
            return;
        }
        float dt = Math.min(dtRaw, DT_MAX);

        // FOV: cone em volta da direção da mira, medido até o peito
        float fov = AimSettings.fovDeg() * cat.radiusScale * (ads ? 0.8f : 1f);
        Vector3 c = target.hitbox.chest;
        v.set(c).sub(cam);
        float dist = v.len();
        if (dist < 0.5f) { lastPitch = pitch; return; }
        float ang = (float) Math.toDegrees(Math.acos(MathUtils.clamp(v.dot(dir) / dist, -1f, 1f)));
        float tYaw = MathUtils.atan2(v.x, v.z);
        float errYaw = wrap(tYaw - yaw);
        // Ponto de atração: a BARRIGA (nunca o peito nem a cabeça). > 0: a barriga está acima da mira
        float elevBelly = elev(cam, target.hitbox.belly);
        float errBelly = elevBelly - (-pitch);
        // Faixa da cabeça: a mira entre o peito e o topo da cabeça também conta
        boolean inFov = ang <= fov;
        boolean inHead = -pitch <= elev(cam, target.hitbox.headTop) + 0.03f;

        // Velocidade angular do alvo (para o tracking), suavizada para não oscilar
        if (haveLast && lastTarget == target) {
            float wy = wrap(tYaw - lastTYaw) / dt;
            float wp = (elevBelly - lastElev) / dt;
            float k = Math.min(1f, 12f * dt);
            omegaYaw += (wy - omegaYaw) * k;
            omegaPitch += (wp - omegaPitch) * k;
        } else {
            omegaYaw = 0f;
            omegaPitch = 0f;
        }
        lastTYaw = tYaw;
        lastElev = elevBelly;
        lastTarget = target;
        haveLast = true;

        // Correção desejada neste quadro (radianos): yaw (ty) e pitch (tp)
        float fat = forca(1f, dist, alcance, AimTuning.snapRange, AimTuning.distFalloff) * cat.assist;
        float ty = 0f, tp = 0f;
        if (inFov || inHead) {
            // Tracking: acompanha o deslocamento do alvo enquanto a mira está perto dele
            ty += trackingScale * cat.tracking * omegaYaw * dt;
            tp += -trackingScale * cat.tracking * omegaPitch * dt;
            // Fecha o atraso que sobra quando o alvo se move: fração do erro, pelo tracking da categoria.
            // Só age com o alvo em movimento (parado, quem manda é o dedo e a força abdominal)
            float mov = MathUtils.clamp((float) Math.hypot(omegaYaw, omegaPitch) / TRACKING_MOV_RAD, 0f, 1f);
            float fecha = trackingScale * cat.tracking * Math.min(1f, AimTuning.trackingGain * dt) * mov;
            ty += errYaw * fecha;
            tp += -errBelly * fecha;
        }
        if (firePress) glideT = AimTuning.glideSeg;   // apertou o tiro: começa o deslizamento até a barriga
        glideT = Math.max(0f, glideT - dt);
        if (glideT > 0f) {
            // Deslizamento do início do tiro: a mira vai para a barriga, limitada pelo maxDegPerSec acima
            if (inFov) {
                ty += errYaw * fat;
                tp += -errBelly * fat;
            }
        } else {
            // Segurando o tiro: força abdominal (pitch) e assistência horizontal, sempre proporcionais ao tempo
            tp += -errBelly * Math.min(1f, 10f * dt) * AimSettings.abdAssist * fat;
            if (inFov) ty += errYaw * Math.min(1f, 8f * dt) * AimSettings.horizAssist * fat;
        }
        // Limite de velocidade: magnitude conjunta (horizontal + vertical) pelo maxDegPerSec da categoria
        float mag = (float) Math.sqrt(ty * ty + tp * tp);
        float maxPasso = passoMaximo(cat.maxDegPerSec, dt);
        if (mag > maxPasso && mag > 0f) {
            float s = maxPasso / mag;
            ty *= s;
            tp *= s;
        }
        dYaw += ty;
        dPitch += tp;

        // Resistência vertical: TODO movimento do dedo para cima, com o tiro apertado, volta na fração configurada
        if (userDelta < -RUIDO_DEDO) {
            dPitch += -userDelta * AimSettings.upResist;
        }

        // Freio: perto do centro do alvo, a sensibilidade manual diminui (piso garante movimento livre)
        float proximidade = inFov ? 1f - ang / Math.max(1e-3f, fov) : 0f;
        friction = freio(cat.friction, proximidade, AimTuning.frictionFloor);

        if (inFov || inHead) {
            active = true;
            strengthNow = Math.max(strengthNow, 0.5f + 0.5f * AimSettings.abdAssist);
        }
        lastPitch = pitch + dPitch;
    }

    private float elev(Vector3 cam, Vector3 p) {
        float dx = p.x - cam.x, dy = p.y - cam.y, dz = p.z - cam.z;
        return MathUtils.atan2(dy, (float) Math.sqrt(dx * dx + dz * dz));
    }

    private static float wrap(float a) {
        while (a > MathUtils.PI) a -= MathUtils.PI2;
        while (a < -MathUtils.PI) a += MathUtils.PI2;
        return a;
    }
}
