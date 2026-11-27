package com.exemplo.jogo3d;

import com.badlogic.gdx.graphics.g2d.BitmapFont;
import com.badlogic.gdx.graphics.g2d.GlyphLayout;
import com.badlogic.gdx.graphics.g2d.SpriteBatch;
import com.badlogic.gdx.graphics.glutils.ShapeRenderer;
import com.badlogic.gdx.math.Matrix4;

import java.util.List;

/**
 * Tela de fim de round da sala personalizada: vitória ou derrota do jogador, vencedor do round, placar,
 * abates de cada jogador no round e a contagem para o próximo round. O combate fica parado enquanto ela aparece.
 */
final class FimRoundUi {
    /** Uma linha da tabela de abates. equipe: 0 azul, 1 vermelha. */
    static final class Linha {
        final String nome;
        final int abates, equipe;
        Linha(String nome, int abates, int equipe) { this.nome = nome; this.abates = abates; this.equipe = equipe; }
    }

    static final float[] VERDE = {0.45f, 1f, 0.55f, 1f}, VERMELHO = {1f, 0.32f, 0.3f, 1f}, OURO = {0.98f, 0.78f, 0.25f, 1f},
            AZUL = {0.25f, 0.6f, 1f, 1f}, BRANCO = {1f, 1f, 1f, 1f}, FUNDO = {0.06f, 0.06f, 0.09f, 0.94f}, LINHA = {0.3f, 0.3f, 0.36f, 1f};

    private final GlyphLayout layout = new GlyphLayout();
    private float t = 0f;
    private int vencedor;            // 0 azul, 1 vermelha, -1 sem vencedor
    private boolean jogadorVenceu;
    private int round, azul, vermelha;

    /** Começa a tela de um round que acabou. */
    void abre(int vencedor, boolean jogadorVenceu, int round, int azul, int vermelha) {
        this.vencedor = vencedor;
        this.jogadorVenceu = jogadorVenceu;
        this.round = round;
        this.azul = azul;
        this.vermelha = vermelha;
        t = 0f;
    }

    void update(float dt) { t += dt; }

    /**
     * Desenha a tela inteira. linhas: abates de cada jogador no round (já ordenados). segundosProximo: contagem
     * para o próximo round (mostrada só quando a partida continua).
     */
    void draw(SpriteBatch b, ShapeRenderer sh, BitmapFont font, Matrix4 proj, int W, int H,
              List<Linha> linhas, float segundosProximo, boolean partidaAcabou) {
        float k = Math.max(0.8f, Math.min(W / 1280f, H / 720f) * 1.2f);
        float pw = Math.min(W * 0.86f, 980f * k), ph = Math.min(H * 0.9f, 640f * k);
        float px = (W - pw) / 2f, py = (H - ph) / 2f;
        boolean empate = vencedor < 0;
        float[] cor = empate ? OURO : jogadorVenceu ? VERDE : VERMELHO;

        // Pulso de entrada: o título chega grande e assenta
        float entrada = Math.min(1f, t / 0.35f);
        float escTitulo = (1.9f - 0.9f * entrada) * (1f + 0.04f * (float) Math.sin(t * 5f));

        sh.setProjectionMatrix(proj);
        sh.begin(ShapeRenderer.ShapeType.Filled);
        sh.setColor(0f, 0f, 0f, 0.78f);
        sh.rect(0, 0, W, H);
        sh.setColor(FUNDO[0], FUNDO[1], FUNDO[2], FUNDO[3]);
        sh.rect(px, py, pw, ph);
        sh.setColor(cor[0], cor[1], cor[2], 0.14f + 0.06f * (float) Math.sin(t * 4f));   // brilho atrás do título
        sh.rect(px, py + ph - 150f * k, pw, 150f * k);
        if (jogadorVenceu && !empate) {                                                   // faixa de luz varrendo o painel
            float x = px + ((t * 0.9f) % 1f) * pw;
            sh.setColor(1f, 1f, 1f, 0.07f);
            sh.rect(x - 60f * k, py, 120f * k, ph);
        }
        sh.setColor(cor[0], cor[1], cor[2], 1f);
        sh.rect(px, py + ph - 4f * k, pw, 4f * k);                                        // filete no topo
        sh.end();

        b.setProjectionMatrix(proj);
        b.begin();
        String titulo = empate ? "EMPATE" : jogadorVenceu ? "VITÓRIA" : "DERROTA";
        centro(b, font, titulo, W / 2f, py + ph - 70f * k, escTitulo * 1.4f * k, cor);

        String quem = vencedor == 0 ? "EQUIPE AZUL VENCEU O ROUND " + round
                : vencedor == 1 ? "EQUIPE VERMELHA VENCEU O ROUND " + round
                : "ROUND " + round + " SEM VENCEDOR";
        centro(b, font, quem, W / 2f, py + ph - 150f * k, 1.2f * k, BRANCO);
        centro(b, font, "AZUL " + azul + "   x   " + vermelha + " VERMELHA", W / 2f, py + ph - 200f * k, 1.6f * k, OURO);
        centro(b, font, "ROUND " + round + " DE " + Rodadas.TOTAL, W / 2f, py + ph - 240f * k, 1f * k, BRANCO);

        // Tabela de abates
        float tx = px + pw * 0.2f, tw = pw * 0.6f;
        float ty = py + ph - 290f * k;
        centro(b, font, "ABATES NO ROUND", W / 2f, ty, 1.1f * k, OURO);
        int max = Math.min(8, linhas.size());
        for (int i = 0; i < max; i++) {
            Linha l = linhas.get(i);
            float y = ty - 40f * k - i * 36f * k;
            float[] c = l.equipe == 0 ? AZUL : VERMELHO;
            font.getData().setScale(1.05f * k);
            font.setColor(c[0], c[1], c[2], 1f);
            font.draw(b, l.nome, tx, y);
            String n = String.valueOf(l.abates);
            layout.setText(font, n);
            font.setColor(BRANCO[0], BRANCO[1], BRANCO[2], 1f);
            font.draw(b, n, tx + tw - layout.width, y);
        }
        if (linhas.isEmpty()) centro(b, font, "sem abates", W / 2f, ty - 50f * k, 1f * k, BRANCO);

        // Rodapé: próximo round ou fim da partida
        String rodape = partidaAcabou ? "" : "PRÓXIMO ROUND EM " + (int) Math.ceil(Math.max(0f, segundosProximo)) + "s";
        if (!rodape.isEmpty()) centro(b, font, rodape, W / 2f, py + 46f * k, 1.2f * k, OURO);

        font.getData().setScale(1f);
        font.setColor(1f, 1f, 1f, 1f);
        b.end();
    }

    private void centro(SpriteBatch b, BitmapFont font, String s, float cx, float y, float escala, float[] c) {
        font.getData().setScale(escala);
        font.setColor(c[0], c[1], c[2], c[3]);
        layout.setText(font, s);
        font.draw(b, s, cx - layout.width / 2f, y);
    }
}
