package com.exemplo.jogo3d;

import java.util.Random;

/**
 * Sala personalizada (regras, sem desenho nem rede). Duas equipes (A e B) com slots próprios; o criador é o líder.
 * Regras: cada equipe tem pelo menos 1 jogador para iniciar; no máximo 8 no total; ninguém ocupa dois slots;
 * só o líder remove jogadores e inicia a partida. O mesmo código roda no aparelho agora e, depois, no servidor.
 */
final class Sala {
    static final int MAX_JOGADORES = 8;
    static final int MIN_POR_EQUIPE = 1;
    static final int MAX_POR_EQUIPE = 7;      // com 8 no total, uma equipe pode ter até 7 (a outra pelo menos 1)

    /** Resultado de uma ação na sala (o texto é mostrado ao jogador). */
    enum Erro {
        NENHUM, CODIGO_INVALIDO, SALA_CHEIA, JA_INICIOU, EQUIPE_CHEIA, NAO_E_LIDER,
        NOME_EM_USO, JOGADOR_NAO_ENCONTRADO, EQUIPE_VAZIA, NAO_PRONTOS, FORMATO_INVALIDO
    }

    static final int A = 0, B = 1;

    final String codigo;
    final int[] tamanho = new int[2];                 // jogadores por equipe (formato)
    final String[][] nomes = new String[2][];         // slots: nome ou null
    final boolean[][] prontos = new boolean[2][];     // cada jogador marcou pronto
    final String mapa;
    private String lider;
    private boolean iniciada;

    Sala(String codigo, int tamanhoA, int tamanhoB, String mapa, String nomeLider) {
        this.codigo = codigo;
        this.mapa = mapa;
        tamanho[A] = tamanhoA;
        tamanho[B] = tamanhoB;
        nomes[A] = new String[tamanhoA];
        nomes[B] = new String[tamanhoB];
        prontos[A] = new boolean[tamanhoA];
        prontos[B] = new boolean[tamanhoB];
        lider = nomeLider;
        colocar(nomeLider, A);
        prontos[A][slotDe(nomeLider, A)] = true;   // o líder já está pronto
    }

    // ---------- formato ----------

    /** Formato válido: cada equipe com 1 a 7 jogadores e no máximo 8 no total. */
    static boolean formatoValido(int a, int b) {
        return a >= MIN_POR_EQUIPE && b >= MIN_POR_EQUIPE && a <= MAX_POR_EQUIPE && b <= MAX_POR_EQUIPE
                && a + b <= MAX_JOGADORES;
    }

    // ---------- consultas ----------

    String lider() { return lider; }

    boolean iniciada() { return iniciada; }

    int ocupados() { return ocupados(A) + ocupados(B); }

    int ocupados(int equipe) {
        int n = 0;
        for (String s : nomes[equipe]) if (s != null) n++;
        return n;
    }

    int vagas(int equipe) { return tamanho[equipe] - ocupados(equipe); }

    int total() { return tamanho[A] + tamanho[B]; }

    boolean cheia() { return ocupados() >= total(); }

    boolean estaNaSala(String nome) { return equipeDe(nome) >= 0; }

    /** Equipe em que o jogador está (A ou B) ou -1. */
    int equipeDe(String nome) {
        for (int e = A; e <= B; e++) if (slotDe(nome, e) >= 0) return e;
        return -1;
    }

    /** Pode iniciar: líder presente, cada equipe com pelo menos 1 jogador e todos prontos. */
    boolean podeIniciar() { return erroParaIniciar(lider) == Erro.NENHUM; }

    /** Motivo que impede o início (NENHUM = pode iniciar). Só o líder inicia. */
    Erro erroParaIniciar(String quem) {
        if (iniciada) return Erro.JA_INICIOU;
        if (!lider.equals(quem)) return Erro.NAO_E_LIDER;
        if (ocupados(A) < MIN_POR_EQUIPE || ocupados(B) < MIN_POR_EQUIPE) return Erro.EQUIPE_VAZIA;
        if (!todosProntos()) return Erro.NAO_PRONTOS;
        return Erro.NENHUM;
    }

    boolean todosProntos() {
        for (int e = A; e <= B; e++) for (int i = 0; i < nomes[e].length; i++) {
            if (nomes[e][i] != null && !prontos[e][i]) return false;
        }
        return true;
    }

    // ---------- ações ----------

    /** Entra na sala: vai para a equipe com mais vagas. */
    Erro entrar(String nome) {
        if (iniciada) return Erro.JA_INICIOU;
        if (estaNaSala(nome)) return Erro.NOME_EM_USO;
        if (cheia()) return Erro.SALA_CHEIA;
        int equipe = vagas(A) >= vagas(B) ? A : B;
        if (vagas(equipe) == 0) equipe = equipe == A ? B : A;
        colocar(nome, equipe);
        return Erro.NENHUM;
    }

    /** Sai da sala. Se o líder sair, o próximo jogador vira líder. */
    Erro sair(String nome) {
        int e = equipeDe(nome);
        if (e < 0) return Erro.JOGADOR_NAO_ENCONTRADO;
        int i = slotDe(nome, e);
        nomes[e][i] = null;
        prontos[e][i] = false;
        if (nome.equals(lider)) {
            lider = primeiroOcupante();
        }
        return Erro.NENHUM;
    }

    /** Troca o jogador de equipe, se houver vaga na outra. */
    Erro trocarEquipe(String nome, int destino) {
        if (iniciada) return Erro.JA_INICIOU;
        int origem = equipeDe(nome);
        if (origem < 0) return Erro.JOGADOR_NAO_ENCONTRADO;
        if (origem == destino) return Erro.NENHUM;
        if (vagas(destino) == 0) return Erro.EQUIPE_CHEIA;
        boolean estavaPronto = prontos[origem][slotDe(nome, origem)];
        nomes[origem][slotDe(nome, origem)] = null;
        prontos[origem][slotDe(nome, origem)] = false;
        colocar(nome, destino);
        prontos[destino][slotDe(nome, destino)] = estavaPronto;
        return Erro.NENHUM;
    }

    /** Só o líder remove outro jogador (nunca a si mesmo por esta ação). */
    Erro remover(String quem, String alvo) {
        if (iniciada) return Erro.JA_INICIOU;
        if (!lider.equals(quem)) return Erro.NAO_E_LIDER;
        if (alvo.equals(quem)) return Erro.NAO_E_LIDER;
        if (!estaNaSala(alvo)) return Erro.JOGADOR_NAO_ENCONTRADO;
        return sair(alvo);
    }

    /** Marca o jogador como pronto (ou não). */
    Erro marcarPronto(String nome, boolean pronto) {
        int e = equipeDe(nome);
        if (e < 0) return Erro.JOGADOR_NAO_ENCONTRADO;
        prontos[e][slotDe(nome, e)] = pronto;
        return Erro.NENHUM;
    }

    /** Início da partida: só se pode. */
    Erro iniciar(String quem) {
        Erro e = erroParaIniciar(quem);
        if (e == Erro.NENHUM) iniciada = true;
        return e;
    }

    // ---------- internos ----------

    private void colocar(String nome, int equipe) {
        for (int i = 0; i < nomes[equipe].length; i++) {
            if (nomes[equipe][i] == null) {
                nomes[equipe][i] = nome;
                prontos[equipe][i] = false;
                return;
            }
        }
    }

    int slotDe(String nome, int equipe) {
        for (int i = 0; i < nomes[equipe].length; i++) if (nome.equals(nomes[equipe][i])) return i;
        return -1;
    }

    private String primeiroOcupante() {
        for (int e = A; e <= B; e++) for (String s : nomes[e]) if (s != null) return s;
        return null;
    }
}
