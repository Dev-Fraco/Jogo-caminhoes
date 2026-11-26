package com.exemplo.jogo3d;

import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.graphics.g2d.BitmapFont;
import com.badlogic.gdx.graphics.g2d.GlyphLayout;
import com.badlogic.gdx.graphics.g2d.SpriteBatch;
import com.badlogic.gdx.graphics.g2d.TextureRegion;
import com.badlogic.gdx.graphics.glutils.ShapeRenderer;
import com.badlogic.gdx.math.MathUtils;

/**
 * Itens na tela (HUD de couro):
 * - painel de vida: HP (vida) e EP (energia) com números, e a água num filete azul embaixo;
 * - os três espaços da esquerda: cura (kit), granada e energia (garrafa), com a quantidade na bolinha;
 * - painel da mochila (botão da mochila): toque num item para usar ou escolher qual vai no espaço;
 * - roda de progresso do item em uso, clarão da atordoante, vermelho do dano e a tela de morte.
 */
final class ItemUi {
    // Espaço 0 = cura, 1 = energia, 2 = granada
    static final int[][] SLOT_TYPES = {
            {Survival.MEDKIT, Survival.BANDAGEM},
            {Survival.ENERGETICO, Survival.ANALGESICO, Survival.INJECAO},
            {Grenades.FRAG, Grenades.SMOKE, Grenades.STUN}};
    static final String[] SLOT_IDS = {"slot_cura", "slot_energia", "slot_granada"};
    // Bolinha do número em cada espaço (fração da imagem, de baixo)
    private static final float[][] BADGE = {{0.7376f, 0.2867f}, {0.7483f, 0.3092f}, {0.7292f, 0.2937f}};
    // Painel de vida (status.png): barras e área do texto (fração da imagem, de baixo)
    private static final float BAR_X0 = 0.390f, BAR_X1 = 0.946f;
    private static final float[][] BAR_Y = {{0.573f, 0.795f}, {0.222f, 0.453f}};
    private static final float TEXT_X = 0.125f;

    final int[] selected = {Survival.MEDKIT, Survival.ENERGETICO, Grenades.FRAG};
    boolean panelOpen = false;
    private final float[][] cellRects = new float[Items.NAMES.length][4];
    private final float[] closeRect = new float[4];
    private final GlyphLayout layout = new GlyphLayout();

    /** O item do espaço: o escolhido, ou outro do mesmo tipo que ainda tenha na mochila. */
    int current(int slot, Items items) {
        if (items.bag[selected[slot]] > 0) return selected[slot];
        for (int t : SLOT_TYPES[slot]) if (items.bag[t] > 0) return t;
        return selected[slot];
    }

    static int slotOf(int type) {
        for (int s = 0; s < 3; s++) for (int t : SLOT_TYPES[s]) if (t == type) return s;
        return -1;
    }

    /** Toque com o painel da mochila aberto: devolve o item tocado, -2 para fechar, -1 nada. */
    int panelHit(float x, float y) {
        if (in(closeRect, x, y)) return -2;
        for (int i = 0; i < Items.NAMES.length; i++) if (in(cellRects[i], x, y)) return i;
        return -2;   // fora das células: fecha
    }

    private static boolean in(float[] r, float x, float y) {
        return x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];
    }

    void draw(SpriteBatch batch, ShapeRenderer shapes, BitmapFont font, Hud hud, Items items, Survival sv,
              boolean aiming, float stunAlpha) {
        int W = Gdx.graphics.getWidth(), H = Gdx.graphics.getHeight();
        float[] sr = hud.rect(hud.get("status"));

        shapes.begin(ShapeRenderer.ShapeType.Filled);
        // Barras: trilho escuro e a parte cheia (vida vermelha, energia azul)
        float[] vals = {sv.health, sv.boost};
        float bx0 = sr[0] + sr[2] * BAR_X0, bx1 = sr[0] + sr[2] * BAR_X1;
        for (int b = 0; b < 2; b++) {
            float y0 = sr[1] + sr[3] * BAR_Y[b][0], y1 = sr[1] + sr[3] * BAR_Y[b][1];
            float xf = bx0 + (bx1 - bx0) * MathUtils.clamp(vals[b] / 100f, 0f, 1f);
            shapes.setColor(0.10f, 0.07f, 0.05f, 1f);
            shapes.rect(bx0, y0, bx1 - bx0, y1 - y0);
            if (b == 0) {
                boolean low = sv.health < 25f && !sv.dead;
                float pulse = low ? 0.75f + 0.25f * MathUtils.sin(System.nanoTime() * 1e-9f * 8f) : 1f;
                shapes.setColor(0.86f * pulse, 0.12f, 0.08f, 1f);
            } else {
                shapes.setColor(0.12f, 0.62f, 0.86f, 1f);
            }
            float pad = (y1 - y0) * 0.12f;
            if (xf > bx0 + 1f) shapes.rect(bx0 + pad, y0 + pad, xf - bx0 - 2f * pad, y1 - y0 - 2f * pad);
            if (b == 0) {   // brilho em cima
                shapes.setColor(1f, 1f, 1f, 0.12f);
                if (xf > bx0 + 1f) shapes.rect(bx0 + pad, y1 - pad * 3f, xf - bx0 - 2f * pad, pad * 1.5f);
            }
        }
        // Água: filete azul-claro embaixo do painel
        float wy = sr[1] - sr[3] * 0.09f, wh = sr[3] * 0.07f;
        shapes.setColor(0.10f, 0.07f, 0.05f, 0.85f);
        shapes.rect(bx0, wy, bx1 - bx0, wh);
        shapes.setColor(water(sv) ? 0.95f : 0.45f, water(sv) ? 0.3f : 0.78f, water(sv) ? 0.2f : 1f, 1f);
        shapes.rect(bx0, wy, (bx1 - bx0) * MathUtils.clamp(sv.water / 100f, 0f, 1f), wh);
        // Espaço com item em uso ou granada na mira: brilho
        for (int s = 0; s < 3; s++) {
            int t = current(s, items);
            float[] q = hud.rect(hud.get(SLOT_IDS[s]));
            if (sv.using == t || (s == 2 && aiming)) {
                shapes.setColor(1f, 0.8f, 0.3f, 0.3f);
                shapes.circle(q[0] + q[2] / 2f, q[1] + q[3] / 2f, q[3] * 0.44f, 32);
            }
        }
        shapes.end();

        batch.begin();
        // Texto do painel de vida
        float th = sr[3];
        font.getData().setScale(Math.max(1f, th / 70f));
        font.setColor(0.98f, 0.93f, 0.82f, 1f);
        String hp = "HP " + Math.round(sv.health) + "/100", ep = "EP " + Math.round(sv.boost) + "/100";
        layout.setText(font, hp);
        float tx = sr[0] + sr[2] * TEXT_X;
        font.draw(batch, hp, tx, sr[1] + sr[3] * 0.684f + layout.height / 2f);
        font.draw(batch, ep, tx, sr[1] + sr[3] * 0.337f + layout.height / 2f);
        font.setColor(1f, 0.9f, 0.7f, 1f);
        font.draw(batch, "FOME " + Math.round(sv.hunger), tx, sr[1] + sr[3] * 0.12f + layout.height / 2f);
        // Quantidade na bolinha de cada espaço e o nome do item escolhido ao lado
        for (int s = 0; s < 3; s++) {
            int t = current(s, items);
            float[] q = hud.rect(hud.get(SLOT_IDS[s]));
            int n = items.bag[t];
            font.getData().setScale(Math.max(1f, q[3] / 95f));
            String c = String.valueOf(n);
            font.setColor(n > 0 ? 1f : 0.55f, n > 0 ? 0.97f : 0.5f, n > 0 ? 0.9f : 0.45f, 1f);
            layout.setText(font, c);
            float cx = q[0] + q[2] * BADGE[s][0], cy = q[1] + q[3] * BADGE[s][1];
            font.draw(batch, c, cx - layout.width / 2f, cy + layout.height / 2f);
            if (n > 0) {
                font.getData().setScale(1f);
                font.setColor(1f, 0.93f, 0.75f, 0.9f);
                font.draw(batch, Items.NAMES[t], q[0] + q[2] + 4f, q[1] + q[3] * 0.25f);
            }
        }
        // Mochila: ocupação embaixo do botão
        float[] mr = hud.rect(hud.get("mochila"));
        font.getData().setScale(1.1f);
        String cap = items.carried() + "/" + items.capacity();
        font.setColor(1f, 0.92f, 0.7f, 1f);
        layout.setText(font, cap);
        font.draw(batch, cap, mr[0] + mr[2] - layout.width, mr[1] + layout.height + 2f);
        batch.end();

        // Item em uso: roda de progresso no meio
        if (sv.using >= 0) {
            float cx = W / 2f, cy = H * 0.36f, rr = H * 0.055f;
            shapes.begin(ShapeRenderer.ShapeType.Filled);
            shapes.setColor(0f, 0f, 0f, 0.45f);
            shapes.circle(cx, cy, rr * 1.15f, 40);
            shapes.setColor(1f, 0.8f, 0.3f, 0.95f);
            shapes.arc(cx, cy, rr, 90f, -360f * sv.progress(), 40);
            shapes.setColor(0.2f, 0.11f, 0.05f, 1f);
            shapes.circle(cx, cy, rr * 0.72f, 40);
            shapes.end();
            batch.begin();
            float left = Math.max(0f, sv.useDur - sv.useT);
            String sec = String.format(java.util.Locale.US, "%.1f", left);
            font.setColor(1f, 0.95f, 0.8f, 1f);
            layout.setText(font, sec);
            font.draw(batch, sec, cx - layout.width / 2f, cy + layout.height / 2f);
            String v = Survival.verb(sv.using);
            layout.setText(font, v);
            font.draw(batch, v, cx - layout.width / 2f, cy - rr * 1.3f);
            batch.end();
        }

        // Aviso curto
        if (sv.message != null && sv.messageT > 0f) {
            batch.begin();
            font.setColor(1f, 0.92f, 0.6f, Math.min(1f, sv.messageT * 2f));
            layout.setText(font, sv.message);
            font.draw(batch, sv.message, (W - layout.width) / 2f, H * 0.62f);
            batch.end();
        }

        if (panelOpen) drawPanel(batch, shapes, font, items, W, H);

        // Dano, clarão e morte por cima de tudo
        if (sv.hurt > 0f || stunAlpha > 0f || sv.dead) {
            shapes.begin(ShapeRenderer.ShapeType.Filled);
            if (sv.hurt > 0f) {
                // só nas bordas (vinheta), bem fina: dá para continuar enxergando e mirando
                float t = H * 0.12f, a = 0.35f * sv.hurt;
                com.badlogic.gdx.graphics.Color in = new com.badlogic.gdx.graphics.Color(0.55f, 0f, 0f, 0f);
                com.badlogic.gdx.graphics.Color out = new com.badlogic.gdx.graphics.Color(0.55f, 0f, 0f, a);
                shapes.rect(0, H - t, W, t, in, in, out, out);
                shapes.rect(0, 0, W, t, out, out, in, in);
                shapes.rect(0, 0, t, H, out, in, in, out);
                shapes.rect(W - t, 0, t, H, in, out, out, in);
            }
            if (stunAlpha > 0f) {
                shapes.setColor(1f, 1f, 0.97f, Math.min(1f, stunAlpha));
                shapes.rect(0, 0, W, H);
            }
            if (sv.dead) {
                shapes.setColor(0.15f, 0f, 0f, Math.min(0.7f, sv.deadT * 0.35f));
                shapes.rect(0, 0, W, H);
            }
            shapes.end();
            if (sv.dead) {
                batch.begin();
                font.getData().setScale(2.2f);
                font.setColor(1f, 0.85f, 0.6f, Math.min(1f, sv.deadT * 0.6f));
                layout.setText(font, "VOCÊ MORREU");
                font.draw(batch, "VOCÊ MORREU", (W - layout.width) / 2f, H * 0.6f);
                font.getData().setScale(1.1f);
                if (sv.deadT > 3f) {
                    layout.setText(font, "Toque na tela para o menu principal");
                    font.draw(batch, "Toque na tela para o menu principal", (W - layout.width) / 2f, H * 0.48f);
                }
                batch.end();
            }
        }
    }

    /** Água no fim: o filete fica vermelho. */
    private static boolean water(Survival sv) { return sv.water < 15f; }

    private void drawPanel(SpriteBatch batch, ShapeRenderer shapes, BitmapFont font, Items items, int W, int H) {
        float ph = H * 0.78f, pw = Math.min(W * 0.8f, ph * 1.35f), px = (W - pw) / 2f, py = (H - ph) / 2f;
        float pad = H * 0.025f, top = H * 0.08f;
        float cw = (pw - pad * 4f) / 3f, ch = (ph - top - pad * 5f - H * 0.07f) / 4f;   // 11 itens: 4 linhas
        for (int i = 0; i < Items.NAMES.length; i++) {
            int col = i % 3, row = i / 3;
            cellRects[i][0] = px + pad + col * (cw + pad);
            cellRects[i][1] = py + ph - top - pad - (row + 1) * ch - row * pad;
            cellRects[i][2] = cw;
            cellRects[i][3] = ch;
        }
        closeRect[2] = pw * 0.3f;
        closeRect[3] = H * 0.07f;
        closeRect[0] = px + (pw - closeRect[2]) / 2f;
        closeRect[1] = py + pad;

        shapes.begin(ShapeRenderer.ShapeType.Filled);
        shapes.setColor(0f, 0f, 0f, 0.5f);
        shapes.rect(0, 0, W, H);
        shapes.setColor(0.33f, 0.2f, 0.1f, 0.97f);
        shapes.rect(px, py, pw, ph);
        for (int i = 0; i < Items.NAMES.length; i++) {
            boolean has = items.bag[i] > 0;
            boolean sel = i != Items.BACKPACK && slotOf(i) >= 0 && selected[slotOf(i)] == i;
            shapes.setColor(has ? 0.2f : 0.15f, has ? 0.11f : 0.09f, 0.05f, 1f);
            float[] c = cellRects[i];
            shapes.rect(c[0], c[1], c[2], c[3]);
            if (sel && has) {
                shapes.setColor(1f, 0.8f, 0.3f, 0.25f);
                shapes.rect(c[0], c[1], c[2], c[3]);
            }
        }
        shapes.setColor(0.5f, 0.3f, 0.14f, 1f);
        shapes.rect(closeRect[0], closeRect[1], closeRect[2], closeRect[3]);
        shapes.end();

        batch.begin();
        font.setColor(1f, 0.92f, 0.7f, 1f);
        String title = "MOCHILA  " + items.carried() + "/" + items.capacity()
                + (items.bag[Items.BACKPACK] > 0 ? "" : "   (ache uma mochila para levar mais)");
        layout.setText(font, title);
        font.draw(batch, title, px + (pw - layout.width) / 2f, py + ph - top * 0.35f);
        for (int i = 0; i < Items.NAMES.length; i++) {
            float[] c = cellRects[i];
            int n = items.bag[i];
            TextureRegion icon = items.icons[i];
            float sz = Math.min(c[2], c[3]) * 0.68f;
            if (icon != null) {
                batch.setColor(1f, 1f, 1f, n > 0 ? 1f : 0.25f);
                batch.draw(icon, c[0] + (c[2] - sz) / 2f, c[1] + c[3] - sz - 4f, sz, sz);
                batch.setColor(1f, 1f, 1f, 1f);
            }
            String label = Items.NAMES[i] + (i == Items.BACKPACK ? (n > 0 ? "  (TEM)" : "") : "  x" + n);
            font.setColor(n > 0 ? 1f : 0.6f, n > 0 ? 0.92f : 0.55f, n > 0 ? 0.7f : 0.45f, 1f);
            layout.setText(font, label);
            font.draw(batch, label, c[0] + (c[2] - layout.width) / 2f, c[1] + layout.height + 6f);
        }
        font.setColor(1f, 0.95f, 0.8f, 1f);
        layout.setText(font, "FECHAR");
        font.draw(batch, "FECHAR", closeRect[0] + (closeRect[2] - layout.width) / 2f, closeRect[1] + (closeRect[3] + layout.height) / 2f);
        batch.end();
    }
}
