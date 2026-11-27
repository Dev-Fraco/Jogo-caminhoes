package com.exemplo.jogo3d;

import java.util.HashMap;
import java.util.Map;
import java.util.Random;

/**
 * Salas criadas e códigos. Hoje fica no aparelho; o servidor vai implementar a mesma API (criar, entrar por código).
 * O código tem 6 dígitos e é único entre as salas abertas.
 */
final class SalaManager {
    static final int CODIGO_TAMANHO = 6;

    private final Map<String, Sala> salas = new HashMap<>();
    private final Random sorteio;

    SalaManager(Random sorteio) { this.sorteio = sorteio; }

    /** Cria uma sala. Devolve null se o formato for inválido. */
    Sala criar(int tamanhoA, int tamanhoB, String mapa, String lider) {
        if (!Sala.formatoValido(tamanhoA, tamanhoB)) return null;
        String codigo = novoCodigo();
        Sala s = new Sala(codigo, tamanhoA, tamanhoB, mapa, lider);
        salas.put(codigo, s);
        return s;
    }

    /** Busca pelo código (sem espaços, só dígitos). */
    Sala buscar(String codigo) {
        if (codigo == null) return null;
        return salas.get(codigo.trim());
    }

    /** Entra por código: devolve a sala ou o motivo. */
    Sala.Erro entrar(String codigo, String nome, Sala[] saida) {
        Sala s = buscar(codigo);
        if (s == null) return Sala.Erro.CODIGO_INVALIDO;
        Sala.Erro e = s.entrar(nome);
        if (e == Sala.Erro.NENHUM) saida[0] = s;
        return e;
    }

    /** Fecha a sala (quando ninguém resta ou o líder cancela). */
    void fechar(String codigo) { salas.remove(codigo); }

    private String novoCodigo() {
        String c;
        do {
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < CODIGO_TAMANHO; i++) sb.append((char) ('0' + sorteio.nextInt(10)));
            c = sb.toString();
        } while (salas.containsKey(c));
        return c;
    }
}
