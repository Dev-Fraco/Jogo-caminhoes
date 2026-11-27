package com.exemplo.jogo3d;

import com.badlogic.gdx.math.MathUtils;
import com.badlogic.gdx.math.Vector3;

/**
 * Assistência de mira, com três parâmetros independentes (AimSettings):
 *
 * - Ao apertar para atirar, com o alvo no FOV, a mira gruda na BARRIGA (ponto entre quadril e peito).
 * - Enquanto segura o tiro, puxa de volta para a barriga com a "Força abdominal" (10% por padrão: suave).
 *   Nunca puxa para o peito nem para a cabeça.
 * - Resistência vertical: acima da barriga, a fração "Resistência vertical" (90% por padrão) do movimento
 *   do dedo para cima volta para baixo. Subir 10 unidades rende 1. Fica sempre pesada, em qualquer sensibilidade.
 * - Assistência horizontal: correção para os lados (10% por padrão).
 *
 * A assistência só soma correções à câmera (dYaw, dPitch); a sensibilidade do jogador não muda.
 */
final class AimAssist {
    float dYaw, dPitch;        // correção deste quadro (radianos) para somar à câmera
    float friction = 1f;       // não usado agora (mantido para o HUD); sempre 1
    boolean active;            // para o indicador discreto na mira
    float strengthNow;         // 0..1 (intensidade visual do indicador)

    /** Alcance da arma em uso (m): a queda por distância vai de 0 a este valor. Atualizado pelo Main a cada quadro. */
    float alcance = 70f;

    private final Vector3 v = new Vector3();

    /**
     * Força da atração depois dos parâmetros da mira: SnapRange (taxa, 0 a 1) e DistFalloff (queda com a distância,
     * 0 a 1: no alcance máximo a força vale (1 - falloff)). Com os padrões (snap 1, falloff 0) é a força de sempre.
     */
    static float forca(float base, float dist, float range, float snap, float falloff) {
        float fracDist = MathUtils.clamp(dist / Math.max(1f, range), 0f, 1f);
        return base * snap * (1f - falloff * fracDist);
    }
    private float lastPitch;   // inclinação ao fim do último quadro (para saber o movimento do dedo)
    private boolean havePitch;

    /** Esquece o movimento anterior (ao trocar de alvo ou de mira à força). */
    void reset() { havePitch = false; }

    /**
     * @param yaw       direção da câmera (frente = (sin yaw, 0, cos yaw))
     * @param pitch     inclinação (positivo = câmera por cima); elevação da mira = -pitch
     * @param firing    segurando o tiro
     * @param firePress acabou de apertar o tiro (o momento da atração instantânea)
     */
    void update(float dt, Vector3 cam, Vector3 dir, float yaw, float pitch, Enemy target, WeaponConfig.Category cat,
                boolean firing, boolean firePress, boolean ads) {
        dYaw = 0f;
        dPitch = 0f;
        friction = 1f;
        active = false;
        strengthNow = Math.max(0f, strengthNow - dt * 4f);
        // Sem tiro apertado, não há referência: o próximo tiro começa do zero (salto de mira não conta como dedo)
        if (!firing) havePitch = false;
        // Movimento do dedo neste quadro (inclinação que mudou desde o último quadro, sem a nossa correção)
        float userDelta = havePitch ? MathUtils.clamp(pitch - lastPitch, -0.3f, 0.3f) : 0f;
        havePitch = true;
        if (!AimSettings.assistOn || target == null || !target.alive() || !firing || dt <= 0f) {
            lastPitch = pitch;
            return;
        }

        // FOV: cone em volta da direção da mira, medido até o peito
        float fov = AimSettings.fovDeg() * cat.radiusScale * (ads ? 0.8f : 1f);
        Vector3 c = target.hitbox.chest;
        v.set(c).sub(cam);
        float dist = v.len();
        if (dist < 0.5f) return;
        float ang = (float) Math.toDegrees(Math.acos(MathUtils.clamp(v.dot(dir) / dist, -1f, 1f)));
        float tYaw = MathUtils.atan2(v.x, v.z);
        float errYaw = wrap(tYaw - yaw);
        // Ponto de atração: a BARRIGA (nunca o peito nem a cabeça). > 0: a barriga está acima da mira
        float errBelly = elev(cam, target.hitbox.belly) - (-pitch);
        // Faixa da cabeça: a mira entre o peito e o topo da cabeça também conta (de perto a cabeça sai do FOV)
        boolean inFov = ang <= fov;
        boolean inHead = -pitch <= elev(cam, target.hitbox.headTop) + 0.03f;
        // A resistência vale com o alvo travado, mesmo fora do FOV: a sensibilidade alta não escapa dela.
        // Só a atração (gruda e puxa) depende de o alvo estar no FOV.
        float fat = forca(1f, dist, alcance, AimTuning.snapRange, AimTuning.distFalloff);
        if (firePress && inFov) {
            // Ao apertar o tiro, com o boneco no FOV: a mira gruda na barriga na hora (taxa e queda aplicadas)
            dYaw += errYaw * fat;
            dPitch += -errBelly * fat;
        }
        if (!firePress) {
            // Segurando o tiro: a mira desce sozinha para a barriga (força abdominal), quando o dedo para ou sobe pouco
            dPitch += -errBelly * Math.min(1f, 10f * dt) * AimSettings.abdAssist * fat;
            if (inFov) dYaw += errYaw * Math.min(1f, 8f * dt) * AimSettings.horizAssist * fat;
        }
        // Resistência vertical: TODO movimento do dedo para cima, com o tiro apertado, volta na fração configurada
        // (90%: subir 100% vira 90% para baixo). Fração do movimento já escalado pela sensibilidade: a sensibilidade
        // alta não elimina a resistência.
        if (userDelta < 0f) {
            dPitch += -userDelta * AimSettings.upResist;
        }

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
