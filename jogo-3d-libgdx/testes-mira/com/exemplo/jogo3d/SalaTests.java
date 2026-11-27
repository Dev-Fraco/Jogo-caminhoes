package com.exemplo.jogo3d;

import java.util.Random;

/** Sala personalizada (regras): formatos, equipes com pelo menos 1 jogador, código, entrada, líder e início. */
public class SalaTests {
    static int pass = 0, fail = 0;

    static void check(String name, boolean ok, String info) {
        System.out.println((ok ? "  OK   " : "  FALHA") + "  " + name + (info.isEmpty() ? "" : "  [" + info + "]"));
        if (ok) pass++; else fail++;
    }

    public static void main(String[] args) {
        System.out.println("== Formatos: NxM com pelo menos 1 por equipe e até 8 no total ==");
        check("1x1 é válido", Sala.formatoValido(1, 1), "");
        check("4x4 é válido (8 jogadores)", Sala.formatoValido(4, 4), "");
        check("2x1 e 3x3 são válidos", Sala.formatoValido(2, 1) && Sala.formatoValido(3, 3), "");
        check("personalizado 5x2 é válido (7 no total)", Sala.formatoValido(5, 2), "");
        check("equipe vazia (0) não é válida", !Sala.formatoValido(0, 4), "");
        check("9 no total não é válido", !Sala.formatoValido(5, 4), "");
        check("8 numa equipe só não é válido", !Sala.formatoValido(8, 1), "");

        System.out.println("== Criar sala e código ==");
        SalaManager gerente = new SalaManager(new Random(7));
        Sala s = gerente.criar(4, 4, "ARENA LIVRE", "Jogador01");
        check("criar sala 4x4 funciona", s != null, "");
        check("código tem 6 dígitos", s != null && s.codigo.matches("\\d{6}"), s == null ? "" : s.codigo);
        check("criador é o líder e entra na equipe A", s != null && s.lider().equals("Jogador01") && s.equipeDe("Jogador01") == Sala.A, "");
        check("formato inválido não cria sala", gerente.criar(0, 2, "ARENA LIVRE", "X") == null, "");
        Sala s2 = gerente.criar(2, 2, "ARENA LIVRE", "Outro");
        check("códigos de salas diferentes são diferentes", s != null && s2 != null && !s.codigo.equals(s2.codigo), "");

        System.out.println("== Entrar por código ==");
        Sala[] achou = new Sala[1];
        check("código errado mostra CODIGO_INVALIDO", gerente.entrar("000000", "Amigo1", achou) == Sala.Erro.CODIGO_INVALIDO, "");
        check("código com letras é inválido", gerente.entrar("ABC", "Amigo1", achou) == Sala.Erro.CODIGO_INVALIDO, "");
        check("código válido entra", gerente.entrar(s.codigo, "Amigo1", achou) == Sala.Erro.NENHUM && achou[0] == s, "");
        check("o amigo aparece na sala", s.estaNaSala("Amigo1"), "");
        check("mesmo nome não entra duas vezes", gerente.entrar(s.codigo, "Amigo1", achou) == Sala.Erro.NOME_EM_USO, "");
        check("entrar em equipe com vaga (B recebe o segundo)", s.equipeDe("Amigo1") == Sala.B, "");

        System.out.println("== Sala cheia ==");
        Sala cheia = gerente.criar(1, 1, "ARENA LIVRE", "Lider");
        gerente.entrar(cheia.codigo, "P2", achou);
        check("sala 1x1 com 2 fica cheia", cheia.cheia(), "");
        check("sala cheia não aceita outro", gerente.entrar(cheia.codigo, "P3", achou) == Sala.Erro.SALA_CHEIA, "");

        System.out.println("== Slots: ninguém ocupa dois slots ==");
        boolean dup = false;
        for (int e = 0; e < 2; e++) for (int i = 0; i < s.nomes[e].length; i++)
            for (int e2 = 0; e2 < 2; e2++) for (int j = 0; j < s.nomes[e2].length; j++)
                if (s.nomes[e][i] != null && s.nomes[e][i].equals(s.nomes[e2][j]) && (e != e2 || i != j)) dup = true;
        check("nenhum nome aparece em dois slots", !dup, "");

        System.out.println("== Trocar de equipe ==");
        Sala t = new Sala("111111", 2, 2, "ARENA LIVRE", "L");
        t.entrar("A2");
        check("trocar para equipe com vaga funciona", t.trocarEquipe("A2", Sala.B) == Sala.Erro.NENHUM && t.equipeDe("A2") == Sala.B, "");
        t.entrar("B2");
        t.entrar("B3");
        check("trocar para equipe cheia é recusado", t.trocarEquipe("L", Sala.B) == Sala.Erro.EQUIPE_CHEIA, "");

        System.out.println("== Remover jogador: só o líder ==");
        Sala r = new Sala("222222", 2, 2, "ARENA LIVRE", "L");
        r.entrar("X");
        check("não líder não remove", r.remover("X", "L") == Sala.Erro.NAO_E_LIDER, "");
        check("líder remove outro", r.remover("L", "X") == Sala.Erro.NENHUM && !r.estaNaSala("X"), "");
        check("líder não remove a si mesmo", r.remover("L", "L") == Sala.Erro.NAO_E_LIDER, "");

        System.out.println("== Iniciar: regras obrigatórias ==");
        Sala v = new Sala("333333", 2, 2, "ARENA LIVRE", "L");
        check("não inicia com equipe B vazia", v.erroParaIniciar("L") == Sala.Erro.EQUIPE_VAZIA, "");
        v.entrar("B1");
        check("não inicia se alguém não está pronto", v.erroParaIniciar("L") == Sala.Erro.NAO_PRONTOS, "");
        v.marcarPronto("B1", true);
        check("inicia quando todos estão prontos e há 1 por equipe", v.erroParaIniciar("L") == Sala.Erro.NENHUM, "");
        check("não líder não inicia", v.erroParaIniciar("B1") == Sala.Erro.NAO_E_LIDER, "");
        check("líder inicia a partida", v.iniciar("L") == Sala.Erro.NENHUM && v.iniciada(), "");
        check("depois de iniciada, ninguém entra", v.entrar("Tarde") == Sala.Erro.JA_INICIOU, "");

        System.out.println("== Líder sai: passa para outro jogador ==");
        Sala w = new Sala("444444", 2, 2, "ARENA LIVRE", "L");
        w.entrar("Y");
        w.sair("L");
        check("ao sair o líder, outro vira líder", "Y".equals(w.lider()), w.lider());

        System.out.println("\nRESULTADO: " + pass + " ok, " + fail + " falhas");
        System.exit(fail == 0 ? 0 : 1);
    }
}
