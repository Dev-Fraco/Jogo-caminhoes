package com.exemplo.jogo3d;

import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.Preferences;
import com.badlogic.gdx.math.MathUtils;

/**
 * Ajustes de mira e sensibilidade (tela "Mira e sensibilidade").
 *
 * O jogo NÃO tem assistência de mira: a mira é só do dedo. Aqui ficam apenas as sensibilidades e as
 * aberturas por arma. A tela mostra cada item numa barra de 0 a 200, e o valor vale s/100
 * (100 = 1,0 = padrão).
 */
final class AimSettings {
    static final String PREFS = "aim_settings_v11";   // v11: sem assistência de mira

    static float general = 1.0f;          // sensibilidade geral
    static float scope2x = 0.6f;          // mira 2x (luneta): multiplica a sensibilidade ao mirar
    static float scope4x = 0.35f;         // mira 4x (luneta)
    static float horizontal = 1.0f;       // fixo: giro para os lados
    static float vertical = 0.85f;        // fixo: subir/descer
    static float smoothing = 0.35f;       // fixo: suavização
    static final float[] category = {1f, 1f, 1f, 1f, 1f, 0.8f};   // fixo: por categoria de arma (ordem do enum)
    /** Abertura da mira por arma (ordem de Weapons.BY_TYPE): 1 = 100% da abertura padrão. */
    static final float[] openPct = {1f, 1f, 1f, 1f, 1f, 1f, 1f, 1f, 1f};
    /**
     * Sensibilidade X (horizontal) e Y (vertical) só com o botão de atirar pressionado. 100% = sem mudança.
     * Fora do tiro, o arrasto segue a sensibilidade geral normal.
     */
    static float fireX = 1f;
    static float fireY = 1f;

    /** Itens da tela: índice = posição em NAMES (ordem interna, usada também para salvar). */
    static final String[] NAMES = {"Sensibilidade geral", "Mira 2x", "Mira 4x",
            "Abertura AKM", "Abertura AUG", "Abertura GROZA", "Abertura M16A4", "Abertura M416", "Abertura SCAR-L", "Abertura AWM", "Abertura M1014", "Abertura MAGNUM 357",
            "Sensi X (ao atirar)", "Sensi Y (ao atirar)"};

    /** Índice da primeira abertura de arma em NAMES. */
    static final int ABERTURA_0 = 3;
    /** Índices de fireX e fireY em NAMES. */
    static final int SENSI_X = 12, SENSI_Y = 13;

    /** Abertura da mira da arma (ordem de BY_TYPE); fora da lista, o padrão. */
    static float openPct(int type) { return type >= 0 && type < openPct.length ? openPct[type] : 1f; }

    /** Multiplicador da sensibilidade ao mirar (por enquanto, o da mira 2x). */
    static float adsMul() { return scope2x; }

    static float get(int i) {
        switch (i) {
            case 0: return general;
            case 1: return scope2x;
            case 2: return scope4x;
            case SENSI_X: return fireX;
            case SENSI_Y: return fireY;
            default: return openPct[i - ABERTURA_0];
        }
    }

    /** Valor de um item na escala da tela (0..200). */
    static int toSlider(int i) { return Math.round(get(i) * 100f); }

    /** Converte uma posição da barra (0..200) para o valor do jogo. */
    static float fromSlider(int i, int s) { return MathUtils.clamp(s, 0, 200) / 100f; }

    static void setSlider(int i, int s) { set(i, fromSlider(i, s)); }

    static void set(int i, float v) {
        switch (i) {
            case 0: general = clampMult(v); break;
            case 1: scope2x = clampMult(v); break;
            case 2: scope4x = clampMult(v); break;
            case SENSI_X: fireX = clampMult(v); break;
            case SENSI_Y: fireY = clampMult(v); break;
            default: openPct[i - ABERTURA_0] = clampMult(v); break;
        }
    }

    private static float clampMult(float v) { return MathUtils.clamp(v, 0f, 2f); }

    static String text(int i) { return String.valueOf(toSlider(i)); }

    /**
     * Índice que este item tinha nas versões com assistência de mira (v9 e v10), para aproveitar o que o
     * jogador já havia ajustado. -1 quando o item não existia lá.
     */
    private static int indiceAntigo(int i) {
        if (i == 0 || i == 1 || i == 2) return i;            // sensibilidade geral, mira 2x, mira 4x
        if (i == SENSI_X) return 17;
        if (i == SENSI_Y) return 18;
        return i - ABERTURA_0 + 7;                            // aberturas: eram 7..15
    }

    static void load() {
        try {
            Preferences p = Gdx.app.getPreferences(PREFS);
            Preferences v10 = Gdx.app.getPreferences("aim_settings_v10");
            Preferences v9 = Gdx.app.getPreferences("aim_settings_v9");
            for (int i = 0; i < NAMES.length; i++) {
                float v = p.getFloat("v" + i, Float.NaN);
                if (Float.isNaN(v)) {
                    int ant = indiceAntigo(i);
                    if (ant >= 0) {
                        v = v10.getFloat("v" + ant, Float.NaN);
                        if (Float.isNaN(v)) v = v9.getFloat("v" + ant, Float.NaN);
                    }
                }
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
        general = 1f; scope2x = 0.6f; scope4x = 0.35f; fireX = 1f; fireY = 1f;
        java.util.Arrays.fill(openPct, 1f);
    }
}
