package com.exemplo.jogo3d;

import com.badlogic.gdx.math.MathUtils;
import com.badlogic.gdx.math.Vector3;

/**
 * Assistência de mira. Cada quadro calcula UMA correção (dYaw, dPitch) que o Main soma à câmera.
 *
 * Etapas, em ordem de prioridade:
 * 1. AQUISIÇÃO: ao apertar o tiro com o alvo no cone, a mira é puxada rápido para o alvo durante
 *    AimTuning.aquisicaoSeg. Tem velocidade e intensidade próprias (não usa o limite do acompanhamento).
 * 2. ACOMPANHAMENTO: depois da aquisição, a mira segue o alvo. Tracking soma a velocidade angular do alvo;
 *    a correção vertical para a barriga só age FORA da zona de tolerância (com histerese), e nunca enquanto o
 *    jogador arrasta a mira de propósito. Assim o dedo controla a subida até a cabeça sem disputa.
 * 3. RESISTÊNCIA VERTICAL: o movimento do dedo para cima volta na fração configurada (upResist), mas quase
 *    não age durante um arrasto deliberado (resistenciaArrasto).
 * 4. FREIO: perto do centro do alvo a sensibilidade manual diminui, nunca abaixo de frictionFloor.
 *
 * A sensibilidade do jogador não muda; a assistência só soma correções.
 */
final class AimAssist {
    /** dt máximo usado nos cálculos: depois de um travamento, a correção não dá um salto grande. */
    static final float DT_MAX = 0.05f;
    /** Velocidade angular (rad/s) a partir da qual o alvo é considerado em movimento (≈1,7°/s). */
    static final float TRACKING_MOV_RAD = 0.03f;
    /** Movimento do dedo menor que isto (rad/quadro, ≈0,01°) é ruído numérico, não dedo. */
    static final float RUIDO_DEDO = 2e-4f;
    /** Movimento do dedo por quadro (rad) que conta como arrasto deliberado (≈0,11°/quadro ≈ 6,6°/s; ~0,5 px/quadro com a sensibilidade padrão). */
    static final float ARRASTO_RAD = 2e-3f;
    /** Mantém o alvo travado até 1,5× o cone (mesma margem da escolha de alvo): o acompanhamento não cai no meio de uma curva. */
    static final float MARGEM_TRAVA = 1.5f;
    /** O arrasto continua valendo por este tempo depois do último movimento do dedo (s). */
    static final float ARRASTO_SEG = 0.20f;
    static final float DEG = (float) (Math.PI / 180.0);

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
    private float aquisicaoT;                  // tempo restante da aquisição (s)
    private float arrastoT;                    // tempo restante do arrasto deliberado (s)
    private boolean pullVertical;              // correção vertical ligada (histerese da zona)
    private float paradoT = 10f;               // tempo desde o último movimento do dedo (s)

    /** Esquece o movimento anterior (ao trocar de alvo ou de mira à força). */
    void reset() {
        havePitch = false;
        haveLast = false;
        lastTarget = null;
        aquisicaoT = 0f;
        arrastoT = 0f;
        pullVertical = false;
    }

    /**
     * Força da atração depois dos parâmetros da mira: SnapRange (taxa, 0 a 1) e DistFalloff (queda com a distância,
     * 0 a 1: no alcance máximo a força vale (1 - falloff)). Com os padrões (snap 1, falloff 0) é a força de sempre.
     */
    static float forca(float base, float dist, float range, float snap, float falloff) {
        float fracDist = MathUtils.clamp(dist / Math.max(1f, range), 0f, 1f);
        return base * snap * (1f - falloff * fracDist);
    }

    /** Passo máximo do acompanhamento neste quadro (rad): maxDegPerSec da categoria × dt. */
    static float passoMaximo(float maxDegPerSec, float dt) {
        return (float) Math.toRadians(maxDegPerSec) * dt;
    }

    /** Correção de aquisição de um eixo: fração do erro (intensidade), limitada pela velocidade da aquisição. */
    static float passoAquisicao(float erro, float intensidade, float velGrauS, float dt) {
        float desejado = erro * MathUtils.clamp(intensidade, 0f, 1f);
        float lim = (float) Math.toRadians(velGrauS) * dt;
        return MathUtils.clamp(desejado, -lim, lim);
    }

    /**
     * Zona de tolerância com histerese: estando fora da correção (inativa), só liga acima de zona + histerese;
     * estando ativa, só desliga abaixo da zona. Evita correções opostas repetidas perto da borda.
     */
    static boolean zonaAtiva(boolean estavaAtiva, float erroGrau, float zona, float hist) {
        float a = Math.abs(erroGrau);
        return estavaAtiva ? a > zona : a > zona + hist;
    }

    /** Resistência vertical efetiva: reduzida durante o arrasto deliberado. */
    static float resistenciaEfetiva(float base, boolean arrastando, float fator) {
        return arrastando ? base * fator : base;
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
        arrastoT = Math.max(0f, arrastoT - dtRaw);
        // Movimento do dedo tem prioridade: enquanto ele se move, a atração ao abdômen fica suspensa;
        // depois de parar, a força volta em rampa (paradoT conta o tempo parado)
        boolean movendo = Math.abs(userDelta) > RUIDO_DEDO;
        paradoT = movendo ? 0f : Math.min(10f, paradoT + dtRaw);
        // Arrasto deliberado: movimento do dedo acima do limiar, que escala com a sensibilidade (mesmo dedo, mais ângulo)
        if (Math.abs(userDelta) > ARRASTO_RAD * Math.max(0.25f, AimSettings.general)) arrastoT = ARRASTO_SEG;
        if (!AimSettings.assistOn || target == null || !target.alive() || !firing || dtRaw <= 0f) {
            lastPitch = pitch;
            haveLast = false;
            lastTarget = null;
            aquisicaoT = 0f;
            pullVertical = false;
            return;
        }
        float dt = Math.min(dtRaw, DT_MAX);
        boolean arrastando = arrastoT > 0f;

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
        float errBellyGrau = errBelly / DEG;
        // Faixa da cabeça: a mira entre o peito e o topo da cabeça também conta
        boolean inFov = ang <= fov;
        boolean inTrava = ang <= fov * MARGEM_TRAVA;   // acompanhamento e correção vertical: com margem, como a escolha de alvo
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

        float fat = forca(1f, dist, alcance, AimTuning.snapRange, AimTuning.distFalloff) * cat.assist;
        float ty = 0f, tp = 0f;
        float limite;   // teto da correção deste quadro (rad): aquisição ou acompanhamento

        if (firePress && inFov) aquisicaoT = AimTuning.aquisicaoSeg;   // apertou o tiro: começa a aquisição
        boolean aquisicao = aquisicaoT > 0f && inFov && !arrastando && !movendo;   // o dedo em movimento tem prioridade
        aquisicaoT = Math.max(0f, aquisicaoT - dt);

        if (aquisicao) {
            // 1. AQUISIÇÃO: puxa rápido para o alvo, com velocidade e intensidade próprias
            float intensidade = AimTuning.aquisicaoForca * fat;
            float vel = AimTuning.aquisicaoVel * cat.assist;
            ty = passoAquisicao(errYaw, intensidade, vel, dt);
            tp = passoAquisicao(-errBelly, intensidade, vel, dt);
            limite = (float) Math.toRadians(vel) * dt;
            pullVertical = true;   // ao fim da aquisição, a zona já começa ligada
        } else {
            // 2. ACOMPANHAMENTO
            limite = passoMaximo(cat.maxDegPerSec, dt);
            if (inTrava) {   // acompanhamento com o alvo travado (a faixa da cabeça sozinha não conta)
                if (!arrastando) {
                    // Tracking: acompanha o deslocamento do alvo enquanto a mira está perto dele
                    ty += trackingScale * cat.tracking * omegaYaw * dt;
                    tp += -trackingScale * cat.tracking * omegaPitch * dt;
                    // Fecha o atraso que sobra quando o alvo se move; só com o alvo em movimento
                    float mov = MathUtils.clamp((float) Math.hypot(omegaYaw, omegaPitch) / TRACKING_MOV_RAD, 0f, 1f);
                    float fecha = trackingScale * cat.tracking * Math.min(1f, AimTuning.trackingGain * dt) * mov;
                    ty += errYaw * fecha;
                    tp += -errBelly * fecha;
                }
            }
            // Vertical: só fora da zona de tolerância (com histerese) e sem disputar o arrasto do dedo
            // Atração ao ABDÔMEN (ponto principal): nos dois sentidos, com zona + histerese, dentro do cone,
            // fora do arrasto e sem movimento do dedo. Volta em rampa depois de parar, sem puxão brusco.
            pullVertical = inTrava && !arrastando && !movendo
                    && zonaAtiva(pullVertical, errBellyGrau, AimTuning.zonaVertical, AimTuning.histerese);
            if (pullVertical) {
                float t = MathUtils.clamp((paradoT - AimTuning.retornoEsperaSeg) / AimTuning.retornoRampaSeg, 0f, 1f);
                float rampa = t * t * (3f - 2f * t);   // suavização (smoothstep)
                tp += -errBelly * Math.min(1f, 10f * dt) * AimSettings.abdAssist * fat * rampa;
            }
            // Horizontal: assistência suave para os lados (não disputa o arrasto vertical)
            if (inFov) ty += errYaw * Math.min(1f, 8f * dt) * AimSettings.horizAssist * fat;
        }

        // Limite conjunto (horizontal + vertical) da etapa atual
        float mag = (float) Math.sqrt(ty * ty + tp * tp);
        if (mag > limite && mag > 0f) {
            float s = limite / mag;
            ty *= s;
            tp *= s;
        }
        dYaw += ty;
        dPitch += tp;

        // 3. RESISTÊNCIA VERTICAL: o movimento do dedo para cima volta na fração configurada; reduzida no arrasto
        if (userDelta < -RUIDO_DEDO) {
            float resist = resistenciaEfetiva(AimSettings.upResist, arrastando, AimTuning.resistenciaArrasto);
            dPitch += -userDelta * resist;
        }

        // 4. FREIO: perto do centro do alvo, a sensibilidade manual diminui (piso garante movimento livre)
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
