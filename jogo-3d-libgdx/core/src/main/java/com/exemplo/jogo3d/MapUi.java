package com.exemplo.jogo3d;

import com.badlogic.gdx.graphics.Pixmap;
import com.badlogic.gdx.graphics.Texture;
import com.badlogic.gdx.graphics.g2d.BitmapFont;
import com.badlogic.gdx.graphics.g2d.GlyphLayout;
import com.badlogic.gdx.graphics.g2d.SpriteBatch;
import com.badlogic.gdx.graphics.glutils.ShapeRenderer;
import com.badlogic.gdx.math.MathUtils;
import com.badlogic.gdx.math.Vector3;

/**
 * Minimapa e bússola do HUD.
 *
 * Minimapa: o mapa de verdade, desenhado uma vez a partir do mundo (relevo sombreado, estrada, rio
 * seco, casas, cidade e açude), com o norte para cima; mostra ~150 m em volta do jogador, com a
 * seta para onde ele está virado. Bússola: graus e pontos cardeais (N, NE, L, SE, S, SO, O, NO)
 * correndo conforme a câmera gira.
 */
final class MapUi {
    private static final int MAP_PX = 256;        // mapa inteiro (360 m)
    private static final int VIEW_PX = 160;       // recorte redondo mostrado
    private static final float VIEW_M = 150f;     // largura mostrada, em metros
    // Miolo redondo da moldura (fração da imagem minimapa_moldura.png)
    private static final float MM_CX = 0.5049f, MM_CY = 0.4906f, MM_R = 0.3918f;
    private static final String[] CARD = {"N", "NE", "L", "SE", "S", "SO", "O", "NO"};

    private final Pixmap world;
    private final Pixmap view;
    private final Texture viewTex;
    private float refresh = 0f;
    private final GlyphLayout layout = new GlyphLayout();

    MapUi(World w) {
        world = new Pixmap(MAP_PX, MAP_PX, Pixmap.Format.RGBA8888);
        float cell = World.SIZE / MAP_PX;
        Vector3 l = new Vector3();
        for (int j = 0; j < MAP_PX; j++) {
            for (int i = 0; i < MAP_PX; i++) {
                float x = -World.HALF + (i + 0.5f) * cell, z = -World.HALF + (j + 0.5f) * cell;
                float e = 1f;
                float hx = w.heightAt(x + e, z) - w.heightAt(x - e, z), hz = w.heightAt(x, z + e) - w.heightAt(x, z - e);
                float nx = -hx / (2f * e), nz = -hz / (2f * e), nl = (float) Math.sqrt(nx * nx + 1f + nz * nz);
                float shade = 0.72f + 0.38f * ((-nx * -0.4f + 1f + -nz * -0.35f) / nl / 1.13f);
                float r = 0.67f, g = 0.56f, b = 0.38f;   // chão seco
                // manchas de mato seco
                float veg = MathUtils.sin(x * 0.21f + 1.3f) * MathUtils.cos(z * 0.17f) + 0.5f * MathUtils.sin(x * 0.53f - z * 0.41f);
                if (veg > 0.9f) { r = 0.52f; g = 0.50f; b = 0.32f; }
                float dr = Math.abs(x - World.riverX(z));
                if (dr < 7.5f) { r = 0.78f; g = 0.71f; b = 0.57f; }
                else if (dr < 9f) { r = 0.55f; g = 0.45f; b = 0.32f; }
                float dz = Math.abs(z - World.roadZ(x));
                if (dz < 3.2f) { r = 0.86f; g = 0.77f; b = 0.60f; }
                else if (dz < 4f) { r = 0.6f; g = 0.5f; b = 0.36f; }
                if (World.inTown(x, z)) { r = (r + 0.74f) / 2f; g = (g + 0.68f) / 2f; b = (b + 0.58f) / 2f; }
                for (int k = 0; k < w.houses.size; k++) {
                    l.set(x, 0f, z).mul(w.houses.get(k).inv);
                    if (Math.abs(l.x) < 4.2f && Math.abs(l.z) < 3.2f) { r = 0.66f; g = 0.30f; b = 0.18f; shade = 1f; }
                }
                for (int k = 0; k < w.boxes.size; k++) {
                    World.Box bx = w.boxes.get(k);
                    l.set(x, 0f, z).mul(bx.inv);
                    if (Math.abs(l.x) < bx.hx && Math.abs(l.z) < bx.hz) { r = 0.80f; g = 0.58f; b = 0.36f; shade = 1f; }
                }
                world.drawPixel(i, j, rgba(r * shade, g * shade, b * shade, 1f));
            }
        }
        view = new Pixmap(VIEW_PX, VIEW_PX, Pixmap.Format.RGBA8888);
        view.setBlending(Pixmap.Blending.None);
        viewTex = new Texture(view);
        viewTex.setFilter(Texture.TextureFilter.Linear, Texture.TextureFilter.Linear);
    }

    private static int rgba(float r, float g, float b, float a) {
        return ((int) (MathUtils.clamp(r, 0f, 1f) * 255) << 24) | ((int) (MathUtils.clamp(g, 0f, 1f) * 255) << 16)
                | ((int) (MathUtils.clamp(b, 0f, 1f) * 255) << 8) | (int) (MathUtils.clamp(a, 0f, 1f) * 255);
    }

    /** Recorta o pedaço redondo em volta do jogador (algumas vezes por segundo). */
    void update(float dt, Vector3 p) {
        refresh -= dt;
        if (refresh > 0f) return;
        refresh = 0.12f;
        float half = VIEW_PX / 2f, mPerPx = VIEW_M / VIEW_PX, cell = World.SIZE / MAP_PX;
        for (int j = 0; j < VIEW_PX; j++) {
            for (int i = 0; i < VIEW_PX; i++) {
                float dx = i + 0.5f - half, dy = j + 0.5f - half;
                float d = (float) Math.sqrt(dx * dx + dy * dy);
                if (d > half) { view.drawPixel(i, j, 0); continue; }
                float wx = p.x + dx * mPerPx, wz = p.z + dy * mPerPx;
                int mi = (int) ((wx + World.HALF) / cell), mj = (int) ((wz + World.HALF) / cell);
                int c = (mi < 0 || mj < 0 || mi >= MAP_PX || mj >= MAP_PX) ? 0x2a2018ff : world.getPixel(mi, mj);
                if (d > half - 1.5f) c = (c & 0xffffff00) | (int) (255 * (half - d) / 1.5f);   // borda lisa
                view.drawPixel(i, j, c);
            }
        }
        viewTex.draw(view, 0, 0);
    }

    /** Mapa e seta do jogador (antes da moldura). */
    void drawMap(SpriteBatch batch, ShapeRenderer shapes, Hud hud, float facing) {
        float[] r = hud.rect(hud.get("minimapa"));
        float cx = r[0] + r[2] * MM_CX, cy = r[1] + r[3] * MM_CY, rad = r[3] * MM_R + 2f;
        batch.begin();
        batch.setColor(1f, 1f, 1f, 1f);
        batch.draw(viewTex, cx - rad, cy - rad, rad * 2f, rad * 2f);
        batch.end();
        // Seta: norte para cima; z do mundo cresce para baixo na tela
        float sx = MathUtils.sin(facing), sy = -MathUtils.cos(facing);
        float px = -sy, py = sx;
        float L = rad * 0.16f;
        shapes.begin(ShapeRenderer.ShapeType.Filled);
        shapes.setColor(0.1f, 0.06f, 0.03f, 0.8f);
        shapes.triangle(cx + sx * L * 1.25f, cy + sy * L * 1.25f, cx - sx * L * 0.8f + px * L * 0.85f, cy - sy * L * 0.8f + py * L * 0.85f,
                cx - sx * L * 0.8f - px * L * 0.85f, cy - sy * L * 0.8f - py * L * 0.85f);
        shapes.setColor(1f, 0.97f, 0.9f, 1f);
        shapes.triangle(cx + sx * L, cy + sy * L, cx - sx * L * 0.6f + px * L * 0.65f, cy - sy * L * 0.6f + py * L * 0.65f,
                cx - sx * L * 0.3f, cy - sy * L * 0.3f);
        shapes.setColor(0.85f, 0.8f, 0.72f, 1f);
        shapes.triangle(cx + sx * L, cy + sy * L, cx - sx * L * 0.6f - px * L * 0.65f, cy - sy * L * 0.6f - py * L * 0.65f,
                cx - sx * L * 0.3f, cy - sy * L * 0.3f);
        shapes.end();
    }

    /** Círculo da zona segura (vermelho) e o próximo (branco, fino) sobre o mapa, recortados ao disco. */
    void drawZone(ShapeRenderer shapes, Hud hud, Vector3 p, Zone z) {
        float[] r = hud.rect(hud.get("minimapa"));
        float cx = r[0] + r[2] * MM_CX, cy = r[1] + r[3] * MM_CY, rad = r[3] * MM_R;
        float ppm = rad / (VIEW_M / 2f);   // pixels por metro
        shapes.begin(ShapeRenderer.ShapeType.Line);
        ring(shapes, cx, cy, rad, ppm, z.cx - p.x, z.cz - p.z, z.radius, 0.9f, 0.15f, 0.1f, 1f);
        if (!z.finalPhase()) ring(shapes, cx, cy, rad, ppm, z.nextCx() - p.x, z.nextCz() - p.z, z.nextR(), 0.97f, 0.95f, 0.88f, 0.75f);
        shapes.end();
    }

    private void ring(ShapeRenderer shapes, float cx, float cy, float rad, float ppm, float dx, float dz, float rm,
                      float cr, float cg, float cb, float ca) {
        shapes.setColor(cr, cg, cb, ca);
        int n = 72;
        float px = 0f, py = 0f;
        boolean prevIn = false;
        for (int i = 0; i <= n; i++) {
            float a = i * MathUtils.PI2 / n;
            float sx = cx + (dx + MathUtils.cos(a) * rm) * ppm, sy = cy - (dz + MathUtils.sin(a) * rm) * ppm;
            boolean in = (sx - cx) * (sx - cx) + (sy - cy) * (sy - cy) < rad * rad * 0.96f;
            if (i > 0 && in && prevIn) shapes.line(px, py, sx, sy);
            px = sx;
            py = sy;
            prevIn = in;
        }
    }

    /** Marcas da bússola por cima da faixa de couro. camYaw = direção da câmera. */
    void drawCompass(SpriteBatch batch, ShapeRenderer shapes, BitmapFont font, Hud hud, float camYaw) {
        float[] r = hud.rect(hud.get("bussola"));
        float x0 = r[0] + r[2] * 0.035f, x1 = r[0] + r[2] * 0.965f, mid = (x0 + x1) / 2f, half = (x1 - x0) / 2f;
        float yTop = r[1] + r[3] * 0.70f, yText = r[1] + r[3] * 0.38f;
        float bearing = MathUtils.atan2(MathUtils.sin(camYaw), -MathUtils.cos(camYaw)) * MathUtils.radiansToDegrees;
        if (bearing < 0f) bearing += 360f;
        float span = 52f;
        shapes.begin(ShapeRenderer.ShapeType.Filled);
        int first = (int) Math.floor((bearing - span) / 5f) * 5;
        for (int deg = first; deg <= bearing + span; deg += 5) {
            float off = deg - bearing;
            float x = mid + off / span * half;
            if (x < x0 || x > x1) continue;
            float fade = 1f - Math.abs(off) / span;
            boolean big = deg % 15 == 0;
            shapes.setColor(0.98f, 0.92f, 0.82f, 0.35f + 0.65f * fade);
            float th = r[3] * (big ? 0.16f : 0.08f);
            shapes.rect(x - 1f, yTop - th, 2f, th);
        }
        shapes.end();
        batch.begin();
        font.getData().setScale(Math.max(1f, r[3] / 48f));
        for (int deg = first; deg <= bearing + span; deg += 5) {
            if (deg % 15 != 0) continue;
            float off = deg - bearing;
            float x = mid + off / span * half;
            if (x < x0 + 8f || x > x1 - 8f) continue;
            int d = ((deg % 360) + 360) % 360;
            String t = d % 45 == 0 ? CARD[d / 45] : String.valueOf(d);
            boolean card = d % 45 == 0;
            float fade = 1f - Math.abs(off) / span;
            font.setColor(card ? 1f : 0.95f, card ? 0.9f : 0.9f, card ? 0.65f : 0.82f, 0.3f + 0.7f * fade);
            layout.setText(font, t);
            font.draw(batch, t, x - layout.width / 2f, yText + layout.height / 2f);
        }
        font.getData().setScale(1.1f);
        batch.end();
    }

    void dispose() {
        world.dispose();
        view.dispose();
        viewTex.dispose();
    }
}
