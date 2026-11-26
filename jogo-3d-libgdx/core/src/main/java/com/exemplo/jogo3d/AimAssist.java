package com.exemplo.jogo3d;

import com.badlogic.gdx.math.MathUtils;
import com.badlogic.gdx.math.Vector3;

/**
 * Assistência de mira: atração suave para o alvo escolhido pelo TargetDetection.
 *
 * - Lados: puxa a mira para o eixo do corpo, devagar (com teto em graus/s), mais forte perto do
 *   centro e sumindo na borda do raio.
 * - Acompanhamento: compensa parte do movimento do alvo (correndo de lado, vindo, indo embora).
 * - Atrito: a mira "pesa" um pouco ao passar sobre o corpo (fica mais fácil parar em cima).
 * - Vertical: só puxa para cima se a mira estiver ABAIXO do quadril, e para baixo se estiver bem
 *   acima da cabeça. Entre o quadril e a cabeça não puxa nada: puxar a mira do peito para a cabeça
 *   é sempre do jogador, e a assistência nunca trava na cabeça.
 * Tudo isso só mexe na câmera (yaw/pitch); o tiro sai da direção real da câmera.
 */
final class AimAssist {
    float dYaw, dPitch;        // correção deste quadro (radianos) para somar à câmera
    float friction = 1f;       // multiplica a sensibilidade manual
    boolean active;            // para o indicador discreto na mira
    float strengthNow;         // 0..1 (intensidade visual do indicador)

    private Enemy last;
    private float lastYaw, lastElev;
    private boolean haveLast;
    private final Vector3 q = new Vector3(), v = new Vector3();

    /**
     * @param yaw   direção da câmera (frente = (sin yaw, 0, cos yaw))
     * @param pitch inclinação (positivo = câmera por cima, mira para baixo); elevação da mira = -pitch
     * @param engaged atirando ou mexendo a câmera: assistência inteira; parado: metade
     */
    void update(float dt, Vector3 cam, Vector3 dir, float yaw, float pitch, Enemy target, WeaponConfig.Category cat,
                boolean engaged, boolean ads) {
        dYaw = 0f;
        dPitch = 0f;
        friction = 1f;
        active = false;
        strengthNow = Math.max(0f, strengthNow - dt * 4f);
        if (!AimSettings.assistOn || target == null || !target.alive() || dt <= 0f) {
            haveLast = false;
            last = null;
            return;
        }
        Hitbox hb = target.hitbox;
        float radius = AimSettings.assistRadius * cat.radiusScale * (ads ? 0.8f : 1f);
        float w = AimSettings.assistStrength * cat.assist * (engaged ? 1f : 0.5f);

        // Ponto do eixo do corpo (quadril → pescoço) mais perto da linha da mira
        TargetDetection.closestOnSegment(cam, dir, hb.pelvis, hb.a[3], q);
        v.set(q).sub(cam);
        float dist = v.len();
        if (dist < 0.5f) return;
        float tYaw = MathUtils.atan2(v.x, v.z);
        float errYaw = wrap(tYaw - yaw);
        float aimElev = -pitch;
        // Ângulo total até o corpo: some na borda do raio
        float ang = (float) Math.toDegrees(Math.acos(MathUtils.clamp(v.dot(dir) / dist, -1f, 1f)));
        if (ang > radius * 1.5f) { haveLast = false; return; }
        float fall = MathUtils.clamp(1f - (ang / radius) * (ang / radius), 0f, 1f);

        // Vertical: só fora da faixa quadril..topo da cabeça
        float ePel = elev(cam, hb.pelvis), eTop = elev(cam, hb.headTop);
        float errV = 0f;
        if (aimElev < ePel) errV = ePel - aimElev;                 // mira nas pernas/chão: sobe um pouco
        else if (aimElev > eTop + 0.03f) errV = (eTop - aimElev) * 0.5f;   // passou da cabeça: desce de leve

        float k = Math.min(1f, 6f * w * fall * dt);
        float cap = (float) Math.toRadians(cat.maxDegPerSec) * w * dt;
        float cy = MathUtils.clamp(errYaw * k, -cap, cap);
        float cv = MathUtils.clamp(errV * k * 0.7f, -cap * 0.7f, cap * 0.7f);

        // Acompanhar o movimento do alvo (velocidade angular dele visto da câmera)
        float elevNow = elev(cam, q);
        if (haveLast && last == target) {
            float rateY = wrap(tYaw - lastYaw) / dt, rateE = (elevNow - lastElev) / dt;
            // ignora saltos grandes (troca de ponto no corpo)
            if (Math.abs(rateY) < 3f) cy += rateY * cat.tracking * w * fall * dt;
            if (Math.abs(rateE) < 3f && errV != 0f) cv += rateE * cat.tracking * 0.5f * w * fall * dt;
        }
        last = target;
        lastYaw = tYaw;
        lastElev = elevNow;
        haveLast = true;

        dYaw = cy;
        dPitch = -cv;   // subir a mira = pitch menor
        // Atrito: mais forte com a mira em cima do corpo (dentro de ~1/3 do raio)
        float inner = MathUtils.clamp(1f - ang / (radius * 0.35f), 0f, 1f);
        friction = 1f - cat.friction * AimSettings.assistStrength * inner;
        active = true;
        strengthNow = Math.max(strengthNow, Math.min(1f, fall * (0.4f + 0.6f * w)));
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
