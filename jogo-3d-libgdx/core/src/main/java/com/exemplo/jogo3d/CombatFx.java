package com.exemplo.jogo3d;

import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.audio.Sound;
import com.badlogic.gdx.graphics.Camera;
import com.badlogic.gdx.graphics.GL20;
import com.badlogic.gdx.graphics.VertexAttributes;
import com.badlogic.gdx.graphics.g2d.BitmapFont;
import com.badlogic.gdx.graphics.g2d.GlyphLayout;
import com.badlogic.gdx.graphics.g2d.SpriteBatch;
import com.badlogic.gdx.graphics.g2d.TextureRegion;
import com.badlogic.gdx.graphics.g3d.Material;
import com.badlogic.gdx.graphics.g3d.Model;
import com.badlogic.gdx.graphics.g3d.ModelInstance;
import com.badlogic.gdx.graphics.g3d.attributes.BlendingAttribute;
import com.badlogic.gdx.graphics.g3d.attributes.ColorAttribute;
import com.badlogic.gdx.graphics.g3d.utils.ModelBuilder;
import com.badlogic.gdx.graphics.glutils.ShapeRenderer;
import com.badlogic.gdx.math.MathUtils;
import com.badlogic.gdx.math.Quaternion;
import com.badlogic.gdx.math.Vector3;
import com.badlogic.gdx.utils.Array;

/**
 * Retorno visual e sonoro do combate, no estilo do sertão de 1915 (couro, latão, sangue seco;
 * nada de neon):
 * - mira de quatro traços cor de osso que abre com a dispersão e fica avermelhada sobre um inimigo;
 * - dois colchetes cor de latão quando a assistência está agindo (discreto);
 * - marcador em X ao acertar; na cabeça o X fica vermelho e maior, com "tlim" de metal;
 * - número do dano subindo do ponto atingido (dourado com "!" na cabeça);
 * - "CANGACEIRO ABATIDO" com a badalada do sino da capela;
 * - rastro curto da bala, clarão no cano e poeira/sangue no ponto atingido;
 * - painel da arma (munição, recarga) e contadores de vivos e abates.
 * Tudo reaproveitado de listas fixas (sem criar objetos por quadro).
 */
final class CombatFx implements DamageSystem.Listener {
    private static final int TRACERS = 24, NUMBERS = 12;

    private final Model tracerModel, flashModel;
    private final ModelInstance[] tracer = new ModelInstance[TRACERS];
    private final float[] tracerT = new float[TRACERS];
    private final BlendingAttribute[] tracerBlend = new BlendingAttribute[TRACERS];
    private int tracerNext;
    private final ModelInstance flash;
    private float flashT;
    private final Array<ModelInstance> draw = new Array<>();

    private final Vector3[] numPos = new Vector3[NUMBERS];
    private final float[] numT = new float[NUMBERS], numVal = new float[NUMBERS];
    private final boolean[] numHead = new boolean[NUMBERS];
    private int numNext;
    private float markT, markHead, killT;
    private boolean killHead;
    private final GlyphLayout layout = new GlyphLayout();
    private final Vector3 tmp = new Vector3(), dir = new Vector3();
    private final Quaternion rot = new Quaternion();
    private final Vector3 scl = new Vector3();
    private Grenades dust;
    private Sound shot, farShot, hit, head, kill, reload, empty, impact;

    CombatFx() {
        ModelBuilder mb = new ModelBuilder();
        long attr = VertexAttributes.Usage.Position | VertexAttributes.Usage.Normal;
        tracerModel = mb.createBox(0.018f, 0.018f, 1f, new Material(ColorAttribute.createDiffuse(1f, 0.9f, 0.6f, 1f),
                ColorAttribute.createEmissive(1f, 0.85f, 0.5f, 1f), new BlendingAttribute(GL20.GL_SRC_ALPHA, GL20.GL_ONE, 0.8f)), attr);
        flashModel = mb.createSphere(0.22f, 0.22f, 0.32f, 8, 6, new Material(ColorAttribute.createDiffuse(1f, 0.75f, 0.3f, 1f),
                ColorAttribute.createEmissive(1f, 0.7f, 0.25f, 1f), new BlendingAttribute(GL20.GL_SRC_ALPHA, GL20.GL_ONE, 0.9f)), attr);
        for (int i = 0; i < TRACERS; i++) {
            tracer[i] = new ModelInstance(tracerModel);
            tracerBlend[i] = (BlendingAttribute) tracer[i].materials.get(0).get(BlendingAttribute.Type);
        }
        flash = new ModelInstance(flashModel);
        for (int i = 0; i < NUMBERS; i++) numPos[i] = new Vector3();
        try {
            shot = load("tiro.wav");
            farShot = load("tiro_longe.wav");
            hit = load("acerto.wav");
            head = load("cabeca.wav");
            kill = load("abate.wav");
            reload = load("recarga.wav");
            empty = load("vazio.wav");
            impact = load("impacto.wav");
        } catch (Throwable t) {
            shot = farShot = hit = head = kill = reload = empty = impact = null;
        }
    }

    private static Sound load(String f) { return Gdx.audio.newSound(Gdx.files.internal("audio/" + f)); }

    void setDust(Grenades g) { dust = g; }

    // ---------- Eventos ----------

    /** Disparo do jogador: rastro, clarão e o que foi atingido. */
    void playerShot(Vector3 muzzle, Vector3 end, boolean hitWorld) {
        addTracer(muzzle, end, 0.07f);
        flash.transform.setToTranslation(muzzle).scale(MathUtils.random(0.8f, 1.2f), MathUtils.random(0.8f, 1.2f), 1f);
        flashT = 0.05f;
        play(shot, 0.8f);
        if (hitWorld && dust != null) dust.impact(end, false);
        if (hitWorld && end.dst(muzzle) < 25f) play(impact, 0.25f);
    }

    void reloadSound() { play(reload, 0.7f); }

    void emptySound() { play(empty, 0.7f); }

    /** Tiro de inimigo: rastro e estampido mais baixo com a distância. */
    void enemyShot(Vector3 from, Vector3 to, Vector3 listener) {
        addTracer(from, to, 0.06f);
        float d = from.dst(listener);
        if (farShot != null) farShot.play(MathUtils.clamp(1f - d / 140f, 0.08f, 0.9f));
        if (dust != null && MathUtils.randomBoolean(0.5f)) dust.impact(to, false);
    }

    @Override
    public void onHit(Enemy e, Vector3 at, float damage, boolean isHead, boolean killed) {
        int k = numNext++ % NUMBERS;
        numPos[k].set(at);
        numVal[k] = damage;
        numHead[k] = isHead;
        numT[k] = 0.9f;
        markT = 0.2f;
        markHead = isHead ? 1f : 0f;
        play(isHead ? head : hit, isHead ? 0.9f : 0.7f);
        if (dust != null) dust.impact(at, true);
        if (killed) {
            killT = 2.4f;
            killHead = isHead;
            play(kill, 0.75f);
        }
    }

    private void addTracer(Vector3 a, Vector3 b, float life) {
        int k = tracerNext++ % TRACERS;
        dir.set(b).sub(a);
        float len = dir.len();
        if (len < 0.1f) return;
        dir.scl(1f / len);
        rot.setFromCross(Vector3.Z, dir);
        tmp.set(a).lerp(b, 0.5f);
        tracer[k].transform.set(tmp, rot, scl.set(1f, 1f, Math.min(len, 60f)));
        tracerT[k] = life;
    }

    private void play(Sound s, float v) { if (s != null) s.play(v); }

    void update(float dt) {
        flashT -= dt;
        markT -= dt;
        killT -= dt;
        for (int i = 0; i < TRACERS; i++) if (tracerT[i] > 0f) tracerT[i] -= dt;
        for (int i = 0; i < NUMBERS; i++) if (numT[i] > 0f) numT[i] -= dt;
    }

    Array<ModelInstance> instances() {
        draw.clear();
        for (int i = 0; i < TRACERS; i++) {
            if (tracerT[i] > 0f) {
                tracerBlend[i].opacity = Math.min(0.85f, tracerT[i] * 14f);
                draw.add(tracer[i]);
            }
        }
        if (flashT > 0f) draw.add(flash);
        return draw;
    }

    // ---------- Tela ----------

    /**
     * @param spreadPx   abertura da mira em pixels (dispersão atual)
     * @param overEnemy  a mira está em cima de um inimigo
     */
    void drawHud(SpriteBatch batch, ShapeRenderer shapes, BitmapFont font, Camera cam, Hud hud, Weapons weapons,
                 AimAssist assist, float spreadPx, boolean overEnemy, int alive, int kills, TextureRegion gunIcon, boolean armedView) {
        int W = Gdx.graphics.getWidth(), H = Gdx.graphics.getHeight();
        float cx = W / 2f, cy = H / 2f, u = H / 400f;
        shapes.begin(ShapeRenderer.ShapeType.Filled);
        if (armedView) {
            // Mira: 4 traços com contorno escuro
            float g = Math.max(4f * u, spreadPx), L = 7f * u, th = 1.6f * u;
            for (int pass = 0; pass < 2; pass++) {
                float o = pass == 0 ? th * 0.9f : 0f;
                if (pass == 0) shapes.setColor(0.1f, 0.06f, 0.03f, 0.75f);
                else if (overEnemy) shapes.setColor(0.86f, 0.25f, 0.15f, 1f);
                else shapes.setColor(0.96f, 0.92f, 0.82f, 0.95f);
                shapes.rect(cx - th / 2f - o, cy + g - o, th + 2 * o, L + 2 * o);
                shapes.rect(cx - th / 2f - o, cy - g - L - o, th + 2 * o, L + 2 * o);
                shapes.rect(cx + g - o, cy - th / 2f - o, L + 2 * o, th + 2 * o);
                shapes.rect(cx - g - L - o, cy - th / 2f - o, L + 2 * o, th + 2 * o);
                shapes.circle(cx, cy, (pass == 0 ? 1.6f : 1f) * u, 10);
            }
            // Assistência agindo: colchetes cor de latão, discretos
            if (assist != null && assist.strengthNow > 0.02f) {
                float a = 0.55f * assist.strengthNow, r = g + L + 6f * u, s = 5f * u, t2 = 1.3f * u;
                shapes.setColor(0.85f, 0.65f, 0.3f, a);
                for (int sx = -1; sx <= 1; sx += 2) {
                    float x = cx + sx * r;
                    shapes.rect(x - t2 / 2f, cy - s, t2, 2 * s);
                    shapes.rect(sx < 0 ? x : x - s * 0.7f, cy + s - t2, s * 0.7f, t2);
                    shapes.rect(sx < 0 ? x : x - s * 0.7f, cy - s, s * 0.7f, t2);
                }
            }
        }
        // Marcador de acerto (X)
        if (markT > 0f) {
            float k = markT / 0.2f, s = (markHead > 0f ? 15f : 10f) * u, inner = 4f * u, w = (markHead > 0f ? 2.6f : 1.8f) * u;
            if (markHead > 0f) shapes.setColor(0.85f, 0.12f, 0.08f, k);
            else shapes.setColor(0.97f, 0.93f, 0.85f, k);
            for (int q = 0; q < 4; q++) {
                float ax = (q == 0 || q == 3) ? 1f : -1f, ay = q < 2 ? 1f : -1f;
                shapes.rectLine(cx + ax * inner, cy + ay * inner, cx + ax * s, cy + ay * s, w);
            }
        }
        // Painel da arma: barra de munição / recarga por cima da barra amarela
        WeaponConfig cfg = weapons != null ? weapons.config() : null;
        if (cfg != null && armedView) {
            float[] r = hud.rect(hud.get("arma"));
            float bx = r[0] + r[2] * 0.081f, bw = r[2] * 0.702f, by = r[1] + r[3] * 0.148f, bh = r[3] * 0.062f;
            shapes.setColor(0.10f, 0.07f, 0.05f, 1f);
            shapes.rect(bx, by, bw, bh);
            float f = weapons.reloading() ? weapons.reloadProgress() : weapons.ammo() / (float) cfg.magazine;
            if (weapons.reloading()) shapes.setColor(0.85f, 0.55f, 0.15f, 1f);
            else if (weapons.ammo() <= cfg.magazine / 5) shapes.setColor(0.85f, 0.2f, 0.1f, 1f);
            else shapes.setColor(0.98f, 0.78f, 0.12f, 1f);
            shapes.rect(bx, by, bw * MathUtils.clamp(f, 0f, 1f), bh);
        }
        shapes.end();

        batch.begin();
        // Números de dano
        float base = font.getData().scaleX;
        for (int i = 0; i < NUMBERS; i++) {
            if (numT[i] <= 0f) continue;
            tmp.set(numPos[i]).add(0f, (0.9f - numT[i]) * 0.9f, 0f);
            cam.project(tmp);
            if (tmp.z > 1f) continue;   // atrás da câmera
            float a = Math.min(1f, numT[i] * 2.5f);
            font.getData().setScale(numHead[i] ? 1.9f * u / 1.6f : 1.5f * u / 1.6f);
            if (numHead[i]) font.setColor(1f, 0.78f, 0.2f, a);
            else font.setColor(0.98f, 0.95f, 0.88f, a);
            String t = numHead[i] ? Math.round(numVal[i]) + "!" : String.valueOf(Math.round(numVal[i]));
            layout.setText(font, t);
            font.draw(batch, t, tmp.x - layout.width / 2f, tmp.y + layout.height);
        }
        // Abate
        if (killT > 0f) {
            float a = Math.min(1f, killT * 2f);
            font.getData().setScale(1.6f * u / 1.6f);
            font.setColor(0.86f, 0.2f, 0.12f, a);
            String t = killHead ? "CANGACEIRO ABATIDO  ·  NA CABEÇA" : "CANGACEIRO ABATIDO";
            layout.setText(font, t);
            font.draw(batch, t, cx - layout.width / 2f, H * 0.72f);
        }
        // Painel da arma: munição e nome
        if (cfg != null && armedView) {
            float[] r = hud.rect(hud.get("arma"));
            font.getData().setScale(Math.max(1.2f, r[3] / 58f));
            font.setColor(0.98f, 0.95f, 0.88f, 1f);
            String ammo = weapons.ammo() + "/" + weapons.reserveAmmo();
            layout.setText(font, ammo);
            font.draw(batch, ammo, r[0] + r[2] * 0.07f, r[1] + r[3] * 0.86f);
            font.getData().setScale(Math.max(1f, r[3] / 120f));
            font.setColor(0.95f, 0.85f, 0.6f, 1f);
            String sub = weapons.reloading() ? "Recarregando..." : cfg.name + "  ·  " + cfg.category.label;
            font.draw(batch, sub, r[0] + r[2] * 0.07f, r[1] + r[3] * 0.44f);
            if (gunIcon != null) {
                float iw = r[2] * 0.42f, ih = iw * 0.5f;
                batch.draw(gunIcon, r[0] + r[2] * 0.42f, r[1] + r[3] * 0.38f, iw, ih);
            }
        }
        // Contadores: vivos e abates
        font.getData().setScale(Math.max(1.2f, hud.rect(hud.get("vivos"))[3] / 30f));
        font.setColor(0.98f, 0.97f, 0.95f, 1f);
        float[] rv = hud.rect(hud.get("vivos"));
        String sv = String.valueOf(alive);
        layout.setText(font, sv);
        font.draw(batch, sv, rv[0] + rv[2] * 0.72f - layout.width / 2f, rv[1] + (rv[3] + layout.height) / 2f);
        float[] rk = hud.rect(hud.get("abates"));
        String sk = String.valueOf(kills);
        layout.setText(font, sk);
        font.draw(batch, sk, rk[0] + rk[2] * 0.73f - layout.width / 2f, rk[1] + (rk[3] + layout.height) / 2f);
        font.getData().setScale(base);
        batch.end();
    }

    void dispose() {
        tracerModel.dispose();
        flashModel.dispose();
        for (Sound s : new Sound[]{shot, farShot, hit, head, kill, reload, empty, impact}) if (s != null) s.dispose();
    }
}
