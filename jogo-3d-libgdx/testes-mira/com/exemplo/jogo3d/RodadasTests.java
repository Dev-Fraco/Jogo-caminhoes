package com.exemplo.jogo3d;

import java.util.HashMap;
import java.util.Map;

/** Rounds (15 + desempate), economia e loja (validação), espectador. Regras locais; o servidor valida o mesmo. */
public class RodadasTests {
    static int pass = 0, fail = 0;

    static void check(String name, boolean ok, String info) {
        System.out.println((ok ? "  OK   " : "  FALHA") + "  " + name + (info.isEmpty() ? "" : "  [" + info + "]"));
        if (ok) pass++; else fail++;
    }

    static void passarRound(Rodadas r, int vencedor) {
        // preparação, combate e fim do round
        r.tick(Rodadas.PREPARO_SEG + 0.1f);
        r.encerraRound(vencedor);
        r.tick(Rodadas.FIM_SEG + 0.1f);
    }

    public static void main(String[] args) {
        System.out.println("== Rounds: fases e tempo ==");
        Rodadas r = new Rodadas();
        check("começa em preparação com compra liberada", r.fase == Rodadas.Fase.PREPARO && r.compraLiberada(), "");
        r.tick(Rodadas.PREPARO_SEG + 0.1f);
        check("depois da preparação, o combate começa", r.combate() && !r.compraLiberada(), "");
        check("compra bloqueada durante o combate", !r.compraLiberada(), "");
        r.tick(Rodadas.COMBATE_SEG + 0.1f);
        check("combate sem vencedor, por tempo, termina sem ponto", r.fase == Rodadas.Fase.FIM_ROUND && r.pontos[0] == 0 && r.pontos[1] == 0, "");
        r.tick(Rodadas.FIM_SEG + 0.1f);
        check("depois da transição vem o round 2", r.round == 2 && r.fase == Rodadas.Fase.PREPARO, "round " + r.round);

        System.out.println("== Pontos e placar ==");
        Rodadas p = new Rodadas();
        passarRound(p, 0);
        check("vitória do azul vale 1 ponto", p.pontos[0] == 1 && p.pontos[1] == 0, "");
        passarRound(p, 1);
        check("vitória do vermelho vale 1 ponto", p.pontos[0] == 1 && p.pontos[1] == 1, "");
        check("rótulo mostra ROUND 3/15", p.rotulo().equals("ROUND 3/15"), p.rotulo());

        System.out.println("== 15 rounds: quem tem mais vence ==");
        Rodadas f = new Rodadas();
        for (int i = 0; i < 15; i++) passarRound(f, i % 3 == 0 ? 1 : 0);   // azul 10, vermelho 5
        check("após 15 rounds, azul com mais rounds vence a partida", f.partidaAcabou() && f.vencedorPartida == 0, "placar " + f.pontos[0] + "x" + f.pontos[1]);

        System.out.println("== Empate: round decisivo ==");
        Rodadas e = new Rodadas();
        for (int i = 0; i < 15; i++) passarRound(e, i % 2);                 // 8 x 7 não é empate...
        // força empate: troca o último round por empate sem ponto
        Rodadas g = new Rodadas();
        for (int i = 0; i < 14; i++) passarRound(g, i % 2);                 // 7 x 7
        g.tick(0f);
        g.encerraRound(-1);                                                  // round 15 sem vencedor
        g.tick(Rodadas.FIM_SEG + 0.1f);
        check("empate após 15 rounds não encerra a partida", !g.partidaAcabou() && g.desempate(), "round " + g.round);
        check("rótulo do desempate", g.rotulo().equals("DESEMPATE"), g.rotulo());
        passarRound(g, 1);
        check("o round decisivo decide a partida", g.partidaAcabou() && g.vencedorPartida == 1, "vencedor " + g.vencedorPartida);

        System.out.println("== Economia e loja (ligada) ==");
        Economia.ativa = true;
        Economia eco = new Economia();
        eco.entrar("A1");
        eco.entrar("B1");
        check("crédito inicial é 800", eco.creditos("A1") == 800, "" + eco.creditos("A1"));
        Rodadas prep = new Rodadas();
        check("compra AKM (2700) sem crédito falha", eco.comprar("A1", 0, prep) == Economia.Erro.SEM_CREDITO, "");
        check("compra de MAGNUM 357 (650) com 800 funciona", eco.comprar("A1", 8, prep) == Economia.Erro.NENHUM && eco.creditos("A1") == 150, "" + eco.creditos("A1"));
        check("compra de item inexistente é recusada", eco.comprar("A1", 99, prep) == Economia.Erro.ITEM_INVALIDO, "");
        Rodadas comb = new Rodadas();
        comb.tick(Rodadas.PREPARO_SEG + 0.1f);
        check("compra no combate é recusada", eco.comprar("A1", 9, comb) == Economia.Erro.FORA_DA_PREPARACAO, "");
        check("equipar arma não comprada é recusado", eco.equipar("A1", 0) == Economia.Erro.SEM_ARMA_COMPRADA, "");
        check("equipar a arma comprada funciona", eco.equipar("A1", 8) == Economia.Erro.NENHUM && eco.armaEquipada("A1") == 8, "");
        check("sem compra, sem arma equipada", eco.armaEquipada("B1") == -1, "");
        check("munição (300) com 150 de crédito é recusada", eco.comprar("A1", 9, prep) == Economia.Erro.SEM_CREDITO, "");
        eco.comprar("B1", 9, prep);
        check("munição comprada conta", eco.municoesExtras("B1") == 1 && eco.creditos("B1") == 500, "" + eco.creditos("B1"));

        System.out.println("== Recompensas: vitória, derrota crescente, eliminação ==");
        Map<String, Integer> equipes = new HashMap<>();
        equipes.put("A1", 0);
        equipes.put("B1", 1);
        Economia r2 = new Economia();
        r2.entrar("A1");
        r2.entrar("B1");
        r2.registraEliminacao("A1");
        r2.recompensarRound(0, equipes);
        check("vitória do azul paga VITORIA + eliminação", r2.creditos("A1") == 800 + Economia.VITORIA + Economia.ELIMINACAO, "" + r2.creditos("A1"));
        check("derrota do vermelho paga a base", r2.creditos("B1") == 800 + Economia.DERROTA_BASE, "" + r2.creditos("B1"));
        r2.recompensarRound(0, equipes);
        check("derrota seguida do vermelho paga mais", r2.creditos("B1") == 800 + Economia.DERROTA_BASE + Economia.DERROTA_BASE + Economia.DERROTA_PASSO, "" + r2.creditos("B1"));

        System.out.println("== Espectador ==");
        check("morto com aliado vivo observa", Espectador.podeObservar(false, true), "");
        check("morto sem aliado vivo não observa (perdeu o round)", !Espectador.podeObservar(false, false), "");
        check("vivo não entra em espectador", !Espectador.podeObservar(true, true), "");
        boolean[] vivos = {false, true, false, true};
        check("próximo aliado vivo a partir do 0 é o 1", Espectador.proximo(vivos, 0, 1) == 1, "");
        check("anterior a partir do 1 pula o 0 (morto) e vai ao 3", Espectador.proximo(vivos, 1, -1) == 3, "" + Espectador.proximo(vivos, 1, -1));
        check("equipe sem ninguém vivo perde o round", Espectador.equipePerdeRound(new boolean[]{false, false}), "");
        check("equipe com alguém vivo não perde", !Espectador.equipePerdeRound(new boolean[]{false, true}), "");

        System.out.println("== Economia desligada: armas gratuitas, sem créditos ==");
        Economia.ativa = false;
        Economia off = new Economia();
        off.entrar("P1");
        check("sem economia, o saldo começa em 0", off.creditos("P1") == 0, "" + off.creditos("P1"));
        check("sem economia, compra de AKM é grátis", off.comprar("P1", 0, new Rodadas()) == Economia.Erro.NENHUM, "");
        check("sem economia, o saldo continua 0", off.creditos("P1") == 0, "" + off.creditos("P1"));
        check("sem economia, equipar qualquer arma funciona", off.equipar("P1", 8) == Economia.Erro.NENHUM && off.armaEquipada("P1") == 8, "");
        Map<String, Integer> eq = new HashMap<>();
        eq.put("P1", 0);
        off.recompensarRound(0, eq);
        check("sem economia, não há recompensa", off.creditos("P1") == 0, "" + off.creditos("P1"));
        Economia.ativa = true;

        System.out.println("== Abates: cada vítima conta uma vez, ao atirador ==");
        Abates ab = new Abates();
        Object v1 = new Object();
        check("abate novo é registrado", ab.registra(v1, "JOGADOR", "INIMIGO001"), "");
        check("o mesmo abate não conta duas vezes", !ab.registra(v1, "AMIGO002", "INIMIGO001"), "");
        check("o abate fica com quem atirou", ab.drenar().get(0).atacante.equals("JOGADOR"), "");
        check("depois de entregue, a fila fica vazia", ab.drenar().isEmpty(), "");

        System.out.println("== IA por equipe: aliados não atacam aliados nem o jogador ==");
        int azul1 = 0, azul2 = 0, verm = 1;
        check("dois azuis são da mesma equipe", Enemy.mesmaEquipe(azul1, azul2), "");
        check("azul e vermelho não são da mesma equipe", !Enemy.mesmaEquipe(azul1, verm), "");
        check("sem equipe (-1) não há aliado", !Enemy.mesmaEquipe(-1, -1), "");
        check("azul não mira no jogador", !Enemy.podeMirarJogador(0), "");
        check("vermelho mira no jogador", Enemy.podeMirarJogador(1), "");
        check("sem equipe, mantém o comportamento antigo", Enemy.podeMirarJogador(-1), "");
        Abates ab2 = new Abates();
        Object botVermelho = new Object();
        check("abate de bot creditado ao bot que atirou", ab2.registra(botVermelho, "AMIGO001", "INIMIGO001") && ab2.drenar().get(0).atacante.equals("AMIGO001"), "");

        System.out.println("\nRESULTADO: " + pass + " ok, " + fail + " falhas");
        System.exit(fail == 0 ? 0 : 1);
    }
}
