package com.exemplo.jogo3d;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Salas online (fase 1): servidor e cliente reais, por sockets em localhost, na mesma porta livre.
 * Cobre criar, entrar por código, estado, pronto, iniciar, sair, lotação e corrida de entradas.
 */
public class SalaRedeTests {
    static int pass = 0, fail = 0;

    static void check(String name, boolean ok, String info) {
        System.out.println((ok ? "  OK   " : "  FALHA") + "  " + name + (info.isEmpty() ? "" : "  [" + info + "]"));
        if (ok) pass++; else fail++;
    }

    /** Roda a ação e devolve o motivo da falha (ou null se deu certo). */
    static String motivo(Runnable acao) {
        try {
            acao.run();
            return null;
        } catch (SalaRede.Falha f) {
            return f.getMessage();
        }
    }

    public static void main(String[] args) throws Exception {
        ServidorSalas servidor = new ServidorSalas(0);
        servidor.iniciar();
        final int portaUsada = servidor.porta();
        SalaRede.host = "127.0.0.1";
        SalaRede.porta = portaUsada;

        System.out.println("== Criar sala ==");
        String codigo = SalaRede.criar(2, 2, "Mapa", "Ana");
        check("criar devolve um código de 6 dígitos", codigo.matches("\\d{6}"), codigo);

        System.out.println("== Entrar por código ==");
        int[] bia = SalaRede.entrar(codigo, "Bia");
        check("Bia entra na equipe B (a outra equipe tem só a Ana)", bia[0] == Sala.B && bia[1] == 0,
                bia[0] + "/" + bia[1]);
        check("nome repetido é recusado", "NOME_EM_USO".equals(motivo(() -> SalaRede.entrar(codigo, "Ana"))), "");
        check("código inexistente é recusado", "CODIGO_INVALIDO".equals(motivo(() -> SalaRede.entrar("000000", "Caio"))), "");
        check("nome com TAB é recusado", "NOME_INVALIDO".equals(motivo(() -> SalaRede.entrar(codigo, "Ca\tio"))), "");
        check("nome vazio é recusado", motivo(() -> SalaRede.entrar(codigo, "   ")) != null, "");

        System.out.println("== Estado ==");
        SalaRede.Estado e = SalaRede.estado(codigo);
        check("líder é a Ana", "Ana".equals(e.lider), e.lider);
        check("estado mostra Ana na equipe A e Bia na B", "Ana".equals(e.nomes[Sala.A][0]) && "Bia".equals(e.nomes[Sala.B][0]), "");
        check("o líder já começa pronto (regra do jogo); a Bia não", e.prontos[Sala.A][0] && !e.prontos[Sala.B][0], "");
        check("sala ainda não iniciada", !e.iniciada, "");

        System.out.println("== Pronto e iniciar ==");
        check("iniciar sem todos prontos é recusado", motivo(() -> SalaRede.iniciar(codigo, "Ana")) != null, "");
        SalaRede.pronto(codigo, "Ana", true);
        SalaRede.pronto(codigo, "Bia", true);
        e = SalaRede.estado(codigo);
        check("pronto aparece no estado", e.prontos[Sala.A][0] && e.prontos[Sala.B][0], "");
        String mIni = motivo(() -> SalaRede.iniciar(codigo, "Ana"));
        check("com todos prontos, o líder inicia", mIni == null, "motivo: " + mIni);
        check("depois de iniciar, o estado mostra iniciada", SalaRede.estado(codigo).iniciada, "");
        check("não se inicia duas vezes", motivo(() -> SalaRede.iniciar(codigo, "Ana")) != null, "");

        System.out.println("== Lotação (2x2 = 4 jogadores) ==");
        String c2 = SalaRede.criar(2, 2, "Mapa", "Dani");
        SalaRede.entrar(c2, "Eli");
        SalaRede.entrar(c2, "Fabi");
        SalaRede.entrar(c2, "Gabi");
        check("a quinta pessoa é recusada: sala cheia",
                "SALA_CHEIA".equals(motivo(() -> SalaRede.entrar(c2, "Hugo"))), "");

        System.out.println("== Sair e fechar sala vazia ==");
        SalaRede.sair(c2, "Eli");
        check("depois que alguém sai, há vaga de novo", motivo(() -> SalaRede.entrar(c2, "Hugo")) == null, "");

        System.out.println("== Corrida: 20 pessoas tentam 4 vagas ao mesmo tempo ==");
        String c3 = SalaRede.criar(2, 2, "Mapa", "Lia");
        AtomicInteger entraram = new AtomicInteger();
        CountDownLatch partida = new CountDownLatch(1);
        List<Thread> ts = new ArrayList<>();
        for (int i = 0; i < 20; i++) {
            final int n = i;
            Thread t = new Thread(() -> {
                try {
                    partida.await();
                    SalaRede.entrar(c3, "J" + n);
                    entraram.incrementAndGet();
                } catch (Exception ex) {
                    // recusado: esperado para quem chegou depois das vagas
                }
            });
            ts.add(t);
            t.start();
        }
        partida.countDown();
        for (Thread t : ts) t.join();
        // A Lia já ocupa uma vaga: só 3 das 20 tentativas podem entrar
        check("exatamente 3 entram (a Lia ocupa a 4ª vaga)", entraram.get() == 3, "entraram " + entraram.get());
        SalaRede.Estado cheio = SalaRede.estado(c3);
        int ocupados = 0;
        for (int eq = 0; eq < 2; eq++) for (String nome : cheio.nomes[eq]) if (nome != null) ocupados++;
        check("a sala não passa de 4 ocupados", ocupados == 4, "ocupados " + ocupados);

        System.out.println("== Sala fecha quando esvazia ==");
        String c4 = SalaRede.criar(1, 1, "Mapa", "Max");
        SalaRede.sair(c4, "Max");
        check("sala vazia some: código deixa de existir", "CODIGO_INVALIDO".equals(motivo(() -> SalaRede.estado(c4))), "");

        System.out.println("== Formato e conexão ==");
        check("formato inválido é recusado", "FORMATO_INVALIDO".equals(motivo(() -> SalaRede.criar(9, 9, "Mapa", "X"))), "");
        servidor.fechar();
        SalaRede.porta = portaUsada;   // mesma porta, agora sem servidor
        check("sem servidor: falha de conexão", "SEM_CONEXAO".equals(motivo(() -> SalaRede.estado("123456"))), "");

        System.out.println("\nRESULTADO: " + pass + " ok, " + fail + " falhas");
        System.exit(fail == 0 ? 0 : 1);
    }
}
