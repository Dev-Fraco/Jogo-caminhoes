package com.exemplo.jogo3d;

import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.Preferences;
import com.badlogic.gdx.math.MathUtils;

/**
 * Ajustes de mira e sensibilidade (tela "Mira e sensibilidade").
 *
 * Na tela ficam só: sensibilidade geral, mira 2x e mira 4x (as lunetas), a assistência de mira
 * (ligar/desligar), a atração ao peito e o FOV do aim assist. Os outros valores são fixos no código.
 */
final class AimSettings {
    static final String PREFS = "aim_settings_v6";   // v6: só geral, 2x e 4x na sensibilidade

    static float general = 1.0f;          // sensibilidade geral
    static float scope2x = 0.6f;          // mira 2x (luneta): multiplica a sensibilidade ao mirar
    static float scope4x = 0.35f;         // mira 4x (luneta)
    static float horizontal = 1.0f;       // fixo: giro para os lados
    static float vertical = 0.85f;        // fixo: subir/descer
    static float smoothing = 0.35f;       // fixo: suavização
    static final float[] category = {1f, 1f, 1f, 1f, 1f, 0.8f};   // fixo: por categoria de arma (ordem do enum)
    static boolean assistOn = true;
    static float chestPull = 0.8f;        // 0..1: atração instantânea ao peito quando aperta o tiro (e segura)
    static float fovPct = 0.4f;           // 0..1: raio do FOV do aim assist (2° a 15°)
    static float upResist = 0.95f;        // fixo: fração do movimento para cima que volta para o peito

    /** Ajuste da tela: nome, mínimo, máximo e passo. */
    static final String[] NAMES = {"Sensibilidade geral", "Mira 2x", "Mira 4x", "Assistência de mira",
            "Atração ao peito", "FOV do Aim Assist"};
    private static final float[][] RANGE = {{0.2f, 3f, 0.1f}, {0.1f, 2f, 0.05f}, {0.05f, 2f, 0.05f},
            {0f, 1f, 1f}, {0f, 1f, 0.05f}, {0f, 1f, 0.05f}};

    /** Raio do FOV do aim assist em graus: 2° (0%) a 15° (100%). */
    static float fovDeg() { return 2f + 13f * fovPct; }

    /** Multiplicador da sensibilidade ao mirar (por enquanto, o da mira 2x). */
    static float adsMul() { return scope2x; }

    static float get(int i) {
        switch (i) {
            case 0: return general;
            case 1: return scope2x;
            case 2: return scope4x;
            case 3: return assistOn ? 1f : 0f;
            case 4: return chestPull;
            default: return fovPct;
        }
    }

    static void set(int i, float v) {
        v = MathUtils.clamp(v, RANGE[i][0], RANGE[i][1]);
        v = Math.round(v / RANGE[i][2]) * RANGE[i][2];
        switch (i) {
            case 0: general = v; break;
            case 1: scope2x = v; break;
            case 2: scope4x = v; break;
            case 3: assistOn = v > 0.5f; break;
            case 4: chestPull = v; break;
            default: fovPct = v; break;
        }
    }

    /** Aumenta (+1) ou diminui (-1) um passo. */
    static void step(int i, int dir) {
        if (i == 3) { assistOn = !assistOn; return; }
        set(i, get(i) + dir * RANGE[i][2]);
    }

    static String text(int i) {
        if (i == 3) return assistOn ? "LIGADA" : "DESLIGADA";
        if (i == 5) return String.format(java.util.Locale.US, "%.0f%% (%.1f°)", get(i) * 100f, fovDeg());
        if (i == 1 || i == 2) return String.format(java.util.Locale.US, "%.2fx", get(i) / 1f);
        return Math.round(get(i) * 100f) + "%";
    }

    static void load() {
        try {
            Preferences p = Gdx.app.getPreferences(PREFS);
            for (int i = 0; i < NAMES.length; i++) {
                float v = p.getFloat("v" + i, Float.NaN);
                if (!Float.isNaN(v)) set(i, v);
            }
        } catch (Throwable t) {
            // sem preferências: valores padrão
        }
    }

    static void save() {
        try {
            Preferences p = Gdx.app.getPreferences(PREFS);
            for (int i = 0; i < NAMES.length; i++) p.putFloat("v" + i, get(i));
            p.flush();
        } catch (Throwable t) {
            // não salvou: vale até fechar o jogo
        }
    }

    static void reset() {
        general = 1f; scope2x = 0.6f; scope4x = 0.35f; assistOn = true;
        chestPull = 0.8f; fovPct = 0.4f;
    }
}
