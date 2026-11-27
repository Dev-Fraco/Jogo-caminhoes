package com.exemplo.jogo3d;

import java.util.HashMap;
import java.util.Map;

/**
 * Créditos de cada jogador na partida e a loja de armas (regras, sem desenho). Compra só na preparação, com crédito
 * suficiente. Recompensas: vitória do round, derrota (aumenta com as derrotas seguidas da equipe) e eliminações.
 */
final class Economia {
    enum Erro { NENHUM, FORA_DA_PREPARACAO, SEM_CREDITO, ITEM_INVALIDO, SEM_ARMA_COMPRADA }

    static final int VITORIA = 3250, DERROTA_BASE = 1400, DERROTA_PASSO = 300, DERROTA_MAX = 2300, ELIMINACAO = 300;

    /** Item da loja. tipoArma = índice em Weapons.NAMES (-1 se não é arma). */
    static final class Item {
        final String nome, descricao;
        final int preco, tipoArma;
        final String categoria;
        Item(String nome, String categoria, int preco, int tipoArma, String descricao) {
            this.nome = nome; this.categoria = categoria; this.preco = preco; this.tipoArma = tipoArma; this.descricao = descricao;
        }
    }

    /** Catálogo: fuzis, sniper, escopeta, pistola, munição e equipamentos (os tipos existem no jogo). */
    static final Item[] CATALOGO = {
            new Item("AKM", "FUZIL", 2700, 0, "Fuzil de dano alto, cadência média."),
            new Item("AUG", "FUZIL", 3000, 1, "Fuzil de cadência alta e recuo baixo."),
            new Item("GROZA", "FUZIL", 2900, 2, "Fuzil de dano forte, carregador grande."),
            new Item("M16A4", "FUZIL", 2800, 3, "Fuzil em rajadas, preciso à distância."),
            new Item("M416", "FUZIL", 3100, 4, "Fuzil equilibrado para qualquer distância."),
            new Item("SCAR-L", "FUZIL", 3000, 5, "Fuzil estável, cadência alta."),
            new Item("AWM", "SNIPER", 4750, 6, "Sniper de um tiro: segure para mirar."),
            new Item("M1014", "ESCOPETA", 2100, 7, "Escopeta de curta distância, espalha chumbo."),
            new Item("MAGNUM 357", "PISTOLA", 650, 8, "Pistola potente, de reserva."),
            new Item("MUNIÇÃO", "MUNIÇÃO", 300, -1, "Carregador extra para a arma equipada."),
            new Item("COLETE", "EQUIPAMENTO", 700, -1, "Protege o tronco contra tiros."),
            new Item("CAPACETE", "EQUIPAMENTO", 400, -1, "Protege a cabeça contra tiros."),
    };

    private final Map<String, Integer> creditos = new HashMap<>();
    private final Map<String, Integer> eliminacoes = new HashMap<>();
    private final Map<String, java.util.List<Integer>> armasCompradas = new HashMap<>();
    private final Map<String, Integer> armaEscolhida = new HashMap<>();
    private final Map<String, Integer> municoesExtras = new HashMap<>();
    private final Map<String, Boolean> colete = new HashMap<>(), capacete = new HashMap<>();
    final int[] derrotasSeguidas = new int[2];

    /** Cada jogador começa com o crédito inicial da partida. */
    void entrar(String jogador) {
        creditos.put(jogador, Rodadas.CREDITO_INICIAL);
        eliminacoes.put(jogador, 0);
        armasCompradas.put(jogador, new java.util.ArrayList<>());
        municoesExtras.put(jogador, 0);
        colete.put(jogador, false);
        capacete.put(jogador, false);
    }

    int creditos(String jogador) { return creditos.getOrDefault(jogador, 0); }

    /** Compra um item. Só na preparação, com crédito suficiente; o item tem que existir. */
    Erro comprar(String jogador, int indice, Rodadas rodadas) {
        if (!rodadas.compraLiberada()) return Erro.FORA_DA_PREPARACAO;
        if (indice < 0 || indice >= CATALOGO.length || !creditos.containsKey(jogador)) return Erro.ITEM_INVALIDO;
        Item it = CATALOGO[indice];
        int saldo = creditos.get(jogador);
        if (saldo < it.preco) return Erro.SEM_CREDITO;
        creditos.put(jogador, saldo - it.preco);
        if (it.tipoArma >= 0) {
            armasCompradas.get(jogador).add(it.tipoArma);
            if (!armaEscolhida.containsKey(jogador)) armaEscolhida.put(jogador, it.tipoArma);
        } else if (it.categoria.equals("MUNIÇÃO")) {
            municoesExtras.put(jogador, municoesExtras.get(jogador) + 1);
        } else if (it.nome.equals("COLETE")) {
            colete.put(jogador, true);
        } else if (it.nome.equals("CAPACETE")) {
            capacete.put(jogador, true);
        }
        return Erro.NENHUM;
    }

    /** Equipa uma arma comprada (ela passa a ser a arma da próxima entrada em combate). */
    Erro equipar(String jogador, int tipoArma) {
        java.util.List<Integer> lista = armasCompradas.get(jogador);
        if (lista == null || !lista.contains(tipoArma)) return Erro.SEM_ARMA_COMPRADA;
        armaEscolhida.put(jogador, tipoArma);
        return Erro.NENHUM;
    }

    /** Arma equipada (-1 se não comprou nenhuma: usa a arma inicial do jogo). */
    int armaEquipada(String jogador) { return armaEscolhida.getOrDefault(jogador, -1); }

    boolean temColete(String jogador) { return colete.getOrDefault(jogador, false); }

    boolean temCapacete(String jogador) { return capacete.getOrDefault(jogador, false); }

    int municoesExtras(String jogador) { return municoesExtras.getOrDefault(jogador, 0); }

    void registraEliminacao(String jogador) {
        eliminacoes.put(jogador, eliminacoes.getOrDefault(jogador, 0) + 1);
    }

    int eliminacoes(String jogador) { return eliminacoes.getOrDefault(jogador, 0); }

    /**
     * Recompensas do fim do round. Vencedores recebem VITORIA; a equipe que perdeu recebe DERROTA, que cresce com as
     * derrotas seguidas (até DERROTA_MAX). Cada eliminação rende ELIMINACAO. Empate (-1) não paga derrota nem vitória.
     */
    void recompensarRound(int vencedor, java.util.Map<String, Integer> equipeDoJogador) {
        for (Map.Entry<String, Integer> e : equipeDoJogador.entrySet()) {
            String j = e.getKey();
            int eq = e.getValue();
            if (!creditos.containsKey(j)) continue;
            int ganho = 0;
            if (vencedor == eq) ganho = VITORIA;
            else if (vencedor >= 0) ganho = Math.min(DERROTA_MAX, DERROTA_BASE + DERROTA_PASSO * Math.max(0, derrotasSeguidas[eq]));
            ganho += ELIMINACAO * eliminacoes.getOrDefault(j, 0);
            creditos.put(j, creditos.get(j) + ganho);
        }
        if (vencedor == 0 || vencedor == 1) {
            derrotasSeguidas[vencedor] = 0;
            derrotasSeguidas[1 - vencedor]++;
        } else if (vencedor < 0) {
            // empate: não há derrota para contar
        }
    }

    /** Zera as eliminações do round (os créditos e as armas seguem na partida). */
    void novoRound() {
        for (String j : eliminacoes.keySet()) eliminacoes.put(j, 0);
    }
}
