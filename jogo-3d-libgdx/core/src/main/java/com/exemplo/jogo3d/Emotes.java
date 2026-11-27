package com.exemplo.jogo3d;

import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.graphics.Pixmap;
import com.badlogic.gdx.graphics.Texture;
import com.badlogic.gdx.graphics.g2d.BitmapFont;
import com.badlogic.gdx.graphics.g2d.GlyphLayout;
import com.badlogic.gdx.graphics.g2d.SpriteBatch;
import com.badlogic.gdx.math.MathUtils;

/**
 * Roda de emotes do lobby (como no Free Fire). Só funciona no lobby: toque no personagem abre a roda; um dos
 * 8 espaços executa o emote no modelo 3D do personagem, duas vezes seguidas, e volta ao Idle. Escolher outro
 * emote interrompe o atual. Espaços sem arquivo de animação ficam vazios (não tocam nada).
 */
final class Emotes {
    /** Espaços da roda, em ordem (horário, a partir do topo), como na imagem de referência. */
    static final String[] NOMES = {"Dança", "Provocação", "Vitória", "Desafio", "Flexão", "Choro", "Saudação", "Aplaudir"};

    /**
     * Clipe de cada espaço (nome no modelo) ou null = ainda sem arquivo. Associação provisória pelos nomes dos
     * arquivos: confirmar com o dono do projeto.
     */
    static final String[] CLIPES = {
            "Emote_MichaelJackson",   // Dança
            "Emote_Loucura",          // Provocação
            "Emote_BichoPirueta",     // Vitória
            "Emote_Reboladinha",      // Desafio
            null,                     // Flexão
            null,                     // Choro
            "Emote_ByeBye",           // Saudação
            null                      // Aplaudir
    };

    /** Vezes que cada emote toca seguidas. */
    static final int REPETICOES = 2;
    private static final float VELOCIDADE = 7f;          // abrir/fechar: 1/7 s de animação
    private static final float ANG_SLOT = 45f;           // 360 / 8

    private Texture roda;
    private Texture pixel;
    private BitmapFont fonte;
    private final GlyphLayout layout = new GlyphLayout();
    private float abertura;                              // 0 fechada .. 1 aberta
    private boolean aberta;
    private int restantes;                               // repetições que faltam do emote atual
    private boolean emoteAtivo;

    /** Carrega a roda e a fonte (uma vez). */
    private void carregar() {
        if (roda != null) return;
        roda = new Texture(Gdx.files.internal("hud2/lobby/roda_emotes.png"));
        roda.setFilter(Texture.TextureFilter.Linear, Texture.TextureFilter.Linear);
        Pixmap pm = new Pixmap(1, 1, Pixmap.Format.RGBA8888);
        pm.setColor(1f, 1f, 1f, 1f);
        pm.fill();
        pixel = new Texture(pm);
        pm.dispose();
        fonte = new BitmapFont(Gdx.files.internal("hud2/texto.fnt"), false);
    }

    boolean aberta() { return aberta; }

    void abrir() { aberta = true; carregar(); }

    void fechar() { aberta = false; }

    /** Quadro da roda: anima abertura/fechamento e o emote em execução. */
    void update(Character personagem, float dt) {
        abertura = MathUtils.clamp(abertura + (aberta ? dt : -dt) * VELOCIDADE, 0f, 1f);
        if (personagem == null || !emoteAtivo) return;
        if (personagem.onceFinished()) {
            if (restantes > 0) {
                restantes--;
                personagem.playOnce(clipeAtual);        // segunda vez seguida
            } else {
                emoteAtivo = false;
                personagem.endOnce();                   // volta ao Idle
            }
        }
    }

    private String clipeAtual;

    /** Executa o emote do espaço (interrompe o anterior). Sem arquivo ou sem o clipe no personagem, não faz nada. */
    void executar(int espaco, Character personagem) {
        if (personagem == null || espaco < 0 || espaco >= CLIPES.length) return;
        String clipe = CLIPES[espaco];
        if (clipe == null || !personagem.temClipe(clipe)) return;
        clipeAtual = clipe;
        restantes = REPETICOES - 1;
        emoteAtivo = true;
        personagem.playOnce(clipe);
    }

    boolean emoteAtivo() { return emoteAtivo; }

    /** Espaço tocado na roda (0..7), -1 = centro, -2 = fora da roda. Coordenadas com origem embaixo. */
    int espacoEm(float x, float yb, int W, int H) {
        float cx = W / 2f, cy = H / 2f;
        float raio = raioRoda(W, H);
        float dx = x - cx, dy = yb - cy;
        float d = (float) Math.sqrt(dx * dx + dy * dy);
        if (d > raio) return -2;
        if (d < raio * 0.28f) return -1;
        // ângulo a partir do topo, no sentido horário
        float ang = (float) Math.toDegrees(Math.atan2(dx, dy));
        if (ang < 0f) ang += 360f;
        return (int) (((ang + ANG_SLOT / 2f) % 360f) / ANG_SLOT);
    }

    private float raioRoda(int W, int H) {
        return Math.min(W, H) * 0.46f * (0.85f + 0.15f * ease(abertura));
    }

    private static float ease(float x) { return 1f - (1f - x) * (1f - x) * (1f - x); }

    /** Desenha a roda por cima do lobby (escurecendo o fundo) quando aberta ou animando. */
    void draw(SpriteBatch b, int W, int H) {
        if (abertura <= 0f) return;
        carregar();
        float a = ease(abertura);
        float raio = raioRoda(W, H);
        float cx = W / 2f, cy = H / 2f;
        b.begin();
        b.setColor(0f, 0f, 0f, 0.45f * a);
        b.draw(pixel, 0, 0, W, H);
        b.setColor(1f, 1f, 1f, a);
        b.draw(roda, cx - raio, cy - raio, raio * 2f, raio * 2f);
        fonte.getData().setScale(Math.max(0.3f, raio / 560f));
        for (int i = 0; i < NOMES.length; i++) {
            double rad = Math.toRadians(i * ANG_SLOT);
            float rx = cx + (float) Math.sin(rad) * raio * 0.66f;
            float ry = cy + (float) Math.cos(rad) * raio * 0.66f;
            layout.setText(fonte, NOMES[i]);
            fonte.setColor(1f, 1f, 1f, a * (CLIPES[i] != null ? 1f : 0.45f));
            fonte.draw(b, layout, rx - layout.width / 2f, ry + layout.height / 2f);
        }
        fonte.setColor(1f, 1f, 1f, 1f);
        b.setColor(1f, 1f, 1f, 1f);
        b.end();
    }

    void dispose() {
        if (roda != null) roda.dispose();
        if (pixel != null) pixel.dispose();
        if (fonte != null) fonte.dispose();
        roda = null;
        pixel = null;
        fonte = null;
    }
}
