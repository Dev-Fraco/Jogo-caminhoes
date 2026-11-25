package com.exemplo.jogo3d;

import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.Preferences;

/**
 * Configurações do jogo: taxa de quadros (30, 60, 90 ou 120) e qualidade gráfica (baixo, médio, ultra).
 * A suavização de serrilhado (MSAA) fica sempre ligada no lançador, em todas as qualidades.
 * Salvo no aparelho.
 */
final class Settings {

    static final int[] FPS_OPTIONS = {30, 60, 90, 120};
    static final String[] QUALITY_NAMES = {"Baixo", "Médio", "Ultra"};
    static final float[] DRAW_DISTANCE = {45f, 90f, 200f};   // objetos até esta distância
    static final float[] FENCE_DISTANCE = {30f, 50f, 80f};   // cerca até esta distância

    static int fps = 60;
    static int quality = 1;   // 0 baixo, 1 médio, 2 ultra

    private Settings() {}

    static float drawDistance() { return DRAW_DISTANCE[quality]; }

    static void load() {
        try {
            Preferences p = Gdx.app.getPreferences("configuracoes");
            fps = p.getInteger("fps", 60);
            quality = p.getInteger("qualidade", 1);
        } catch (Throwable t) {
            // sem preferências: fica com os padrões
        }
        if (!isFps(fps)) fps = 60;
        quality = Math.max(0, Math.min(2, quality));
    }

    static void save() {
        try {
            Preferences p = Gdx.app.getPreferences("configuracoes");
            p.putInteger("fps", fps);
            p.putInteger("qualidade", quality);
            p.flush();
        } catch (Throwable t) {
            // não salvou: vale até fechar o jogo
        }
    }

    static boolean isFps(int v) {
        for (int f : FPS_OPTIONS) if (f == v) return true;
        return false;
    }

    /** Aplica a taxa de quadros e a distância da cerca. */
    static void apply() {
        Gdx.graphics.setForegroundFPS(fps);
        FenceSystem.renderRadius = FENCE_DISTANCE[quality];
        FenceSystem.updateRadius = FENCE_DISTANCE[quality] * 0.8f;
    }
}
