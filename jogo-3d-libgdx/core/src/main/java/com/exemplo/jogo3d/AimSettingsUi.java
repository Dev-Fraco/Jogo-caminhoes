package com.exemplo.jogo3d;

import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.graphics.GL20;
import com.badlogic.gdx.graphics.Texture;
import com.badlogic.gdx.graphics.g2d.BitmapFont;
import com.badlogic.gdx.graphics.g2d.GlyphLayout;
import com.badlogic.gdx.graphics.g2d.SpriteBatch;
import com.badlogic.gdx.graphics.glutils.HdpiUtils;
import com.badlogic.gdx.graphics.glutils.ShapeRenderer;
import com.badlogic.gdx.math.MathUtils;

/**
 * Tela "MIRA E SENSIBILIDADE" (aberta pela engrenagem), no visual de battle royale: fundo preto, painéis
 * escuros com borda metálica, barras amarelas com indicador circular e valores de 0 a 200.
 *
 * Esquerda: sensibilidade geral, mira 2x e 4x e as sensibilidades X/Y ao atirar. Direita: aberturas de
 * AKM, GROZA, M16A4, M416, SCAR-L, AWM, M1014, MAGNUM 357 e AUG.
 *
 * Cada coluna ROLA na vertical por conta própria: o conteúdo é recortado na área da lista e a coluna que
 * não transborda simplesmente não se move (sem buracos). O dedo sobre uma barra ajusta o valor; o dedo na
 * área livre do painel rola a lista, com o mesmo limiar de 12 px usado no Arsenal para separar toque de
 * arrasto. Os botões do rodapé ficam fora da área que rola.
 *
 * Cada mudança vale na hora no jogo e é salva ao soltar o dedo.
 */
final class AimSettingsUi {
    boolean open = false;

    // Ordem das linhas em cada coluna (índices de AimSettings)
    static final int[] LEFT = {0, 1, 2, 12, 13};
    static final int[] RIGHT = {3, 5, 6, 7, 8, 9, 10, 11, 4};
    static final String[] LEFT_LABEL = {"Sensibilidade geral", "Mira 2x", "Mira 4x",
            "Sensi X (ao atirar)", "Sensi Y (ao atirar)"};
    static final String[] RIGHT_LABEL = {"AKM", "GROZA", "M16A4", "M416", "SCAR-L", "AWM", "M1014", "MAGNUM 357", "AUG"};

    private static final float[] YELLOW = {1f, 0.8f, 0.08f, 1f};
    private static final float[] PANEL = {0.07f, 0.07f, 0.075f, 1f};
    private static final float[] TRACK = {0.19f, 0.19f, 0.2f, 1f};

    // Geometria (calculada em layout)
    private int lastW = 0, lastH = 0;
    private final float[] panX = new float[2];
    private float panY, panW, panH, panTop, tabH;
    private final float[][] track = new float[AimSettings.NAMES.length][4];   // x0, x1, yc, altura da barra
    private float rowH;
    private float rowsTopY, viewY0, viewH;                 // área da lista (a parte que rola)
    private final float[] scroll = new float[2];           // deslocamento de cada coluna (px, 0 = topo)
    private final float[] maxScroll = new float[2];         // quanto cada coluna pode rolar (0 = não rola)
    private int scrollCol = -1;                             // coluna em que o dedo está rolando (-1 = nenhuma)
    private float pressY, lastY;                            // onde o dedo encostou e onde estava no quadro anterior
    private boolean arrastou;                               // passou do limiar: é rolagem, não toque
    private final float[] back = new float[4], reset = new float[4], voltar = new float[4], backArrow = new float[4];

    private static BitmapFont texto;
    private final GlyphLayout glyph = new GlyphLayout();
    private int drag = -1;     // item que está sendo arrastado (-1 = nenhum)
    private boolean changed;   // houve mudança desde o último salvar

    /** Calcula todas as posições para a tela W×H (chamado no desenho e nos toques). */
    void layout(int W, int H) {
        lastW = W;
        lastH = H;
        float m = W * 0.022f;
        float hh = H * 0.13f;
        panTop = H - hh;
        float bottom = H * 0.165f;
        panY = bottom;
        panH = panTop - bottom - m * 0.5f;
        float pw = (W - 3f * m) / 2f;
        panW = pw;
        panX[0] = m;
        panX[1] = m * 2f + pw;
        tabH = panH * 0.105f;
        rowsTopY = panTop - m * 0.5f - tabH - panH * 0.035f;
        float rowsH = rowsTopY - panY - panH * 0.04f;
        viewH = rowsH;
        viewY0 = rowsTopY - rowsH;
        // Linha ~40% mais alta que antes (era rowsH/10): barra, indicador e textos crescem junto, porque
        // todos saem de rowH. O que não couber fica acessível pela rolagem, não espremido.
        rowH = H * 0.079f;
        if (rowH > rowsH / 3.5f) rowH = rowsH / 3.5f;   // tela muito baixa: garante 3 linhas e meia à vista
        for (int c = 0; c < 2; c++) {
            int n = (c == 0 ? LEFT : RIGHT).length;
            maxScroll[c] = Math.max(0f, n * rowH - viewH);
            scroll[c] = MathUtils.clamp(scroll[c], 0f, maxScroll[c]);
        }
        for (int r = 0; r < LEFT.length; r++) placeRow(LEFT[r], 0, r);
        for (int r = 0; r < RIGHT.length; r++) placeRow(RIGHT[r], 1, r);
        set(backArrow, m, H - hh * 0.82f, hh * 0.56f, hh * 0.56f);
        set(back, backArrow[0] - hh * 0.2f, backArrow[1] - hh * 0.2f, hh * 0.96f, hh * 0.96f);
        set(reset, m, H * 0.03f, W * 0.28f, H * 0.095f);
        set(voltar, W - m - W * 0.22f, H * 0.03f, W * 0.22f, H * 0.095f);
    }

    private void placeRow(int idx, int col, int row) {
        float yc = rowsTopY - (row + 0.5f) * rowH + scroll[col];
        float x0 = panX[col] + panW * 0.43f, x1 = panX[col] + panW * 0.84f;
        track[idx][0] = x0;
        track[idx][1] = x1;
        track[idx][2] = yc;
        track[idx][3] = rowH * 0.15f;
    }

    /** Quanto a coluna está rolada (px). Para os testes. */
    float scrollOf(int col) { return scroll[col]; }

    /** Quanto a coluna pode rolar (px); 0 quando a lista cabe inteira. Para os testes. */
    float maxScrollOf(int col) { return maxScroll[col]; }

    /** Limites da área da lista: {y0, altura}. Para os testes. */
    float[] viewOf() { return new float[]{viewY0, viewH}; }

    /** Limites do painel da coluna: {x, y, largura, altura}. Para os testes. */
    float[] panelOf(int col) { return new float[]{panX[col], panY, panW, panH}; }

    /** Altura de uma linha (px). Para os testes. */
    float rowHeight() { return rowH; }

    /** A linha do item está inteira dentro da área visível? Para os testes. */
    boolean linhaVisivel(int idx) { return visivel(track[idx][2]); }

    /** Posição da barra de um item: {x0, x1, yc, altura} (para testes e para o toque). */
    float[] trackOf(int idx) {
        return new float[]{track[idx][0], track[idx][1], track[idx][2], track[idx][3]};
    }

    void draw(SpriteBatch batch, ShapeRenderer shapes, BitmapFont unused, int W, int H) {
        loadAssets();
        layout(W, H);

        shapes.begin(ShapeRenderer.ShapeType.Filled);
        shapes.setColor(0.015f, 0.015f, 0.015f, 1f);
        shapes.rect(0, 0, W, H);
        // Faixa dourada do cabeçalho
        shapes.setColor(YELLOW[0], YELLOW[1], YELLOW[2], 1f);
        shapes.rect(0, panTop + H * 0.012f, W * 0.52f, H * 0.006f);
        // Painéis
        for (int c = 0; c < 2; c++) {
            shapes.setColor(PANEL[0], PANEL[1], PANEL[2], 1f);
            shapes.rect(panX[c], panY, panW, panH);
            // Aba amarela com a ponta chanfrada
            float tw = panW * 0.55f, sl = tabH * 0.45f, ty = panY + panH - tabH;
            shapes.setColor(YELLOW[0], YELLOW[1], YELLOW[2], 1f);
            preencherPoligono(shapes, new float[]{panX[c], ty + tabH, panX[c] + tw, ty + tabH,
                    panX[c] + tw - sl, ty, panX[c], ty});
        }
        // Barras (recortadas na área da lista: nada vaza do painel ao rolar)
        for (int c = 0; c < 2; c++) {
            int[] lista = c == 0 ? LEFT : RIGHT;
            recorte(shapes, null, c, true);
            for (int idx : lista) {
                float[] t = track[idx];
                float h = t[3];
                shapes.setColor(TRACK[0], TRACK[1], TRACK[2], 1f);
                shapes.rect(t[0], t[2] - h / 2f, t[1] - t[0], h);
                float frac = AimSettings.toSlider(idx) / 200f;
                float kx = t[0] + (t[1] - t[0]) * frac;
                shapes.setColor(YELLOW[0], YELLOW[1], YELLOW[2], 1f);
                shapes.rect(t[0], t[2] - h / 2f, kx - t[0], h);
            }
            for (int idx : lista) {
                float[] t = track[idx];
                float kx = t[0] + (t[1] - t[0]) * (AimSettings.toSlider(idx) / 200f);
                float r = rowH * 0.25f;
                shapes.setColor(YELLOW[0], YELLOW[1], YELLOW[2], 1f);
                shapes.circle(kx, t[2], r, 24);
                shapes.setColor(0.07f, 0.07f, 0.075f, 1f);
                shapes.circle(kx, t[2], r * 0.42f, 18);
            }
            recorte(shapes, null, c, false);
            // Indicador de rolagem: só aparece na coluna que tem conteúdo além da área visível
            if (maxScroll[c] > 1f) {
                float bw = panW * 0.008f, bx = panX[c] + panW - panW * 0.014f;
                shapes.setColor(TRACK[0], TRACK[1], TRACK[2], 1f);
                shapes.rect(bx, viewY0, bw, viewH);
                float th = viewH * viewH / (viewH + maxScroll[c]);
                float ty = viewY0 + (viewH - th) * (1f - scroll[c] / maxScroll[c]);
                shapes.setColor(YELLOW[0], YELLOW[1], YELLOW[2], 1f);
                shapes.rect(bx, ty, bw, th);
            }
        }
        // Botões
        shapes.setColor(0.13f, 0.13f, 0.13f, 1f);
        shapes.rect(reset[0], reset[1], reset[2], reset[3]);
        shapes.setColor(YELLOW[0], YELLOW[1], YELLOW[2], 1f);
        shapes.rect(voltar[0], voltar[1], voltar[2], voltar[3]);
        // Seta de voltar (cabeçalho)
        shapes.setColor(YELLOW[0], YELLOW[1], YELLOW[2], 1f);
        float ax = backArrow[0], ay = backArrow[1], aw = backArrow[2], ah = backArrow[3];
        preencherPoligono(shapes, new float[]{ax, ay + ah / 2f, ax + aw * 0.45f, ay + ah, ax + aw * 0.45f, ay + ah * 0.62f,
                ax + aw, ay + ah * 0.62f, ax + aw, ay + ah * 0.38f, ax + aw * 0.45f, ay + ah * 0.38f, ax + aw * 0.45f, ay});
        shapes.end();

        // Bordas metálicas dos painéis
        shapes.begin(ShapeRenderer.ShapeType.Line);
        for (int c = 0; c < 2; c++) {
            shapes.setColor(0.62f, 0.62f, 0.66f, 1f);
            shapes.rect(panX[c], panY, panW, panH);
            shapes.setColor(0.28f, 0.28f, 0.3f, 1f);
            shapes.rect(panX[c] + 2, panY + 2, panW - 4, panH - 4);
        }
        shapes.setColor(0.62f, 0.62f, 0.66f, 1f);
        shapes.rect(reset[0], reset[1], reset[2], reset[3]);
        shapes.end();

        // Textos
        batch.begin();
        batch.setColor(1f, 1f, 1f, 1f);
        texto.setColor(1f, 1f, 1f, 1f);
        float th = H * 0.078f;
        tamanho(th);
        drawTexto(batch, "MIRA E SENSIBILIDADE", backArrow[0] + backArrow[2] * 1.6f, H - H * 0.042f, th, 1f, 1f, 1f);
        for (int c = 0; c < 2; c++) {
            tamanho(tabH * 0.42f);
            drawTexto(batch, c == 0 ? "CÂMERA E SENSIBILIDADE" : "SENSIBILIDADE POR ARMA", panX[c] + panW * 0.02f,
                    panY + panH - tabH / 2f, tabH * 0.42f, 0.04f, 0.04f, 0.04f);
        }
        for (int c = 0; c < 2; c++) {
            int[] lista = c == 0 ? LEFT : RIGHT;
            String[] nomes = c == 0 ? LEFT_LABEL : RIGHT_LABEL;
            recorte(null, batch, c, true);
            for (int r = 0; r < lista.length; r++) {
                int idx = lista[r];
                float[] t = track[idx];
                tamanho(rowH * 0.40f);
                drawTexto(batch, nomes[r], panX[c] + panW * 0.035f, t[2], rowH * 0.40f, 0.96f, 0.96f, 0.96f);
                String v = String.valueOf(AimSettings.toSlider(idx));
                tamanho(rowH * 0.44f);
                glyph.setText(texto, v);
                float vx = panX[c] + panW * 0.965f - glyph.width;
                drawTexto(batch, v, vx, t[2], rowH * 0.44f, 1f, 0.8f, 0.08f);
            }
            recorte(null, batch, c, false);
        }
        tamanho(reset[3] * 0.36f);
        drawCentro(batch, "RESTAURAR PADRÃO", reset, reset[3] * 0.36f, 1f, 0.8f, 0.08f);
        tamanho(voltar[3] * 0.4f);
        drawCentro(batch, "VOLTAR", voltar, voltar[3] * 0.4f, 0.05f, 0.05f, 0.05f);
        batch.end();
    }

    /** Toque: devolve true (a tela consome o toque). Começa o arrasto se o dedo caiu numa barra. */
    boolean press(float x, float y) {
        if (lastW == 0) return true;
        if (in(back, x, y)) { open = false; return true; }
        if (in(reset, x, y)) { AimSettings.reset(); AimSettings.save(); return true; }
        if (in(voltar, x, y)) { open = false; return true; }
        for (int c = 0; c < 2; c++) {
            int[] lista = c == 0 ? LEFT : RIGHT;
            for (int idx : lista) {
                float[] t = track[idx];
                float r = rowH * 0.5f;
                if (x < t[0] - r || x > t[1] + r || y < t[2] - r || y > t[2] + r) continue;
                if (!visivel(t[2])) continue;   // linha rolada para fora da área: não recebe o toque
                drag = idx;
                setFromX(idx, x);
                return true;
            }
        }
        // Fora das barras, dentro de um painel que rola: o dedo passa a rolar a lista
        for (int c = 0; c < 2; c++) {
            if (x < panX[c] || x > panX[c] + panW || y < viewY0 || y > viewY0 + viewH) continue;
            if (maxScroll[c] <= 1f) break;      // esta coluna cabe inteira: nada a rolar
            scrollCol = c;
            pressY = lastY = y;
            arrastou = false;
            break;
        }
        return true;
    }

    /** Dedo arrastado: acompanha a barra em que começou, ou rola a coluna em que encostou. */
    void drag(float x, float y) {
        if (drag >= 0) {
            setFromX(drag, x);
            return;
        }
        if (scrollCol < 0) return;
        float dy = y - lastY;
        lastY = y;
        if (Math.abs(y - pressY) > 12f) arrastou = true;   // mesmo limiar do Arsenal: separa toque de arrasto
        if (arrastou) scroll[scrollCol] = MathUtils.clamp(scroll[scrollCol] + dy, 0f, maxScroll[scrollCol]);
    }

    /** Dedo solto: salva a configuração e encerra a rolagem. */
    void release() {
        if (drag >= 0 || changed) AimSettings.save();
        drag = -1;
        changed = false;
        scrollCol = -1;
        arrastou = false;
    }

    /** A linha centrada em yc está dentro da área visível da lista? */
    private boolean visivel(float yc) {
        return yc + rowH * 0.5f > viewY0 && yc - rowH * 0.5f < viewY0 + viewH;
    }

    /**
     * Liga ou desliga o recorte na área da lista da coluna. Passe o ShapeRenderer OU o SpriteBatch que está
     * desenhando: ele é descarregado antes de mexer no recorte, senão o que já estava na fila sai sem corte.
     */
    private void recorte(ShapeRenderer shapes, SpriteBatch batch, int col, boolean ligar) {
        if (shapes != null) shapes.flush();
        if (batch != null) batch.flush();
        if (ligar) {
            Gdx.gl.glEnable(GL20.GL_SCISSOR_TEST);
            HdpiUtils.glScissor(Math.round(panX[col]), Math.round(viewY0), Math.round(panW), Math.round(viewH));
        } else {
            Gdx.gl.glDisable(GL20.GL_SCISSOR_TEST);
        }
    }

    private void setFromX(int idx, float x) {
        float[] t = track[idx];
        float frac = MathUtils.clamp((x - t[0]) / (t[1] - t[0]), 0f, 1f);
        int s = Math.round(frac * 200f);
        AimSettings.setSlider(idx, s);
        changed = true;
    }

    // ---------- Texto e desenho ----------

    private static void loadAssets() {
        if (texto != null) return;
        texto = new BitmapFont(Gdx.files.internal("hud2/texto.fnt"), false);
        texto.getRegion().getTexture().setFilter(Texture.TextureFilter.Linear, Texture.TextureFilter.Linear);
        texto.setUseIntegerPositions(true);   // posições inteiras: sem bordas de glifos vizinhos no texto
    }

    /** Altura de linha de {@code px} pixels (o texto fica nítido pois a fonte é de alta resolução). */
    private static void tamanho(float px) {
        float base = texto.getData().lineHeight / texto.getData().scaleY;
        texto.getData().setScale(px / base);
    }

    /** Texto com o topo da caixa de letras em y (y = centro da linha, para alinhar com a barra). */
    private void drawTexto(SpriteBatch batch, String t, float x, float yc, float px, float r, float g, float b) {
        texto.setColor(r, g, b, 1f);
        texto.draw(batch, t, x, yc + px * 0.36f);
    }

    private void drawCentro(SpriteBatch batch, String t, float[] rect, float px, float r, float g, float b) {
        glyph.setText(texto, t);
        texto.setColor(r, g, b, 1f);
        texto.draw(batch, t, rect[0] + (rect[2] - glyph.width) / 2f, rect[1] + rect[3] / 2f + px * 0.36f);
    }

    private static void preencherPoligono(ShapeRenderer s, float[] v) {
        int n = v.length / 2;
        float cx = 0f, cy = 0f;
        for (int i = 0; i < n; i++) { cx += v[2 * i]; cy += v[2 * i + 1]; }
        cx /= n;
        cy /= n;
        for (int i = 0; i < n; i++) {
            int j = (i + 1) % n;
            s.triangle(cx, cy, v[2 * i], v[2 * i + 1], v[2 * j], v[2 * j + 1]);
        }
    }

    private static void set(float[] r, float x, float y, float w, float h) { r[0] = x; r[1] = y; r[2] = w; r[3] = h; }

    private static boolean in(float[] r, float x, float y) {
        return x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];
    }
}
