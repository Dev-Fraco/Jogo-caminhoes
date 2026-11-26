package com.exemplo.jogo3d;

/**
 * Câmera e mira pelo toque: converte o arrasto do dedo (área da direita ou o próprio botão de
 * atirar) em giro (yaw) e subida/descida (pitch), com sensibilidade geral, horizontal e vertical
 * separadas, ao mirar, por categoria de arma e o atrito da assistência.
 *
 * Suavização: o arrasto entra num acumulador e sai aos poucos (nenhum movimento do dedo se perde,
 * só chega distribuído em alguns quadros), o que deixa o "puxar para cima" preciso e sem tremido.
 */
final class AimController {
    private static final float BASE = 4.0f;   // radianos por altura de tela arrastada (sensibilidade 100%)

    private float pendX, pendY;   // pixels ainda não aplicados
    float yawDelta, pitchDelta;   // resultado deste quadro (radianos)
    boolean touching;             // algum dedo controlando a câmera neste quadro

    /** Arrasto em pixels (x para a direita, y para BAIXO, como na tela). */
    void addDrag(float dxPx, float dyPx) {
        pendX += dxPx;
        pendY += dyPx;
    }

    void update(float dt, float screenH, boolean ads, WeaponConfig.Category cat, float friction) {
        float s = AimSettings.smoothing;
        float frac = s <= 0.001f ? 1f : 1f - (float) Math.pow(s, Math.max(dt, 1e-4f) * 30f);
        float ox = pendX * frac, oy = pendY * frac;
        pendX -= ox;
        pendY -= oy;
        if (Math.abs(pendX) < 0.01f) pendX = 0f;
        if (Math.abs(pendY) < 0.01f) pendY = 0f;
        float k = BASE / Math.max(1f, screenH) * AimSettings.general * (ads ? AimSettings.ads : 1f) * friction;
        if (cat != null) k *= AimSettings.category[cat.ordinal()];
        yawDelta = -ox * k * AimSettings.horizontal;     // dedo para a direita: câmera gira para a direita
        pitchDelta = oy * k * AimSettings.vertical;      // dedo para cima: mira sobe (pitch menor)
    }

    void clear() {
        pendX = pendY = 0f;
        yawDelta = pitchDelta = 0f;
    }
}
