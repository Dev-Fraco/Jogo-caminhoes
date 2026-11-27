package com.exemplo.jogo3d;

import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.audio.Sound;
import com.badlogic.gdx.files.FileHandle;
import com.badlogic.gdx.graphics.GL20;
import com.badlogic.gdx.graphics.Pixmap;
import com.badlogic.gdx.graphics.Texture;
import com.badlogic.gdx.graphics.g2d.SpriteBatch;
import com.badlogic.gdx.graphics.g2d.TextureRegion;
import com.badlogic.gdx.math.Matrix4;
import com.badlogic.gdx.math.MathUtils;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.Random;

/**
 * Abertura do SEM LIMITES – BATTLE ROYALE, só ao iniciar o jogo. A arte original fica inteira e sem
 * distorção (preenche a tela e corta só as bordas): zoom de aproximação, câmera suave, brilho,
 * partículas, vento, impacto com tremor e um brilho que passa pelo nome. 5 s; toque pula.
 */
final class Intro {
    static final float DURATION = 5f;        // cena inteira (s)
    static final float FADE_START = 4.4f;    // começa a escurecer para a transição
    static final float FADE_IN = 0.6f;       // o lobby aparece do preto
    static final float SKIP_LOCK = 0.3f;     // o toque só pula depois disto (sem pular sem querer)
    private static final int RATE = 22050;
    private static final int SPARKS = 46, STREAKS = 18;

    private final Texture art, pixel;
    private final TextureRegion artReg, pixelReg;
    private final float iw, ih;
    private final Sound wind, impact;
    private final long windId;
    private final Random rnd = new Random(1915);
    private final float[][] sparks = new float[SPARKS][5];      // x, y, vx, vy, vida
    private final float[][] streaks = new float[STREAKS][4];    // x, y, comprimento, velocidade
    private float t, fadeIn;
    private boolean ended, hit1, hit2;
    private float flash, shake;

    Intro() {
        art = new Texture(Gdx.files.internal("hud2/abertura.png"));
        art.setFilter(Texture.TextureFilter.Linear, Texture.TextureFilter.Linear);
        artReg = new TextureRegion(art);
        iw = art.getWidth();
        ih = art.getHeight();
        Pixmap pm = new Pixmap(1, 1, Pixmap.Format.RGBA8888);
        pm.setColor(1f, 1f, 1f, 1f);
        pm.fill();
        pixel = new Texture(pm);
        pm.dispose();
        pixelReg = new TextureRegion(pixel);
        for (float[] s : sparks) resetSpark(s, true);
        for (float[] s : streaks) resetStreak(s, true);
        wind = Gdx.audio.newSound(writeWav("intro_vento.wav", wind(), RATE));
        impact = Gdx.audio.newSound(writeWav("intro_impacto.wav", impact(), RATE));
        windId = wind.play(0.35f);
    }

    /** A abertura ainda está rodando (cena ou escurecimento)? */
    boolean running() { return !ended; }

    /** Toque: pula para o escurecimento final. */
    void skip() {
        if (!ended && t > SKIP_LOCK && t < FADE_START) t = FADE_START;
    }

    void update(float dt) {
        if (ended) {
            if (fadeIn > 0f) fadeIn = Math.max(0f, fadeIn - dt);
            return;
        }
        t += dt;
        if (!hit1 && t >= 0.9f) { hit1 = true; impact.play(0.9f); flash = 1f; shake = 1f; }
        if (!hit2 && t >= 2.6f) { hit2 = true; impact.play(0.55f); flash = 0.6f; shake = 0.5f; }
        flash = Math.max(0f, flash - dt * 2.5f);
        shake = Math.max(0f, shake - dt * 2.2f);
        float fadeOut = fadeOut();
        wind.setVolume(windId, 0.35f * (1f - fadeOut));
        for (float[] s : sparks) updateSpark(s, dt);
        for (float[] s : streaks) updateStreak(s, dt);
        if (t >= DURATION) {
            ended = true;
            fadeIn = FADE_IN;
            wind.stop();
        }
    }

    private float fadeOut() { return MathUtils.clamp((t - FADE_START) / (DURATION - FADE_START), 0f, 1f); }

    /** Desenha a cena da abertura (a tela inteira). */
    void draw(SpriteBatch batch, Matrix4 proj, int W, int H) {
        float base = Math.max(W / iw, H / ih);
        float e = ease(MathUtils.clamp(t / 1.5f, 0f, 1f));
        float z = 1.3f - 0.3f * e + 0.03f * MathUtils.clamp((t - 1.5f) / 3.5f, 0f, 1f);   // aproximação, depois deriva
        float w = iw * base * z, h = ih * base * z;
        float sx = shake * 0.02f * H * MathUtils.sin(t * 61f), sy = shake * 0.02f * H * MathUtils.cos(t * 47f);
        float px = MathUtils.sin(t * 0.6f) * 0.012f * W, py = MathUtils.cos(t * 0.45f) * 0.01f * H;
        float x = W / 2f - w / 2f + px + sx, y = H / 2f - h / 2f + py + sy;
        float fo = fadeOut();

        batch.setProjectionMatrix(proj);
        batch.begin();
        batch.setColor(1f, 1f, 1f, 1f);
        batch.draw(artReg, x, y, w, h);
        // Brilho que passa pelo nome SEM LIMITES (aditivo, só sobre a área da logo)
        batch.setBlendFunction(GL20.GL_SRC_ALPHA, GL20.GL_ONE);
        float lx = x + w * 0.27f, lw = w * 0.46f, ly = y + h * 0.16f, lh = h * 0.68f;
        if (t > 1.8f && t < 4.2f) {
            float p = (t - 1.8f) / 2.4f;
            float bandX = lx - lw * 0.2f + lw * 1.4f * p, bandW = lw * 0.22f;
            for (int i = 0; i < 6; i++) {
                float x0 = bandX + bandW * i / 6f, x1 = bandX + bandW * (i + 1) / 6f;
                float a = 0.22f * (1f - Math.abs(i - 2.5f) / 3f);
                float cx0 = MathUtils.clamp(x0, lx, lx + lw), cx1 = MathUtils.clamp(x1, lx, lx + lw);
                if (cx1 > cx0) { batch.setColor(1f, 0.95f, 0.6f, a); batch.draw(pixelReg, cx0, ly, cx1 - cx0, lh); }
            }
        }
        if (t >= 4.2f) {   // pulso suave no nome depois da passada
            batch.setColor(1f, 0.85f, 0.3f, 0.08f + 0.06f * MathUtils.sin(t * 3.5f));
            batch.draw(pixelReg, lx, ly, lw, lh);
        }
        // Partículas (faíscas que sobem) e vento (listras que passam)
        for (float[] s : sparks) {
            float a = MathUtils.clamp(s[4], 0f, 1f) * (1f - fo);
            batch.setColor(1f, 0.85f, 0.25f, a * 0.9f);
            batch.draw(pixelReg, s[0] * W, s[1] * H, 3f, 3f);
        }
        float windI = 0.35f + 0.65f * (0.5f + 0.5f * MathUtils.sin(t * 2f * MathUtils.PI / 3.5f));
        for (float[] s : streaks) {
            batch.setColor(1f, 1f, 1f, 0.22f * windI * (1f - fo));
            batch.draw(pixelReg, s[0] * W, s[1] * H, s[2] * W, 2f);
        }
        batch.setBlendFunction(GL20.GL_SRC_ALPHA, GL20.GL_ONE_MINUS_SRC_ALPHA);
        // Flash do impacto
        if (flash > 0f) { batch.setColor(1f, 1f, 1f, 0.35f * flash); batch.draw(pixelReg, 0, 0, W, H); }
        // Começa preta e escurece no fim
        float black = Math.max(1f - t / 0.9f, fo);
        if (black > 0f) { batch.setColor(0f, 0f, 0f, black); batch.draw(pixelReg, 0, 0, W, H); }
        batch.setColor(1f, 1f, 1f, 1f);
        batch.end();
    }

    /** Depois da abertura: o lobby aparece do preto. Chamado depois da cena, sobre o menu. */
    void drawFadeIn(SpriteBatch batch, Matrix4 proj, int W, int H) {
        if (fadeIn <= 0f) return;
        batch.setProjectionMatrix(proj);
        batch.begin();
        batch.setColor(0f, 0f, 0f, fadeIn / FADE_IN);
        batch.draw(pixelReg, 0, 0, W, H);
        batch.setColor(1f, 1f, 1f, 1f);
        batch.end();
    }

    void dispose() {
        art.dispose();
        pixel.dispose();
        wind.dispose();
        impact.dispose();
    }

    // ---------- partículas e vento ----------

    private void resetSpark(float[] s, boolean anywhere) {
        s[0] = rnd.nextFloat();
        s[1] = anywhere ? rnd.nextFloat() * 0.6f : -0.02f;
        s[2] = (rnd.nextFloat() - 0.5f) * 0.02f;
        s[3] = 0.04f + rnd.nextFloat() * 0.08f;
        s[4] = 0.4f + rnd.nextFloat() * 0.6f;
    }

    private void updateSpark(float[] s, float dt) {
        s[0] += s[2] * dt + MathUtils.sin(t * 2f + s[1] * 10f) * 0.0004f;
        s[1] += s[3] * dt;
        s[4] -= dt * 0.25f;
        if (s[4] <= 0f || s[1] > 1.02f) resetSpark(s, false);
    }

    private void resetStreak(float[] s, boolean anywhere) {
        s[0] = anywhere ? rnd.nextFloat() : 1.1f;
        s[1] = rnd.nextFloat();
        s[2] = 0.05f + rnd.nextFloat() * 0.15f;
        s[3] = 0.25f + rnd.nextFloat() * 0.35f;
    }

    private void updateStreak(float[] s, float dt) {
        s[0] -= s[3] * dt;
        if (s[0] + s[2] < -0.05f) resetStreak(s, false);
    }

    private static float ease(float x) { return 1f - (1f - x) * (1f - x) * (1f - x); }

    // ---------- áudio gerado em código (sem arquivos de som) ----------

    /** Vento: ruído grave que sobe e desce de intensidade, com entrada e saída suaves. */
    private float[] wind() {
        int n = (int) (DURATION * RATE);
        float[] out = new float[n];
        float y = 0f;
        for (int i = 0; i < n; i++) {
            float tt = i / (float) RATE;
            y += ((rnd.nextFloat() * 2f - 1f) - y) * 0.03f;   // ruído passa-baixa
            float env = (0.55f + 0.45f * MathUtils.sin(tt * 2f * MathUtils.PI / 3.5f))
                    * Math.min(1f, tt / 0.8f) * Math.min(1f, (DURATION - tt) / 0.8f);
            out[i] = y * 2.2f * env;
        }
        return out;
    }

    /** Impacto: um baque grave que cai, com estalo de ruído no começo. */
    private float[] impact() {
        int n = (int) (0.9f * RATE);
        float[] out = new float[n];
        for (int i = 0; i < n; i++) {
            float tt = i / (float) RATE;
            float body = (float) Math.sin(2 * Math.PI * (55f - 20f * tt) * tt) * (float) Math.exp(-tt * 6f);
            float crack = ((rnd.nextFloat() * 2f - 1f)) * (float) Math.exp(-tt * 30f) * 0.6f;
            out[i] = MathUtils.clamp((body * 0.9f + crack) * 0.9f, -1f, 1f);
        }
        return out;
    }

    private static FileHandle writeWav(String name, float[] s, int rate) {
        int dataLen = s.length * 2;
        ByteBuffer b = ByteBuffer.allocate(44 + dataLen).order(ByteOrder.LITTLE_ENDIAN);
        b.put("RIFF".getBytes()).putInt(36 + dataLen).put("WAVE".getBytes());
        b.put("fmt ".getBytes()).putInt(16).putShort((short) 1).putShort((short) 1).putInt(rate)
                .putInt(rate * 2).putShort((short) 2).putShort((short) 16);
        b.put("data".getBytes()).putInt(dataLen);
        for (float v : s) b.putShort((short) (MathUtils.clamp(v, -1f, 1f) * 32000f));
        FileHandle fh = Gdx.files.local(name);
        fh.writeBytes(b.array(), false);
        return fh;
    }
}
