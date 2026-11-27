package com.exemplo.jogo3d;

import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.graphics.Texture;
import com.badlogic.gdx.graphics.g2d.BitmapFont;
import com.badlogic.gdx.graphics.g2d.GlyphLayout;
import com.badlogic.gdx.graphics.g2d.SpriteBatch;
import com.badlogic.gdx.graphics.glutils.ShapeRenderer;
import com.badlogic.gdx.math.MathUtils;

/**
 * Tela "MIRA E SENSIBILIDADE" (aberta pela engrenagem), no visual de battle royale: fundo preto, painéis
 * escuros com borda metálica, barras amarelas com indicador circular e valores de 0 a 200.
 *
 * Esquerda: sensibilidade geral, mira 2x e 4x, assistência de mira (liga/desliga), força abdominal,
 * assistência horizontal, FOV e resistência vertical. Direita: aberturas de AKM, GROZA, M16A4, M416,
 * SCAR-L, AWM, M1014, MAGNUM 357 e AUG.
 *
 * Toque: tocar numa barra já ajusta o valor; arrastar o indicador ou o dedo sobre a barra acompanha.
 * Cada mudança vale na hora no jogo e é salva ao soltar o dedo.
 */
final class AimSettingsUi {
    boolean open = false;

    // Ordem das linhas em cada coluna (índices de AimSettings)
    static final int[] LEFT = {0, 1, 2, 3, 4, 5, 6, 16};
    static final int[] RIGHT = {7, 9, 10, 11, 12, 13, 14, 15, 8};
    static final String[] LEFT_LABEL = {"Sensibilidade geral", "Mira 2x", "Mira 4x", "Assistência de mira",
            "Força abdominal", "Assistência horizontal", "FOV do Aim Assist", "Resistência vertical"};
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
        float rowsTop = panTop - m * 0.5f - tabH - panH * 0.035f;
        float rowsH = rowsTop - panY - panH * 0.04f;
        rowH = rowsH / 9f;
        for (int r = 0; r < LEFT.length; r++) placeRow(LEFT[r], 0, r, rowsTop);
        for (int r = 0; r < RIGHT.length; r++) placeRow(RIGHT[r], 1, r, rowsTop);
        set(backArrow, m, H - hh * 0.82f, hh * 0.56f, hh * 0.56f);
        set(back, backArrow[0] - hh * 0.2f, backArrow[1] - hh * 0.2f, hh * 0.96f, hh * 0.96f);
        set(reset, m, H * 0.03f, W * 0.28f, H * 0.095f);
        set(voltar, W - m - W * 0.22f, H * 0.03f, W * 0.22f, H * 0.095f);
    }

    private void placeRow(int idx, int col, int row, float rowsTop) {
        float yc = rowsTop - (row + 0.5f) * rowH;
        float x0 = panX[col] + panW * 0.43f, x1 = panX[col] + panW * 0.84f;
        track[idx][0] = x0;
        track[idx][1] = x1;
        track[idx][2] = yc;
        track[idx][3] = rowH * 0.15f;
    }

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
        // Barras
        for (int c = 0; c < 2; c++) {
            int[] lista = c == 0 ? LEFT : RIGHT;
            for (int idx : lista) {
                float[] t = track[idx];
                float h = t[3];
                shapes.setColor(TRACK[0], TRACK[1], TRACK[2], 1f);
                shapes.rect(t[0], t[2] - h / 2f, t[1] - t[0], h);
                if (idx == 3) continue;   // liga/desliga: desenhado no batch
                float frac = AimSettings.toSlider(idx) / 200f;
                float kx = t[0] + (t[1] - t[0]) * frac;
                shapes.setColor(YELLOW[0], YELLOW[1], YELLOW[2], 1f);
                shapes.rect(t[0], t[2] - h / 2f, kx - t[0], h);
            }
            for (int idx : lista) {
                if (idx == 3) continue;
                float[] t = track[idx];
                float kx = t[0] + (t[1] - t[0]) * (AimSettings.toSlider(idx) / 200f);
                float r = rowH * 0.25f;
                shapes.setColor(YELLOW[0], YELLOW[1], YELLOW[2], 1f);
                shapes.circle(kx, t[2], r, 24);
                shapes.setColor(0.07f, 0.07f, 0.075f, 1f);
                shapes.circle(kx, t[2], r * 0.42f, 18);
            }
            if (c == 0) {
                // Liga/desliga da assistência
                float[] t = track[3];
                float sw = (t[1] - t[0]) * 0.34f, sh = rowH * 0.46f;
                boolean on = AimSettings.assistOn;
                shapes.setColor(on ? YELLOW[0] : 0.25f, on ? YELLOW[1] : 0.25f, on ? YELLOW[2] : 0.27f, 1f);
                shapes.rect(t[0], t[2] - sh / 2f, sw, sh);
                shapes.setColor(0.97f, 0.97f, 0.97f, 1f);
                float kxs = on ? t[0] + sw - sh * 0.5f : t[0] + sh * 0.5f;
                shapes.circle(kxs, t[2], sh * 0.4f, 18);
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
            drawTexto(batch, c == 0 ? "CÂMERA E ASSISTÊNCIA" : "SENSIBILIDADE POR ARMA", panX[c] + panW * 0.02f,
                    panY + panH - tabH / 2f, tabH * 0.42f, 0.04f, 0.04f, 0.04f);
        }
        for (int c = 0; c < 2; c++) {
            int[] lista = c == 0 ? LEFT : RIGHT;
            String[] nomes = c == 0 ? LEFT_LABEL : RIGHT_LABEL;
            for (int r = 0; r < lista.length; r++) {
                int idx = lista[r];
                float[] t = track[idx];
                tamanho(rowH * 0.40f);
                drawTexto(batch, nomes[r], panX[c] + panW * 0.035f, t[2], rowH * 0.40f, 0.96f, 0.96f, 0.96f);
                String v = idx == 3 ? (AimSettings.assistOn ? "LIGADA" : "DESLIGADA") : String.valueOf(AimSettings.toSlider(idx));
                tamanho(rowH * 0.44f);
                glyph.setText(texto, v);
                float vx = panX[c] + panW * 0.965f - glyph.width;
                drawTexto(batch, v, vx, t[2], rowH * 0.44f, 1f, 0.8f, 0.08f);
            }
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
                if (idx == 3) {
                    AimSettings.assistOn = !AimSettings.assistOn;
                    AimSettings.save();
                    return true;
                }
                drag = idx;
                setFromX(idx, x);
                return true;
            }
        }
        return true;
    }

    /** Dedo arrastado: acompanha a barra em que começou. */
    void drag(float x, float y) {
        if (drag >= 0) setFromX(drag, x);
    }

    /** Dedo solto: salva a configuração. */
    void release() {
        if (drag >= 0 || changed) AimSettings.save();
        drag = -1;
        changed = false;
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
