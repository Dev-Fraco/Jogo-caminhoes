package com.exemplo.jogo3d;

import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.graphics.Pixmap;
import com.badlogic.gdx.graphics.Texture;
import com.badlogic.gdx.graphics.g2d.PolygonRegion;
import com.badlogic.gdx.graphics.g2d.PolygonSprite;
import com.badlogic.gdx.graphics.g2d.PolygonSpriteBatch;
import com.badlogic.gdx.graphics.g2d.SpriteBatch;
import com.badlogic.gdx.graphics.g2d.TextureRegion;
import com.badlogic.gdx.graphics.glutils.FrameBuffer;
import com.badlogic.gdx.math.MathUtils;
import com.badlogic.gdx.math.Matrix4;

/**
 * Luneta do fuzil de precisão (AWM). Ao mirar, o mundo é desenhado de novo com a câmera mais
 * fechada (zoom real) num FBO; o círculo da lente mostra esse zoom e o resto da tela continua
 * normal. A moldura (luneta.png) e o retículo ficam por cima. A entrada e a saída são suaves:
 * a lente cresce do centro e o zoom vai junto.
 */
final class Scope {
    static final float NORMAL_FOV = 67f;   // campo de visão normal da câmera
    static final float ZOOM_FOV = (float) (2.0 * Math.toDegrees(Math.atan(Math.tan(Math.toRadians(NORMAL_FOV / 2.0)) / 6.0)));   // lente: zoom de 6x

    // Medidas da imagem da moldura (px): centro do anel, raio externo do anel e raio da lente
    private static final float IMG_W = 1536f, IMG_H = 1024f, CX = 765f, CY = 511f, RING_R = 503f, LENS_R = 391f;
    private static final float RATE = 9f;   // velocidade da transição (1/s)
    private static final int SEG = 56;      // segmentos do círculo da lente

    /** 0 = sem luneta, 1 = luneta toda aberta. */
    float t = 0f;

    private final Texture frameTex, pixelTex;
    private final TextureRegion frame, pixel;
    private final PolygonSpriteBatch poly = new PolygonSpriteBatch();
    private FrameBuffer fbo;
    private TextureRegion fboRegion;
    private int fw, fh;

    Scope() {
        frameTex = new Texture(Gdx.files.internal("hud2/luneta.png"));
        frameTex.setFilter(Texture.TextureFilter.Linear, Texture.TextureFilter.Linear);
        frame = new TextureRegion(frameTex);
        Pixmap pm = new Pixmap(1, 1, Pixmap.Format.RGBA8888);
        pm.setColor(1f, 1f, 1f, 1f);
        pm.fill();
        pixelTex = new Texture(pm);
        pm.dispose();
        pixel = new TextureRegion(pixelTex);
    }

    /** Se há luneta na tela (para o render gastar a passada extra só quando precisa). */
    boolean visible() { return t > 0.003f; }

    /** Campo de visão da lente neste instante (acompanha a transição). */
    float lensFov() { return NORMAL_FOV + (ZOOM_FOV - NORMAL_FOV) * t; }

    /** Avança a transição: entra quando mirando com o fuzil de precisão, sai ao largar a mira. */
    void update(float dt, boolean wanted) {
        t += ((wanted ? 1f : 0f) - t) * Math.min(1f, dt * RATE);
        if (t < 0.001f && !wanted) t = 0f;
        if (t > 0.999f && wanted) t = 1f;
    }

    /** Escala da moldura: o anel ocupa `size` da altura da tela. */
    private static float scale(int h, float size) { return size * h / (2f * RING_R); }

    private static float ease(float x) { return x * x * (3f - 2f * x); }

    private void ensure(int w, int h) {
        if (fbo != null && fw == w && fh == h) return;
        if (fbo != null) fbo.dispose();
        fbo = new FrameBuffer(Pixmap.Format.RGBA8888, w, h, true);
        fboRegion = new TextureRegion(fbo.getColorBufferTexture());
        fboRegion.flip(false, true);   // o FBO sai de cabeça para baixo na textura
        fw = w;
        fh = h;
    }

    /** Começa a desenhar o mundo com zoom dentro do FBO da lente. */
    void beginLens(int w, int h) {
        ensure(w, h);
        fbo.begin();
    }

    void endLens() {
        fbo.end();
    }

    /** Luneta com zoom (AWM): a lente mostra o mundo com zoom, a moldura e o retículo ficam por cima. */
    void draw(SpriteBatch batch, Matrix4 proj, int w, int h) {
        float k = scale(h, 0.92f), e = ease(t);
        float cx = w * 0.5f, cy = h * 0.5f;
        float r = LENS_R * k * e;
        float[] v = new float[(SEG + 1) * 2];
        short[] tri = new short[SEG * 3];
        v[0] = cx;
        v[1] = cy;
        for (int i = 0; i < SEG; i++) {
            float an = MathUtils.PI2 * i / SEG;
            v[2 + 2 * i] = cx + r * MathUtils.cos(an);
            v[3 + 2 * i] = cy + r * MathUtils.sin(an);
        }
        for (int i = 0; i < SEG; i++) {
            tri[3 * i] = 0;
            tri[3 * i + 1] = (short) (1 + i);
            tri[3 * i + 2] = (short) (1 + (i + 1) % SEG);
        }
        PolygonSprite lens = new PolygonSprite(new PolygonRegion(fboRegion, v, tri));
        poly.setProjectionMatrix(proj);
        poly.begin();
        lens.draw(poly);
        poly.end();
        drawFrame(batch, proj, w, h, 0.92f);
    }

    /** Mira sem zoom (red dot): mesma moldura e retículo da luneta, a visão normal aparece por dentro. */
    void drawSight(SpriteBatch batch, Matrix4 proj, int w, int h) {
        drawFrame(batch, proj, w, h, 0.5f);
    }

    /** Moldura da luneta e retículo, no centro da tela, com o anel ocupando `size` da altura. */
    private void drawFrame(SpriteBatch batch, Matrix4 proj, int w, int h, float size) {
        float k = scale(h, size), a = t;
        float cx = w * 0.5f, cy = h * 0.5f;
        batch.setProjectionMatrix(proj);
        batch.begin();
        batch.setColor(1f, 1f, 1f, a);
        batch.draw(frame, cx - CX * k, cy - (IMG_H - CY) * k, IMG_W * k, IMG_H * k);
        float lw = 2.2f * k, len = 380f * k, gap = 16f * k;
        batch.setColor(0f, 0f, 0f, 0.9f * a);
        batch.draw(pixel, cx - len, cy - lw * 0.5f, len - gap, lw);
        batch.draw(pixel, cx + gap, cy - lw * 0.5f, len - gap, lw);
        batch.draw(pixel, cx - lw * 0.5f, cy - len, lw, len - gap);
        batch.draw(pixel, cx - lw * 0.5f, cy + gap, lw, len - gap);
        batch.setColor(1f, 0.1f, 0.1f, a);
        float d = 7f * k;
        batch.draw(pixel, cx - d * 0.5f, cy - d * 0.5f, d, d);
        batch.setColor(1f, 1f, 1f, 1f);
        batch.end();
    }

    void dispose() {
        poly.dispose();
        frameTex.dispose();
        pixelTex.dispose();
        if (fbo != null) fbo.dispose();
    }
}
