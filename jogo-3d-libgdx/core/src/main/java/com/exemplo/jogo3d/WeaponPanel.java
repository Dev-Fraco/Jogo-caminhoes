package com.exemplo.jogo3d;

import com.badlogic.gdx.graphics.Color;
import com.badlogic.gdx.graphics.Texture;
import com.badlogic.gdx.graphics.g2d.BitmapFont;
import com.badlogic.gdx.graphics.g2d.SpriteBatch;
import com.badlogic.gdx.graphics.g2d.TextureRegion;
import com.badlogic.gdx.graphics.glutils.ShapeRenderer;
import com.badlogic.gdx.graphics.g2d.GlyphLayout;
import com.badlogic.gdx.math.MathUtils;

/**
 * Painel de armas (botão "arma" do HUD), no desenho da arte nova:
 * em cima, a arma na mão com a munição (e a barra de recarga); embaixo, as duas armas levadas e o punho.
 *
 * Coordenadas do painel em frações da largura e da altura (origem embaixo à esquerda).
 * Toque: em cima recarrega; embaixo, a caixa da arma leva essa arma para a mão; o punho guarda ou saca.
 */
final class WeaponPanel {
    static final float TOP_Y = 0.47f;                                   // acima disso é o painel da arma na mão
    static final float[][] TILE_X = {{0.000f, 0.325f}, {0.3375f, 0.6625f}, {0.675f, 1.000f}};   // as três caixas de baixo
    static final int TOP = 9, FIST = 2;

    private static Texture bulletsTex, fistTex;
    private static final GlyphLayout layout = new GlyphLayout();

    /** Área tocada: 0 e 1 = as duas armas, FIST = punho, TOP = painel de cima, -1 = fora. */
    static int hitArea(float lx, float ly) {
        if (ly >= TOP_Y) return TOP;
        for (int i = 0; i < 3; i++) if (lx >= TILE_X[i][0] && lx <= TILE_X[i][1]) return i == 2 ? FIST : i;
        return -1;
    }

    private static void loadTextures() {
        if (bulletsTex != null) return;
        bulletsTex = new Texture(com.badlogic.gdx.Gdx.files.internal("hud2/arma_balas.png"));
        fistTex = new Texture(com.badlogic.gdx.Gdx.files.internal("hud2/arma_punho.png"));
        bulletsTex.setFilter(Texture.TextureFilter.Linear, Texture.TextureFilter.Linear);
        fistTex.setFilter(Texture.TextureFilter.Linear, Texture.TextureFilter.Linear);
    }

    /** Fundos e bordas (ShapeRenderer, dentro de um begin/end de Filled e de Line). */
    static void drawShapes(ShapeRenderer shapes, float x, float y, float w, float h, Weapons wp, boolean held) {
        int active = wp.activeSlotIndex();
        // Painel de cima: fundo escuro, borda amarela
        float ty = y + h * TOP_Y;
        shapes.begin(ShapeRenderer.ShapeType.Filled);
        shapes.setColor(0.05f, 0.05f, 0.05f, 0.9f);
        shapes.rect(x, ty, w, h * (1f - TOP_Y));
        shapes.setColor(0.10f, 0.08f, 0.02f, 0.9f);
        // Caixas de baixo: fundo escuro
        float by = y, bh = h * (TOP_Y - 0.02f);
        for (int i = 0; i < 3; i++) {
            float bx = x + w * TILE_X[i][0], bw = w * (TILE_X[i][1] - TILE_X[i][0]);
            shapes.setColor(0.05f, 0.05f, 0.05f, 0.9f);
            shapes.rect(bx, by, bw, bh);
        }
        // Munição: barra por baixo do número (recarga em laranja, pouca munição em vermelho)
        int hm = wp.heldMag(), hr = wp.heldReserve();
        float f = wp.reloading() ? wp.reloadProgress() : hm / (float) Math.max(1, wp.heldMagazine());
        float bx = x + w * 0.05f, bw = w * 0.42f, bar = y + h * 0.505f, bar_h = h * 0.035f;
        shapes.setColor(0.12f, 0.1f, 0.08f, 1f);
        shapes.rect(bx, bar, bw, bar_h);
        if (wp.reloading()) shapes.setColor(0.9f, 0.55f, 0.15f, 1f);
        else if (hm <= wp.heldMagazine() / 5) shapes.setColor(0.85f, 0.2f, 0.1f, 1f);
        else shapes.setColor(0.98f, 0.8f, 0.12f, 1f);
        shapes.rect(bx, bar, bw * MathUtils.clamp(f, 0f, 1f), bar_h);
        shapes.end();

        // Bordas: amarela em cima e na caixa da arma na mão; prata nas outras
        shapes.begin(ShapeRenderer.ShapeType.Line);
        for (int k = 0; k < 2; k++) {
            float d = k * h * 0.006f;
            shapes.setColor(0.98f, 0.82f, 0.1f, 1f);
            shapes.rect(x + d, ty + d, w - 2 * d, h * (1f - TOP_Y) - 2 * d);
        }
        for (int i = 0; i < 3; i++) {
            float bxi = x + w * TILE_X[i][0], bwi = w * (TILE_X[i][1] - TILE_X[i][0]);
            boolean on = (i < 2 && i == active && held) || (i == FIST && !held && wp.heldType() >= 0);
            for (int k = 0; k < 2; k++) {
                float d = k * h * 0.006f;
                if (on) shapes.setColor(0.98f, 0.82f, 0.1f, 1f);
                else shapes.setColor(0.78f, 0.78f, 0.8f, 1f);
                shapes.rect(bxi + d, by + d, bwi - 2 * d, bh - 2 * d);
            }
        }
        shapes.end();
    }

    /** Textos, ícones e o punho (SpriteBatch já em begin). */
    static void drawBatch(SpriteBatch batch, BitmapFont font, float x, float y, float w, float h, Weapons wp, boolean held) {
        loadTextures();
        float scale = font.getData().scaleX;
        Color c0 = font.getColor().cpy();
        // Arma na mão (em cima): ícone 3D, munição com ícone de balas e nome
        int hm = wp.heldMag(), hr = wp.heldReserve();
        TextureRegion big = wp.iconOf(wp.heldType());
        if (big != null && held) {
            float s = Math.min(w * 0.46f, h * 0.44f);
            batch.draw(big, x + w * 0.52f - s / 2f, y + h * 0.66f - s / 2f, s, s * 0.5f);
        }
        float bs = h * 0.20f;
        batch.setColor(1f, 0.92f, 0.5f, 1f);
        batch.draw(bulletsTex, x + w * 0.04f, y + h * 0.62f, bs, bs);
        batch.setColor(1f, 1f, 1f, 1f);
        font.getData().setScale(h / 330f);
        font.setColor(1f, 1f, 1f, 1f);
        String ammo = hm + "/" + hr;
        font.draw(batch, ammo, x + w * 0.04f + bs * 1.15f, y + h * 0.84f);
        font.getData().setScale(h / 520f);
        font.setColor(1f, 0.85f, 0.3f, 1f);
        font.draw(batch, held && wp.heldType() >= 0 ? Weapons.NAMES[wp.heldType()] : "PUNHO", x + w * 0.04f, y + h * 0.56f);
        // Caixas de baixo: as armas levadas (ícone e munição) e o punho
        font.getData().setScale(h / 470f);
        for (int i = 0; i < 2; i++) {
            float bx = x + w * TILE_X[i][0], bw = w * (TILE_X[i][1] - TILE_X[i][0]);
            int t = wp.slotType(i);
            if (t < 0) {
                font.setColor(0.45f, 0.45f, 0.45f, 1f);
                layout.setText(font, "VAZIO");
                font.draw(batch, "VAZIO", bx + (bw - layout.width) / 2f, y + h * 0.27f);
                continue;
            }
            TextureRegion ic = wp.iconOf(t);
            if (ic != null) {
                float s = Math.min(bw * 0.7f, h * 0.30f);
                batch.draw(ic, bx + bw / 2f - s / 2f, y + h * 0.22f, s, s * 0.5f);
            }
            String am = wp.magOf(t) + "/" + wp.reserveOf(t);
            font.setColor(1f, 1f, 1f, 1f);
            layout.setText(font, am);
            font.draw(batch, am, bx + (bw - layout.width) / 2f, y + h * 0.1f);
        }
        float fs = Math.min(w * 0.26f, h * 0.29f);
        float fx = x + w * (TILE_X[FIST][0] + TILE_X[FIST][1]) / 2f - fs / 2f;
        batch.setColor(1f, 1f, 1f, held ? 0.7f : 1f);
        batch.draw(fistTex, fx, y + h * 0.2f, fs, fs);
        batch.setColor(1f, 1f, 1f, 1f);
        font.getData().setScale(scale);
        font.setColor(c0);
    }
}
