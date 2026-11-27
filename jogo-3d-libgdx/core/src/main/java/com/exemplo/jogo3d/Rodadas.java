package com.exemplo.jogo3d;

/**
 * Partida de 15 rounds da sala personalizada (regras, sem desenho). Cada round: preparação (compra liberada),
 * combate (tempo limite), fim do round (transição). Vitória do round = 1 ponto. Ao fim dos 15, vence quem tem mais;
 * empate vai para um round decisivo (desempate), que termina na primeira vitória.
 * Só as regras; o servidor deve validar o mesmo ao sincronizar as equipes.
 */
final class Rodadas {
    static final int TOTAL = 15;
    static final float PREPARO_SEG = 20f, COMBATE_SEG = 150f, FIM_SEG = 5f;
    static final int CREDITO_INICIAL = 800;

    enum Fase { PREPARO, COMBATE, FIM_ROUND, FIM_PARTIDA }

    final int[] pontos = new int[2];                 // Sala.A (azul) e Sala.B (vermelha)
    int round = 1;                                   // 1 a 15; depois 16, 17... são desempate
    Fase fase = Fase.PREPARO;
    float tempo = PREPARO_SEG;                       // segundos restantes na fase
    int vencedorPartida = -1;                        // -1 enquanto a partida não acabou
    int ultimoVencedorRound = -2;                    // -2 = nenhum ainda; -1 = empate no round

    boolean compraLiberada() { return fase == Fase.PREPARO; }

    boolean combate() { return fase == Fase.COMBATE; }

    boolean desempate() { return round > TOTAL; }

    boolean partidaAcabou() { return fase == Fase.FIM_PARTIDA; }

    /** Avança o tempo; troca de fase quando o tempo da fase acaba. */
    void tick(float dt) {
        if (fase == Fase.FIM_PARTIDA) return;
        tempo -= dt;
        if (tempo > 0f) return;
        switch (fase) {
            case PREPARO:
                fase = Fase.COMBATE;
                tempo = COMBATE_SEG;
                break;
            case COMBATE:
                encerraRound(-1);                     // tempo esgotou: sem vencedor claro
                break;
            case FIM_ROUND:
                proximoRound();
                break;
            default:
                break;
        }
    }

    /** Fim do round com a equipe vencedora (Sala.A/Sala.B) ou -1 se empatou. */
    void encerraRound(int equipe) {
        if (fase != Fase.COMBATE && fase != Fase.PREPARO) return;
        ultimoVencedorRound = equipe;
        if (equipe == 0 || equipe == 1) pontos[equipe]++;
        fase = Fase.FIM_ROUND;
        tempo = FIM_SEG;
        // Partida: após o 15º round, vence quem tem mais; igualou, o próximo round que tiver vencedor decide
        if (round >= TOTAL) {
            if (pontos[0] != pontos[1]) {
                vencedorPartida = pontos[0] > pontos[1] ? 0 : 1;
                fase = Fase.FIM_PARTIDA;
            } else if (equipe == 0 || equipe == 1) {
                vencedorPartida = equipe;             // desempate decisivo: quem ganhou o round extra
                fase = Fase.FIM_PARTIDA;
            }
        }
    }

    /** Vai para o próximo round (depois da transição). */
    private void proximoRound() {
        round++;
        fase = Fase.PREPARO;
        tempo = PREPARO_SEG;
    }

    /** Placar curto para o HUD: "ROUND 4/15" ou "DESEMPATE". */
    String rotulo() {
        return desempate() ? "DESEMPATE" : "ROUND " + round + "/" + TOTAL;
    }

    /** Nome do estado da partida para o HUD. */
    String estado() {
        switch (fase) {
            case PREPARO: return "PREPARAÇÃO";
            case COMBATE: return "COMBATE";
            case FIM_ROUND: return "FIM DO ROUND";
            default: return "FIM DE JOGO";
        }
    }
}
