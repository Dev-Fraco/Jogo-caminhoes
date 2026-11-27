package com.exemplo.jogo3d;

import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.Preferences;

/**
 * Progresso do jogador, salvo no aparelho: nível, XP, moedas, diamantes e o dia da última recompensa.
 * Cada inimigo abatido dá XP e moedas; subir de nível dá moedas. A recompensa diária vale uma vez por dia.
 */
final class Progresso {
    private static final String PREFS = "progresso";
    static final int XP_INIMIGO = 40, MOEDAS_INIMIGO = 5, MOEDAS_NIVEL = 100, MOEDAS_DIARIA = 100;

    private static boolean carregado = false;
    static int nivel = 1, xp = 0, moedas = 500, diamantes = 20;
    private static String ultimaRecompensa = "";

    // Loja: os itens à venda (tipo em Items), com o preço em moedas; o que é comprado vai para o estoque
    static final int[] TIPO_LOJA = {0, 1, 5};   // kit médico, bandagem, granada
    static final int[] PRECO_LOJA = {150, 60, 300};
    private static final int[] estoque = new int[Items.NAMES.length];

    private Progresso() {}

    private static void garantir() {
        if (carregado) return;
        carregado = true;
        try {
            Preferences p = Gdx.app.getPreferences(PREFS);
            nivel = Math.max(1, p.getInteger("nivel", 1));
            xp = Math.max(0, p.getInteger("xp", 0));
            moedas = p.getInteger("moedas", 500);
            diamantes = p.getInteger("diamantes", 20);
            ultimaRecompensa = p.getString("ultimaRecompensa", "");
            String[] partes = p.getString("estoque", "").split(";");
            for (int i = 0; i < partes.length && i < estoque.length; i++) {
                try { estoque[i] = Math.max(0, Integer.parseInt(partes[i].trim())); } catch (NumberFormatException e) { estoque[i] = 0; }
            }
        } catch (RuntimeException e) {
            // sem preferências: começa do zero nesta sessão
        }
    }

    private static void salvar() {
        try {
            Preferences p = Gdx.app.getPreferences(PREFS);
            p.putInteger("nivel", nivel);
            p.putInteger("xp", xp);
            p.putInteger("moedas", moedas);
            p.putInteger("diamantes", diamantes);
            p.putString("ultimaRecompensa", ultimaRecompensa);
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < estoque.length; i++) sb.append(i > 0 ? ";" : "").append(estoque[i]);
            p.putString("estoque", sb.toString());
            p.flush();
        } catch (RuntimeException e) {
            // sem como salvar: vale só nesta sessão
        }
    }

    /** XP necessário para subir do nível n para o n + 1. */
    static int xpParaNivel(int n) { return 1000 + 100 * n; }

    static int nivel() { garantir(); return nivel; }
    static int xp() { garantir(); return xp; }
    static int moedas() { garantir(); return moedas; }
    static int diamantes() { garantir(); return diamantes; }

    /** Ganha XP e moedas; sobe de nível (com moedas de bônus) quando juntar o XP necessário. */
    static void ganha(int quantXp, int quantMoedas) {
        garantir();
        xp += quantXp;
        moedas += quantMoedas;
        while (xp >= xpParaNivel(nivel)) {
            xp -= xpParaNivel(nivel);
            nivel++;
            moedas += MOEDAS_NIVEL;
        }
        salvar();
    }

    /** Gasta moedas, se houver. Devolve false se não tiver o suficiente. */
    static boolean gasta(int quant) {
        garantir();
        if (moedas < quant) return false;
        moedas -= quant;
        salvar();
        return true;
    }

    /** Compra o item i da loja: gasta as moedas e põe no estoque. */
    static boolean compra(int i) {
        garantir();
        if (i < 0 || i >= TIPO_LOJA.length || !gasta(PRECO_LOJA[i])) return false;
        estoque[TIPO_LOJA[i]]++;
        salvar();
        return true;
    }

    /** Quantos de um tipo de item (Items) há no estoque. */
    static int estoque(int tipo) {
        garantir();
        return estoque[tipo];
    }

    /** Tira o estoque inteiro para a mochila da partida (devolve as quantidades por tipo). */
    static int[] retiraEstoque() {
        garantir();
        int[] copia = estoque.clone();
        java.util.Arrays.fill(estoque, 0);
        salvar();
        return copia;
    }

    /** Dia de hoje (ano-mês-dia), pelo calendário do aparelho. */
    static String hoje() {
        java.util.Calendar c = java.util.Calendar.getInstance();
        return c.get(java.util.Calendar.YEAR) + "-" + (c.get(java.util.Calendar.MONTH) + 1) + "-" + c.get(java.util.Calendar.DAY_OF_MONTH);
    }

    /** A recompensa diária ainda não foi resgatada hoje? */
    static boolean recompensaDisponivel() {
        garantir();
        return !hoje().equals(ultimaRecompensa);
    }

    /** Resgata a recompensa de hoje (uma vez por dia). */
    static boolean resgataRecompensa() {
        garantir();
        if (!recompensaDisponivel()) return false;
        ultimaRecompensa = hoje();
        moedas += MOEDAS_DIARIA;
        salvar();
        return true;
    }
}
