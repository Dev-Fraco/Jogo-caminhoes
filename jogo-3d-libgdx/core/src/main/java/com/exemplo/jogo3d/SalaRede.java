package com.exemplo.jogo3d;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;

/**
 * Cliente das salas online (fase 1). Fala com {@link ServidorSalas}: cada chamada abre uma conexão, envia um
 * pedido e lê a resposta. Não usa libGDX, então também roda nos testes do PC.
 *
 * O endereço do servidor é {@link #host} e {@link #porta}. Falhas de rede e respostas de erro viram
 * {@link Falha} com o motivo (o mesmo nome de {@link Sala.Erro}, ou um código de conexão).
 */
final class SalaRede {
    private SalaRede() {}

    /** Endereço do servidor de salas. Padrão: o próprio aparelho/PC (127.0.0.1). Troque pela configuração. */
    static String host = "127.0.0.1";
    static int porta = 7777;
    static int tempoLimiteMs = 4000;

    /** Erro de uma operação: {@link #getMessage()} traz o motivo (ex.: CODIGO_INVALIDO, SEM_CONEXAO). */
    static final class Falha extends RuntimeException {
        Falha(String motivo) { super(motivo); }
    }

    /** Estado de uma sala como o servidor informa. */
    static final class Estado {
        final String lider;
        final boolean iniciada;
        final int[] tamanho = new int[2];
        /** Por equipe, por slot: nome ou null. */
        final String[][] nomes = new String[2][];
        /** Por equipe, por slot: se está pronto. */
        final boolean[][] prontos = new boolean[2][];

        Estado(String lider, boolean iniciada, int tamA, int tamB) {
            this.lider = lider;
            this.iniciada = iniciada;
            this.tamanho[Sala.A] = tamA;
            this.tamanho[Sala.B] = tamB;
            nomes[Sala.A] = new String[tamA];
            nomes[Sala.B] = new String[tamB];
            prontos[Sala.A] = new boolean[tamA];
            prontos[Sala.B] = new boolean[tamB];
        }
    }

    /** Cria uma sala e devolve o código de 6 dígitos. */
    static String criar(int tamanhoA, int tamanhoB, String mapa, String nome) {
        return ok(pedir("CRIAR", String.valueOf(tamanhoA), String.valueOf(tamanhoB), mapa, nome)).get(0);
    }

    /** Entra numa sala. Devolve {equipe, slot}. */
    static int[] entrar(String codigo, String nome) {
        java.util.List<String> r = ok(pedir("ENTRAR", codigo, nome));
        return new int[]{Integer.parseInt(r.get(0)), Integer.parseInt(r.get(1))};
    }

    /** Lê o estado atual da sala (para atualizar a tela). */
    static Estado estado(String codigo) {
        java.util.List<String> r = ok(pedir("ESTADO", codigo));
        int tamA = Integer.parseInt(r.get(2)), tamB = Integer.parseInt(r.get(3));
        Estado e = new Estado(r.get(0), "1".equals(r.get(1)), tamA, tamB);
        lerSlots(r.get(4), e, Sala.A);
        lerSlots(r.get(5), e, Sala.B);
        return e;
    }

    static void pronto(String codigo, String nome, boolean pronto) {
        ok(pedir("PRONTO", codigo, nome, pronto ? "1" : "0"));
    }

    static void trocarEquipe(String codigo, String nome, int equipe) {
        ok(pedir("TROCAR", codigo, nome, String.valueOf(equipe)));
    }

    static void remover(String codigo, String quem, String alvo) {
        ok(pedir("REMOVER", codigo, quem, alvo));
    }

    static void sair(String codigo, String nome) {
        ok(pedir("SAIR", codigo, nome));
    }

    static void iniciar(String codigo, String quem) {
        ok(pedir("INICIAR", codigo, quem));
    }

    /** Slots "nome:1|-|Bob:0" → nomes e prontos da equipe. */
    private static void lerSlots(String texto, Estado e, int equipe) {
        String[] slots = texto.split("\\|", -1);
        for (int i = 0; i < slots.length && i < e.nomes[equipe].length; i++) {
            if ("-".equals(slots[i])) continue;
            int dois = slots[i].lastIndexOf(':');
            e.nomes[equipe][i] = slots[i].substring(0, dois);
            e.prontos[equipe][i] = "1".equals(slots[i].substring(dois + 1));
        }
    }

    /** Resposta "OK\t..." → campos depois do OK. "ERRO\tmotivo" vira Falha. */
    private static java.util.List<String> ok(String resposta) {
        String[] p = resposta.split("\t", -1);
        if (!"OK".equals(p[0])) throw new Falha(p.length > 1 ? p[1] : "RESPOSTA_INVALIDA");
        java.util.List<String> campos = new java.util.ArrayList<>();
        for (int i = 1; i < p.length; i++) campos.add(p[i]);
        return campos;
    }

    /** Envia um pedido e lê a linha de resposta. */
    static String pedir(String... campos) {
        // Um campo com TAB ou quebra de linha partiria o pedido em outros campos: recusa antes de enviar
        for (String c : campos) {
            if (c != null && (c.indexOf('\t') >= 0 || c.indexOf('\n') >= 0 || c.indexOf('\r') >= 0)) {
                throw new Falha("NOME_INVALIDO");
            }
        }
        String linha = String.join("\t", campos);
        try (Socket s = new Socket()) {
            s.connect(new InetSocketAddress(host, porta), tempoLimiteMs);
            s.setSoTimeout(tempoLimiteMs);
            try (Writer out = new OutputStreamWriter(s.getOutputStream(), StandardCharsets.UTF_8);
                 BufferedReader in = new BufferedReader(new InputStreamReader(s.getInputStream(), StandardCharsets.UTF_8))) {
                out.write(linha + "\n");
                out.flush();
                String resposta = in.readLine();
                if (resposta == null) throw new Falha("SEM_RESPOSTA");
                return resposta;
            }
        } catch (IOException e) {
            throw new Falha("SEM_CONEXAO");
        }
    }
}
