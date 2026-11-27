package com.exemplo.jogo3d;

import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.graphics.Texture;
import com.badlogic.gdx.graphics.g2d.BitmapFont;
import com.badlogic.gdx.graphics.g2d.GlyphLayout;
import com.badlogic.gdx.graphics.g2d.SpriteBatch;

/**
 * Emblema de abate: a caveira entra com impacto (aumenta e assenta), brilha e some. Mostra quem abateu e quem caiu.
 * Disparado no mesmo quadro em que o som do abate toca.
 */
final class AbateEmblema {
    static final float ENTRADA = 0.22f, DURACAO = 1.9f, SUMIR = 0.45f;

    private Texture tex;
    private float t = -1f;          // -1 = parado
    private String atacante = "", vitima = "";
    private final GlyphLayout layout = new GlyphLayout();

    void carregar() {
        if (tex == null) tex = new Texture(Gdx.files.internal("hud2/lobby/caveira.png"));
    }

    void dispose() {
        if (tex != null) tex.dispose();
        tex = null;
    }

    void dispara(String atacante, String vitima) {
        this.atacante = atacante;
        this.vitima = vitima;
        t = 0f;
    }

    boolean ativo() { return t >= 0f; }

    void update(float dt) {
        if (t < 0f) return;
        t += dt;
        if (t >= DURACAO) t = -1f;
    }

    /** Escala: chega grande e assenta com um pequeno estouro. */
    float escala() {
        if (t >= ENTRADA) return 1f;
        float k = t / ENTRADA;
        float ease = 1f - (1f - k) * (1f - k);
        return 1.7f - 0.7f * ease + (float) Math.sin(k * Math.PI) * 0.08f;
    }

    float alpha() {
        if (t > DURACAO - SUMIR) return Math.max(0f, (DURACAO - t) / SUMIR);
        return 1f;
    }

    /** Desenha o emblema no topo da tela, com o nome do atacante e da vítima embaixo. */
    void draw(SpriteBatch b, BitmapFont font, int W, int H) {
        if (!ativo() || tex == null) return;
        float a = alpha();
        float k = Math.max(0.9f, Math.min(W, H) / 600f);
        float lado = 230f * k * escala();
        float cx = W / 2f, cy = H * 0.66f;
        float brilho = 0.35f + 0.25f * (float) Math.sin(t * 9f);

        b.begin();
        b.setColor(1f, 0.25f, 0.2f, a * brilho);                      // halo vermelho atrás da caveira
        b.draw(tex, cx - lado * 0.62f, cy - lado * 0.62f, lado * 1.24f, lado * 1.24f);
        b.setColor(1f, 1f, 1f, a);
        b.draw(tex, cx - lado / 2f, cy - lado / 2f, lado, lado);

        font.getData().setScale(1.3f * k);
        font.setColor(1f, 0.82f, 0.3f, a);
        String linha = atacante + "  ELIMINOU  " + vitima;
        layout.setText(font, linha);
        font.draw(b, linha, cx - layout.width / 2f, cy - lado / 2f - 14f * k);
        font.getData().setScale(1f);
        font.setColor(1f, 1f, 1f, 1f);
        b.setColor(1f, 1f, 1f, 1f);
        b.end();
    }
}
