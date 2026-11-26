package com.exemplo.jogo3d;

import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.Preferences;
import com.badlogic.gdx.math.MathUtils;

/**
 * Sensibilidade da câmera e da assistência de mira. Salvo no aparelho (Preferences) e aplicado na
 * hora, sem reiniciar. Os valores padrão foram escolhidos para os primeiros testes.
 */
final class AimSettings {
    static final String PREFS = "aim_settings";

    static float general = 1.0f;       // sensibilidade geral
    static float horizontal = 1.0f;    // multiplica o giro para os lados
    static float vertical = 0.85f;     // multiplica o subir/descer (um pouco menor: puxar para a cabeça com controle)
    static float ads = 0.6f;           // multiplica tudo ao mirar
    static boolean assistOn = true;
    static float assistStrength = 0.6f;   // 0..1
    static float assistRadius = 7f;       // graus em volta da mira
    static float smoothing = 0.35f;       // 0 = cru, 1 = bem suavizado
    static final float[] category = {1f, 1f, 1f, 1f, 1f, 0.8f};   // por categoria (ordem do enum)

    /** Item ajustável: nome, mínimo, máximo e passo (para a tela de ajustes). */
    static final String[] NAMES = {"Sensibilidade geral", "Horizontal", "Vertical", "Ao mirar", "Assistência de mira",
            "Força da assistência", "Raio de atração", "Suavização", "Pistola", "Revólver", "Submetralhadora", "Fuzil",
            "Espingarda", "Precisão"};
    private static final float[][] RANGE = {{0.2f, 3f, 0.1f}, {0.3f, 2f, 0.05f}, {0.3f, 2f, 0.05f}, {0.2f, 1.5f, 0.05f},
            {0f, 1f, 1f}, {0f, 1f, 0.05f}, {2f, 15f, 0.5f}, {0f, 0.9f, 0.05f}, {0.3f, 2f, 0.05f}, {0.3f, 2f, 0.05f},
            {0.3f, 2f, 0.05f}, {0.3f, 2f, 0.05f}, {0.3f, 2f, 0.05f}, {0.3f, 2f, 0.05f}};

    static float get(int i) {
        switch (i) {
            case 0: return general;
            case 1: return horizontal;
            case 2: return vertical;
            case 3: return ads;
            case 4: return assistOn ? 1f : 0f;
            case 5: return assistStrength;
            case 6: return assistRadius;
            case 7: return smoothing;
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
            case 5: assistStrength = v; break;
            case 6: assistRadius = v; break;
            case 7: smoothing = v; break;
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
        if (i == 6) return String.format(java.util.Locale.US, "%.1f°", get(i));
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
        assistStrength = 0.6f; assistRadius = 7f; smoothing = 0.35f;
        for (int i = 0; i < category.length; i++) category[i] = i == 5 ? 0.8f : 1f;
    }
}
