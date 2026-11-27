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
 * em cima, a arma na mão grande à direita e a munição embaixo à esquerda; embaixo, as armas levadas
 * em caixas (ícone no centro, munição no canto) e o punho.
 *
 * Coordenadas do painel em frações da largura e da altura (origem embaixo à esquerda).
 * Toque: em cima recarrega; embaixo, a caixa de uma arma leva essa arma para a mão; o punho guarda a arma.
 */
final class WeaponPanel {
    static final float TOP_Y = 0.47f;                                   // acima disso é o painel da arma na mão
    // Quatro caixas de baixo: fuzil, fuzil, pistola (slots 0, 1, 2) e punho (3)
    static final float[][] TILE_X = {{0.000f, 0.2406f}, {0.2531f, 0.4937f}, {0.5063f, 0.7469f}, {0.7594f, 1.000f}};
    static final int TOP = 9, FIST = 3;
    /** Fator de clareamento dos ícones 3D das armas (a luz do render deixa o aço escuro). */
    static final float ICONE_CLARO = 1.9f;

    private static Texture bulletsTex, fistTex;
    private static final GlyphLayout layout = new GlyphLayout();

    /** Área tocada: 0, 1 e 2 = as armas levadas, FIST = punho, TOP = painel de cima, -1 = fora. */
    static int hitArea(float lx, float ly) {
        if (ly >= TOP_Y) return TOP;
        for (int i = 0; i < TILE_X.length; i++) if (lx >= TILE_X[i][0] && lx <= TILE_X[i][1]) return i;
        return -1;
    }

    private static void loadTextures() {
        if (bulletsTex != null) return;
        bulletsTex = new Texture(com.badlogic.gdx.Gdx.files.internal("hud2/arma_balas.png"));
        fistTex = new Texture(com.badlogic.gdx.Gdx.files.internal("hud2/arma_punho.png"));
        bulletsTex.setFilter(Texture.TextureFilter.Linear, Texture.TextureFilter.Linear);
        fistTex.setFilter(Texture.TextureFilter.Linear, Texture.TextureFilter.Linear);
    }

    /** Escolhe a escala da fonte para o texto ter a altura de {@code px} pixels (a partir da altura sem escala). */
    private static void tamanho(BitmapFont font, float px) {
        float base = font.getData().lineHeight / font.getData().scaleY;   // altura de linha sem escala
        font.getData().setScale(px / base);
    }

    /** Fundos e bordas (ShapeRenderer, dentro de um begin/end de Filled e de Line). */
    static void drawShapes(ShapeRenderer shapes, float x, float y, float w, float h, Weapons wp, boolean held) {
        int active = wp.activeSlotIndex();
        float ty = y + h * TOP_Y;
        shapes.begin(ShapeRenderer.ShapeType.Filled);
        // Painel de cima: fundo escuro
        shapes.setColor(0.05f, 0.05f, 0.05f, 0.9f);
        shapes.rect(x, ty, w, h * (1f - TOP_Y));
        // Caixas de baixo: fundo escuro
        float by = y, bh = h * (TOP_Y - 0.02f);
        for (int i = 0; i < TILE_X.length; i++) {
            float bx = x + w * TILE_X[i][0], bw = w * (TILE_X[i][1] - TILE_X[i][0]);
            shapes.setColor(0.05f, 0.05f, 0.05f, 0.9f);
            shapes.rect(bx, by, bw, bh);
        }
        // Recarga: barra fina embaixo do painel de cima (laranja na recarga, vermelha com pouca munição)
        int hm = wp.heldMag();
        float f = wp.reloading() ? wp.reloadProgress() : hm / (float) Math.max(1, wp.heldMagazine());
        float bx = x + w * 0.05f, bw = w * 0.42f, bar = ty + h * 0.035f, bar_h = h * 0.03f;
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
        for (int i = 0; i < TILE_X.length; i++) {
            float bxi = x + w * TILE_X[i][0], bwi = w * (TILE_X[i][1] - TILE_X[i][0]);
            boolean on = (i < FIST && i == active && held) || (i == FIST && !held && wp.heldType() >= 0);
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
        float topMid = y + h * (TOP_Y + (1f - TOP_Y) * 0.5f);   // centro do painel de cima

        // Arma na mão: grande, à direita do painel de cima (ícone 2:1)
        TextureRegion big = wp.iconOf(wp.heldType());
        if (big != null && held) {
            float iw = Math.min(w * 0.60f, h * 0.44f * 2f), ih = iw / 2f;
            batch.setColor(ICONE_CLARO, ICONE_CLARO, ICONE_CLARO, 1f);   // ícone 3D escuro: clareia para ler no HUD
            batch.draw(big, x + w * 0.96f - iw, topMid - ih / 2f, iw, ih);
            batch.setColor(1f, 1f, 1f, 1f);
        }
        // Munição: canto inferior esquerdo do painel de cima, ícone de balas + número grande
        float bs = h * 0.20f, rowY = y + h * 0.50f;
        batch.setColor(1f, 0.92f, 0.5f, 1f);
        batch.draw(bulletsTex, x + w * 0.05f, rowY, bs, bs);
        batch.setColor(1f, 1f, 1f, 1f);
        String ammo = wp.heldMag() + "/" + wp.heldReserve();
        tamanho(font, h * 0.25f);
        font.setColor(1f, 1f, 1f, 1f);
        font.draw(batch, ammo, x + w * 0.05f + bs * 1.25f, rowY + bs * 0.95f);

        // Caixas de baixo: arma levada (ícone no centro, munição no canto inferior) ou VAZIO
        float bh = h * (TOP_Y - 0.02f);
        for (int i = 0; i < FIST; i++) {
            float bx = x + w * TILE_X[i][0], bw = w * (TILE_X[i][1] - TILE_X[i][0]);
            int t = wp.slotType(i);
            if (t < 0) {
                tamanho(font, bh * 0.16f);
                font.setColor(0.45f, 0.45f, 0.45f, 1f);
                layout.setText(font, "VAZIO");
                font.draw(batch, "VAZIO", bx + (bw - layout.width) / 2f, y + bh * 0.5f + layout.height / 2f);
                continue;
            }
            TextureRegion ic = wp.iconOf(t);
            if (ic != null) {
                float iw = Math.min(bw * 0.95f, bh * 1.2f), ih = iw / 2f;
                batch.setColor(ICONE_CLARO, ICONE_CLARO, ICONE_CLARO, 1f);
                batch.draw(ic, bx + (bw - iw) / 2f, y + bh * 0.46f, iw, ih);
                batch.setColor(1f, 1f, 1f, 1f);
            }
            float bsm = bh * 0.26f, rowm = y + bh * 0.08f;
            batch.setColor(1f, 1f, 1f, 1f);
            batch.draw(bulletsTex, bx + bw * 0.12f, rowm, bsm, bsm);
            String am = wp.magOf(t) + "/" + wp.reserveOf(t);
            tamanho(font, bh * 0.20f);
            font.setColor(1f, 1f, 1f, 1f);
            font.draw(batch, am, bx + bw * 0.12f + bsm * 1.25f, rowm + bsm * 0.92f);
        }

        // Punho: centro da última caixa
        float fs = Math.min(w * 0.26f, bh * 0.70f);
        float fx = x + w * (TILE_X[FIST][0] + TILE_X[FIST][1]) / 2f - fs / 2f;
        batch.setColor(1f, 1f, 1f, held ? 0.7f : 1f);
        batch.draw(fistTex, fx, y + bh * 0.5f - fs / 2f, fs, fs);
        batch.setColor(1f, 1f, 1f, 1f);
        font.getData().setScale(scale);
        font.setColor(c0);
    }

}
