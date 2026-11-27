package com.exemplo.jogo3d;

import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.graphics.g3d.Model;
import com.badlogic.gdx.graphics.g3d.ModelInstance;
import com.badlogic.gdx.graphics.g3d.loader.G3dModelLoader;
import com.badlogic.gdx.graphics.g3d.model.Node;
import com.badlogic.gdx.graphics.g3d.utils.AnimationController;
import com.badlogic.gdx.math.MathUtils;
import com.badlogic.gdx.math.Matrix4;
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
    private float crouch = 0f;    // 0..1: agachado (pose por código: usada para o pulo de montaria e para o modelo sem clipe)
    // Agachar pelo botão: o clipe "Agachar" desce e segura; "LevantarAgachado" sobe
    private boolean agachadoWant = false;
    private int agachaEstado = 0;   // 0 em pé, 1 agachado (segurando), 2 levantando
    // Animação única (deitar, levantar)
    private String onceClip = null;
    private float onceT = 0f, onceDur = 1f;
    private boolean onceDone = false;
    private boolean onceLoop = false;
    private boolean armed = false;
    private float tiltPitch, tiltRoll, tiltPivot;   // pêndulo do paraquedas (graus) e altura do eixo

    /** Inclina o corpo em torno de um eixo acima dos pés (pendurado no paraquedas). */
    public void setTilt(float pitchDeg, float rollDeg, float pivotY) {
        tiltPitch = pitchDeg;
        tiltRoll = rollDeg;
        tiltPivot = pivotY;
    }      // com arma na mão: parado, fica mirando

    public void setArmed(boolean a) {
        if (armed == a) return;
        armed = a;
        if (onceClip == null) applyClip();
    }   // animação única que repete (ex.: queda livre)

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

    /** Modelos já carregados (cada personagem entra na memória uma vez só). */
    private static final java.util.Map<String, Model> MODELOS = new java.util.HashMap<>();
    private static final String[] NOS = {"RightUpperArm", "RightForeArm", "Hips", "Spine", "Spine1", "LeftUpperLeg", "RightUpperLeg", "LeftLowerLeg", "RightLowerLeg"};
    private String modelPath = null;

    public void create() {
        trocarModelo();
        loadSounds();
    }

    /** Modelo de um caminho (carregado uma vez e compartilhado). Usado pelos inimigos, que são sempre o Jake. */
    static Model modelo(String caminho) {
        Model m = MODELOS.get(caminho);
        if (m == null) {
            m = ModelIO.load(caminho);
            MODELOS.put(caminho, m);
        }
        return m;
    }

    /** Põe na cena a personagem escolhida (troca sem reiniciar o jogo; vale ao começar a próxima partida). */
    void trocarModelo() {
        String caminho = Personagens.caminho();
        if (caminho.equals(modelPath)) return;
        Model novo = MODELOS.get(caminho);
        if (novo == null) {
            novo = ModelIO.load(caminho);
            MODELOS.put(caminho, novo);
        }
        if (instance != null) instances.removeValue(instance, true);
        model = novo;
        modelPath = caminho;
        instance = new ModelInstance(model);
        anim = new AnimationController(instance);
        instances.add(instance);
        nodes.clear();
        for (String n : NOS) {
            Node node = instance.getNode(n);
            if (node != null) nodes.put(n, node);
        }
        anim.animate("Idle", -1, 1f, null, 0.15f);
        anim.current.speed = 0f;
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
        boolean stepping = onceClip == null && p.grounded
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
        onceLoop = false;
        com.badlogic.gdx.graphics.g3d.model.Animation a = model.getAnimation(clip);
        onceDur = a != null && a.duration > 0f ? a.duration : 1.2f;
        anim.animate(clip, 1, 1f, null, 0.2f);
    }

    /** Toca uma animação repetindo, fora do andar/parado, até endOnce() (ex.: "Falling" na queda livre). */
    public void playLoop(String clip) {
        onceClip = clip;
        onceT = 0f;
        onceDone = false;
        onceLoop = true;
        anim.animate(clip, -1, 1f, null, 0.25f);
    }

    public boolean onceFinished() {
        return onceClip == null || onceDone;
    }

    /** Sai da animação única e volta ao estado normal (andar, parado...). */
    public void endOnce() {
        onceClip = null;
        onceDone = false;
        onceLoop = false;
        current = State.IDLE;
        candidate = State.IDLE;
        applyClip();
    }

    /** Modelo do personagem (os moradores da cidade usam o mesmo, com roupas de outras cores). */
    Model model() { return model; }

    /** Posição da mão (osso da mão) no mundo; usada para as rédeas chegarem na mão. */
    public Vector3 handWorld(boolean left, Vector3 out) {
        Node n = instance.getNode(left ? "LeftHand" : "RightHand");
        if (n == null) return instance.transform.getTranslation(out).add(0f, 1.2f, 0f);
        return out.set(0f, 0f, 0f).mul(n.globalTransform).mul(instance.transform);
    }

    /**
     * Atualiza pose e animação a partir do estado do Player.
     */
    public void update(Player p, float dt) {
        smoothArm(dt);
        instance.transform.setToTranslation(p.pos.x, p.pos.y, p.pos.z)
                .rotate(Vector3.Y, p.facing * MathUtils.radiansToDegrees);
        if (tiltPitch != 0f || tiltRoll != 0f) {
            // pendurado no paraquedas: balança em torno do centro do velame
            instance.transform.translate(0f, tiltPivot, 0f).rotate(Vector3.X, -tiltPitch).rotate(Vector3.Z, tiltRoll)
                    .translate(0f, -tiltPivot, 0f);
        }
        instance.transform.scale(MODEL_SCALE, MODEL_SCALE, MODEL_SCALE);

        atualizaAgachar(p);
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
        for (java.util.Map.Entry<Node, Matrix4> e : savedLocal.entrySet()) e.getKey().localTransform.set(e.getValue());
        savedLocal.clear();
        if (onceClip != null) {
            if (onceLoop) {
                anim.update(dt);
            } else if (!onceDone) {
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
        boolean still = !armed && p.grounded && current == State.IDLE && p.speed < 0.25f
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
        // Braço da arma: mirar (à frente), coice (antebraço), recarga (ao peito), guardar/sacar (baixo).
        // Os ossos animados são escritos pela animação a cada quadro: a pose vai sobre a transformação local.
        if (armAim > 0.001f) localRot("RightUpperArm", ARM_AIM_AXIS, armAim * ARM_AIM_DEG);
        if (armKick > 0.001f) localRot("RightForeArm", ARM_KICK_AXIS, armKick * ARM_KICK_DEG);
        if (armReload > 0.001f) localRot("RightUpperArm", ARM_RELOAD_AXIS, armReload * ARM_RELOAD_DEG);
        if (armLower > 0.001f) localRot("RightUpperArm", ARM_LOWER_AXIS, armLower * ARM_LOWER_DEG);
        if (lean > 0.001f) localRot("Spine1", Vector3.X, lean * 16f);   // corpo inclina para trás ao levar tiro
        if (crouch > 0.001f) {
            float c = crouch;
            addX("Hips", -25f * c);
            addX("Spine", 10f * c);
            addX("LeftUpperLeg", -62f * c);
            addX("RightUpperLeg", -62f * c);
            addX("LeftLowerLeg", 70f * c);
            addX("RightLowerLeg", 70f * c);
        }
        for (java.util.Map.Entry<String, Quaternion> e : extra.entrySet()) {
            Node node = nodes.get(e.getKey());
            if (node == null) continue;
            saved.put(e.getKey(), new Quaternion(node.rotation));
            node.rotation.mulLeft(e.getValue());
        }
    }

    // Eixos e ângulos da pose do braço (medidos no modelo: ver testes-mira/AnimTests)
    static final Vector3 ARM_AIM_AXIS = new Vector3(1f, 0f, 0f), ARM_KICK_AXIS = new Vector3(1f, 0f, 0f),
            ARM_RELOAD_AXIS = new Vector3(0f, 0f, 1f), ARM_LOWER_AXIS = new Vector3(0f, 0f, 1f);
    static final float ARM_AIM_DEG = 75f, ARM_KICK_DEG = 12f, ARM_RELOAD_DEG = 45f, ARM_LOWER_DEG = 80f;
    private final java.util.HashMap<Node, Matrix4> savedLocal = new java.util.HashMap<>();
    private final Matrix4 ovM = new Matrix4();

    /** Gira o osso em torno do eixo LOCAL dele, sobre a transformação que a animação escreveu (desfeito no quadro seguinte). */
    private void localRot(String name, Vector3 axis, float deg) {
        Node node = nodes.get(name);
        if (node == null) return;
        if (!savedLocal.containsKey(node)) savedLocal.put(node, new Matrix4(node.localTransform));
        ovM.idt().rotate(axis, deg);
        node.localTransform.mul(ovM);
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

    // Pose do braço e do corpo, suavizada: os alvos vêm do jogo a cada quadro
    private float armAim, armKick, armReload, armLower, lean;
    private float tAim, tKick, tReload, tLower, tLean;

    /**
     * aim: 0..1 braço da arma à frente (mirando); kick: 0..1 coice do tiro (antebraço); reload: 0..1 arma ao peito;
     * lower: 0..1 braço baixo (guardar, ou sacar no começo); lean: 0..1 corpo para trás (levou tiro).
     */
    public void setArmPose(float aim, float kick, float reload, float lower, float leanBack) {
        tAim = MathUtils.clamp(aim, 0f, 1f);
        tKick = MathUtils.clamp(kick, 0f, 1f);
        tReload = MathUtils.clamp(reload, 0f, 1f);
        tLower = MathUtils.clamp(lower, 0f, 1f);
        tLean = MathUtils.clamp(leanBack, 0f, 1f);
    }

    /** Suaviza a pose: os braços não pulam de um quadro para o outro. */
    private void smoothArm(float dt) {
        float k = Math.min(1f, dt * 10f), kk = Math.min(1f, dt * 25f);   // coice é rápido; o resto é suave
        armAim += (tAim - armAim) * k;
        armKick += (tKick - armKick) * kk;
        armReload += (tReload - armReload) * k;
        armLower += (tLower - armLower) * k;
        lean += (tLean - lean) * k;
    }

    /** Instância do modelo (testes). */
    ModelInstance instance() { return instance; }

    /** Posição mundial de um osso (testes e efeitos). */
    public Vector3 nodeWorld(String name, Vector3 out) {
        Node n = instance.getNode(name);
        if (n == null) return out.set(0f, 0f, 0f);
        return out.set(0f, 0f, 0f).mul(n.globalTransform).mul(instance.transform);
    }

    /** 0 = braço solto, 1 = braço totalmente esticado para a frente. */
    public void setReach(float r) {
        reach = MathUtils.clamp(r, 0f, 1f);
    }

    /** 0 = em pé, 1 = agachado (para o pulo de montaria). */
    public void setCrouch(float c) {
        crouch = MathUtils.clamp(c, 0f, 1f);
    }

    /**
     * Agachar pelo botão: usa o clipe "Agachar" do modelo (desce e segura; sobe com "LevantarAgachado").
     * Sem o clipe no modelo, cai na pose por código.
     */
    public void setAgachado(boolean want) {
        agachadoWant = want;
        if (!temClipeAgachar() && want) crouch = 1f;
    }

    private boolean temClipeAgachar() {
        return model != null && model.getAnimation("Agachar") != null && model.getAnimation("LevantarAgachado") != null;
    }

    private static boolean ehClipeAgachar(String clip) {
        return "Agachar".equals(clip) || "LevantarAgachado".equals(clip);
    }

    /** Fica agachado enquanto parado; ao andar, levanta na hora; ao parar de agachar, sobe pelo clipe. */
    private void atualizaAgachar(Player p) {
        if (!temClipeAgachar()) return;
        if (agachaEstado != 0 && !ehClipeAgachar(onceClip)) agachaEstado = 0;   // outra animação única (morrer, deitar) tomou conta
        boolean parado = p.grounded && p.speed < 0.25f;
        switch (agachaEstado) {
            case 0:
                if (agachadoWant && parado && onceClip == null) {
                    agachaEstado = 1;
                    playOnce("Agachar");
                }
                break;
            case 1:
                if (!agachadoWant || !parado) {
                    if (parado) {                 // parou de agachar: sobe pelo clipe
                        agachaEstado = 2;
                        playOnce("LevantarAgachado");
                    } else {                      // andou: levanta na hora
                        agachaEstado = 0;
                        endOnce();
                    }
                }
                break;
            case 2:
                if (agachadoWant || !parado) {    // voltou a agachar ou andou: corta o levantar
                    agachaEstado = 0;
                    endOnce();
                } else if (onceFinished()) {
                    agachaEstado = 0;
                    endOnce();
                }
                break;
            default:
                agachaEstado = 0;
        }
    }

    private void applyClip() {
        String clip;
        switch (current) {
            case JUMP: clip = jumpStanding ? "JumpParado" : "Jump"; break;
            case RUN: clip = "Run"; break;
            case WALK: clip = "Walk"; break;
            default: clip = armed ? "Mirar" : "Idle"; break;
        }
        anim.animate(clip, -1, 1f, null, 0.15f);
    }

    public void dispose() {
        for (Model m : MODELOS.values()) m.dispose();
        MODELOS.clear();
        model = null;
        modelPath = null;
    }
}
