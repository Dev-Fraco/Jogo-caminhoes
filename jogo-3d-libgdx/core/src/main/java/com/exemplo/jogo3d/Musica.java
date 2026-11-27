package com.exemplo.jogo3d;

import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.audio.Music;

/**
 * Música de fundo do menu (abertura e lobby): toca em loop. Some ao começar treinamento ou partida
 * e volta ao voltar para o lobby. Sem o arquivo ou sem áudio, o jogo segue normalmente.
 */
final class Musica {
    static final String ARQUIVO = "audio/cabra_da_peste.mp3";
    private static Music musica;
    private static boolean falhou;

    private Musica() { }

    /** Toca (ou continua tocando) a música do menu, em loop. */
    static void tocar() {
        if (falhou) return;
        try {
            if (musica == null) {
                musica = Gdx.audio.newMusic(Gdx.files.internal(ARQUIVO));
                musica.setLooping(true);
                musica.setVolume(0.6f);
            }
            if (!musica.isPlaying()) musica.play();
        } catch (Throwable t) {
            falhou = true;   // sem o arquivo ou sem áudio: o jogo segue sem música
            musica = null;
        }
    }

    /** Para a música (ao iniciar treinamento ou partida). */
    static void parar() {
        if (musica != null) musica.stop();
    }

    static void descartar() {
        if (musica != null) musica.dispose();
        musica = null;
    }
}
