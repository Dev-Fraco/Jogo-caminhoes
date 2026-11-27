package com.exemplo.jogo3d;

import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.Preferences;
import com.badlogic.gdx.math.MathUtils;

/**
 * Ajustes de mira e sensibilidade (tela "Mira e sensibilidade").
 *
 * Os valores ficam em unidades do jogo (multiplicadores e frações). A tela mostra cada um numa barra de
 * 0 a 200: sensibilidades e aberturas valem s/100 (100 = 1,0 = padrão); assistências e o FOV valem s/200
 * (fração); a resistência vertical vai até 95% (s = 190). Assim os valores atuais são preservados ao
 * migrar a tela: 100% de sensibilidade vira 100, 10% de força abdominal vira 20, 90% de resistência vira 180.
 */
final class AimSettings {
    static final String PREFS = "aim_settings_v9";   // v9: aim assist na barriga, resistência vertical própria

    static float general = 1.0f;          // sensibilidade geral
    static float scope2x = 0.6f;          // mira 2x (luneta): multiplica a sensibilidade ao mirar
    static float scope4x = 0.35f;         // mira 4x (luneta)
    static float horizontal = 1.0f;       // fixo: giro para os lados
    static float vertical = 0.85f;        // fixo: subir/descer
    static float smoothing = 0.35f;       // fixo: suavização
    static final float[] category = {1f, 1f, 1f, 1f, 1f, 0.8f};   // fixo: por categoria de arma (ordem do enum)
    static boolean assistOn = true;
    static float abdAssist = 0.10f;       // 0..1: força com que a mira sobe até a BARRIGA ao atirar (10%: suave)
    static float horizAssist = 0.1f;      // 0..1: força da correção para os lados ao atirar (baixa: sem puxão lateral)
    static float fovPct = 0.4f;           // 0..1: raio do FOV do aim assist (2° a 15°)
    /** Abertura da mira por arma (ordem de Weapons.BY_TYPE): 1 = 100% da abertura padrão. */
    static final float[] openPct = {1f, 1f, 1f, 1f, 1f, 1f, 1f, 1f, 1f};
    /**
     * Resistência vertical ao atirar: fração do movimento do dedo para cima, acima da barriga, que é devolvida.
     * 90% = subir 10 cm de dedo sobe 1 cm. Não depende da sensibilidade (é fração do movimento já escalado).
     */
    static float upResist = 0.90f;
    /**
     * Sensibilidade X (horizontal) e Y (vertical) só com o botão de atirar pressionado. 100% = sem mudança.
     * Fora do tiro, o arrasto segue a sensibilidade geral normal.
     */
    static float fireX = 1f;
    static float fireY = 1f;

    /** Itens da tela: índice = posição em NAMES (ordem interna, usada também para salvar). */
    static final String[] NAMES = {"Sensibilidade geral", "Mira 2x", "Mira 4x", "Assistência de mira",
            "Força abdominal (atração à barriga)", "Assistência horizontal", "FOV do Aim Assist",
            "Abertura AKM", "Abertura AUG", "Abertura GROZA", "Abertura M16A4", "Abertura M416", "Abertura SCAR-L", "Abertura AWM", "Abertura M1014", "Abertura MAGNUM 357",
            "Resistência vertical (subida)", "Sensi X (ao atirar)", "Sensi Y (ao atirar)"};

    // Tipos de barra: multiplicador (0..2), fração (0..1), resistência (0..0,95) e liga/desliga
    static final int K_MULT = 0, K_FRAC = 1, K_RESIST = 2, K_TOGGLE = 3;
    static final float RESIST_MAX = 0.95f;

    static int kind(int i) {
        if (i == 3) return K_TOGGLE;
        if (i == 4 || i == 5 || i == 6) return K_FRAC;
        if (i == 16) return K_RESIST;
        return K_MULT;   // sensibilidades e aberturas
    }

    /** Abertura da mira da arma (ordem de BY_TYPE); fora da lista, o padrão. */
    static float openPct(int type) { return type >= 0 && type < openPct.length ? openPct[type] : 1f; }

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
            case 4: return abdAssist;
            case 5: return horizAssist;
            case 6: return fovPct;
            case 16: return upResist;
            case 17: return fireX;
            case 18: return fireY;
            default: return openPct[i - 7];
        }
    }

    /** Valor de um item na escala da tela (0..200). */
    static int toSlider(int i) {
        switch (kind(i)) {
            case K_MULT: return Math.round(get(i) * 100f);
            case K_TOGGLE: return assistOn ? 200 : 0;
            default: return Math.round(get(i) * 200f);
        }
    }

    /** Converte uma posição da barra (0..200) para o valor do jogo, dentro dos limites de cada item. */
    static float fromSlider(int i, int s) {
        s = MathUtils.clamp(s, 0, 200);
        switch (kind(i)) {
            case K_MULT: return s / 100f;
            case K_TOGGLE: return s >= 100 ? 1f : 0f;
            case K_RESIST: return Math.min(s / 200f, RESIST_MAX);
            default: return s / 200f;
        }
    }

    static void setSlider(int i, int s) { set(i, fromSlider(i, s)); }

    static void set(int i, float v) {
        switch (i) {
            case 0: general = clampMult(v); break;
            case 1: scope2x = clampMult(v); break;
            case 2: scope4x = clampMult(v); break;
            case 3: assistOn = v > 0.5f; break;
            case 4: abdAssist = clampFrac(v); break;
            case 5: horizAssist = clampFrac(v); break;
            case 6: fovPct = clampFrac(v); break;
            case 16: upResist = MathUtils.clamp(v, 0f, RESIST_MAX); break;
            case 17: fireX = clampMult(v); break;
            case 18: fireY = clampMult(v); break;
            default: openPct[i - 7] = clampMult(v); break;
        }
    }

    private static float clampMult(float v) { return MathUtils.clamp(v, 0f, 2f); }

    private static float clampFrac(float v) { return MathUtils.clamp(v, 0f, 1f); }

    static String text(int i) {
        if (i == 3) return assistOn ? "LIGADA" : "DESLIGADA";
        return String.valueOf(toSlider(i));
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
        abdAssist = 0.10f; horizAssist = 0.1f; fovPct = 0.4f; upResist = 0.90f; fireX = 1f; fireY = 1f;
        java.util.Arrays.fill(openPct, 1f);
    }
}
