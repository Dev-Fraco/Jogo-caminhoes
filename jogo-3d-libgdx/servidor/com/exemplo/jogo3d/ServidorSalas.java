package com.exemplo.jogo3d;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.Random;

/**
 * Servidor de salas (fase 1): salas personalizadas por código, entre aparelhos.
 *
 * Usa as MESMAS regras de {@link Sala} e {@link SalaManager} que o jogo já tem. Protocolo: uma linha por
 * pedido e uma linha por resposta, com campos separados por TAB (UTF-8). Cada conexão faz um pedido e fecha.
 *
 * Pedidos:
 *   CRIAR  tamA tamB mapa nome          → OK codigo | ERRO motivo
 *   ENTRAR codigo nome                  → OK equipe slot | ERRO motivo
 *   ESTADO codigo                       → OK lider iniciada tamA tamB slotsA slotsB | ERRO motivo
 *   PRONTO codigo nome 0|1              → OK | ERRO motivo
 *   TROCAR codigo nome equipe           → OK | ERRO motivo
 *   REMOVER codigo quem alvo            → OK | ERRO motivo
 *   SAIR   codigo nome                  → OK | ERRO motivo
 *   INICIAR codigo quem                 → OK | ERRO motivo
 *
 * Em ESTADO, cada slot é "nome:pronto" (1 ou 0) ou "-" se vazio; os slots são separados por "|".
 * Salas e jogadores ficam só na memória: ao desligar o servidor, as salas somem (esperado nos testes).
 */
public final class ServidorSalas {
    static final int PORTA_PADRAO = 7777;
    static final int NOME_MAX = 16;

    private final SalaManager salas = new SalaManager(new Random());
    private final ServerSocket servidor;

    /** Abre a porta (0 = qualquer porta livre, útil nos testes). */
    public ServidorSalas(int porta) throws IOException {
        servidor = new ServerSocket(porta);
    }

    public int porta() { return servidor.getLocalPort(); }

    /** Começa a aceitar conexões em segundo plano. */
    public void iniciar() {
        Thread aceitar = new Thread(() -> {
            while (!servidor.isClosed()) {
                try {
                    Socket s = servidor.accept();
                    new Thread(() -> atender(s), "cliente-salas").start();
                } catch (IOException e) {
                    // servidor fechado: encerra o laço
                }
            }
        }, "servidor-salas");
        aceitar.setDaemon(true);
        aceitar.start();
    }

    public void fechar() throws IOException { servidor.close(); }

    private void atender(Socket s) {
        try (s; BufferedReader in = new BufferedReader(new InputStreamReader(s.getInputStream(), StandardCharsets.UTF_8));
             Writer out = new OutputStreamWriter(s.getOutputStream(), StandardCharsets.UTF_8)) {
            s.setSoTimeout(10_000);
            String linha = in.readLine();
            String resposta = linha == null ? "ERRO\tPEDIDO_VAZIO" : tratar(linha);
            out.write(resposta + "\n");
            out.flush();
        } catch (IOException e) {
            // conexão caiu no meio: nada a fazer
        }
    }

    /** Um pedido → uma resposta. Visível para os testes. */
    String tratar(String linha) {
        String[] p = linha.split("\t", -1);
        try {
            synchronized (salas) {
                switch (p[0]) {
                    case "CRIAR": return criar(p);
                    case "ENTRAR": return entrar(p);
                    case "ESTADO": return estado(p);
                    case "PRONTO": return pronto(p);
                    case "TROCAR": return trocar(p);
                    case "REMOVER": return remover(p);
                    case "SAIR": return sair(p);
                    case "INICIAR": return iniciar(p);
                    default: return "ERRO\tPEDIDO_DESCONHECIDO";
                }
            }
        } catch (ArrayIndexOutOfBoundsException | NumberFormatException e) {
            return "ERRO\tPEDIDO_INVALIDO";
        }
    }

    /** Nome válido: 1 a 16 caracteres, sem TAB, quebra de linha ou os separadores do protocolo. */
    static boolean nomeValido(String nome) {
        if (nome == null) return false;
        String n = nome.trim();
        return !n.isEmpty() && n.length() <= NOME_MAX && n.indexOf('\t') < 0 && n.indexOf('\n') < 0
                && n.indexOf('\r') < 0 && n.indexOf('|') < 0 && n.indexOf(':') < 0;
    }

    private String criar(String[] p) {
        if (p.length != 5) return "ERRO\tPEDIDO_INVALIDO";
        if (!nomeValido(p[4])) return "ERRO\tNOME_INVALIDO";
        Sala s = salas.criar(Integer.parseInt(p[1]), Integer.parseInt(p[2]), p[3], p[4].trim());
        return s == null ? "ERRO\tFORMATO_INVALIDO" : "OK\t" + s.codigo;
    }

    private String entrar(String[] p) {
        if (p.length != 3) return "ERRO\tPEDIDO_INVALIDO";
        if (!nomeValido(p[2])) return "ERRO\tNOME_INVALIDO";
        String nome = p[2].trim();
        Sala[] saida = new Sala[1];
        Sala.Erro e = salas.entrar(p[1], nome, saida);
        if (e != Sala.Erro.NENHUM) return "ERRO\t" + e.name();
        int equipe = saida[0].equipeDe(nome);
        return "OK\t" + equipe + "\t" + saida[0].slotDe(nome, equipe);
    }

    private String estado(String[] p) {
        Sala s = salas.buscar(p[1]);
        if (s == null) return "ERRO\tCODIGO_INVALIDO";
        return "OK\t" + s.lider() + "\t" + (s.iniciada() ? 1 : 0) + "\t" + s.tamanho[Sala.A] + "\t" + s.tamanho[Sala.B]
                + "\t" + slots(s, Sala.A) + "\t" + slots(s, Sala.B);
    }

    private static String slots(Sala s, int equipe) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < s.tamanho[equipe]; i++) {
            if (i > 0) sb.append('|');
            String nome = s.nomes[equipe][i];
            sb.append(nome == null ? "-" : nome + ":" + (s.prontos[equipe][i] ? 1 : 0));
        }
        return sb.toString();
    }

    private String pronto(String[] p) {
        Sala s = salas.buscar(p[1]);
        if (s == null) return "ERRO\tCODIGO_INVALIDO";
        return resultado(s.marcarPronto(p[2], "1".equals(p[3])));
    }

    private String trocar(String[] p) {
        Sala s = salas.buscar(p[1]);
        if (s == null) return "ERRO\tCODIGO_INVALIDO";
        return resultado(s.trocarEquipe(p[2], Integer.parseInt(p[3])));
    }

    private String remover(String[] p) {
        Sala s = salas.buscar(p[1]);
        if (s == null) return "ERRO\tCODIGO_INVALIDO";
        return resultado(s.remover(p[2], p[3]));
    }

    private String sair(String[] p) {
        Sala s = salas.buscar(p[1]);
        if (s == null) return "ERRO\tCODIGO_INVALIDO";
        Sala.Erro e = s.sair(p[2]);
        if (e == Sala.Erro.NENHUM && s.ocupados() == 0) salas.fechar(s.codigo);   // sala vazia: fecha
        return resultado(e);
    }

    private String iniciar(String[] p) {
        Sala s = salas.buscar(p[1]);
        if (s == null) return "ERRO\tCODIGO_INVALIDO";
        return resultado(s.iniciar(p[2]));
    }

    private static String resultado(Sala.Erro e) {
        return e == Sala.Erro.NENHUM ? "OK" : "ERRO\t" + e.name();
    }

    public static void main(String[] args) throws IOException, InterruptedException {
        int porta = args.length > 0 ? Integer.parseInt(args[0]) : PORTA_PADRAO;
        ServidorSalas servidor = new ServidorSalas(porta);
        servidor.iniciar();
        System.out.println("Servidor de salas na porta " + servidor.porta() + ". Ctrl+C para parar.");
        Thread.currentThread().join();   // fica no ar até ser interrompido
    }
}
