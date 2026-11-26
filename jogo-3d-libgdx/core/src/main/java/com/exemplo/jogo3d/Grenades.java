package com.exemplo.jogo3d;

import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.audio.Sound;
import com.badlogic.gdx.graphics.Camera;
import com.badlogic.gdx.graphics.GL20;
import com.badlogic.gdx.graphics.VertexAttributes;
import com.badlogic.gdx.graphics.g3d.Material;
import com.badlogic.gdx.graphics.g3d.Model;
import com.badlogic.gdx.graphics.g3d.ModelInstance;
import com.badlogic.gdx.graphics.g3d.attributes.BlendingAttribute;
import com.badlogic.gdx.graphics.g3d.attributes.ColorAttribute;
import com.badlogic.gdx.graphics.g3d.attributes.IntAttribute;
import com.badlogic.gdx.graphics.g3d.utils.ModelBuilder;
import com.badlogic.gdx.math.MathUtils;
import com.badlogic.gdx.math.Vector3;
import com.badlogic.gdx.utils.Array;

/**
 * Granadas: mira com o arco da trajetória (segurando o botão), arremesso, quique no chão e nas
 * paredes e o efeito de cada uma:
 * - fragmentação: bola de fogo, poeira, marca preta no chão, tremor da câmera e dano por distância;
 * - fumaça: nuvem cinza que cresce, cobre a visão e vai embora com o vento em ~25 s;
 * - atordoante: clarão; quem estiver perto e olhando fica com a tela branca e o zumbido.
 */
final class Grenades {
    static final int FRAG = 5, SMOKE = 6, STUN = 7;
    static final float THROW_SPEED = 15f;
    private static final float G = 9.8f, R = 0.06f;
    private static final float FRAG_RADIUS = 9f;

    static final class Live {
        final int type;
        final ModelInstance inst;
        final Vector3 pos = new Vector3(), vel = new Vector3();
        float fuse, spin, spinAxisX, spinAxisZ;
        boolean rest;

        Live(int type, ModelInstance inst) {
            this.type = type;
            this.inst = inst;
        }
    }

    /** Pedaço de efeito: esfera transparente que cresce, sobe e some. */
    static final class Puff {
        final ModelInstance inst;
        final ColorAttribute color;
        final BlendingAttribute blend;
        final Vector3 pos = new Vector3(), vel = new Vector3();
        float age, life, r0, r1, grow, alpha, fadeIn;
        boolean flat;   // marca no chão: não cresce na altura

        final Model model;

        Puff(Model model, ModelInstance inst) {
            this.model = model;
            this.inst = inst;
            Material m = inst.materials.get(0);
            color = (ColorAttribute) m.get(ColorAttribute.Diffuse);
            blend = (BlendingAttribute) m.get(BlendingAttribute.Type);
        }
    }

    private final Model sphere, fireSphere, disc, dot;
    private final Items items;
    final Array<Live> live = new Array<>();
    private final Array<Puff> puffs = new Array<>();
    final Array<ModelInstance> drawList = new Array<>();
    private final Array<ModelInstance> arc = new Array<>();
    private int arcCount = 0;
    float shake = 0f;   // tremor da câmera (m)
    private final Vector3 wind = new Vector3(0.6f, 0f, 0.3f);
    private Sound boom, hiss, bang, pin, bounce;
    private final Array<Puff> freeSphere = new Array<>();   // reaproveita as nuvens (poeira dos tiros)
    Enemies enemies;    // a explosão também fere os cangaceiros
    int kills;          // abates por granada

    Grenades(Items items) {
        this.items = items;
        ModelBuilder mb = new ModelBuilder();
        long attr = VertexAttributes.Usage.Position | VertexAttributes.Usage.Normal;
        sphere = mb.createSphere(1f, 1f, 1f, 14, 10, puffMat(), attr);
        fireSphere = mb.createSphere(1f, 1f, 1f, 14, 10, new Material(ColorAttribute.createDiffuse(1f, 0.6f, 0.2f, 1f),
                ColorAttribute.createEmissive(1f, 0.55f, 0.15f, 1f), new BlendingAttribute(GL20.GL_SRC_ALPHA, GL20.GL_ONE, 1f),
                IntAttribute.createCullFace(GL20.GL_NONE)), attr);
        disc = mb.createCylinder(1f, 0.02f, 1f, 18, new Material(ColorAttribute.createDiffuse(0.06f, 0.05f, 0.04f, 1f),
                new BlendingAttribute(GL20.GL_SRC_ALPHA, GL20.GL_ONE_MINUS_SRC_ALPHA, 0.8f)), attr);
        dot = mb.createSphere(0.12f, 0.12f, 0.12f, 6, 4, new Material(ColorAttribute.createDiffuse(1f, 0.9f, 0.4f, 1f),
                ColorAttribute.createEmissive(0.8f, 0.6f, 0.2f, 1f), new BlendingAttribute(GL20.GL_SRC_ALPHA, GL20.GL_ONE_MINUS_SRC_ALPHA, 0.85f)), attr);
        for (int i = 0; i < 34; i++) arc.add(new ModelInstance(dot));
        try {
            boom = Gdx.audio.newSound(Gdx.files.internal("audio/explosao.wav"));
            hiss = Gdx.audio.newSound(Gdx.files.internal("audio/fumaca.wav"));
            bang = Gdx.audio.newSound(Gdx.files.internal("audio/atordoante.wav"));
            pin = Gdx.audio.newSound(Gdx.files.internal("audio/pino.wav"));
            bounce = Gdx.audio.newSound(Gdx.files.internal("audio/quique.wav"));
        } catch (Throwable t) {
            boom = hiss = bang = pin = bounce = null;
        }
    }

    private static Material puffMat() {
        return new Material(ColorAttribute.createDiffuse(0.8f, 0.8f, 0.8f, 1f),
                new BlendingAttribute(GL20.GL_SRC_ALPHA, GL20.GL_ONE_MINUS_SRC_ALPHA, 0.8f),
                IntAttribute.createCullFace(GL20.GL_NONE));
    }

    static float fuse(int type) { return type == FRAG ? 3.6f : 2.2f; }

    /** Velocidade inicial do arremesso: para onde a câmera olha, um pouco para cima. */
    static void throwVelocity(Camera cam, Vector3 out) {
        out.set(cam.direction);
        float up = MathUtils.clamp(out.y + 0.42f, -0.2f, 0.95f);
        float hl = (float) Math.sqrt(out.x * out.x + out.z * out.z);
        if (hl < 1e-3f) { out.x = 0f; out.z = 1f; hl = 1f; }
        out.x /= hl;
        out.z /= hl;
        out.y = up;
        out.nor().scl(THROW_SPEED);
    }

    void pullPin() {
        if (pin != null) pin.play(0.6f);
    }

    /** Joga a granada da mão. */
    void throwIt(int type, Vector3 from, Vector3 v0) {
        Live g = new Live(type, new ModelInstance(items.model(type)));
        g.pos.set(from);
        g.vel.set(v0);
        g.fuse = fuse(type);
        g.spin = MathUtils.random(400f, 700f);
        g.spinAxisX = MathUtils.random(-1f, 1f);
        g.spinAxisZ = 1f;
        live.add(g);
    }

    /** Arco da mira: simula o voo com quiques até ~2,5 s. */
    void aim(World w, Vector3 from, Vector3 v0) {
        Vector3 p = new Vector3(from), v = new Vector3(v0);
        float dt = 1f / 30f;
        arcCount = 0;
        int bounces = 0;
        for (int i = 0; i < 90 && arcCount < arc.size; i++) {
            v.y -= G * dt;
            p.mulAdd(v, dt);
            float gy = w.groundAt(p.x, p.z) + R;
            if (p.y < gy) {
                p.y = gy;
                v.y = -v.y * 0.35f;
                v.x *= 0.6f;
                v.z *= 0.6f;
                if (++bounces > 2) break;
            }
            if (i % 2 == 0) arc.get(arcCount++).transform.setToTranslation(p);
        }
    }

    void clearAim() { arcCount = 0; }

    void update(float dt, World w, Camera cam, Survival sv, Vector3 playerPos) {
        shake = Math.max(0f, shake - dt * 1.6f);
        for (int i = live.size - 1; i >= 0; i--) {
            Live g = live.get(i);
            g.fuse -= dt;
            if (!g.rest) {
                g.vel.y -= G * dt;
                float px = g.pos.x, pz = g.pos.z;
                g.pos.mulAdd(g.vel, dt);
                // Parede, casa, árvore ou cerca: volta quicando
                float bx = g.pos.x, bz = g.pos.z;
                w.resolveCollisions(g.pos, R);
                if (Math.abs(g.pos.x - bx) + Math.abs(g.pos.z - bz) > 1e-4f) {
                    float nx = g.pos.x - bx, nz = g.pos.z - bz, nl = (float) Math.sqrt(nx * nx + nz * nz);
                    nx /= nl;
                    nz /= nl;
                    float vn = g.vel.x * nx + g.vel.z * nz;
                    if (vn < 0f) {
                        g.vel.x -= 1.45f * vn * nx;
                        g.vel.z -= 1.45f * vn * nz;
                        g.vel.x *= 0.7f;
                        g.vel.z *= 0.7f;
                        play(bounce, 0.5f, g.pos, playerPos);
                    }
                }
                float gy = w.groundAt(g.pos.x, g.pos.z) + R;
                if (g.pos.y < gy) {
                    g.pos.y = gy;
                    if (g.vel.y < -1.5f) play(bounce, Math.min(1f, -g.vel.y / 8f), g.pos, playerPos);
                    g.vel.y = -g.vel.y * 0.32f;
                    g.vel.x *= 0.62f;
                    g.vel.z *= 0.62f;
                    g.spin *= 0.6f;
                    if (Math.abs(g.vel.y) < 0.6f && g.vel.len2() < 0.5f) {
                        g.rest = true;
                        g.vel.setZero();
                    }
                }
                if (Float.isNaN(g.pos.x)) g.pos.set(px, gy, pz);
            }
            g.inst.transform.setToTranslation(g.pos)
                    .rotate(g.spinAxisX, 0f, g.spinAxisZ, g.spin * (fuse(g.type) - g.fuse));
            if (g.fuse <= 0f) {
                live.removeIndex(i);
                detonate(g, w, cam, sv, playerPos);
            }
        }
        for (int i = puffs.size - 1; i >= 0; i--) {
            Puff p = puffs.get(i);
            p.age += dt;
            if (p.age >= p.life) {
                puffs.removeIndex(i);
                if (p.model == sphere) freeSphere.add(p);
                continue;
            }
            p.pos.mulAdd(p.vel, dt);
            p.vel.scl(1f - Math.min(1f, dt * 1.2f));
            float t = p.age / p.life;
            float r = p.r1 + (p.r0 - p.r1) * (float) Math.exp(-p.age * p.grow);
            float a = p.alpha * Math.min(1f, p.age / p.fadeIn) * (t > 0.75f ? (1f - t) / 0.25f : 1f);
            p.blend.opacity = a;
            p.inst.transform.setToTranslation(p.pos).scale(r * 2f, p.flat ? 1f : r * 2f, r * 2f);
        }
    }

    private void detonate(Live g, World w, Camera cam, Survival sv, Vector3 playerPos) {
        float d = g.pos.dst(playerPos.x, playerPos.y + 1f, playerPos.z);
        if (g.type == FRAG) {
            play(boom, 1f, g.pos, playerPos);
            // Bola de fogo
            puff(fireSphere, g.pos, 0f, 0.35f, 0f, 0.3f, 4.2f, 14f, 1f, 0.04f, 1f, 1f, 1f);
            puff(fireSphere, g.pos, 0f, 0.55f, 0f, 0.4f, 2.8f, 10f, 0.8f, 0.04f, 1f, 0.8f, 0.4f);
            // Poeira e fumaça escura subindo
            for (int i = 0; i < 16; i++) {
                float a = MathUtils.random(MathUtils.PI2), s = MathUtils.random(2f, 6f);
                Puff p = puff(sphere, g.pos, MathUtils.cos(a) * s, MathUtils.random(1.5f, 5f), MathUtils.sin(a) * s,
                        0.4f, MathUtils.random(1.4f, 2.4f), 1.8f, 0.8f, 0.15f, 0.42f, 0.36f, 0.3f);
                p.life = MathUtils.random(3f, 5.5f);
            }
            // Marca preta no chão
            Puff mark = puff(disc, g.pos, 0f, 0f, 0f, 3.2f, 3.2f, 1f, 0.75f, 0.05f, -1f, 0f, 0f);
            mark.life = 30f;
            mark.flat = true;
            mark.pos.y = w.groundAt(g.pos.x, g.pos.z) + 0.03f;
            shake = Math.max(shake, MathUtils.clamp(1.2f - d / 30f, 0f, 1.2f));
            if (d < FRAG_RADIUS) {
                float k = 1f - d / FRAG_RADIUS;
                sv.damage(115f * k * k + 8f * k, true);
            }
            if (enemies != null) kills += enemies.explosion(g.pos, FRAG_RADIUS, 115f);
        } else if (g.type == SMOKE) {
            play(hiss, 0.9f, g.pos, playerPos);
            for (int i = 0; i < 26; i++) {
                float a = MathUtils.random(MathUtils.PI2), s = MathUtils.random(0.4f, 1.6f);
                Puff p = puff(sphere, g.pos, MathUtils.cos(a) * s + wind.x * 0.2f, MathUtils.random(0.2f, 1.0f),
                        MathUtils.sin(a) * s + wind.z * 0.2f, 0.3f, MathUtils.random(2.2f, 3.4f), 0.35f, 0.93f,
                        MathUtils.random(0.5f, 2.5f), 0.86f, 0.86f, 0.84f);
                p.life = MathUtils.random(22f, 27f);
                p.pos.add(MathUtils.cos(a) * MathUtils.random(0f, 2.5f), MathUtils.random(0.5f, 2.2f), MathUtils.sin(a) * MathUtils.random(0f, 2.5f));
            }
        } else {
            play(bang, 1f, g.pos, playerPos);
            puff(fireSphere, g.pos, 0f, 0f, 0f, 0.2f, 3.5f, 25f, 1f, 0.02f, 1f, 1f, 1f).life = 0.25f;
            if (d < 16f) {
                // Olhando para a granada, o clarão pega em cheio; de costas, só um pouco
                Vector3 to = new Vector3(g.pos).sub(cam.position).nor();
                float look = MathUtils.clamp(to.dot(cam.direction), 0f, 1f);
                float k = (1f - d / 16f) * (0.35f + 0.65f * look);
                sv.stun = Math.max(sv.stun, Math.min(1.4f, k * 1.6f));
                if (d < 3f) sv.damage(5f, false);
            }
        }
    }

    private Puff puff(Model m, Vector3 at, float vx, float vy, float vz, float r0, float r1, float grow, float alpha,
                      float fadeIn, float cr, float cg, float cb) {
        Puff p = m == sphere && freeSphere.size > 0 ? freeSphere.pop() : new Puff(m, new ModelInstance(m));
        p.age = 0f;
        p.flat = false;
        p.pos.set(at);
        p.vel.set(vx, vy, vz);
        p.r0 = r0;
        p.r1 = r1;
        p.grow = grow;
        p.alpha = alpha;
        p.fadeIn = fadeIn;
        p.life = 0.7f;
        if (cr >= 0f && p.color != null) p.color.color.set(cr, cg, cb, 1f);
        p.inst.transform.setToTranslation(at).scale(r0 * 2f, r0 * 2f, r0 * 2f);
        if (p.blend != null) p.blend.opacity = 0f;
        puffs.add(p);
        return p;
    }

    /** Ponto atingido por bala: poeira de terra, ou sangue seco escuro num inimigo. */
    void impact(Vector3 at, boolean flesh) {
        for (int i = 0; i < 2; i++) {
            Puff p = flesh
                    ? puff(sphere, at, MathUtils.random(-0.4f, 0.4f), MathUtils.random(0.1f, 0.6f), MathUtils.random(-0.4f, 0.4f),
                    0.04f, 0.16f, 9f, 0.85f, 0.02f, 0.38f, 0.07f, 0.05f)
                    : puff(sphere, at, MathUtils.random(-0.5f, 0.5f), MathUtils.random(0.4f, 1.2f), MathUtils.random(-0.5f, 0.5f),
                    0.05f, 0.35f, 5f, 0.7f, 0.03f, 0.6f, 0.5f, 0.36f);
            p.life = flesh ? 0.35f : 0.9f;
        }
    }

    private void play(Sound s, float vol, Vector3 at, Vector3 listener) {
        if (s == null) return;
        float d = at.dst(listener);
        float v = vol * MathUtils.clamp(1f - d / 120f, 0f, 1f);
        if (v > 0.02f) s.play(v);
    }

    /** Tudo que precisa ser desenhado: granadas voando, efeitos e o arco da mira. */
    Array<ModelInstance> instances() {
        drawList.clear();
        for (int i = 0; i < live.size; i++) drawList.add(live.get(i).inst);
        for (int i = 0; i < puffs.size; i++) drawList.add(puffs.get(i).inst);
        for (int i = 0; i < arcCount; i++) drawList.add(arc.get(i));
        return drawList;
    }

    void clearAll() {
        live.clear();
        puffs.clear();
        arcCount = 0;
        shake = 0f;
    }

    void dispose() {
        sphere.dispose();
        fireSphere.dispose();
        disc.dispose();
        dot.dispose();
        for (Sound s : new Sound[]{boom, hiss, bang, pin, bounce}) if (s != null) s.dispose();
    }
}
