package com.exemplo.jogo3d;

import com.badlogic.gdx.graphics.g2d.BitmapFont;
import com.badlogic.gdx.graphics.g2d.GlyphLayout;
import com.badlogic.gdx.graphics.g2d.SpriteBatch;
import com.badlogic.gdx.graphics.glutils.ShapeRenderer;

/**
 * Tela "Mira e sensibilidade" (aberta pela engrenagem): cada ajuste com − e +, aplicado na hora e
 * salvo no aparelho. Duas colunas: câmera/assistência à esquerda, sensibilidade por arma à direita.
 */
final class AimSettingsUi {
    boolean open = false;
    private final float[][] minus = new float[AimSettings.NAMES.length][4], plus = new float[AimSettings.NAMES.length][4];
    private final float[] back = new float[4], reset = new float[4];
    private final GlyphLayout layout = new GlyphLayout();

    void draw(SpriteBatch batch, ShapeRenderer shapes, BitmapFont font, int W, int H) {
        float pw = Math.min(W * 0.92f, H * 2.0f), ph = H * 0.9f, px = (W - pw) / 2f, py = (H - ph) / 2f;
        float pad = H * 0.025f, rowH = (ph - pad * 4f - H * 0.16f) / 9f, colW = (pw - pad * 3f) / 2f, bw = rowH * 1.1f;
        int n = AimSettings.NAMES.length;
        for (int i = 0; i < n; i++) {
            int col = i < 9 ? 0 : 1, row = i < 9 ? i : i - 9;
            float x = px + pad + col * (colW + pad), y = py + ph - pad - H * 0.08f - (row + 1) * rowH;
            set(minus[i], x + colW - bw * 2.1f, y + rowH * 0.1f, bw, rowH * 0.8f);
            set(plus[i], x + colW - bw, y + rowH * 0.1f, bw, rowH * 0.8f);
        }
        set(back, px + pw - pad - pw * 0.25f, py + pad, pw * 0.25f, H * 0.075f);
        set(reset, px + pad, py + pad, pw * 0.25f, H * 0.075f);

        shapes.begin(ShapeRenderer.ShapeType.Filled);
        shapes.setColor(0f, 0f, 0f, 0.6f);
        shapes.rect(0, 0, W, H);
        shapes.setColor(0.30f, 0.19f, 0.10f, 0.98f);
        shapes.rect(px, py, pw, ph);
        for (int i = 0; i < n; i++) {
            shapes.setColor(0.45f, 0.29f, 0.15f, 1f);
            rect(shapes, minus[i]);
            rect(shapes, plus[i]);
        }
        shapes.setColor(0.5f, 0.32f, 0.16f, 1f);
        rect(shapes, back);
        rect(shapes, reset);
        shapes.end();

        batch.begin();
        float old = font.getData().scaleX;
        font.getData().setScale(Math.max(1f, H / 600f));
        font.setColor(1f, 0.92f, 0.7f, 1f);
        String title = "MIRA E SENSIBILIDADE";
        layout.setText(font, title);
        font.draw(batch, title, px + (pw - layout.width) / 2f, py + ph - pad);
        font.setColor(0.9f, 0.8f, 0.6f, 1f);
        font.draw(batch, "Câmera e assistência", px + pad, py + ph - pad - H * 0.045f);
        font.draw(batch, "Sensibilidade por arma", px + pad * 2f + colW, py + ph - pad - H * 0.045f);
        for (int i = 0; i < n; i++) {
            float[] m = minus[i];
            font.setColor(1f, 0.95f, 0.85f, 1f);
            int col = i < 9 ? 0 : 1;
            float x = px + pad + col * (colW + pad);
            font.draw(batch, AimSettings.NAMES[i], x, m[1] + m[3] * 0.65f);
            String v = AimSettings.text(i);
            layout.setText(font, v);
            font.setColor(1f, 0.8f, 0.35f, 1f);
            font.draw(batch, v, m[0] - layout.width - pad * 0.6f, m[1] + m[3] * 0.65f);
            label(batch, font, minus[i], i == 3 ? "<" : "-");   // a fonte padrão não tem o sinal "−" (U+2212)
            label(batch, font, plus[i], i == 3 ? ">" : "+");
        }
        label(batch, font, back, "Voltar");
        label(batch, font, reset, "Padrão");
        font.getData().setScale(old);
        batch.end();
    }

    /** Toque: devolve true se tratou (sempre, com a tela aberta). */
    boolean press(float x, float y) {
        for (int i = 0; i < AimSettings.NAMES.length; i++) {
            if (in(minus[i], x, y)) { AimSettings.step(i, -1); AimSettings.save(); return true; }
            if (in(plus[i], x, y)) { AimSettings.step(i, 1); AimSettings.save(); return true; }
        }
        if (in(reset, x, y)) { AimSettings.reset(); AimSettings.save(); return true; }
        if (in(back, x, y)) { open = false; return true; }
        return true;
    }

    private void label(SpriteBatch batch, BitmapFont font, float[] r, String t) {
        font.setColor(1f, 0.97f, 0.9f, 1f);
        layout.setText(font, t);
        font.draw(batch, t, r[0] + (r[2] - layout.width) / 2f, r[1] + (r[3] + layout.height) / 2f);
    }

    private static void set(float[] r, float x, float y, float w, float h) { r[0] = x; r[1] = y; r[2] = w; r[3] = h; }

    private static void rect(ShapeRenderer s, float[] r) { s.rect(r[0], r[1], r[2], r[3]); }

    private static boolean in(float[] r, float x, float y) {
        return x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];
    }
}
