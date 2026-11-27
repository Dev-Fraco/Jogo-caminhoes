package com.exemplo.jogo3d;

import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.graphics.Texture;
import com.badlogic.gdx.graphics.g2d.BitmapFont;
import com.badlogic.gdx.graphics.g2d.GlyphLayout;
import com.badlogic.gdx.graphics.g2d.SpriteBatch;
import com.badlogic.gdx.graphics.g2d.TextureRegion;
import com.badlogic.gdx.graphics.glutils.ShapeRenderer;
import com.badlogic.gdx.math.Matrix4;

/**
 * Tela da partida da sala personalizada (arena): placar e round no topo, loja antes de cada round, botões do
 * espectador e o resultado final. Desenho e toques; as regras ficam em {@link Rodadas}, {@link Economia} e
 * {@link Espectador}. O jogo executa a ação que esta classe devolve.
 */
final class ArenaUi {
    enum Acao { NENHUMA, COMPRAR, EQUIPAR, SELECIONAR, PRONTO, ESPECTADOR_ANTERIOR, ESPECTADOR_PROXIMO, VOLTAR_LOBBY }

    static final float[] AZUL = {0.20f, 0.55f, 1f, 1f}, VERMELHO = {1f, 0.30f, 0.28f, 1f}, GOLD = {0.98f, 0.78f, 0.25f, 1f},
            WHITE = {1f, 0.96f, 0.88f, 1f}, DARK = {0.06f, 0.05f, 0.045f, 0.93f}, MUTED = {0.72f, 0.68f, 0.6f, 1f},
            INK = {0.10f, 0.06f, 0.02f, 1f}, CINZA = {0.35f, 0.33f, 0.3f, 1f}, VERDE = {0.3f, 0.9f, 0.4f, 1f};
    private static final float RW = 1672f, RH = 941f;

    // Loja: lista à esquerda, detalhes à direita
    static final float[] LOJA = {60, 130, 1552, 740};
    static final float[] PRONTO_BTN = {1300, 790, 290, 70};
    private static final float ROW_Y = 200f, ROW_H = 48f;

    private final Economia eco;
    private final Rodadas rod;
    private final Weapons armas;
    private final String jogador;
    private int selecionado = 0;
    String mensagem = "";

    private BitmapFont fonte;
    private Texture pixel;
    private final GlyphLayout layout = new GlyphLayout();
    private float s, ox, oy;

    ArenaUi(Economia eco, Rodadas rod, Weapons armas, String jogador) {
        this.eco = eco;
        this.rod = rod;
        this.armas = armas;
        this.jogador = jogador;
    }

    void carregar() {
        if (pixel != null) return;
        com.badlogic.gdx.graphics.Pixmap pm = new com.badlogic.gdx.graphics.Pixmap(1, 1, com.badlogic.gdx.graphics.Pixmap.Format.RGBA8888);
        pm.setColor(1f, 1f, 1f, 1f);
        pm.fill();
        pixel = new Texture(pm);
        pm.dispose();
    }

    void dispose() {
        if (pixel != null) pixel.dispose();
        pixel = null;
    }

    private void escala(int W, int H) {
        s = Math.min(W / RW, H / RH);
        ox = (W - RW * s) / 2f;
        oy = (H - RH * s) / 2f;
    }

    private void preenche(ShapeRenderer sh, float x, float y, float w, float h, float[] c) {
        sh.setColor(c[0], c[1], c[2], c[3]);
        sh.rect(ox + x * s, oy + (RH - y - h) * s, w * s, h * s);
    }

    private void contorno(ShapeRenderer sh, float x, float y, float w, float h, float[] c) {
        sh.setColor(c[0], c[1], c[2], c[3]);
        sh.rect(ox + x * s, oy + (RH - y - h) * s, w * s, h * s);
    }

    private void texto(SpriteBatch b, String t, float x, float y, float sc, float[] c, boolean centro) {
        fonte.getData().setScale(s * sc);
        fonte.setColor(c[0], c[1], c[2], c[3]);
        layout.setText(fonte, t);
        fonte.draw(b, t, ox + x * s - (centro ? layout.width / 2f : 0f), oy + (RH - y) * s);
    }

    private void textoCentro(SpriteBatch b, String t, float x, float y, float w, float sc, float[] c) {
        fonte.getData().setScale(s * sc);
        fonte.setColor(c[0], c[1], c[2], c[3]);
        layout.setText(fonte, t);
        fonte.draw(b, t, ox + (x + w / 2f) * s - layout.width / 2f, oy + (RH - y) * s);
    }

    private static boolean dentro(float[] r, float x, float y) {
        return x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];
    }

    private static float[] rect(float x, float y, float w, float h) { return new float[]{x, y, w, h}; }

    private static float[] linha(int i) { return rect(80, ROW_Y + i * ROW_H, 760, ROW_H - 6); }

    private static float[] btnCompra(int i) { return rect(560, ROW_Y + i * ROW_H + 4, 120, ROW_H - 14); }

    private static float[] btnEquipar(int i) { return rect(692, ROW_Y + i * ROW_H + 4, 120, ROW_H - 14); }

    // Espectador: botões na base da tela
    static final float[] ESP_ANT = {520, 850, 70, 70}, ESP_PROX = {1082, 850, 70, 70};

    // Resultado final
    static final float[] VOLTAR_BTN = {600, 600, 470, 90};

    /** Desenha a loja (se a compra está liberada e o jogador não fechou), o placar e o resto. */
    void draw(SpriteBatch b, ShapeRenderer sh, BitmapFont font, Matrix4 proj, int W, int H,
              int pontosAzul, int pontosVermelho, boolean lojaAberta, boolean espectando, String nomeAlvo,
              String estadoExtra, String bannerRound) {
        carregar();
        fonte = font;
        escala(W, H);
        sh.setProjectionMatrix(proj);
        sh.begin(ShapeRenderer.ShapeType.Filled);
        // placar: azul à esquerda, vermelho à direita, round no meio
        preenche(sh, 330, 10, 170, 80, AZUL);
        preenche(sh, 725, 10, 170, 80, VERMELHO);
        preenche(sh, 505, 10, 220, 80, DARK);
        if (lojaAberta) {
            preenche(sh, LOJA[0], LOJA[1], LOJA[2], LOJA[3], DARK);
            for (int i = 0; i < Economia.CATALOGO.length; i++) {
                preenche(sh, linha(i)[0], linha(i)[1], linha(i)[2], linha(i)[3], i == selecionado ? new float[]{0.2f, 0.16f, 0.08f, 1f} : new float[]{0.1f, 0.09f, 0.08f, 1f});
                if (Economia.CATALOGO[i].tipoArma >= 0) {
                    preenche(sh, btnEquipar(i)[0], btnEquipar(i)[1], btnEquipar(i)[2], btnEquipar(i)[3], GOLD);
                }
                preenche(sh, btnCompra(i)[0], btnCompra(i)[1], btnCompra(i)[2], btnCompra(i)[3], GOLD);
            }
            preenche(sh, PRONTO_BTN[0], PRONTO_BTN[1], PRONTO_BTN[2], PRONTO_BTN[3], GOLD);
            preenche(sh, 880, 200, 700, 520, new float[]{0.12f, 0.1f, 0.08f, 1f});
        }
        if (espectando) {
            preenche(sh, ESP_ANT[0], ESP_ANT[1], ESP_ANT[2], ESP_ANT[3], GOLD);
            preenche(sh, ESP_PROX[0], ESP_PROX[1], ESP_PROX[2], ESP_PROX[3], GOLD);
            preenche(sh, 600, 850, 470, 70, DARK);
        }
        if (bannerRound != null) preenche(sh, 360, 360, 952, 140, DARK);
        sh.end();
        sh.begin(ShapeRenderer.ShapeType.Line);
        contorno(sh, 330, 10, 170, 80, AZUL);
        contorno(sh, 725, 10, 170, 80, VERMELHO);
        if (lojaAberta) {
            contorno(sh, LOJA[0], LOJA[1], LOJA[2], LOJA[3], GOLD);
            for (int i = 0; i < Economia.CATALOGO.length; i++) contorno(sh, linha(i)[0], linha(i)[1], linha(i)[2], linha(i)[3], GOLD);
        }
        sh.end();

        b.setProjectionMatrix(proj);
        b.begin();
        // placar
        texto(b, "AZUL", 344, 20, 1.3f, WHITE, false);
        texto(b, String.valueOf(pontosAzul), 344, 38, 2.6f, WHITE, false);
        texto(b, "VERMELHO", 740, 20, 1.3f, WHITE, false);
        texto(b, String.valueOf(pontosVermelho), 740, 38, 2.6f, WHITE, false);
        textoCentro(b, rod.rotulo(), 505, 16, 220, 1.7f, GOLD);
        textoCentro(b, rod.estado() + (estadoExtra == null || estadoExtra.isEmpty() ? "" : " " + estadoExtra), 505, 56, 220, 1.1f, WHITE);
        if (lojaAberta) desenhaLoja(b);
        if (espectando) {
            textoCentro(b, "<", ESP_ANT[0], ESP_ANT[1] + 14, ESP_ANT[2], 2.6f, INK);
            textoCentro(b, ">", ESP_PROX[0], ESP_PROX[1] + 14, ESP_PROX[2], 2.6f, INK);
            textoCentro(b, "OBSERVANDO: " + (nomeAlvo == null ? "" : nomeAlvo), 600, 872, 470, 1.6f, AZUL);
        }
        if (bannerRound != null) {
            textoCentro(b, bannerRound, 360, 385, 952, 2.2f, GOLD);
        }
        b.end();
    }

    private void desenhaLoja(SpriteBatch b) {
        texto(b, "LOJA DE ARMAS", 80, 150, 2.2f, GOLD, false);
        texto(b, "Créditos: " + eco.creditos(jogador), 80, 790, 1.8f, WHITE, false);
        for (int i = 0; i < Economia.CATALOGO.length; i++) {
            Economia.Item it = Economia.CATALOGO[i];
            float[] r = linha(i);
            texto(b, it.nome, r[0] + 14, r[1] + 12, 1.5f, WHITE, false);
            texto(b, it.categoria, r[0] + 230, r[1] + 12, 1.2f, MUTED, false);
            texto(b, "$" + it.preco, r[0] + 400, r[1] + 12, 1.5f, GOLD, false);
            textoCentro(b, "COMPRAR", btnCompra(i)[0], btnCompra(i)[1] + 12, btnCompra(i)[2], 1.2f, INK);
            if (it.tipoArma >= 0) textoCentro(b, "EQUIPAR", btnEquipar(i)[0], btnEquipar(i)[1] + 12, btnEquipar(i)[2], 1.2f, INK);
        }
        Economia.Item sel = Economia.CATALOGO[selecionado];
        texto(b, sel.nome, 910, 225, 2.4f, GOLD, false);
        texto(b, sel.categoria + "   ·   preço $" + sel.preco, 910, 275, 1.4f, WHITE, false);
        texto(b, sel.descricao, 910, 315, 1.4f, MUTED, false);
        if (sel.tipoArma >= 0 && armas.iconHud(sel.tipoArma) != null) {
            TextureRegion ic = armas.iconHud(sel.tipoArma);
            float k = Math.min(420f / ic.getRegionWidth(), 180f / ic.getRegionHeight());
            b.draw(ic, ox + 910 * s, oy + (RH - 520) * s, ic.getRegionWidth() * k * s, ic.getRegionHeight() * k * s);
        }
        texto(b, "Equipada: " + (eco.armaEquipada(jogador) == sel.tipoArma && sel.tipoArma >= 0 ? "sim" : "não"), 910, 560, 1.4f, WHITE, false);
        textoCentro(b, "PRONTO", PRONTO_BTN[0], PRONTO_BTN[1] + 18, PRONTO_BTN[2], 2.2f, INK);
        if (!mensagem.isEmpty()) texto(b, mensagem, 330, 792, 1.5f, GOLD, false);
    }

    /** Resultado final da partida: vencedor e placar, com botão para o lobby. */
    void desenhaFinal(SpriteBatch b, ShapeRenderer sh, BitmapFont font, Matrix4 proj, int W, int H, int azul, int vermelho, int vencedor) {
        carregar();
        fonte = font;
        escala(W, H);
        sh.setProjectionMatrix(proj);
        sh.begin(ShapeRenderer.ShapeType.Filled);
        sh.setColor(0f, 0f, 0f, 0.8f);
        sh.rect(0, 0, W, H);
        preenche(sh, 380, 200, 912, 500, DARK);
        preenche(sh, VOLTAR_BTN[0], VOLTAR_BTN[1], VOLTAR_BTN[2], VOLTAR_BTN[3], GOLD);
        sh.end();
        b.setProjectionMatrix(proj);
        b.begin();
        textoCentro(b, "PARTIDA ENCERRADA", 380, 250, 912, 2.6f, WHITE);
        String v = vencedor == 0 ? "EQUIPE AZUL VENCE" : vencedor == 1 ? "EQUIPE VERMELHA VENCE" : "EMPATE";
        textoCentro(b, v, 380, 370, 912, 2.8f, vencedor == 0 ? AZUL : VERMELHO);
        textoCentro(b, "AZUL " + azul + "  x  " + vermelho + " VERMELHO", 380, 470, 912, 2f, GOLD);
        textoCentro(b, "VOLTAR AO LOBBY", VOLTAR_BTN[0], VOLTAR_BTN[1] + 22, VOLTAR_BTN[2], 2.2f, INK);
        b.end();
    }

    /**
     * Toque (coordenadas com origem embaixo). Devolve a ação e o índice quando couber (item da loja ou alvo do
     * espectador). A loja só responde quando está aberta.
     */
    int[] toque(float x, float yb, int W, int H, boolean lojaAberta, boolean espectando, boolean finalAberto) {
        escala(W, H);
        float rx = (x - ox) / s, ry = RH - (yb - oy) / s;
        if (finalAberto) {
            if (dentro(VOLTAR_BTN, rx, ry)) return new int[]{Acao.VOLTAR_LOBBY.ordinal(), 0};
            return new int[]{Acao.NENHUMA.ordinal(), 0};
        }
        if (espectando) {
            if (dentro(ESP_ANT, rx, ry)) return new int[]{Acao.ESPECTADOR_ANTERIOR.ordinal(), 0};
            if (dentro(ESP_PROX, rx, ry)) return new int[]{Acao.ESPECTADOR_PROXIMO.ordinal(), 0};
        }
        if (lojaAberta) {
            if (dentro(PRONTO_BTN, rx, ry)) return new int[]{Acao.PRONTO.ordinal(), 0};
            for (int i = 0; i < Economia.CATALOGO.length; i++) {
                if (dentro(btnCompra(i), rx, ry)) return new int[]{Acao.COMPRAR.ordinal(), i};
                if (Economia.CATALOGO[i].tipoArma >= 0 && dentro(btnEquipar(i), rx, ry)) return new int[]{Acao.EQUIPAR.ordinal(), i};
                if (dentro(linha(i), rx, ry)) { selecionado = i; return new int[]{Acao.SELECIONAR.ordinal(), i}; }
            }
        }
        return new int[]{Acao.NENHUMA.ordinal(), 0};
    }

    int selecionado() { return selecionado; }

    void selecionar(int i) { selecionado = Math.max(0, Math.min(Economia.CATALOGO.length - 1, i)); }
}
