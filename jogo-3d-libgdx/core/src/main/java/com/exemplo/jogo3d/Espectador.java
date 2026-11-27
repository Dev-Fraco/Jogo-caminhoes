package com.exemplo.jogo3d;

/** Espectador depois da morte: a câmera segue um aliado vivo, e o botão troca para o próximo/anterior vivo. */
final class Espectador {
    private Espectador() { }

    /** O jogador morto entra em espectador se ainda houver aliado vivo na equipe. */
    static boolean podeObservar(boolean jogadorVivo, boolean algumAliadoVivo) {
        return !jogadorVivo && algumAliadoVivo;
    }

    /**
     * Próximo aliado vivo a partir de 'atual' no sentido 'passo' (+1 ou -1), circular. Devolve -1 se ninguém vive.
     */
    static int proximo(boolean[] vivos, int atual, int passo) {
        int n = vivos.length;
        if (n == 0) return -1;
        int i = atual;
        for (int k = 0; k < n; k++) {
            i = ((i + passo) % n + n) % n;
            if (vivos[i]) return i;
        }
        return -1;
    }

    /** A equipe perde o round quando não sobra ninguém vivo nela. */
    static boolean equipePerdeRound(boolean[] vivosDaEquipe) {
        for (boolean v : vivosDaEquipe) if (v) return false;
        return true;
    }
}
