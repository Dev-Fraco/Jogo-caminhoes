package com.exemplo.jogo3d;

import com.badlogic.gdx.math.MathUtils;
import com.badlogic.gdx.math.Vector3;

/**
 * Assistência de mira, com três controles em porcentagem (AimSettings):
 *
 * - Ao apertar para atirar, se o alvo estiver dentro do FOV, a mira vai na hora para o PEITO
 *   (fração "Atração ao peito" do caminho). O jogador é quem arrasta para cima até a cabeça.
 * - Enquanto segura o tiro: se a mira ficou abaixo do peito, sobe até ele; se subiu acima dele,
 *   a "Resistência para cima" (80% por padrão) devolve essa fração do movimento do dedo para cima:
 *   subir 10% vira 8% para baixo, de volta ao peito. 0% = livre, 100% = não sai do peito.
 * - Nunca sobe sozinha para a cabeça.
 *
 * A assistência só soma correções à câmera (dYaw, dPitch); a sensibilidade do jogador não muda.
 */
final class AimAssist {
    float dYaw, dPitch;        // correção deste quadro (radianos) para somar à câmera
    float friction = 1f;       // não usado agora (mantido para o HUD); sempre 1
    boolean active;            // para o indicador discreto na mira
    float strengthNow;         // 0..1 (intensidade visual do indicador)

    private final Vector3 v = new Vector3();
    /** Fração da correção lateral (para os lados) que sobra: 0,6 = 40% a menos de movimento lateral. */
    static final float LATERAL = 0.6f;
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
        // Movimento do dedo neste quadro (inclinação que mudou desde o último quadro, sem a nossa correção)
        float userDelta = havePitch ? MathUtils.clamp(pitch - lastPitch, -0.05f, 0.05f) : 0f;
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
        if (ang > fov) {
            lastPitch = pitch;
            return;
        }

        float tYaw = MathUtils.atan2(v.x, v.z);
        float errYaw = wrap(tYaw - yaw);
        float errElev = elev(cam, c) - (-pitch);   // > 0: o peito está acima da mira

        if (firePress) {
            // Instantânea: a mira vai para o peito na hora, na fração escolhida
            dYaw += errYaw * AimSettings.chestPull * LATERAL;
            dPitch += -errElev * AimSettings.chestPull;
        }
        // Enquanto segura: abaixo do peito, sobe até ele; acima, desconta parte do movimento para cima
        float k = Math.min(1f, 8f * dt);
        if (errElev > 0f) {
            dPitch += -errElev * k * AimSettings.chestPull;        // abaixo do peito: crava nele
        } else if (userDelta < 0f) {
            dPitch += -userDelta * AimSettings.upResist;           // o dedo subiu: a resistência devolve a maior parte
        }
        dYaw += errYaw * k * AimSettings.chestPull * LATERAL;

        active = true;
        strengthNow = Math.max(strengthNow, 0.5f + 0.5f * AimSettings.chestPull);
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
