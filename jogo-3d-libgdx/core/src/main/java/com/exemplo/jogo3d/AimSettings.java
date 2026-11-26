package com.exemplo.jogo3d;

import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.Preferences;
import com.badlogic.gdx.math.MathUtils;

/**
 * Sensibilidade da câmera e da assistência de mira. Salvo no aparelho (Preferences) e aplicado na
 * hora, sem reiniciar. Os valores padrão foram escolhidos para os primeiros testes.
 */
final class AimSettings {
    static final String PREFS = "aim_settings_v2";   // v2: os controles de assistência mudaram (porcentagens)

    static float general = 1.0f;       // sensibilidade geral
    static float horizontal = 1.0f;    // multiplica o giro para os lados
    static float vertical = 0.85f;     // multiplica o subir/descer (um pouco menor: puxar para a cabeça com controle)
    static float ads = 0.6f;           // multiplica tudo ao mirar
    static boolean assistOn = true;
    static float chestPull = 0.8f;        // 0..1: atração instantânea ao peito quando aperta o tiro (e segura)
    static float fovPct = 0.4f;           // 0..1: raio do FOV do aim assist (2° a 15°)
    static float upResist = 0.35f;        // 0..1: resistência a subir a mira em direção à cabeça
    static float smoothing = 0.35f;       // 0 = cru, 1 = bem suavizado
    static final float[] category = {1f, 1f, 1f, 1f, 1f, 0.8f};   // por categoria (ordem do enum)

    /** Item ajustável: nome, mínimo, máximo e passo (para a tela de ajustes). */
    static final String[] NAMES = {"Sensibilidade geral", "Horizontal", "Vertical", "Ao mirar", "Assistência de mira",
            "Atração ao peito", "FOV do Aim Assist", "Suavização", "Pistola", "Revólver", "Submetralhadora", "Fuzil",
            "Espingarda", "Precisão", "Resistência para cima"};
    private static final float[][] RANGE = {{0.2f, 3f, 0.1f}, {0.3f, 2f, 0.05f}, {0.3f, 2f, 0.05f}, {0.2f, 1.5f, 0.05f},
            {0f, 1f, 1f}, {0f, 1f, 0.05f}, {0f, 1f, 0.05f}, {0f, 0.9f, 0.05f}, {0.3f, 2f, 0.05f}, {0.3f, 2f, 0.05f},
            {0.3f, 2f, 0.05f}, {0.3f, 2f, 0.05f}, {0.3f, 2f, 0.05f}, {0.3f, 2f, 0.05f}, {0f, 1f, 0.05f}};

    /** Raio do FOV do aim assist em graus: 2° (0%) a 15° (100%). */
    static float fovDeg() { return 2f + 13f * fovPct; }

    static float get(int i) {
        switch (i) {
            case 0: return general;
            case 1: return horizontal;
            case 2: return vertical;
            case 3: return ads;
            case 4: return assistOn ? 1f : 0f;
            case 5: return chestPull;
            case 6: return fovPct;
            case 7: return smoothing;
            case 14: return upResist;
            default: return category[i - 8];
        }
    }

    static void set(int i, float v) {
        v = MathUtils.clamp(v, RANGE[i][0], RANGE[i][1]);
        v = Math.round(v / RANGE[i][2]) * RANGE[i][2];
        switch (i) {
            case 0: general = v; break;
            case 1: horizontal = v; break;
            case 2: vertical = v; break;
            case 3: ads = v; break;
            case 4: assistOn = v > 0.5f; break;
            case 5: chestPull = v; break;
            case 6: fovPct = v; break;
            case 7: smoothing = v; break;
            case 14: upResist = v; break;
            default: category[i - 8] = v; break;
        }
    }

    /** Aumenta (+1) ou diminui (-1) um passo. */
    static void step(int i, int dir) {
        if (i == 4) { assistOn = !assistOn; return; }
        set(i, get(i) + dir * RANGE[i][2]);
    }

    static String text(int i) {
        if (i == 4) return assistOn ? "LIGADA" : "DESLIGADA";
        if (i == 6) return String.format(java.util.Locale.US, "%.0f%% (%.1f°)", get(i) * 100f, fovDeg());
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
        general = 1f; horizontal = 1f; vertical = 0.85f; ads = 0.6f; assistOn = true;
        chestPull = 0.8f; fovPct = 0.4f; upResist = 0.35f; smoothing = 0.35f;
        for (int i = 0; i < category.length; i++) category[i] = i == 5 ? 0.8f : 1f;
    }
}
