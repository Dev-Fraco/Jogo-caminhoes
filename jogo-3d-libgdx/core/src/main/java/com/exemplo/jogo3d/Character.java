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

    private final Quaternion tmpQ = new Quaternion();
    private final java.util.Map<String, Node> nodes = new java.util.HashMap<>();
    private final java.util.Map<String, Quaternion> saved = new java.util.HashMap<>();   // rotação da animação
    private final java.util.Map<String, Quaternion> extra = new java.util.HashMap<>();   // ajuste do quadro

    private State current = State.IDLE;
    private State candidate = State.IDLE;
    private float candidateTime = 0f;

    public void create() {
        model = new G3dModelLoader(new JsonReader()).loadModel(Gdx.files.internal("models/cangaceiro.g3dj"));
        instance = new ModelInstance(model);
        anim = new AnimationController(instance);
        instances.add(instance);
        for (String n : new String[]{"RightUpperArm", "Hips", "Spine", "LeftUpperLeg", "RightUpperLeg", "LeftLowerLeg", "RightLowerLeg"}) {
            Node node = instance.getNode(n);
            if (node != null) nodes.put(n, node);
        }
        anim.animate("Idle", -1, 1f, null, 0.15f);
        anim.current.speed = 0f;
    }

    /**
     * Atualiza pose e animação a partir do estado do Player.
     * Se o personagem estiver montado (sitting), o Player não é usado para a pose de andar.
     */
    public void update(Player p, float dt) {
        instance.transform.setToTranslation(p.pos.x, p.pos.y, p.pos.z)
                .rotate(Vector3.Y, p.facing * MathUtils.radiansToDegrees)
                .scale(MODEL_SCALE, MODEL_SCALE, MODEL_SCALE);

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

        // 1) desfaz o ajuste do quadro anterior; 2) toca a animação; 3) aplica as poses por código
        for (java.util.Map.Entry<String, Quaternion> e : saved.entrySet()) {
            nodes.get(e.getKey()).rotation.set(e.getValue());
        }
        saved.clear();
        anim.update(dt);
        applyPoses();
        instance.calculateTransforms();
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
            case JUMP: clip = "Jump"; break;
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
