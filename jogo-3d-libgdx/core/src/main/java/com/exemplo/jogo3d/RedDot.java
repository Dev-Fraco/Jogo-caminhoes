package com.exemplo.jogo3d;

import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.graphics.Texture;
import com.badlogic.gdx.graphics.g2d.SpriteBatch;
import com.badlogic.gdx.graphics.g2d.TextureRegion;
import com.badlogic.gdx.math.Matrix4;

/**
 * Mira red dot: toda arma vem com ela. Ao mirar, aparece no centro da tela (sem zoom) e o retículo
 * normal some; o ponto vermelho fica exatamente no centro, onde o tiro sai. Aparece e some com fade.
 */
final class RedDot {
    // Medidas da imagem (px): tamanho e posição do ponto vermelho
    private static final float IMG_W = 1536f, IMG_H = 1024f, DOT_X = 768f, DOT_Y = 476f;
    private static final float RATE = 12f;   // velocidade do fade (1/s)
    private static final float WIDTH_FRAC = 0.5f;   // largura da mira em relação à altura da tela

    /** 0 = escondida, 1 = toda visível. */
    float t = 0f;

    private final Texture tex;
    private final TextureRegion region;

    RedDot() {
        tex = new Texture(Gdx.files.internal("hud2/red_dot.png"));
        tex.setFilter(Texture.TextureFilter.Linear, Texture.TextureFilter.Linear);
        region = new TextureRegion(tex);
    }

    boolean visible() { return t > 0.003f; }

    void update(float dt, boolean wanted) {
        t += ((wanted ? 1f : 0f) - t) * Math.min(1f, dt * RATE);
        if (t < 0.001f && !wanted) t = 0f;
        if (t > 0.999f && wanted) t = 1f;
    }

    /** Desenha a mira no centro da tela (o ponto vermelho cai sobre o centro). */
    void draw(SpriteBatch batch, Matrix4 proj, int w, int h) {
        float k = WIDTH_FRAC * h / IMG_W;
        float cx = w * 0.5f, cy = h * 0.5f;
        batch.setProjectionMatrix(proj);
        batch.begin();
        batch.setColor(1f, 1f, 1f, t);
        batch.draw(region, cx - DOT_X * k, cy - (IMG_H - DOT_Y) * k, IMG_W * k, IMG_H * k);
        batch.setColor(1f, 1f, 1f, 1f);
        batch.end();
    }

    void dispose() { tex.dispose(); }
}
