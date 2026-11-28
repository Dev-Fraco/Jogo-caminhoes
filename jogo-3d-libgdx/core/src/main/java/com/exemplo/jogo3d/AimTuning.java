package com.exemplo.jogo3d;

import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.Preferences;

/**
 * Configuração da mira com os nomes dos parâmetros da documentação da Garena Craftland (estrutura para
 * ajustes futuros). Os valores padrão são NEUTROS: reproduzem o comportamento atual do projeto, sem mudança.
 *
 * Importante: os valores padrão são do projeto, não da Garena. A documentação oficial não informa padrões,
 * unidades nem intervalos de todos os campos; por isso as unidades não documentadas estão marcadas abaixo.
 *
 * SightAimAssist (Boolean) não está aqui: já existe como AimSettings.assistOn.
 *
 * Esta classe ainda NÃO altera a mecânica de tiro, a dispersão, o recuo, a sensibilidade nem a câmera.
 */
final class AimTuning {
    static final String PREFS = "aim_tuning_v1";

    /** Taxa de Atração da Mira Assistida na Tela (0 a 1). 1 = taxa atual do projeto (multiplicador neutro). */
    static float snapRange = 1f;
    /** Atenuação da assistência conforme a distância (0 a 1). 0 = sem atenuação (comportamento atual). */
    static float distFalloff = 0f;
    /** Prioridade por distância (liga/desliga). true = o termo de distância já usado hoje. */
    static boolean distPriority = true;
    /** Distância mínima considerada na prioridade (metros; unidade inferida, não documentada). 0 = sem mínimo. */
    static float distPrioMin = 0f;
    /** Distância máxima considerada na prioridade (metros; unidade inferida). 1000 = sem limite prático. */
    static float distPrioMax = 1000f;
    /** Impacto da prioridade por distância. Mínimo documentado: 1 (1 = peso atual do projeto). */
    static float distPrioCoef = 1f;
    /** Sensibilidade de Rotação ao Mirar. Intervalo não documentado. 1 = neutro (sem mudança). */
    static float rotSensitiveness = 1f;
    /** Dispersão Máxima. Unidade e intervalo não documentados. 0 = sem teto adicional (usa o da arma). */
    static float scatterMax = 0f;
    /** Taxa de Convergência da dispersão. Unidade e intervalo não documentados. 0 = sem convergência extra. */
    static float shrinkSpeed = 0f;
    /** Piso do freio da mira (experimental, não é valor da Garena): a sensibilidade nunca cai abaixo disso. */
    static float frictionFloor = 0.35f;
    /** Duração da aquisição do alvo depois de apertar o tiro (s). Experimental (não é valor da Garena). */
    static float aquisicaoSeg = 0.30f;
    /** Velocidade máxima da aquisição (°/s), separada do acompanhamento. Experimental. */
    static float aquisicaoVel = 150f;
    /** Intensidade da aquisição: fração do erro corrigida por quadro (0 a 1). Experimental. */
    static float aquisicaoForca = 1f;
    /** Zona de tolerância vertical em torno da barriga (°): dentro dela a assistência não empurra. Experimental. */
    static float zonaVertical = 0.4f;
    /** Histerese da zona vertical (°): liga a correção só acima de zona + histerese. Experimental. */
    static float histerese = 0.3f;
    /** Intensidade da atração ao abdômen durante a subida (0 a 1). Experimental. */
    static float atracaoSubida = 1f;
    /** Resistência magnética de base: fração do movimento de subida que volta assim que a mira sai do abdômen. Experimental. */
    static float resistenciaBase = 0.15f;
    /** Resistência magnética: fração adicional do movimento de subida por grau acima do abdômen. Experimental. */
    static float resistenciaGrau = 0.16f;
    /** Velocidade de referência do dedo (°/s): acima dela a resistência usa força cheia (com sensibilidade à velocidade). Experimental. */
    static float resistenciaVelRef = 60f;
    /** Sensibilidade da resistência à velocidade do dedo (0 = não depende da velocidade; 1 = proporcional). Experimental. */
    static float resistenciaSensVel = 0.3f;
    /** Variação máxima da correção por quadro (°/quadro): evita mudanças bruscas. Experimental. */
    static float resistenciaRampa = 0.05f;
    /** Amortecimento da correção (1/s): suaviza a leitura do toque e a correção. Experimental. */
    static float amortecimento = 12f;
    /** Velocidade máxima da volta ao abdômen quando o dedo para (°/s). Experimental. */
    static float retornoVel = 90f;
    /** Tempo parado do dedo até a assistência voltar a puxar para o abdômen (s). Experimental. */
    static float retornoEsperaSeg = 0.15f;
    /** Duração da rampa que devolve a força da atração ao abdômen depois de parar (s). Experimental. */
    static float retornoRampaSeg = 0.6f;
    /** Ganho do tracking sobre o erro (1/s): quão rápido a mira fecha o atraso de um alvo em movimento. Experimental. */
    static float trackingGain = 6f;

    /** Restaura os valores neutros (padrão do projeto). */
    static void restaurarPadroes() {
        snapRange = 1f;
        distFalloff = 0f;
        distPriority = true;
        distPrioMin = 0f;
        distPrioMax = 1000f;
        distPrioCoef = 1f;
        rotSensitiveness = 1f;
        scatterMax = 0f;
        shrinkSpeed = 0f;
        frictionFloor = 0.35f;
        aquisicaoSeg = 0.30f;
        aquisicaoVel = 150f;
        aquisicaoForca = 1f;
        zonaVertical = 0.4f;
        histerese = 0.3f;
        atracaoSubida = 1f;
        resistenciaBase = 0.15f;
        resistenciaGrau = 0.16f;
        resistenciaVelRef = 60f;
        resistenciaSensVel = 0.3f;
        resistenciaRampa = 0.05f;
        amortecimento = 12f;
        retornoVel = 90f;
        retornoEsperaSeg = 0.15f;
        retornoRampaSeg = 0.6f;
        trackingGain = 6f;
    }

    /** Corrige valores fora dos limites documentados ou impossíveis. Chamado depois de carregar ou editar. */
    static void validar() {
        snapRange = clamp(snapRange, 0f, 1f);
        distFalloff = clamp(distFalloff, 0f, 1f);
        distPrioMin = Math.max(0f, distPrioMin);
        distPrioMax = Math.max(distPrioMin, distPrioMax);
        distPrioCoef = Math.max(1f, distPrioCoef);   // mínimo documentado: 1
        rotSensitiveness = Math.max(0f, rotSensitiveness);
        scatterMax = Math.max(0f, scatterMax);
        shrinkSpeed = Math.max(0f, shrinkSpeed);
        frictionFloor = clamp(frictionFloor, 0.05f, 1f);
        aquisicaoSeg = Math.max(0.05f, aquisicaoSeg);
        aquisicaoVel = Math.max(10f, aquisicaoVel);
        aquisicaoForca = clamp(aquisicaoForca, 0f, 1f);
        zonaVertical = Math.max(0f, zonaVertical);
        histerese = Math.max(0f, histerese);
        atracaoSubida = clamp(atracaoSubida, 0f, 1f);
        resistenciaBase = clamp(resistenciaBase, 0f, 1f);
        resistenciaGrau = Math.max(0f, resistenciaGrau);
        resistenciaVelRef = Math.max(1f, resistenciaVelRef);
        resistenciaSensVel = clamp(resistenciaSensVel, 0f, 1f);
        resistenciaRampa = Math.max(0.001f, resistenciaRampa);
        amortecimento = Math.max(0.1f, amortecimento);
        retornoVel = Math.max(1f, retornoVel);
        retornoEsperaSeg = Math.max(0f, retornoEsperaSeg);
        retornoRampaSeg = Math.max(0.05f, retornoRampaSeg);
        trackingGain = Math.max(0f, trackingGain);
    }

    static void load() {
        try {
            Preferences p = Gdx.app.getPreferences(PREFS);
            snapRange = p.getFloat("snapRange", snapRange);
            distFalloff = p.getFloat("distFalloff", distFalloff);
            distPriority = p.getBoolean("distPriority", distPriority);
            distPrioMin = p.getFloat("distPrioMin", distPrioMin);
            distPrioMax = p.getFloat("distPrioMax", distPrioMax);
            distPrioCoef = p.getFloat("distPrioCoef", distPrioCoef);
            rotSensitiveness = p.getFloat("rotSensitiveness", rotSensitiveness);
            scatterMax = p.getFloat("scatterMax", scatterMax);
            shrinkSpeed = p.getFloat("shrinkSpeed", shrinkSpeed);
            frictionFloor = p.getFloat("frictionFloor", frictionFloor);
            aquisicaoSeg = p.getFloat("aquisicaoSeg", aquisicaoSeg);
            aquisicaoVel = p.getFloat("aquisicaoVel", aquisicaoVel);
            aquisicaoForca = p.getFloat("aquisicaoForca", aquisicaoForca);
            zonaVertical = p.getFloat("zonaVertical", zonaVertical);
            histerese = p.getFloat("histerese", histerese);
            atracaoSubida = p.getFloat("atracaoSubida", atracaoSubida);
            resistenciaBase = p.getFloat("resistenciaBase", resistenciaBase);
            resistenciaGrau = p.getFloat("resistenciaGrau", resistenciaGrau);
            resistenciaVelRef = p.getFloat("resistenciaVelRef", resistenciaVelRef);
            resistenciaSensVel = p.getFloat("resistenciaSensVel", resistenciaSensVel);
            resistenciaRampa = p.getFloat("resistenciaRampa", resistenciaRampa);
            amortecimento = p.getFloat("amortecimento", amortecimento);
            retornoVel = p.getFloat("retornoVel", retornoVel);
            retornoEsperaSeg = p.getFloat("retornoEsperaSeg", retornoEsperaSeg);
            retornoRampaSeg = p.getFloat("retornoRampaSeg", retornoRampaSeg);
            trackingGain = p.getFloat("trackingGain", trackingGain);
            validar();
        } catch (Throwable t) {
            // sem preferências: valores padrão
        }
    }

    static void save() {
        try {
            Preferences p = Gdx.app.getPreferences(PREFS);
            p.putFloat("snapRange", snapRange);
            p.putFloat("distFalloff", distFalloff);
            p.putBoolean("distPriority", distPriority);
            p.putFloat("distPrioMin", distPrioMin);
            p.putFloat("distPrioMax", distPrioMax);
            p.putFloat("distPrioCoef", distPrioCoef);
            p.putFloat("rotSensitiveness", rotSensitiveness);
            p.putFloat("scatterMax", scatterMax);
            p.putFloat("shrinkSpeed", shrinkSpeed);
            p.putFloat("frictionFloor", frictionFloor);
            p.putFloat("aquisicaoSeg", aquisicaoSeg);
            p.putFloat("aquisicaoVel", aquisicaoVel);
            p.putFloat("aquisicaoForca", aquisicaoForca);
            p.putFloat("zonaVertical", zonaVertical);
            p.putFloat("histerese", histerese);
            p.putFloat("atracaoSubida", atracaoSubida);
            p.putFloat("resistenciaBase", resistenciaBase);
            p.putFloat("resistenciaGrau", resistenciaGrau);
            p.putFloat("resistenciaVelRef", resistenciaVelRef);
            p.putFloat("resistenciaSensVel", resistenciaSensVel);
            p.putFloat("resistenciaRampa", resistenciaRampa);
            p.putFloat("amortecimento", amortecimento);
            p.putFloat("retornoVel", retornoVel);
            p.putFloat("retornoEsperaSeg", retornoEsperaSeg);
            p.putFloat("retornoRampaSeg", retornoRampaSeg);
            p.putFloat("trackingGain", trackingGain);
            p.flush();
        } catch (Throwable t) {
            // sem permissão de gravar: segue com os valores da memória
        }
    }

    private static float clamp(float v, float lo, float hi) {
        return Math.max(lo, Math.min(hi, v));
    }
}
