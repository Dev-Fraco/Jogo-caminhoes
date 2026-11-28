package com.exemplo.jogo3d;

/**
 * Parâmetros da assistência magnética de mira (AimAssist). Tudo que afeta o comportamento fica aqui; nenhuma
 * outra classe guarda número mágico do sistema de mira.
 *
 * Unidades: graus para ângulos, segundos para tempo, 1/s para taxas de atração. Os valores são o ponto de
 * partida; os testes de AimAssistTests medem o efeito de cada um.
 */
final class AimTuning {
    private AimTuning() {}

    // ---- Aquisição (ao apertar o tiro) ----
    /** Liga o travamento instantâneo ao apertar o tiro. Desligado, a mira só é assistida depois de adquirir. */
    static boolean snapHabilitado = true;
    /** Raio do FOV de assistência, em graus, antes do multiplicador da categoria da arma (padrão do projeto). */
    static float fovBaseGrau = 15f;
    /** Diferença de ângulo (graus) abaixo da qual a distância vira critério de desempate. */
    static float desempateGrau = 0.3f;

    // ---- Atração magnética vertical (abdômen) ----
    /** Taxa mínima de atração vertical (1/s): força da atração com a mira perto do abdômen. */
    static float atracaoVerticalBase = 4f;
    /** Ganho progressivo da atração conforme a distância angular do abdômen (1/s por grau). */
    static float atracaoVerticalPorGrau = 2f;
    /** Taxa da atração horizontal de acompanhamento (1/s). */
    static float atracaoHorizontal = 8f;
    /**
     * Força máxima absoluta da atração (°/s). Limita a correção magnética mesmo com a mira longe do abdômen:
     * sem isso, a resistência cresce sem teto e um arrasto intencional rápido também seria bloqueado. Com
     * 90°/s, um dedo a 180°/s ainda sobe a 90°/s, e um dedo lento fica travado perto de 95% de resistência.
     */
    static float velocidadeMaxGrauS = 90f;

    // ---- Entrada manual x força magnética ----
    /**
     * Fração máxima do movimento manual que a força magnética pode desfazer. Com 0,95 o dedo sempre sobe pelo
     * menos 5% do que tentou: o capa é possível, mesmo com a resistência no máximo.
     */
    static float limiteResistenciaVertical = 0.95f;
    /** Mesmo limite, para o movimento horizontal (mais leve: o jogador deve conseguir girar). */
    static float limiteResistenciaHorizontal = 0.5f;
}
