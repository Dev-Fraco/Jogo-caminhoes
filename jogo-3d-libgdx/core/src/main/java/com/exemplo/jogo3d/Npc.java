package com.exemplo.jogo3d;

import com.badlogic.gdx.graphics.Color;
import com.badlogic.gdx.graphics.g3d.Material;
import com.badlogic.gdx.graphics.g3d.Model;
import com.badlogic.gdx.graphics.g3d.ModelInstance;
import com.badlogic.gdx.graphics.g3d.attributes.ColorAttribute;
import com.badlogic.gdx.graphics.g3d.utils.AnimationController;
import com.badlogic.gdx.math.MathUtils;
import com.badlogic.gdx.math.Vector3;

/**
 * Morador da cidade: segue um roteiro de passos em laço (andar até um ponto, fazer uma ação por
 * alguns segundos, virar para alguém). Pode andar a cavalo. Cada um tem roupa e cabelo de cores próprias.
 */
final class Npc {
    enum Kind { GO, DO, FACE }

    static final class Step {
        final Kind kind;
        final float x, z, time;
        final String clip;

        private Step(Kind kind, float x, float z, float time, String clip) {
            this.kind = kind;
            this.x = x;
            this.z = z;
            this.time = time;
            this.clip = clip;
        }

        /** Andar até (x, z). */
        static Step go(float x, float z) { return new Step(Kind.GO, x, z, 0f, null); }
        /** Fazer uma animação por alguns segundos. */
        static Step act(String clip, float seconds) { return new Step(Kind.DO, 0f, 0f, seconds, clip); }
        /** Virar de frente para (x, z). */
        static Step face(float x, float z) { return new Step(Kind.FACE, x, z, 0f, null); }
    }

    private static final float WALK_CLIP_SPEED = 1.8f;   // o clipe Walk anda ~1,8 m/s
    private static final float RIDER_Y = 1.43f;          // cavaleiro sentado no lombo (altura dos pés)

    final ModelInstance inst;
    private final AnimationController anim;
    final Vector3 pos = new Vector3();
    float facing;
    float speed = 1.2f;
    private Step[] steps;
    private int idx;
    private float timer;
    private String clipNow = "";
    private ModelInstance horse;
    private AnimationController horseAnim;
    private String horseClip = "";

    Npc(Model model, float x, float z, Color shirt, Color pants, Color hair) {
        inst = new ModelInstance(model);
        anim = new AnimationController(inst);
        pos.set(x, 0f, z);
        // Materiais do Jake: camisa (mat21), calça (mat17), cintura (mat18) e cabelo (mat19, mat20)
        tint("mat21", shirt);
        tint("mat17", pants);
        tint("mat18", pants.cpy().mul(0.8f, 0.8f, 0.8f, 1f));
        tint("mat19", hair);
        tint("mat20", hair);
        setClip("Idle", 1f);
    }

    private void tint(String id, Color c) {
        Material m = inst.getMaterial(id);
        if (m != null) m.set(ColorAttribute.createDiffuse(c));
    }

    Npc script(Step... s) {
        steps = s;
        idx = 0;
        timer = 0f;
        return this;
    }

    /** Monta num cavalo (o cavalo segue o roteiro e o morador vai sentado segurando os arreios). */
    Npc ride(Model horseModel) {
        horse = new ModelInstance(horseModel);
        horseAnim = new AnimationController(horse);
        speed = 1.8f;
        return this;
    }

    ModelInstance horseInstance() { return horse; }

    void update(float dt, World w) {
        if (steps != null && steps.length > 0) {
            Step s = steps[idx];
            switch (s.kind) {
                case GO: {
                    float dx = s.x - pos.x, dz = s.z - pos.z;
                    float d = (float) Math.sqrt(dx * dx + dz * dz);
                    if (d < 0.2f) {
                        next();
                        break;
                    }
                    facing += wrap(MathUtils.atan2(dx, dz) - facing) * Math.min(1f, dt * 5f);
                    float stepLen = Math.min(d, speed * dt);
                    pos.x += dx / d * stepLen;
                    pos.z += dz / d * stepLen;
                    if (horse == null) setClip("Walk", speed / WALK_CLIP_SPEED);
                    break;
                }
                case DO:
                    if (horse == null) setClip(s.clip, 1f);
                    timer += dt;
                    if (timer >= s.time) next();
                    break;
                case FACE:
                    facing = MathUtils.atan2(s.x - pos.x, s.z - pos.z);
                    next();
                    break;
            }
        }
        float y = w.groundAt(pos.x, pos.z);
        if (horse != null) {
            boolean moving = steps != null && steps[idx].kind == Kind.GO;
            if (!(moving ? "Walk" : "Idle").equals(horseClip)) {
                horseClip = moving ? "Walk" : "Idle";
                horseAnim.animate(horseClip, -1, 1f, null, 0.25f);
            }
            horse.transform.setToTranslation(pos.x, y, pos.z).rotate(Vector3.Y, facing * MathUtils.radiansToDegrees);
            horseAnim.update(dt);
            inst.transform.set(horse.transform).translate(0f, RIDER_Y, 0f);
            setClip("SentadoArreios", 1f);
        } else {
            inst.transform.setToTranslation(pos.x, y, pos.z).rotate(Vector3.Y, facing * MathUtils.radiansToDegrees);
        }
        anim.update(dt);
    }

    private void next() {
        idx = (idx + 1) % steps.length;
        timer = 0f;
    }

    private void setClip(String c, float sp) {
        if (!c.equals(clipNow)) {
            clipNow = c;
            anim.animate(c, -1, 1f, null, 0.25f);
        }
        anim.current.speed = sp;
    }

    private static float wrap(float a) {
        while (a > MathUtils.PI) a -= MathUtils.PI2;
        while (a < -MathUtils.PI) a += MathUtils.PI2;
        return a;
    }
}
