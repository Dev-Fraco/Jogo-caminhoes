package com.exemplo.jogo3d;

import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.graphics.Texture;
import com.badlogic.gdx.graphics.g2d.BitmapFont;
import com.badlogic.gdx.graphics.g2d.GlyphLayout;
import com.badlogic.gdx.graphics.g2d.SpriteBatch;
import com.badlogic.gdx.graphics.glutils.ShapeRenderer;

/**
 * Janela de escolha ao pegar um fuzil com os dois slots cheios: "TROCAR QUAL ARMA?". Mostra a arma que foi
 * pega e as duas que estão nos slots 1 e 2, mais CANCELAR. A arma escolhida sai do inventário e cai no chão.
 */
final class ColetaUi {
    boolean open = false;
    private final float[] box = new float[4], sub1 = new float[4], sub2 = new float[4], cancel = new float[4];
    private static BitmapFont texto;
    private final GlyphLayout glyph = new GlyphLayout();

    /** Toque: 1 = substituir o slot 1, 2 = slot 2, 3 = cancelar, 0 = nada. Com a janela aberta, consome o toque. */
    int press(float x, float y) {
        if (!open) return 0;
        if (in(sub1, x, y)) return 1;
        if (in(sub2, x, y)) return 2;
        if (in(cancel, x, y)) return 3;
        return 0;
    }

    void draw(SpriteBatch batch, ShapeRenderer shapes, int W, int H, Weapons wp, Weapons.Pickup g) {
        loadAssets();
        float bw = W * 0.56f, bh = H * 0.56f, bx = (W - bw) / 2f, by = (H - bh) / 2f;
        set(box, bx, by, bw, bh);
        float bt = bh * 0.15f;
        set(sub1, bx + bw * 0.06f, by + bh * 0.36f, bw * 0.88f, bt);
        set(sub2, bx + bw * 0.06f, by + bh * 0.36f - bt - bh * 0.04f, bw * 0.88f, bt);
        set(cancel, bx + bw * 0.06f, by + bh * 0.05f, bw * 0.88f, bt * 0.8f);

        shapes.begin(ShapeRenderer.ShapeType.Filled);
        shapes.setColor(0f, 0f, 0f, 0.65f);
        shapes.rect(0, 0, W, H);
        shapes.setColor(0.06f, 0.06f, 0.065f, 1f);
        shapes.rect(bx, by, bw, bh);
        shapes.setColor(0.13f, 0.1f, 0.02f, 1f);
        shapes.rect(sub1[0], sub1[1], sub1[2], sub1[3]);
        shapes.rect(sub2[0], sub2[1], sub2[2], sub2[3]);
        shapes.setColor(0.12f, 0.12f, 0.13f, 1f);
        shapes.rect(cancel[0], cancel[1], cancel[2], cancel[3]);
        shapes.end();

        shapes.begin(ShapeRenderer.ShapeType.Line);
        shapes.setColor(1f, 0.82f, 0.1f, 1f);
        shapes.rect(bx, by, bw, bh);
        shapes.rect(sub1[0], sub1[1], sub1[2], sub1[3]);
        shapes.rect(sub2[0], sub2[1], sub2[2], sub2[3]);
        shapes.setColor(0.62f, 0.64f, 0.68f, 1f);
        shapes.rect(cancel[0], cancel[1], cancel[2], cancel[3]);
        shapes.end();

        batch.begin();
        tamanho(bh * 0.085f);
        text(batch, "TROCAR QUAL ARMA?", bx + bw * 0.06f, by + bh * 0.93f, 1f, 0.82f, 0.1f, 0f);
        tamanho(bh * 0.055f);
        text(batch, "Você pegou: " + Weapons.NAMES[g.type], bx + bw * 0.06f, by + bh * 0.80f, 0.92f, 0.92f, 0.92f, 0f);
        tamanho(bt * 0.34f);
        int t1 = wp.slotType(Weapons.SLOT_FUZIL_1), t2 = wp.slotType(Weapons.SLOT_FUZIL_2);
        centro(batch, "SUBSTITUIR " + (t1 >= 0 ? Weapons.NAMES[t1] : "—"), sub1, 1f, 0.9f, 0.4f);
        centro(batch, "SUBSTITUIR " + (t2 >= 0 ? Weapons.NAMES[t2] : "—"), sub2, 1f, 0.9f, 0.4f);
        tamanho(cancel[3] * 0.42f);
        centro(batch, "CANCELAR", cancel, 0.92f, 0.92f, 0.92f);
        batch.end();
    }

    private void text(SpriteBatch batch, String t, float x, float top, float r, float g, float b, float unused) {
        texto.setColor(r, g, b, 1f);
        texto.draw(batch, t, x, top);
    }

    private void centro(SpriteBatch batch, String t, float[] rect, float r, float g, float b) {
        glyph.setText(texto, t);
        texto.setColor(r, g, b, 1f);
        texto.draw(batch, t, rect[0] + (rect[2] - glyph.width) / 2f, rect[1] + rect[3] / 2f + texto.getData().lineHeight * texto.getData().scaleY * 1.2f);
    }

    private static void loadAssets() {
        if (texto != null) return;
        texto = new BitmapFont(Gdx.files.internal("hud2/texto.fnt"), false);
        texto.getRegion().getTexture().setFilter(Texture.TextureFilter.Linear, Texture.TextureFilter.Linear);
    }

    private static void tamanho(float px) {
        float base = texto.getData().lineHeight / texto.getData().scaleY;
        texto.getData().setScale(px / base);
    }

    private static void set(float[] r, float x, float y, float w, float h) { r[0] = x; r[1] = y; r[2] = w; r[3] = h; }

    private static boolean in(float[] r, float x, float y) {
        return x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];
    }
}
