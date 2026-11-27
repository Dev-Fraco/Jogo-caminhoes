package com.exemplo.jogo3d;

/**
 * Climas do mapa. O mapa é dividido ao meio em quatro quadrantes (vista do mapa, como na tela):
 * 1 = esquerda de cima (inverno), 2 = direita de cima (mangue), 3 = esquerda de baixo (inverno),
 * 4 = direita de baixo (deserto). "Cima" é o -z e "esquerda" é o -x, como no mapa.
 *
 * O terreno é feito em pedaços que nunca cruzam a linha dos quadrantes, então cada pedaço usa a
 * textura do próprio clima.
 */
enum Clima {
    INVERNO("textures/clima/inverno.jpg"),
    MANGUE("textures/clima/mangue.jpg"),
    DESERTO("textures/clima/deserto.jpg");

    /** Textura do chão do clima (arquivo em assets). */
    final String arquivo;

    Clima(String arquivo) {
        this.arquivo = arquivo;
    }

    /** Largura da transição entre dois climas (m), centrada nas linhas x = 0 e z = 0. */
    static final float FAIXA = 40f;

    private static float suave(float t) {
        t = Math.max(0f, Math.min(1f, t));
        return t * t * (3f - 2f * t);
    }

    /**
     * Peso de cada clima em (x, z) (out[ordinal]): somam 1. Dentro de cada quadrante vale 1 para o
     * clima dele; na faixa de FAIXA metros em volta das linhas x = 0 e z = 0 os pesos se misturam.
     */
    static void pesos(float x, float z, float[] out) {
        float sx = suave((x + FAIXA) / (2f * FAIXA));   // 0 = esquerda, 1 = direita
        float sz = suave((z + FAIXA) / (2f * FAIXA));   // 0 = cima, 1 = baixo
        out[INVERNO.ordinal()] = 1f - sx;                 // esquerda (cima e baixo)
        out[MANGUE.ordinal()] = sx * (1f - sz);            // direita de cima
        out[DESERTO.ordinal()] = sx * sz;                  // direita de baixo
    }

    /** Clima do quadrante de um ponto. */
    static Clima quadrante(float x, float z) {
        boolean esquerda = x < 0f, cima = z < 0f;
        if (cima) return esquerda ? INVERNO : MANGUE;   // 1 e 2
        return esquerda ? INVERNO : DESERTO;            // 3 e 4
    }
}
