package com.exemplo.jogo3d;

import com.badlogic.gdx.graphics.g2d.BitmapFont;
import com.badlogic.gdx.graphics.g2d.GlyphLayout;
import com.badlogic.gdx.graphics.g2d.SpriteBatch;
import com.badlogic.gdx.graphics.g2d.TextureRegion;
import com.badlogic.gdx.graphics.glutils.ShapeRenderer;
import com.badlogic.gdx.math.MathUtils;

/**
 * Arsenal de treino: abas de categoria, grade rolável de armas (com as imagens 3D reais do projeto),
 * arma selecionada em destaque e painel lateral com atributos e o botão EQUIPAR. Desenhado e tocado
 * em coordenadas de tela (origem embaixo), como o resto do HUD.
 */
final class Arsenal {
    enum Act { NONE, CLOSE, EQUIP }

    static final String[] TABS = {"FUZIS", "SMGs", "ESCOPETAS", "SNIPERS", "PISTOLAS", "CORPO A CORPO", "ACESSÓRIOS"};
    // Categoria (índice em TABS) de cada arma, na ordem de WeaponConfig.BY_TYPE
    private static final int[] TAB_OF = {0, 0, 0, 0, 0, 0, 3, 2};
    private static final String[] SUB = {"FUZIL DE ASSALTO", "FUZIL DE ASSALTO", "FUZIL DE ASSALTO", "FUZIL DE ASSALTO",
            "FUZIL DE ASSALTO", "FUZIL DE ASSALTO", "FUZIL DE PRECISÃO", "ESPINGARDA"};
    // Atributos de 0 a 1 (dano, precisão, alcance) para as barras
    private static final float[][] STAT = {
            {0.55f, 0.60f, 0.70f}, {0.50f, 0.65f, 0.70f}, {0.60f, 0.50f, 0.60f}, {0.60f, 0.65f, 0.80f},
            {0.55f, 0.70f, 0.75f}, {0.60f, 0.60f, 0.75f}, {0.90f, 0.95f, 1.00f}, {0.70f, 0.35f, 0.35f}};
    private static final String[] ATTR = {"DANO", "PRECISÃO", "ALCANCE"};
    private static final int COLS = 3;

    // Geometria (px), calculada em layout() a cada desenho
    private final float[] dlg = new float[4], close = new float[4], equip = new float[4];
    private final float[] grid = new float[4], detail = new float[4], bars = new float[4];
    private final float[][] tabs = new float[TABS.length][4];
    private float cardW, cardH, gap;

    int tab = 0;            // aba ativa
    int sel = 0;            // arma selecionada (índice em BY_TYPE)
    private float scroll = 0f, maxScroll = 0f;
    private boolean gridPress = false, dragged = false;
    private float pressY, lastY;
    private int pressType = -1;
    private final GlyphLayout layout = new GlyphLayout();

    /** Abre o arsenal com a arma da mão selecionada (ou a primeira). */
    void open(int heldType) {
        sel = heldType >= 0 ? heldType : 0;
        tab = TAB_OF[sel];
        scroll = 0f;
    }

    /** Armas da aba t, em ordem. */
    static int[] listOf(int t) {
        int n = 0;
        for (int v : TAB_OF) if (v == t) n++;
        int[] out = new int[n];
        int k = 0;
        for (int i = 0; i < TAB_OF.length; i++) if (TAB_OF[i] == t) out[k++] = i;
        return out;
    }

    /** Geometria da tela: diálogo com margens, abas no topo, grade à esquerda, detalhes à direita. */
    private void layout(int W, int H) {
        float mx = W * 0.035f, my = H * 0.05f;
        set(dlg, mx, my, W - 2 * mx, H - 2 * my);
        float top = H - my;
        float headH = H * 0.1f;
        set(close, W - mx - H * 0.08f, top - H * 0.09f, H * 0.08f, H * 0.08f);
        float tabY = top - headH - H * 0.075f;
        float tabGap = W * 0.008f;
        float tabW = (dlg[2] - tabGap * (TABS.length - 1)) / TABS.length;
        for (int t = 0; t < TABS.length; t++) set(tabs[t], dlg[0] + t * (tabW + tabGap), tabY, tabW, H * 0.075f);
        float gridTop = tabY - H * 0.025f;
        float gridBottom = my + H * 0.075f;
        float gridW = dlg[2] * 0.62f;
        set(grid, dlg[0] + W * 0.01f, gridBottom, gridW - W * 0.01f, gridTop - gridBottom);
        float dx = grid[0] + grid[2] + W * 0.02f, dw = dlg[0] + dlg[2] - dx - W * 0.01f;
        set(detail, dx, gridBottom, dw, gridTop - gridBottom);
        set(bars, dx + dw * 0.08f, gridBottom + H * 0.27f, dw * 0.84f, H * 0.2f);
        set(equip, dx + dw * 0.08f, gridBottom + H * 0.03f, dw * 0.84f, H * 0.09f);
        gap = W * 0.012f;
        cardW = (grid[2] - gap * (COLS - 1)) / COLS;
        cardH = cardW * 0.62f;
    }

    /** Retângulo do cartão i (já com a rolagem aplicada). */
    private float[] card(int i) {
        int row = i / COLS, col = i % COLS;
        float x = grid[0] + col * (cardW + gap);
        float y = grid[1] + grid[3] - (row + 1) * (cardH + gap) + gap + scroll;
        return new float[]{x, y, cardW, cardH};
    }

    private boolean visible(float[] c) { return c[1] + c[3] > grid[1] && c[1] < grid[1] + grid[3]; }

    /** Desenha o arsenal inteiro (tela cheia). */
    void draw(SpriteBatch batch, ShapeRenderer shapes, BitmapFont font, Weapons weapons, int W, int H) {
        layout(W, H);
        int[] items = listOf(tab);
        int rows = (items.length + COLS - 1) / COLS;
        maxScroll = Math.max(0f, rows * (cardH + gap) - grid[3]);
        scroll = MathUtils.clamp(scroll, 0f, maxScroll);
        float keep = font.getData().scaleX;

        shapes.begin(ShapeRenderer.ShapeType.Filled);
        shapes.setColor(0f, 0f, 0f, 0.72f);
        shapes.rect(0, 0, W, H);
        shapes.setColor(0.07f, 0.065f, 0.06f, 0.98f);
        shapes.rect(dlg[0], dlg[1], dlg[2], dlg[3]);
        for (int t = 0; t < TABS.length; t++) {
            float[] r = tabs[t];
            if (t == tab) shapes.setColor(1f, 0.62f, 0.1f, 1f);
            else shapes.setColor(0.16f, 0.15f, 0.13f, 1f);
            shapes.rect(r[0], r[1], r[2], r[3]);
        }
        for (int i = 0; i < items.length; i++) {
            float[] c = card(i);
            if (!visible(c)) continue;
            boolean on = items[i] == sel;
            shapes.setColor(on ? 0.3f : 0.12f, on ? 0.2f : 0.11f, on ? 0.05f : 0.1f, 1f);
            shapes.rect(c[0], c[1], c[2], c[3]);
        }
        if (maxScroll > 0f) {
            float contentH = rows * (cardH + gap);
            float th = Math.max(H * 0.05f, grid[3] * grid[3] / contentH);
            float ty = grid[1] + (grid[3] - th) * (1f - scroll / maxScroll);
            float sx = grid[0] + grid[2] + W * 0.004f;
            shapes.setColor(0.25f, 0.2f, 0.15f, 1f);
            shapes.rect(sx, grid[1], W * 0.006f, grid[3]);
            shapes.setColor(1f, 0.62f, 0.1f, 1f);
            shapes.rect(sx, ty, W * 0.006f, th);
        }
        // Barras dos cartões
        for (int i = 0; i < items.length; i++) {
            float[] c = card(i);
            if (!visible(c)) continue;
            float[] st = STAT[items[i]];
            for (int a = 0; a < 3; a++) bar(shapes, c[0] + cardW * 0.42f, c[1] + cardH * (0.52f - a * 0.2f), cardW * 0.5f, cardH * 0.06f, st[a]);
        }
        // Barras do painel
        for (int a = 0; a < 3; a++) bar(shapes, bars[0], bars[1] + bars[3] - (a + 1) * bars[3] / 3f + bars[3] * 0.1f, bars[2], bars[3] * 0.07f, STAT[sel][a]);
        // Botão EQUIPAR e borda da arma selecionada
        shapes.setColor(1f, 0.62f, 0.1f, 1f);
        shapes.rect(equip[0], equip[1], equip[2], equip[3]);
        shapes.end();
        shapes.begin(ShapeRenderer.ShapeType.Line);
        shapes.setColor(1f, 0.7f, 0.15f, 1f);
        for (int i = 0; i < items.length; i++) {
            float[] c = card(i);
            if (items[i] == sel && visible(c)) {
                shapes.rect(c[0], c[1], c[2], c[3]);
                shapes.rect(c[0] + 1, c[1] + 1, c[2] - 2, c[3] - 2);
            }
        }
        shapes.end();

        batch.begin();
        font.getData().setScale(H / 520f);
        font.setColor(1f, 0.95f, 0.85f, 1f);
        font.draw(batch, "ARSENAL DE TREINO", dlg[0] + W * 0.015f, dlg[1] + dlg[3] - H * 0.04f);
        font.getData().setScale(H / 880f);
        String info = "MUNIÇÃO: INFINITA      EQUIPAMENTOS: LIVRE";
        layout.setText(font, info);
        font.draw(batch, info, close[0] - W * 0.02f - layout.width, dlg[1] + dlg[3] - H * 0.04f);
        font.getData().setScale(H / 420f);
        text(batch, "X", close, font, new float[]{1f, 0.95f, 0.85f, 1f});
        font.getData().setScale(H / 600f);
        for (int t = 0; t < TABS.length; t++) {
            boolean on = t == tab;
            text(batch, TABS[t], tabs[t], font, on ? new float[]{0.1f, 0.06f, 0.02f, 1f} : new float[]{0.95f, 0.85f, 0.7f, 1f});
        }
        for (int i = 0; i < items.length; i++) {
            float[] c = card(i);
            if (!visible(c)) continue;
            int type = items[i];
            TextureRegion ic = weapons != null ? weapons.iconOf(type) : null;
            if (ic != null) batch.draw(ic, c[0] + cardW * 0.03f, c[1] + cardH * 0.38f, cardW * 0.5f, cardW * 0.25f);
            font.getData().setScale(H / 440f);
            font.setColor(1f, 0.95f, 0.85f, 1f);
            font.draw(batch, Weapons.NAMES[type], c[0] + cardW * 0.05f, c[1] + cardH * 0.93f);
            font.getData().setScale(H / 900f);
            font.setColor(0.95f, 0.85f, 0.6f, 1f);
            for (int a = 0; a < 3; a++) font.draw(batch, ATTR[a], c[0] + cardW * 0.05f, c[1] + cardH * (0.6f - a * 0.2f));
            if (weapons != null && weapons.heldType() == type) {
                font.getData().setScale(H / 420f);
                font.setColor(1f, 0.7f, 0.1f, 1f);
                font.draw(batch, "OK", c[0] + cardW * 0.8f, c[1] + cardH * 0.93f);
            }
        }
        if (items.length == 0) {
            font.getData().setScale(H / 560f);
            text(batch, "NENHUMA ARMA NESTA CATEGORIA AINDA", new float[]{grid[0], grid[1] + grid[3] / 2f, grid[2], 1f}, font,
                    new float[]{0.8f, 0.75f, 0.65f, 1f});
        }
        // Painel de detalhes
        font.getData().setScale(H / 400f);
        font.setColor(1f, 0.95f, 0.85f, 1f);
        font.draw(batch, Weapons.NAMES[sel], detail[0] + detail[2] * 0.08f, detail[1] + detail[3] - detail[3] * 0.06f);
        font.getData().setScale(H / 760f);
        font.setColor(1f, 0.7f, 0.15f, 1f);
        font.draw(batch, SUB[sel], detail[0] + detail[2] * 0.08f, detail[1] + detail[3] - detail[3] * 0.13f);
        TextureRegion big = weapons != null ? weapons.iconOf(sel) : null;
        if (big != null) batch.draw(big, detail[0] + detail[2] * 0.08f, detail[1] + detail[3] * 0.5f, detail[2] * 0.84f, detail[2] * 0.42f);
        font.getData().setScale(H / 640f);
        for (int a = 0; a < 3; a++) {
            float ty = bars[1] + bars[3] - (a + 1) * bars[3] / 3f + bars[3] * 0.22f;
            font.setColor(1f, 0.95f, 0.85f, 1f);
            font.draw(batch, ATTR[a], bars[0], ty);
            layout.setText(font, String.valueOf(Math.round(STAT[sel][a] * 100)));
            font.setColor(1f, 0.9f, 0.7f, 1f);
            font.draw(batch, String.valueOf(Math.round(STAT[sel][a] * 100)), bars[0] + bars[2] - layout.width, ty);
        }
        font.getData().setScale(H / 420f);
        text(batch, "EQUIPAR  >>", equip, font, new float[]{0.1f, 0.06f, 0.02f, 1f});
        font.getData().setScale(H / 720f);
        font.setColor(0.85f, 0.8f, 0.7f, 1f);
        String hint = "TOQUE PARA SELECIONAR   |   ARRASTE A GRADE PARA VER TODAS";
        layout.setText(font, hint);
        font.draw(batch, hint, grid[0] + (grid[2] - layout.width) / 2f, dlg[1] + H * 0.035f);
        font.getData().setScale(keep);
        batch.end();
    }

    private static void bar(ShapeRenderer s, float x, float y, float w, float h, float v) {
        s.setColor(0.25f, 0.22f, 0.2f, 1f);
        s.rect(x, y, w, h);
        s.setColor(1f, 0.62f, 0.1f, 1f);
        s.rect(x, y, w * MathUtils.clamp(v, 0f, 1f), h);
    }

    /** Texto centralizado no retângulo r (com a cor dada). */
    private void text(SpriteBatch batch, String t, float[] r, BitmapFont font, float[] col) {
        font.setColor(col[0], col[1], col[2], col[3]);
        layout.setText(font, t);
        font.draw(batch, t, r[0] + (r[2] - layout.width) / 2f, r[1] + (r[3] + layout.height) / 2f);
    }

    private static void set(float[] r, float x, float y, float w, float h) { r[0] = x; r[1] = y; r[2] = w; r[3] = h; }

    /** Toque: devolve a ação. Abas e cartões são tratados aqui; EQUIPAR e FECHAR voltam ao Main. */
    Act press(float x, float y) {
        if (in(close, x, y)) return Act.CLOSE;
        if (in(equip, x, y)) return Act.EQUIP;
        for (int t = 0; t < TABS.length; t++) {
            if (in(tabs[t], x, y)) {
                tab = t;
                scroll = 0f;
                int[] items = listOf(t);
                if (items.length > 0 && !contains(items, sel)) sel = items[0];
                return Act.NONE;
            }
        }
        if (in(grid, x, y)) {
            gridPress = true;
            dragged = false;
            pressY = lastY = y;
            pressType = cardAt(x, y);
        }
        return Act.NONE;
    }

    private static boolean contains(int[] a, int v) { for (int x : a) if (x == v) return true; return false; }

    private int cardAt(float x, float y) {
        int[] items = listOf(tab);
        for (int i = 0; i < items.length; i++) if (in(card(i), x, y)) return items[i];
        return -1;
    }

    /** Arraste na grade: rola a lista (um toque curto seleciona). */
    void drag(float y) {
        if (!gridPress) return;
        float dy = y - lastY;
        lastY = y;
        if (Math.abs(y - pressY) > 12f) dragged = true;
        if (dragged) scroll = MathUtils.clamp(scroll + dy, 0f, maxScroll);
    }

    /** Soltou o dedo: sem arrastar, seleciona a arma tocada. */
    void release() {
        if (gridPress && !dragged && pressType >= 0) sel = pressType;
        gridPress = false;
        dragged = false;
        pressType = -1;
    }

    static boolean in(float[] r, float x, float y) {
        return x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];
    }
}
