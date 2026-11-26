package com.exemplo.jogo3d;

import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.graphics.g3d.Model;
import com.badlogic.gdx.graphics.g3d.ModelInstance;
import com.badlogic.gdx.graphics.g3d.loader.G3dModelLoader;
import com.badlogic.gdx.graphics.g3d.model.Node;
import com.badlogic.gdx.graphics.g3d.utils.AnimationController;
import com.badlogic.gdx.math.MathUtils;
import com.badlogic.gdx.math.Quaternion;
import com.badlogic.gdx.math.Vector3;
import com.badlogic.gdx.utils.Array;
import com.badlogic.gdx.utils.JsonReader;

/**
 * Personagem cangaceiro (.g3dj) com as animações "Idle", "Walk", "Run" e "Jump".
 *
 * Poses por código, em cima da animação normal (e desfeitas a cada quadro, para não acumular):
 * - braço esticado (abrir a porteira);
 * - agachado (preparar o pulo para montar);
 * - sentado (montado no donkey).
 */
public class Character {

    // Modelo em metros. Frente do modelo = +z (igual ao Player.facing).
    static final float MODEL_SCALE = 1.0f;
    static final float STATE_HOLD = 0.12f;       // tempo mínimo para trocar de animação (s)
    static final float WALK_CLIP_SPEED = 1.8f;   // quadril anda ~1,8 m/s no clipe
    static final float RUN_CLIP_SPEED = 5.8f;    // quadril anda ~5,8 m/s no clipe
    static final float LIMB_SPEED_SCALE = 1.0f;

    private enum State { IDLE, WALK, RUN, JUMP }

    final Array<ModelInstance> instances = new Array<>();
    private Model model;
    private ModelInstance instance;
    private AnimationController anim;

    // Poses por código (graus): sinal negativo em X = para a frente
    private float reach = 0f;     // 0..1: braço direito esticado
    private float crouch = 0f;    // 0..1: agachado
    private boolean sitting = false;
    // Animação única (deitar, levantar) e balanço da rede
    private String onceClip = null;
    private float onceT = 0f, onceDur = 1f;
    private boolean onceDone = false;
    private float swing = 0f;      // radianos: balanço em torno do quadril (rede)
    private float swingPivotY = 1.15f;   // altura das ancoragens da rede, em relação aos pés deitados

    private final Quaternion tmpQ = new Quaternion();
    private final java.util.Map<String, Node> nodes = new java.util.HashMap<>();
    private final java.util.Map<String, Quaternion> saved = new java.util.HashMap<>();   // rotação da animação
    private final java.util.Map<String, Quaternion> extra = new java.util.HashMap<>();   // ajuste do quadro

    private State current = State.IDLE;
    private State candidate = State.IDLE;
    private float candidateTime = 0f;

    // Passos: um som por pisada, disparado na fase do clipe Walk/Run (um ciclo tem duas pisadas)
    private static com.badlogic.gdx.audio.Sound[] walkSounds, runSounds;
    private com.badlogic.gdx.graphics.g3d.model.Animation lastStepAnim;
    private int lastStepHalf = -1;

    // Parado por um tempo: sorteia uma animação de espera e fica alternando até o jogador andar
    private static final float IDLE_WAIT = 3f;
    private static final String[] IDLE_VARIANTS = {"IdleKneel", "IdleTurn", "IdleLook"};
    private float stillTime = 0f;
    private String variant = null;
    private float variantT = 0f, variantDur = 1f;
    private int lastVariant = -1;
    private boolean jumpStanding = false;   // pulou sem se mover: usa o pulo parado

    public void create() {
        model = new G3dModelLoader(new JsonReader()).loadModel(Gdx.files.internal("models/jake/jake.g3dj"));
        instance = new ModelInstance(model);
        anim = new AnimationController(instance);
        instances.add(instance);
        for (String n : new String[]{"RightUpperArm", "Hips", "Spine", "LeftUpperLeg", "RightUpperLeg", "LeftLowerLeg", "RightLowerLeg"}) {
            Node node = instance.getNode(n);
            if (node != null) nodes.put(n, node);
        }
        anim.animate("Idle", -1, 1f, null, 0.15f);
        anim.current.speed = 0f;
        loadSounds();
    }

    private static void loadSounds() {
        if (walkSounds != null) return;
        try {
            walkSounds = new com.badlogic.gdx.audio.Sound[]{
                    com.badlogic.gdx.Gdx.audio.newSound(com.badlogic.gdx.Gdx.files.internal("audio/passo1.mp3")),
                    com.badlogic.gdx.Gdx.audio.newSound(com.badlogic.gdx.Gdx.files.internal("audio/passo2.mp3")),
                    com.badlogic.gdx.Gdx.audio.newSound(com.badlogic.gdx.Gdx.files.internal("audio/passo3.mp3"))};
            runSounds = new com.badlogic.gdx.audio.Sound[]{
                    com.badlogic.gdx.Gdx.audio.newSound(com.badlogic.gdx.Gdx.files.internal("audio/corrida1.mp3")),
                    com.badlogic.gdx.Gdx.audio.newSound(com.badlogic.gdx.Gdx.files.internal("audio/corrida2.mp3")),
                    com.badlogic.gdx.Gdx.audio.newSound(com.badlogic.gdx.Gdx.files.internal("audio/corrida3.mp3"))};
        } catch (RuntimeException e) {
            // Sem som: o jogo continua normal
            walkSounds = new com.badlogic.gdx.audio.Sound[0];
            runSounds = new com.badlogic.gdx.audio.Sound[0];
        }
    }

    /**
     * Toca um som a cada pisada. O clipe tem dois passos por ciclo (uma vez em cada metade),
     * então o som sai exatamente no momento em que a animação põe o pé no chão.
     */
    private void footsteps(Player p) {
        com.badlogic.gdx.graphics.g3d.utils.AnimationController.AnimationDesc cur = anim.current;
        boolean stepping = onceClip == null && !sitting && p.grounded
                && (current == State.WALK || current == State.RUN) && cur != null && cur.animation != null
                && cur.animation.duration > 0f;
        if (!stepping) {
            lastStepHalf = -1;
            lastStepAnim = null;
            return;
        }
        if (cur.animation != lastStepAnim) {        // clipe trocou: começa a contar de novo
            lastStepAnim = cur.animation;
            lastStepHalf = -1;
        }
        float dur = cur.animation.duration;
        float tt = cur.time % dur;
        if (tt < 0f) tt += dur;
        int half = (int) (tt / (dur * 0.5f)) & 1;
        if (lastStepHalf >= 0 && half != lastStepHalf) {
            com.badlogic.gdx.audio.Sound[] set = current == State.RUN ? runSounds : walkSounds;
            if (set != null && set.length > 0) {
                float vol = 0.5f + 0.4f * MathUtils.clamp(p.speed / 5f, 0f, 1f);
                set[MathUtils.random(set.length - 1)].play(vol, MathUtils.random(0.95f, 1.05f), 0f);
            }
        }
        lastStepHalf = half;
    }

    /** Toca uma animação uma vez (ex.: "LieDown", "GetUp"). Ao terminar, fica na última pose. */
    public void playOnce(String clip) {
        onceClip = clip;
        onceT = 0f;
        onceDone = false;
        com.badlogic.gdx.graphics.g3d.model.Animation a = model.getAnimation(clip);
        onceDur = a != null && a.duration > 0f ? a.duration : 1.2f;
        anim.animate(clip, 1, 1f, null, 0.2f);
    }

    public boolean onceFinished() {
        return onceClip == null || onceDone;
    }

    /** Sai da animação única e volta ao estado normal (andar, parado...). */
    public void endOnce() {
        onceClip = null;
        onceDone = false;
        current = State.IDLE;
        candidate = State.IDLE;
        applyClip();
    }

    /** Posição da mão (osso da mão) no mundo; usada para as rédeas chegarem na mão. */
    public Vector3 handWorld(boolean left, Vector3 out) {
        Node n = instance.getNode(left ? "LeftHand" : "RightHand");
        if (n == null) return instance.transform.getTranslation(out).add(0f, 1.2f, 0f);
        return out.set(0f, 0f, 0f).mul(n.globalTransform).mul(instance.transform);
    }

    /** Balanço da rede (radianos), em torno do quadril. */
    public void setSwing(float rad) {
        swing = rad;
    }

    /**
     * Atualiza pose e animação a partir do estado do Player.
     * Se o personagem estiver montado (sitting), o Player não é usado para a pose de andar.
     */
    public void update(Player p, float dt) {
        instance.transform.setToTranslation(p.pos.x, p.pos.y, p.pos.z)
                .rotate(Vector3.Y, p.facing * MathUtils.radiansToDegrees);
        if (swing != 0f) {
            // balança em torno de um eixo na altura do quadril (da rede), no sentido do corpo
            instance.transform.translate(0f, swingPivotY, 0f).rotate(Vector3.Z, swing * MathUtils.radiansToDegrees)
                    .translate(0f, -swingPivotY, 0f);
        }
        instance.transform.scale(MODEL_SCALE, MODEL_SCALE, MODEL_SCALE);

        if (onceClip == null) {
            State wanted;
            if (!p.grounded) wanted = State.JUMP;
            else if (p.speed < 0.25f) wanted = State.IDLE;
            else if (p.speed < 3.6f) wanted = State.WALK;
            else wanted = State.RUN;

            // Histerese: só troca depois de ficar estável por STATE_HOLD segundos
            if (wanted != current) {
                if (wanted != candidate) {
                    candidate = wanted;
                    candidateTime = 0f;
                }
                candidateTime += dt;
                if (candidateTime >= STATE_HOLD) {
                    current = wanted;
                    candidateTime = 0f;
                    jumpStanding = p.speed < 0.25f;
                    applyClip();
                }
            } else {
                candidate = current;
                candidateTime = 0f;
            }

            switch (current) {
                case IDLE: anim.current.speed = 1f; break;
                case WALK: anim.current.speed = MathUtils.clamp(p.speed / WALK_CLIP_SPEED, 0.6f, 1.3f); break;
                case RUN: anim.current.speed = MathUtils.clamp(p.speed / RUN_CLIP_SPEED, 0.7f, 1.3f); break;
                case JUMP: anim.current.speed = 1f; break;
            }
            anim.current.speed *= LIMB_SPEED_SCALE;
            updateVariants(dt, p);

        }
        // 1) desfaz o ajuste do quadro anterior; 2) toca a animação; 3) aplica as poses por código
        for (java.util.Map.Entry<String, Quaternion> e : saved.entrySet()) {
            nodes.get(e.getKey()).rotation.set(e.getValue());
        }
        saved.clear();
        if (onceClip != null) {
            if (!onceDone) {
                onceT += dt;
                anim.update(dt);
                if (onceT >= onceDur) onceDone = true;   // segura a última pose
            }
        } else {
            anim.update(dt);
            footsteps(p);
        }
        applyPoses();
        instance.calculateTransforms();
    }

    /** Parado por IDLE_WAIT segundos: toca uma animação de espera; ao acabar, sorteia outra (sem repetir a anterior). */
    private void updateVariants(float dt, Player p) {
        boolean still = !sitting && p.grounded && current == State.IDLE && p.speed < 0.25f
                && crouch <= 0.001f && reach <= 0.001f;
        if (!still) {
            stillTime = 0f;
            if (variant != null) {
                variant = null;
                applyClip();
            }
            return;
        }
        if (variant == null) {
            stillTime += dt;
            if (stillTime >= IDLE_WAIT) pickVariant();
            return;
        }
        variantT += dt;
        if (variantT >= variantDur) pickVariant();
    }

    private void pickVariant() {
        int i;
        do {
            i = MathUtils.random(IDLE_VARIANTS.length - 1);
        } while (IDLE_VARIANTS.length > 1 && i == lastVariant);
        lastVariant = i;
        variant = IDLE_VARIANTS[i];
        variantT = 0f;
        com.badlogic.gdx.graphics.g3d.model.Animation a = model.getAnimation(variant);
        variantDur = a != null && a.duration > 0f ? a.duration : 2f;
        anim.animate(variant, -1, 1f, null, 0.3f);
        anim.current.speed = 1f;
    }

    private void applyPoses() {
        extra.clear();
        if (reach > 0.001f) addX("RightUpperArm", -reach * 69f);
        if (crouch > 0.001f || sitting) {
            float c = sitting ? 1f : crouch;
            addX("Hips", -25f * c);
            addX("Spine", 10f * c);
            addX("LeftUpperLeg", -62f * c);
            addX("RightUpperLeg", -62f * c);
            addX("LeftLowerLeg", 70f * c);
            addX("RightLowerLeg", 70f * c);
        }
        if (sitting) addX("Hips", -8f);
        for (java.util.Map.Entry<String, Quaternion> e : extra.entrySet()) {
            Node node = nodes.get(e.getKey());
            if (node == null) continue;
            saved.put(e.getKey(), new Quaternion(node.rotation));
            node.rotation.mulLeft(e.getValue());
        }
    }

    private void addX(String node, float deg) {
        if (!nodes.containsKey(node)) return;
        Quaternion q = extra.get(node);
        if (q == null) {
            q = new Quaternion();
            extra.put(node, q);
        }
        tmpQ.setFromAxisRad(Vector3.X, deg * MathUtils.degreesToRadians);
        q.mulLeft(tmpQ);
    }

    /** 0 = braço solto, 1 = braço totalmente esticado para a frente. */
    public void setReach(float r) {
        reach = MathUtils.clamp(r, 0f, 1f);
    }

    /** 0 = em pé, 1 = agachado (para o pulo de montaria). */
    public void setCrouch(float c) {
        crouch = MathUtils.clamp(c, 0f, 1f);
    }

    /** Sentado sobre o donkey. */
    public void setSitting(boolean s) {
        sitting = s;
    }

    private void applyClip() {
        String clip;
        switch (current) {
            case JUMP: clip = jumpStanding ? "JumpParado" : "Jump"; break;
            case RUN: clip = "Run"; break;
            case WALK: clip = "Walk"; break;
            default: clip = "Idle"; break;
        }
        anim.animate(clip, -1, 1f, null, 0.15f);
    }

    public void dispose() {
        model.dispose();
    }
}
