package com.exemplo.jogo3d;

/**
 * Climas do mapa. O mapa é dividido ao meio em quatro quadrantes (vista do mapa, como na tela):
 * 1 = esquerda de cima (inverno), 2 = direita de cima (mangue), 3 = esquerda de baixo (inverno),
 * 4 = direita de baixo (deserto). "Cima" é o -z e "esquerda" é o -x, como no mapa.
 *
 * Nas bordas entre os quadrantes a cor do chão é misturada, numa faixa de FAIXA metros, para não
 * ter uma emenda seca no meio do mapa.
 */
enum Clima {
    INVERNO(0.92f, 0.95f, 1.00f, 0.85f),
    MANGUE(0.30f, 0.36f, 0.22f, 0.80f),
    DESERTO(0f, 0f, 0f, 0f);   // o deserto usa a cor normal da região (sem mistura)

    /** Cor-alvo do chão do clima (r, g, b) e quanto ela substitui a cor da região (0 a 1). */
    final float r, g, b, forca;

    Clima(float r, float g, float b, float forca) {
        this.r = r;
        this.g = g;
        this.b = b;
        this.forca = forca;
    }

    /** Largura da transição entre dois climas (m), centrada nas linhas x = 0 e z = 0. */
    static final float FAIXA = 40f;

    /** Clima do quadrante de um ponto, sem transição. */
    static Clima quadrante(float x, float z) {
        boolean esquerda = x < 0f, cima = z < 0f;
        if (cima) return esquerda ? INVERNO : MANGUE;   // 1 e 2
        return esquerda ? INVERNO : DESERTO;            // 3 e 4
    }

    private static float suave(float t) {
        t = Math.max(0f, Math.min(1f, t));
        return t * t * (3f - 2f * t);
    }

    /**
     * Mistura a cor do chão (rgb, valores de 0 a 1) com o clima do ponto, em (x, z).
     * O resultado é gravado de volta em rgb.
     */
    static void mistura(float x, float z, float[] rgb) {
        float sx = suave((x + FAIXA) / (2f * FAIXA));   // 0 = esquerda, 1 = direita
        float sz = suave((z + FAIXA) / (2f * FAIXA));   // 0 = cima, 1 = baixo
        float wInverno = (1f - sx) * (1f - sz) + (1f - sx) * sz;   // quadrantes 1 e 3
        float wMangue = sx * (1f - sz);                            // quadrante 2
        float s = wInverno * INVERNO.forca + wMangue * MANGUE.forca;
        if (s <= 0f) return;
        float tr = (wInverno * INVERNO.r + wMangue * MANGUE.r) / (wInverno + wMangue);
        float tg = (wInverno * INVERNO.g + wMangue * MANGUE.g) / (wInverno + wMangue);
        float tb = (wInverno * INVERNO.b + wMangue * MANGUE.b) / (wInverno + wMangue);
        rgb[0] = rgb[0] * (1f - s) + tr * s;
        rgb[1] = rgb[1] * (1f - s) + tg * s;
        rgb[2] = rgb[2] * (1f - s) + tb * s;
    }
}
