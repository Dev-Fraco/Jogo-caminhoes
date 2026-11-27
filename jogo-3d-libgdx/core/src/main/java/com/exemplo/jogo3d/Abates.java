package com.exemplo.jogo3d;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Registro de abates da sala personalizada. Cada vítima conta uma vez só, creditada a quem fez o abate. Os eventos
 * novos são entregues uma vez (drenar) para o feed e os contadores. O servidor vai validar o mesmo ao sincronizar.
 */
final class Abates {
    static final class Abate {
        final String atacante, vitima;
        Abate(String atacante, String vitima) { this.atacante = atacante; this.vitima = vitima; }
    }

    private final Set<Object> vitimas = new HashSet<>();
    private final List<Abate> novos = new ArrayList<>();

    /** Registra o abate da vítima (identidade) por 'atacante'. Devolve false se essa vítima já tinha abate contado. */
    boolean registra(Object idVitima, String atacante, String nomeVitima) {
        if (!vitimas.add(idVitima)) return false;
        novos.add(new Abate(atacante, nomeVitima));
        return true;
    }

    /** Entrega os abates novos e esvazia a fila. */
    List<Abate> drenar() {
        List<Abate> copia = new ArrayList<>(novos);
        novos.clear();
        return copia;
    }

    void limpa() {
        vitimas.clear();
        novos.clear();
    }
}
