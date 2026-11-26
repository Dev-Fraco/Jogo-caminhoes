package com.exemplo.jogo3d;

import com.badlogic.gdx.math.MathUtils;

/**
 * Zona segura do battle royale: um círculo que espera, encolhe até o próximo e repete (5 fases, até
 * um círculo pequeno). Fora dele o jogador perde vida, cada vez mais rápido nas fases finais.
 * A faixa do HUD mostra o tempo; o minimapa mostra o círculo.
 */
final class Zone {
    static final float[] RADII = {175f, 120f, 75f, 40f, 16f};
    static final float[] DAMAGE = {1.0f, 2.0f, 3.5f, 5.0f, 8.0f};   // vida por segundo fora da zona
    private static final float FIRST_WAIT = 100f, WAIT = 60f, SHRINK = 40f;   // s (a primeira espera inclui o voo do avião)

    float cx, cz, radius;                 // círculo atual
    private float fromCx, fromCz, fromR, toCx, toCz, toR;
    int phase;                            // 0 = círculo inicial; sobe a cada encolhimento
    boolean shrinking;
    private float t;                      // tempo dentro da etapa (espera ou encolhimento)
    private final java.util.Random rnd;

    Zone(long seed) {
        rnd = new java.util.Random(seed);
        reset();
    }

    void reset() {
        phase = 0;
        shrinking = false;
        t = 0f;
        cx = (rnd.nextFloat() - 0.5f) * 80f;
        cz = (rnd.nextFloat() - 0.5f) * 80f;
        radius = RADII[0];
        planNext();
    }

    private void planNext() {
        int n = Math.min(phase + 1, RADII.length - 1);
        fromCx = cx;
        fromCz = cz;
        fromR = radius;
        toR = RADII[n];
        // o próximo círculo fica dentro do atual
        float maxOff = Math.max(0f, fromR - toR - 3f);
        float a = rnd.nextFloat() * MathUtils.PI2, d = rnd.nextFloat() * maxOff;
        toCx = fromCx + MathUtils.cos(a) * d;
        toCz = fromCz + MathUtils.sin(a) * d;
    }

    boolean finalPhase() { return phase >= RADII.length - 1; }

    void update(float dt) {
        if (finalPhase() && !shrinking) return;
        t += dt;
        if (!shrinking) {
            float wait = phase == 0 ? FIRST_WAIT : WAIT;
            if (t >= wait) {
                shrinking = true;
                t = 0f;
            }
        } else {
            float k = MathUtils.clamp(t / SHRINK, 0f, 1f);
            cx = fromCx + (toCx - fromCx) * k;
            cz = fromCz + (toCz - fromCz) * k;
            radius = fromR + (toR - fromR) * k;
            if (k >= 1f) {
                shrinking = false;
                phase = Math.min(phase + 1, RADII.length - 1);
                t = 0f;
                if (!finalPhase()) planNext();
            }
        }
    }

    boolean inside(float x, float z) {
        float dx = x - cx, dz = z - cz;
        return dx * dx + dz * dz <= radius * radius;
    }

    /** Vida por segundo perdida fora da zona. */
    float damagePerSecond() { return DAMAGE[Math.min(phase + (shrinking ? 1 : 0), DAMAGE.length - 1)]; }

    /** Próximo círculo (para o minimapa), válido enquanto não é a fase final. */
    float nextCx() { return toCx; }
    float nextCz() { return toCz; }
    float nextR() { return toR; }

    /** Segundos até a mudança de etapa. */
    float timeLeft() {
        if (finalPhase() && !shrinking) return 0f;
        float total = shrinking ? SHRINK : (phase == 0 ? FIRST_WAIT : WAIT);
        return Math.max(0f, total - t);
    }

    String label() {
        int s = Math.round(timeLeft());
        String time = String.format(java.util.Locale.US, "%02d:%02d", s / 60, s % 60);
        if (finalPhase() && !shrinking) return "Zona final";
        return shrinking ? "Zona Segura diminuindo  " + time : "Zona Segura diminui em  " + time;
    }
}
