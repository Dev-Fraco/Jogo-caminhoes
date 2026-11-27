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

    /** Clima do quadrante de um ponto. */
    static Clima quadrante(float x, float z) {
        boolean esquerda = x < 0f, cima = z < 0f;
        if (cima) return esquerda ? INVERNO : MANGUE;   // 1 e 2
        return esquerda ? INVERNO : DESERTO;            // 3 e 4
    }
}
