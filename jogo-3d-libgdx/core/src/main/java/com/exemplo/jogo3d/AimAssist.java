package com.exemplo.jogo3d;

import com.badlogic.gdx.math.MathUtils;
import com.badlogic.gdx.math.Vector3;

/**
 * Assistência de mira. Cada quadro calcula UMA correção (dYaw, dPitch) que o Main soma à câmera.
 *
 * 1. AQUISIÇÃO: ao apertar o tiro com o alvo no cone, a mira é puxada rápido ao abdômen (aquisicaoSeg,
 *    aquisicaoVel, aquisicaoForca). Suspensa enquanto o dedo se move: o controle manual tem prioridade.
 * 2. ATRAÇÃO AO ABDÔMEN, o ponto principal: com o dedo parado, a mira volta ao abdômen em rampa, com
 *    velocidade limitada (retornoVel), depois de uma pausa (retornoEsperaSeg) e uma rampa (retornoRampaSeg).
 * 3. RESISTÊNCIA MAGNÉTICA: enquanto o dedo sobe, a atração continua agindo como uma força contrária. Ela cresce
 *    com a altura acima do abdômen (resistenciaGrau × atracaoSubida), depende da velocidade do dedo
 *    (resistenciaSensVel), é limitada pelo ajuste de resistência vertical (AimSettings.upResist) e é suavizada
 *    (amortecimento, resistenciaRampa). Ela só diminui a subida: a correção nunca passa de 95% do movimento do
 *    dedo, então a mira nunca é puxada para baixo enquanto o jogador sobe.
 * 4. TRACKING horizontal: segue o deslocamento lateral do alvo (não é removido).
 * 5. FREIO: perto do centro do alvo, a sensibilidade manual diminui, nunca abaixo de frictionFloor.
 *
 * A sensibilidade do jogador não muda; a assistência só soma correções. Todos os valores vêm de AimTuning
 * (experimentais) e AimSettings (ajustes do jogador).
 */
final class AimAssist {
    /** dt máximo usado nos cálculos: depois de um travamento, a correção não dá um salto grande. */
    static final float DT_MAX = 0.05f;
    /** Velocidade angular (rad/s) a partir da qual o alvo é considerado em movimento (≈1,7°/s). */
    static final float TRACKING_MOV_RAD = 0.03f;
    /** Movimento do dedo menor que isto (rad/quadro, ≈0,01°) é ruído numérico, não dedo. */
    static final float RUIDO_DEDO = 2e-4f;
    /** Mantém o alvo travado até 1,5× o cone (mesma margem da escolha de alvo). */
    static final float MARGEM_TRAVA = 1.5f;
    /** Fração máxima do movimento do dedo que a assistência pode desfazer: sempre sobra movimento para subir. */
    static final float LIMITE_CONTRA = 0.95f;
    /** Suavização da leitura da velocidade do dedo (1/s): reduz o ruído do toque, mantém a resposta. */
    static final float VEL_SUAVIZA = 20f;
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
    private float paradoT = 10f;               // tempo desde o último movimento do dedo (s)
    private boolean moveuDesdeAperto;          // o dedo já se moveu desde o aperto do tiro (a aquisição não reengata)
    private boolean pullVertical;              // atração ao abdômen ligada (histerese da zona)
    private float velDedo;                     // velocidade suavizada do dedo subindo/descendo (rad/s)
    private float corrAlvo, corrOut;           // resistência magnética: alvo e saída já suavizada (rad)

    /** Esquece o movimento anterior (ao trocar de alvo ou de mira à força). */
    void reset() {
        havePitch = false;
        haveLast = false;
        lastTarget = null;
        aquisicaoT = 0f;
        paradoT = 10f;
        pullVertical = false;
        velDedo = 0f;
        corrAlvo = 0f;
        corrOut = 0f;
        moveuDesdeAperto = false;
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

    /**
     * Resistência magnética: fração do movimento de subida que volta, dada a altura acima do abdômen (graus), a
     * velocidade do dedo (°/s) e os parâmetros. Nunca passa de 'limite' (ajuste de resistência vertical).
     */
    static float fracaoResistencia(float altoAcimaGrau, float velDedoGrauS, float base, float grau, float atracao,
                                   float velRef, float sensVel, float limite) {
        float fDist = MathUtils.clamp((base + altoAcimaGrau * grau) * atracao, 0f, 1f);
        float velFac = MathUtils.clamp(velDedoGrauS / Math.max(1f, velRef), 0f, 1f);
        float fVel = 1f - sensVel + sensVel * velFac;
        return MathUtils.clamp(fDist * fVel, 0f, limite);
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
        boolean movendo = Math.abs(userDelta) > RUIDO_DEDO;
        paradoT = movendo ? 0f : Math.min(10f, paradoT + dtRaw);
        if (!AimSettings.assistOn || target == null || !target.alive() || !firing || dtRaw <= 0f) {
            lastPitch = pitch;
            haveLast = false;
            lastTarget = null;
            aquisicaoT = 0f;
            pullVertical = false;
            velDedo = 0f;
            corrAlvo = 0f;
            corrOut = 0f;
            return;
        }
        float dt = Math.min(dtRaw, DT_MAX);
        float subindoRad = -userDelta;                 // > 0: o dedo sobe (o pitch diminui)
        boolean subindo = subindoRad > RUIDO_DEDO;
        velDedo += (Math.abs(subindoRad) / dt - velDedo) * (1f - (float) Math.exp(-VEL_SUAVIZA * dt));

        // FOV: cone em volta da direção da mira, medido até o peito
        float fov = AimSettings.fovDeg() * cat.radiusScale * (ads ? 0.8f : 1f);
        Vector3 c = target.hitbox.chest;
        v.set(c).sub(cam);
        float dist = v.len();
        if (dist < 0.5f) { lastPitch = pitch; return; }
        float ang = anguloRedondo(v, dir);
        float tYaw = MathUtils.atan2(v.x, v.z);
        float errYaw = wrap(tYaw - yaw);
        // Ponto de atração: o ABDÔMEN (nunca o peito nem a cabeça). errBelly > 0: o abdômen está acima da mira
        float elevBelly = elev(cam, target.hitbox.belly);
        float errBelly = elevBelly - (-pitch);
        float errBellyGrau = errBelly / DEG;
        float altoAcimaGrau = -errBellyGrau;           // > 0: a mira está acima do abdômen
        boolean inFov = ang <= fov;
        boolean inTrava = ang <= fov * MARGEM_TRAVA;   // acompanhamento e atração: com margem, como a escolha de alvo
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

        if (firePress) moveuDesdeAperto = false;
        if (movendo) moveuDesdeAperto = true;
        if (firePress && inFov) aquisicaoT = AimTuning.aquisicaoSeg;   // apertou o tiro: começa a aquisição
        // A aquisição vale só no aperto: depois que o dedo se mexe, o controle é dele (não reengata ao parar)
        boolean aquisicao = aquisicaoT > 0f && inFov && !movendo && !moveuDesdeAperto;
        aquisicaoT = Math.max(0f, aquisicaoT - dt);

        if (aquisicao) {
            // 1. AQUISIÇÃO: puxa rápido para o abdômen, com velocidade e intensidade próprias
            float intensidade = AimTuning.aquisicaoForca * fat;
            float vel = AimTuning.aquisicaoVel * cat.assist;
            ty = passoAquisicao(errYaw, intensidade, vel, dt);
            tp = passoAquisicao(-errBelly, intensidade, vel, dt);
            limite = (float) Math.toRadians(vel) * dt;
            pullVertical = true;   // ao fim da aquisição, a zona já começa ligada
        } else {
            limite = passoMaximo(cat.maxDegPerSec, dt);
            // 4. TRACKING: o horizontal segue o alvo sempre; o vertical só com o dedo parado
            if (inTrava) {
                ty += trackingScale * cat.tracking * omegaYaw * dt;
                float mov = MathUtils.clamp((float) Math.hypot(omegaYaw, omegaPitch) / TRACKING_MOV_RAD, 0f, 1f);
                float fecha = trackingScale * cat.tracking * Math.min(1f, AimTuning.trackingGain * dt) * mov;
                ty += errYaw * fecha;
                if (!movendo) {
                    tp += -trackingScale * cat.tracking * omegaPitch * dt;
                    tp += -errBelly * fecha;
                }
            }
            // 2a. ATRAÇÃO AO ABDÔMEN ENQUANTO O DEDO SOBE: puxa proporcional à distância acima do abdômen
            // (força abdominal). O limite de 95% abaixo garante que a subida nunca é invertida.
            if (inTrava && subindo && altoAcimaGrau > 0f) {
                tp += -errBelly * Math.min(1f, 10f * dt) * AimSettings.abdAssist * fat;
            }
            // 2. ATRAÇÃO AO ABDÔMEN com o dedo parado: volta em rampa, com velocidade limitada
            pullVertical = inTrava && !movendo && zonaAtiva(pullVertical, errBellyGrau, AimTuning.zonaVertical, AimTuning.histerese);
            if (pullVertical) {
                float t = MathUtils.clamp((paradoT - AimTuning.retornoEsperaSeg) / AimTuning.retornoRampaSeg, 0f, 1f);
                float rampa = t * t * (3f - 2f * t);   // suavização (smoothstep)
                float retorno = -errBelly * Math.min(1f, 10f * dt) * AimSettings.abdAssist * fat * rampa;
                float lim = (float) Math.toRadians(AimTuning.retornoVel) * dt;
                tp += MathUtils.clamp(retorno, -lim, lim);
            }
            // Horizontal: assistência suave para os lados
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

        // 3. RESISTÊNCIA MAGNÉTICA: enquanto o dedo sobe acima do abdômen, a atração resiste à subida
        float alvo = 0f;
        if (inTrava && subindo && altoAcimaGrau > 0f) {
            float f = fracaoResistencia(altoAcimaGrau, velDedo / DEG, AimTuning.resistenciaBase, AimTuning.resistenciaGrau,
                    AimTuning.atracaoSubida,
                    AimTuning.resistenciaVelRef, AimTuning.resistenciaSensVel, AimSettings.upResist);
            alvo = f * subindoRad;
        }
        corrAlvo += (alvo - corrAlvo) * (1f - (float) Math.exp(-AimTuning.amortecimento * dt));
        float rampaMax = (float) Math.toRadians(AimTuning.resistenciaRampa);   // variação máxima por quadro
        corrOut += MathUtils.clamp(corrAlvo - corrOut, -rampaMax, rampaMax);
        dPitch += corrOut;

        // Garantia: enquanto o dedo sobe, a assistência nunca inverte o movimento (sempre sobra subida)
        if (subindo) {
            dPitch = MathUtils.clamp(dPitch, -LIMITE_CONTRA * subindoRad, AimSettings.upResist * subindoRad);
        }

        // 5. FREIO: perto do centro do alvo, a sensibilidade manual diminui (piso garante movimento livre)
        float proximidade = inFov ? 1f - ang / Math.max(1e-3f, fov) : 0f;
        friction = freio(cat.friction, proximidade, AimTuning.frictionFloor);

        if (inFov || inHead) {
            active = true;
            strengthNow = Math.max(strengthNow, 0.5f + 0.5f * AimSettings.abdAssist);
        }
        lastPitch = pitch + dPitch;
    }

    /**
     * Distância angular do alvo ao centro da mira, medida NA TELA: o deslocamento é projetado no plano da imagem
     * (tangente, sem deformação de cone) e o FOV vira um círculo, com o mesmo raio na horizontal e na vertical.
     * @param v   vetor câmera → alvo (não normalizado)
     * @param dir direção da mira (normalizada)
     * @return ângulo em graus entre o centro da mira e o alvo, medido como raio do círculo
     */
    static float anguloRedondo(Vector3 v, Vector3 dir) {
        float depth = v.dot(dir);
        if (depth <= 1e-4f) return 180f;   // atrás da câmera: fora de qualquer círculo
        // Eixo horizontal da imagem: perpendicular à mira e ao eixo vertical do mundo
        float rx = -dir.z, rz = dir.x;
        float rLen = (float) Math.sqrt(rx * rx + rz * rz);
        if (rLen < 1e-4f) { rx = 1f; rz = 0f; rLen = 1f; }   // mirando reto para cima/baixo
        rx /= rLen;
        rz /= rLen;
        // Eixo vertical da imagem: produto vetorial do eixo horizontal com a mira
        float uy = rz * dir.x - rx * dir.z;
        float ux = -rz * dir.y, uz = rx * dir.y;
        float uLen = (float) Math.sqrt(ux * ux + uy * uy + uz * uz);
        if (uLen < 1e-4f) return 0f;
        ux /= uLen;
        uy /= uLen;
        uz /= uLen;
        float tx = (v.x * rx + v.z * rz) / depth;
        float ty = (v.x * ux + v.y * uy + v.z * uz) / depth;
        float r = (float) Math.sqrt(tx * tx + ty * ty);
        return (float) Math.toDegrees(Math.atan(r));
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
