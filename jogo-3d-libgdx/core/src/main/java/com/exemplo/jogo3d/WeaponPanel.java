package com.exemplo.jogo3d;

import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.graphics.Color;
import com.badlogic.gdx.graphics.Texture;
import com.badlogic.gdx.graphics.g2d.BitmapFont;
import com.badlogic.gdx.graphics.g2d.SpriteBatch;
import com.badlogic.gdx.graphics.g2d.TextureRegion;
import com.badlogic.gdx.graphics.glutils.ShapeRenderer;
import com.badlogic.gdx.math.MathUtils;

/**
 * Painel de armas (botão "arma" do HUD), no layout de jogos battle royale:
 * em cima, um slot grande com a arma na mão (borda amarela), munição no canto inferior esquerdo;
 * embaixo, três caixas com as outras armas e o punho (bordas neutras).
 *
 * A ordem vem de {@link Weapons#ordemHud()}: o item que sobe para a mão deixa a caixa e o que estava
 * na mão ocupa essa caixa. Nunca mostra o mesmo item duas vezes.
 *
 * Coordenadas do painel em frações da largura e da altura (origem embaixo à esquerda).
 * Toque: em cima recarrega; embaixo, a caixa leva esse item para a mão.
 */
final class WeaponPanel {
    static final float TOP_Y = 0.46f;                    // acima disso é o slot da mão
    static final int TOP = 9;                            // código de área: slot da mão
    static final float TILE_TOP = 0.42f;                 // altura das caixas de baixo
    // Três caixas de baixo, com a mesma largura e pequena folga entre elas
    static final float[][] TILE_X = {{0.000f, 0.3267f}, {0.3467f, 0.6533f}, {0.6733f, 1.000f}};

    private static Texture fistTex;
    private static BitmapFont numFont;
    private static final Color AMARELO = new Color(1f, 0.82f, 0.1f, 1f);
    private static final Color NEUTRO = new Color(0.62f, 0.64f, 0.68f, 1f);
    private static final Color VAZIO = new Color(0.26f, 0.27f, 0.3f, 1f);
    private static final Color FUNDO = new Color(0.035f, 0.035f, 0.04f, 0.94f);

    /** Área tocada: 0..2 = caixa de baixo, TOP = slot da mão, -1 = fora. */
    static int hitArea(float lx, float ly) {
        if (ly >= TOP_Y) return TOP;
        for (int i = 0; i < TILE_X.length; i++) if (lx >= TILE_X[i][0] && lx <= TILE_X[i][1]) return i;
        return -1;
    }

    private static void loadAssets() {
        if (fistTex != null) return;
        fistTex = new Texture(Gdx.files.internal("hud2/arma_punho.png"));
        fistTex.setFilter(Texture.TextureFilter.Linear, Texture.TextureFilter.Linear);
        numFont = new BitmapFont(Gdx.files.internal("hud2/numeros.fnt"), false);
        numFont.getRegion().getTexture().setFilter(Texture.TextureFilter.Linear, Texture.TextureFilter.Linear);
    }

    /** Escolhe a escala da fonte de números para a altura de linha de {@code px} pixels. */
    private static void tamanho(float px) {
        float base = numFont.getData().lineHeight / numFont.getData().scaleY;
        numFont.getData().setScale(px / base);
    }

    /** Octógono com cantos chanfrados (x0,y0 embaixo à esquerda), como nos slots de battle royale. */
    static float[] octogono(float x, float y, float w, float h, float c) {
        return new float[]{
                x + c, y, x + w - c, y, x + w, y + c, x + w, y + h - c,
                x + w - c, y + h, x + c, y + h, x, y + h - c, x, y + c};
    }

    /** Geometria da caixa de baixo i: x, y, largura, altura. */
    private static float[] caixa(float x, float y, float w, float h, int i) {
        return new float[]{x + w * TILE_X[i][0], y, w * (TILE_X[i][1] - TILE_X[i][0]), h * TILE_TOP};
    }

    /** Preenche um polígono convexo (leque de triângulos a partir do centro). ShapeRenderer em modo Filled. */
    private static void preencher(ShapeRenderer s, float[] v) {
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

    /** Linha de balas (vetor, nítida em qualquer tamanho): 3 balas de altura bh, começando em (bx, by). */
    private static void balas(ShapeRenderer s, float bx, float by, float bh, Color cor) {
        float bw = bh * 0.34f, corpo = bh * 0.72f;
        s.setColor(cor);
        for (int i = 0; i < 3; i++) {
            float x = bx + i * bw * 1.3f;
            s.rect(x, by, bw, corpo);
            s.triangle(x, by + corpo, x + bw, by + corpo, x + bw / 2f, by + bh);
        }
    }

    /** Número com a altura de linha px, com o topo dos algarismos centrado em cy. */
    private static void numero(SpriteBatch batch, String t, float x, float cy, float px) {
        tamanho(px);
        numFont.setColor(1f, 1f, 1f, 1f);
        numFont.draw(batch, t, x, cy + px * 0.48f);
    }

    /** Barra de recarga e fundos/bordas (ShapeRenderer, dentro de um begin/end de Filled e de Line). */
    static void drawShapes(ShapeRenderer shapes, float x, float y, float w, float h, Weapons wp, boolean held) {
        loadAssets();
        int[] ord = wp.ordemHud();
        float ty = y + h * TOP_Y, th = h * (1f - TOP_Y);
        float cTop = th * 0.14f;

        // Fundos
        shapes.begin(ShapeRenderer.ShapeType.Filled);
        shapes.setColor(FUNDO);
        preencher(shapes, octogono(x, ty, w, th, cTop));
        for (int i = 0; i < TILE_X.length; i++) {
            float[] c = caixa(x, y, w, h, i);
            shapes.setColor(FUNDO);
            preencher(shapes, octogono(c[0], c[1], c[2], c[3], c[3] * 0.18f));
        }
        // Munição: balas na mão (amarelas) e nas caixas (brancas)
        if (ord[0] != Weapons.ITEM_PUNHO && wp.slotType(ord[0]) >= 0) {
            float bh = th * 0.30f;
            balas(shapes, x + w * 0.06f, ty + th * 0.18f, bh, new Color(1f, 0.9f, 0.45f, 1f));
        }
        for (int i = 0; i < TILE_X.length; i++) {
            int c = ord[i + 1];
            if (c < 0 || c == Weapons.ITEM_PUNHO) continue;
            float[] b = caixa(x, y, w, h, i);
            float bh = b[3] * 0.26f;
            balas(shapes, b[0] + b[2] * 0.08f, b[1] + b[3] * 0.12f, bh, Color.WHITE);
        }
        // Recarga: barra fina na base do slot da mão
        int hm = wp.heldMag();
        float f = wp.reloading() ? wp.reloadProgress() : hm / (float) Math.max(1, wp.heldMagazine());
        float bx = x + w * 0.06f, bw = w * 0.88f, bar = ty + th * 0.04f, barH = th * 0.035f;
        shapes.setColor(0.14f, 0.13f, 0.1f, 1f);
        shapes.rect(bx, bar, bw, barH);
        if (wp.reloading()) shapes.setColor(0.95f, 0.58f, 0.15f, 1f);
        else if (hm <= wp.heldMagazine() / 5) shapes.setColor(0.9f, 0.25f, 0.12f, 1f);
        else shapes.setColor(AMARELO);
        shapes.rect(bx, bar, bw * MathUtils.clamp(f, 0f, 1f), barH);
        shapes.end();

        // Bordas: amarela no slot da mão (com brilho); neutras nas caixas; apagadas nas vazias
        shapes.begin(ShapeRenderer.ShapeType.Line);
        float[] brilho = {0f, 0.011f, 0.024f};
        float[] alfa = {1f, 0.45f, 0.18f};
        for (int k = 0; k < brilho.length; k++) {
            float d = h * brilho[k];
            shapes.setColor(AMARELO.r, AMARELO.g, AMARELO.b, alfa[k]);
            shapes.polygon(octogono(x - d, ty - d, w + 2 * d, th + 2 * d, cTop + d));
        }
        for (int i = 0; i < TILE_X.length; i++) {
            float[] c = caixa(x, y, w, h, i);
            boolean vazia = ord[i + 1] < 0;
            shapes.setColor(vazia ? VAZIO : NEUTRO);
            for (int k = 0; k < 2; k++) {
                float d = k * h * 0.006f;
                shapes.polygon(octogono(c[0] + d, c[1] + d, c[2] - 2 * d, c[3] - 2 * d, c[3] * 0.18f));
            }
        }
        shapes.end();
    }

    /** Ícones, números e o punho (SpriteBatch já em begin). */
    static void drawBatch(SpriteBatch batch, float x, float y, float w, float h, Weapons wp, boolean held) {
        loadAssets();
        int[] ord = wp.ordemHud();
        float ty = y + h * TOP_Y, th = h * (1f - TOP_Y);
        float scaleAntes = numFont.getData().scaleX;

        // Slot da mão: arma grande (silhueta) à direita e munição embaixo à esquerda; ou o punho
        float cx = x + w * 0.70f, cy = ty + th * 0.56f;
        if (ord[0] == Weapons.ITEM_PUNHO) {
            float fs = Math.min(w * 0.30f, th * 0.80f);
            batch.setColor(1f, 1f, 1f, 1f);
            batch.draw(fistTex, cx - fs / 2f, cy - fs / 2f, fs, fs);
        } else {
            int t = wp.slotType(ord[0]);
            TextureRegion ic = wp.iconHud(t);
            if (ic != null) {
                float iw = Math.min(w * 0.54f, th * 0.78f * 2f), ih = iw / 2f;
                batch.setColor(1f, 1f, 1f, 1f);
                batch.draw(ic, cx - iw / 2f, cy - ih / 2f, iw, ih);
            }
            float bh = th * 0.30f, bw = bh * 0.34f;
            numero(batch, wp.magOf(t) + "/" + wp.reserveOf(t),
                    x + w * 0.06f + 3.6f * bw + 1.2f * bw,
                    ty + th * 0.18f + bh / 2f, bh * 1.15f);
        }

        // Caixas de baixo: ícone no alto, munição embaixo à esquerda; punho ou vazia
        for (int i = 0; i < TILE_X.length; i++) {
            int c = ord[i + 1];
            if (c < 0) continue;
            float[] b = caixa(x, y, w, h, i);
            batch.setColor(1f, 1f, 1f, 1f);
            if (c == Weapons.ITEM_PUNHO) {
                float fs = Math.min(b[2] * 0.50f, b[3] * 0.62f);
                batch.draw(fistTex, b[0] + b[2] / 2f - fs / 2f, b[1] + b[3] * 0.5f - fs / 2f, fs, fs);
                continue;
            }
            int t = wp.slotType(c);
            TextureRegion ic = wp.iconHud(t);
            if (ic != null) {
                float iw = Math.min(b[2] * 0.86f, b[3] * 0.60f * 2f), ih = iw / 2f;
                batch.draw(ic, b[0] + b[2] / 2f - iw / 2f, b[1] + b[3] * 0.64f - ih / 2f, iw, ih);
            }
            float bh = b[3] * 0.26f, bw = bh * 0.34f;
            numero(batch, wp.magOf(t) + "/" + wp.reserveOf(t),
                    b[0] + b[2] * 0.08f + 3.6f * bw + 1.0f * bw,
                    b[1] + b[3] * 0.12f + bh / 2f, bh * 0.92f);
        }
        numFont.getData().setScale(scaleAntes);
        batch.setColor(1f, 1f, 1f, 1f);
    }
}
