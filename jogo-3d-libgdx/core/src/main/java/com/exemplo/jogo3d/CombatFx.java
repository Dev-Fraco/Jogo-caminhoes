package com.exemplo.jogo3d;

import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.audio.Sound;
import com.badlogic.gdx.graphics.Camera;
import com.badlogic.gdx.graphics.Color;
import com.badlogic.gdx.graphics.Pixmap;
import com.badlogic.gdx.graphics.Texture;
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
    private static final int TRACERS = 24, NUMBERS = 24;
    private static final float NUM_LIFE = 1.0f;   // segundos que cada número fica na tela

    private final Model tracerModel;
    private final ModelInstance[] tracer = new ModelInstance[TRACERS];
    private final float[] tracerT = new float[TRACERS];
    private final BlendingAttribute[] tracerBlend = new BlendingAttribute[TRACERS];
    private int tracerNext;
    private final Array<ModelInstance> draw = new Array<>();

    private final Vector3[] numPos = new Vector3[NUMBERS];
    private final float[] numT = new float[NUMBERS], numVal = new float[NUMBERS];
    private final boolean[] numHead = new boolean[NUMBERS];
    private final boolean[] numWall = new boolean[NUMBERS];   // dano na parede (azul)
    private int numNext;
    private float markT, markHead, killT;
    private boolean killHead;
    private final GlyphLayout layout = new GlyphLayout();
    private final Vector3 tmp = new Vector3(), dir = new Vector3();
    private final Quaternion rot = new Quaternion();
    private final Vector3 scl = new Vector3();
    private ImpactEffects impacts;
    private WeaponAudio weaponAudio;
    private final Vector3 shotNormal = new Vector3(0f, 1f, 0f);
    private Sound hit, head, kill;

    CombatFx() {
        ModelBuilder mb = new ModelBuilder();
        long attr = VertexAttributes.Usage.Position | VertexAttributes.Usage.Normal;
        tracerModel = mb.createBox(0.018f, 0.018f, 1f, new Material(ColorAttribute.createDiffuse(1f, 0.9f, 0.6f, 1f),
                ColorAttribute.createEmissive(1f, 0.85f, 0.5f, 1f), new BlendingAttribute(GL20.GL_SRC_ALPHA, GL20.GL_ONE, 0.8f)), attr);
        for (int i = 0; i < TRACERS; i++) {
            tracer[i] = new ModelInstance(tracerModel);
            tracerBlend[i] = (BlendingAttribute) tracer[i].materials.get(0).get(BlendingAttribute.Type);
        }
        for (int i = 0; i < NUMBERS; i++) numPos[i] = new Vector3();
        try {
            hit = load("acerto.wav");
            head = load("cabeca.wav");
            kill = load("abate.wav");
        } catch (Throwable t) {
            hit = head = kill = null;
        }
    }

    private static Sound load(String f) { return Gdx.audio.newSound(Gdx.files.internal("audio/" + f)); }

    void setImpacts(ImpactEffects e) { impacts = e; }

    void setAudio(WeaponAudio a) { weaponAudio = a; }

    /** Direção do tiro atual (de onde saem os respingos no inimigo). */
    void setShotNormal(Vector3 aim) { shotNormal.set(aim).scl(-1f); }

    // ---------- Eventos ----------

    /** Rastro curto da bala, do cano até o ponto atingido. */
    void tracer(Vector3 muzzle, Vector3 end) {
        addTracer(muzzle, end, 0.07f);
    }

    /** Tiro de bot: rastro, estampido distante e poeira onde bate. */
    void enemyShot(Vector3 from, Vector3 to, Vector3 listener) {
        addTracer(from, to, 0.06f);
        float d = from.dst(listener);
        if (weaponAudio != null) weaponAudio.distantShot(d);
        if (impacts != null && MathUtils.randomBoolean(0.5f)) impacts.hit(Surface.TERRA, to, Vector3.Y);
    }

    @Override
    public void onHit(Enemy e, Vector3 at, float damage, boolean isHead, boolean killed, int bone) {
        int k = numNext++ % NUMBERS;
        numPos[k].set(at);
        numVal[k] = damage;
        numHead[k] = isHead;
        numWall[k] = false;
        numT[k] = NUM_LIFE;
        markT = 0.2f;
        markHead = isHead ? 1f : 0f;
        play(isHead ? head : hit, isHead ? 0.9f : 0.7f);
        if (impacts != null) impacts.hit(Surface.CARNE, at, shotNormal);
        e.flinch(isHead, bone);   // o inimigo reage ao tiro (e ao membro atingido)
        if (killed) {
            killT = 2.4f;
            killHead = isHead;
            play(kill, 0.75f);
        }
    }

    // ---------- Mira dinâmica (4 arcos e ponto) ----------
    private float openNow, kickNow;   // abertura suavizada (0 parado, 1 correndo ou com tiros seguidos)
    // Posição de cada arco em relação ao centro (pixels da arte) e tamanho do recorte
    // Mira: anel fino cortado nos eixos (sem degradê e sem ponto no centro). Parado: anel fechado;
    // andando ou atirando: só as duas laterais se afastam na horizontal.
    private static Texture miraEsq, miraDir;
    private static final int MIRA_PX = 64;            // raio do anel na textura (px)
    private static final float MIRA_RAIO = 0.058f;    // raio da mira em relação à altura da tela
    private static final float MIRA_ABRE = 0.6f;      // afastamento das laterais (fração do raio)
    private static final float MIRA_ESPESSURA = 1.3f; // espessura do traço (px da textura)

    /** Atualiza a abertura da mira: corre abre, parar fecha (suave), cada tiro dá um coice temporário. */
    /** Luneta aberta: some o retículo de mira (a lente tem o seu próprio). */
    boolean hideCross = false;

    void crossUpdate(float dt, float speedFrac, boolean fired, float pct) {
        if (fired) kickNow = Math.min(1f, kickNow + 0.22f);
        kickNow = Math.max(0f, kickNow - dt * 3.2f);
        float target = Math.min(1f, Math.min(1f, speedFrac) * 0.85f + kickNow) * pct;
        openNow += (target - openNow) * (1f - (float) Math.exp(-dt * 12f));
    }

    /** Metade do anel (esquerda ou direita) em textura: 2 arcos de 60° por lado, com 30° de folga nos eixos. */
    private static Texture gerarArcos(boolean esquerda) {
        int S = 2 * MIRA_PX + 8, c = S / 2;
        Pixmap pm = new Pixmap(S, S, Pixmap.Format.RGBA8888);
        for (int y = 0; y < S; y++) {
            for (int x = 0; x < S; x++) {
                float dx = x + 0.5f - c, dy = c - (y + 0.5f);
                float r = (float) Math.sqrt(dx * dx + dy * dy);
                float ang = (float) Math.toDegrees(Math.atan2(dy, dx));
                if (ang < 0f) ang += 360f;
                boolean ladoCerto = esquerda ? (ang > 90f && ang < 270f) : (ang < 90f || ang > 270f);
                if (!ladoCerto) continue;
                float dentro = ang % 90f;                       // posição dentro do quadrante
                if (dentro < 15f || dentro > 75f) continue;     // folga de 30° nos eixos
                float cov = MathUtils.clamp(MIRA_ESPESSURA * 0.5f + 0.5f - Math.abs(r - MIRA_PX), 0f, 1f);
                if (cov > 0f) pm.drawPixel(x, y, Color.rgba8888(1f, 1f, 1f, cov));
            }
        }
        Texture t = new Texture(pm);
        t.setFilter(Texture.TextureFilter.Linear, Texture.TextureFilter.Linear);
        pm.dispose();
        return t;
    }

    private void drawCross(SpriteBatch batch, float cx, float cy, int H, boolean overEnemy) {
        if (miraEsq == null) {
            miraEsq = gerarArcos(true);
            miraDir = gerarArcos(false);
        }
        float raio = MIRA_RAIO * H;
        float escala = raio / MIRA_PX;                        // px da textura -> px da tela
        float tam = (2 * MIRA_PX + 8) * escala;
        float abre = openNow * MIRA_ABRE * raio;              // só as laterais se afastam
        if (overEnemy) batch.setColor(1f, 0.35f, 0.25f, 1f);
        else batch.setColor(1f, 1f, 1f, 0.95f);
        batch.draw(miraEsq, cx - tam / 2f - abre, cy - tam / 2f, tam, tam);
        batch.draw(miraDir, cx - tam / 2f + abre, cy - tam / 2f, tam, tam);
        batch.setColor(1f, 1f, 1f, 1f);
    }

    /** Dano numa parede de proteção: número azul no ponto do impacto. */
    void wallHit(Vector3 at, float damage) {
        int k = numNext++ % NUMBERS;
        numPos[k].set(at);
        numVal[k] = damage;
        numHead[k] = false;
        numWall[k] = true;
        numT[k] = NUM_LIFE;
        play(hit, 0.5f);
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
        markT -= dt;
        killT -= dt;
        for (int i = 0; i < TRACERS; i++) if (tracerT[i] > 0f) tracerT[i] -= dt;
        for (int i = 0; i < NUMBERS; i++) if (numT[i] > 0f) numT[i] -= dt;
        // Dano na parede de proteção: número azul no ponto do impacto
        // (chamado pelo ShootingSystem, que já aplicou o dano no muro)
    }

    Array<ModelInstance> instances() {
        draw.clear();
        for (int i = 0; i < TRACERS; i++) {
            if (tracerT[i] > 0f) {
                tracerBlend[i].opacity = Math.min(0.85f, tracerT[i] * 14f);
                draw.add(tracer[i]);
            }
        }
        return draw;
    }

    // ---------- Tela ----------

    /**
     * @param spreadPx   abertura da mira em pixels (dispersão atual)
     * @param overEnemy  a mira está em cima de um inimigo
     */
    void drawHud(SpriteBatch batch, ShapeRenderer shapes, BitmapFont font, Camera cam, Hud hud, Weapons weapons,
                 AimAssist assist, float spreadPx, boolean overEnemy, int alive, int kills, TextureRegion gunIcon, boolean armedView,
                 Enemies enemies) {
        int W = Gdx.graphics.getWidth(), H = Gdx.graphics.getHeight();
        float cx = W / 2f, cy = H / 2f, u = H / 400f;
        shapes.begin(ShapeRenderer.ShapeType.Filled);
        if (armedView) {
        }
        // Acerto: X vermelho pequeno no meio do círculo
        if (markT > 0f) {
            float k = markT / 0.2f, sz = 3.5f * u, inner = 1.2f * u, w = 1.4f * u;
            shapes.setColor(0.9f, 0.12f, 0.08f, k);
            for (int q = 0; q < 4; q++) {
                float ax = (q == 0 || q == 3) ? 1f : -1f, ay = q < 2 ? 1f : -1f;
                shapes.rectLine(cx + ax * inner, cy + ay * inner, cx + ax * sz, cy + ay * sz, w);
            }
        }
        shapes.end();
        // Painel de armas (fundos e bordas em código; textos e ícones no batch)
        WeaponConfig cfg = weapons != null ? weapons.config() : null;
        boolean showPanel = cfg != null && armedView;
        float[] pr = showPanel ? hud.rect(hud.get("arma")) : null;
        if (showPanel) WeaponPanel.drawShapes(shapes, pr[0], pr[1], pr[2], pr[3], weapons, !weapons.holstered());

        batch.begin();
        if (armedView && weapons != null && !hideCross) drawCross(batch, cx, cy, H, overEnemy);
        if (showPanel) WeaponPanel.drawBatch(batch, font, pr[0], pr[1], pr[2], pr[3], weapons, !weapons.holstered());
        float base = font.getData().scaleX;
        // Números de dano: cada tiro tem o seu. Peito amarelo, cabeça vermelha e maior, parede azul.
        // Tamanho cresce com o dano; sobe devagar, aparece rápido e some suavemente, ao lado do alvo.
        for (int i = 0; i < NUMBERS; i++) {
            if (numT[i] <= 0f) continue;
            float age = 1f - numT[i] / NUM_LIFE;                 // 0 no acerto, 1 no fim
            tmp.set(numPos[i]);
            cam.project(tmp);
            if (tmp.z > 1f) continue;                            // atrás da câmera
            float rise = (1f - (1f - age) * (1f - age)) * 46f * u;   // sobe rápido no começo e desacelera
            float side = (numHead[i] ? 30f : 42f) * u * (1f + 0.3f * (i % 3 - 1));   // ao lado do alvo, sem sobrepor
            float fadeIn = Math.min(1f, age / 0.08f), fadeOut = Math.min(1f, (1f - age) / 0.35f);
            float a = Math.min(fadeIn, fadeOut);
            float dmg = numVal[i];
            float scale = MathUtils.clamp(0.9f + dmg / 55f, 0.9f, 2.2f) * (numHead[i] ? 1.35f : 1f);
            font.getData().setScale(scale * u / 1.6f * 1.2f);
            String t = String.valueOf(Math.round(dmg));
            layout.setText(font, t);
            float x = tmp.x + side - layout.width / 2f, y = tmp.y + rise;
            if (numWall[i]) font.setColor(0.25f, 0.6f, 1f, a);            // parede: azul
            else if (numHead[i]) font.setColor(1f, 0.16f, 0.1f, a);      // cabeça: vermelho
            else font.setColor(1f, 0.86f, 0.18f, a);                     // peito: amarelo
            font.draw(batch, t, x, y + layout.height);
            if (numHead[i] && !numWall[i]) {   // etiqueta discreta
                font.getData().setScale(0.8f * u / 1.6f);
                font.setColor(1f, 0.16f, 0.1f, a);
                layout.setText(font, "CABEÇA");
                font.draw(batch, "CABEÇA", tmp.x + side - layout.width / 2f, y + layout.height * 3.4f);
            }
        }
        // Pente e reserva vazios: aviso
        if (cfg != null && armedView && weapons.ammo() == 0 && !weapons.reloading()) {
            font.getData().setScale(1.3f * u / 1.6f);
            font.setColor(0.9f, 0.3f, 0.15f, 0.6f + 0.4f * MathUtils.sin(System.nanoTime() * 1e-9f * 6f));
            String t = weapons.reserveAmmo() > 0 ? "SEM MUNIÇÃO — RECARREGAR" : "SEM MUNIÇÃO";
            layout.setText(font, t);
            font.draw(batch, t, cx - layout.width / 2f, cy - 26f * u);
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
            String sub = weapons.reloading() ? "Recarregando..." : cfg.name + "  ·  " + weapons.modeLabel();
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
        for (Sound s : new Sound[]{hit, head, kill}) if (s != null) s.dispose();
    }
}
