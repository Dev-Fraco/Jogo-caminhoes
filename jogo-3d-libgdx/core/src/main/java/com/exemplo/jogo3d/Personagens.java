package com.exemplo.jogo3d;

import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.Preferences;

/**
 * Personagens disponíveis para o jogador. A escolhida (principal) é guardada nas configurações e
 * entra na próxima partida; as outras ficam no painel de personagens do lobby, com o botão USAR.
 */
final class Personagens {
    static final String[] NOMES = {"Funcionária", "Jake", "Droide", "Robô", "Lutador"};
    static final String[] MODELOS = {"models/female/female.g3dj", "models/jake/jake.g3dj", "models/droide/droide.g3dj", "models/robo/robo.g3dj", "models/lutador/lutador.g3dj"};
    static final String[] MINIATURAS = {"personagem_funcionaria", "personagem_jake", "personagem_droide", "personagem_robo", "personagem_lutador"};
    static final int PADRAO = 0;   // a funcionária é a principal

    private static final String PREFS = "configuracoes", CHAVE = "personagem";
    private static int atual = -1;

    private Personagens() {}

    /** Índice da personagem principal (lê das configurações na primeira vez). */
    static int atual() {
        if (atual < 0) {
            int v = PADRAO;
            try {
                Preferences p = Gdx.app.getPreferences(PREFS);
                v = p.getInteger(CHAVE, PADRAO);
            } catch (RuntimeException e) {
                // sem preferências: usa a padrão
            }
            atual = v >= 0 && v < MODELOS.length ? v : PADRAO;
        }
        return atual;
    }

    /** Caminho do modelo da personagem principal. */
    static String caminho() { return MODELOS[atual()]; }

    /** Torna principal a personagem de índice i (vale na próxima partida). */
    static void escolher(int i) {
        if (i < 0 || i >= MODELOS.length) return;
        atual = i;
        try {
            Preferences p = Gdx.app.getPreferences(PREFS);
            p.putInteger(CHAVE, i);
            p.flush();
        } catch (RuntimeException e) {
            // sem como salvar: vale só nesta sessão
        }
    }
}
