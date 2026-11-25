package com.exemplo.jogo3d;

import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.graphics.g3d.Model;
import com.badlogic.gdx.graphics.g3d.ModelInstance;
import com.badlogic.gdx.graphics.g3d.loader.G3dModelLoader;
import com.badlogic.gdx.graphics.g3d.utils.AnimationController;
import com.badlogic.gdx.math.MathUtils;
import com.badlogic.gdx.math.Vector3;
import com.badlogic.gdx.utils.Array;
import com.badlogic.gdx.utils.JsonReader;

/**
 * Personagem Mixamo (.g3dj) com animações "walk", "run" e "jump".
 *
 * Correções em relação à versão anterior:
 * - Troca de animação com histerese: só muda depois de ficar estável por um tempo
 *   (antes trocava a cada quadro e piscava entre pulo e caminhada).
 * - Velocidade da animação acompanha a velocidade real (sem "correr no lugar").
 * - O modelo gira para onde o jogador anda (vem do Player.facing).
 * - Escala 0.01 (modelo em centímetros -> 1.8 m).
 */
public class Character {

    // Cangaceiro (modelo principal): já está em metros, então escala 1. Frente do modelo = +z (igual ao Player.facing).
    static final float MODEL_SCALE = 1.0f;
    static final float STATE_HOLD = 0.12f;   // tempo mínimo para trocar de animação (s)
    // Velocidade "natural" de cada animação (m/s), para sincronizar os passos com o movimento
    static final float WALK_CLIP_SPEED = 1.8f;   // medido no clipe: quadril anda ~1,8 m/s
    static final float RUN_CLIP_SPEED = 5.8f;    // medido no clipe: quadril anda ~5,8 m/s
    // 1.0 = ritmo natural. (Antes estava 0.1 por causa de um bug de unidade: keytime em ms)
    static final float LIMB_SPEED_SCALE = 1.0f;

    private enum State { IDLE, WALK, RUN, JUMP }

    final Array<ModelInstance> instances = new Array<>();
    private Model model;
    private ModelInstance instance;
    private AnimationController anim;

    private float reach = 0f;   // 0..1: braço direito esticado (usado ao abrir a porteira)
    private final com.badlogic.gdx.math.Quaternion tmpQ = new com.badlogic.gdx.math.Quaternion();
    private final com.badlogic.gdx.math.Quaternion armBase = new com.badlogic.gdx.math.Quaternion();
    private com.badlogic.gdx.graphics.g3d.model.Node armNode;
    private boolean armOverridden = false;

    private State current = State.IDLE;
    private State candidate = State.IDLE;
    private float candidateTime = 0f;

    public void create() {
        model = new G3dModelLoader(new JsonReader()).loadModel(Gdx.files.internal("models/cangaceiro.g3dj"));
        instance = new ModelInstance(model);
        anim = new AnimationController(instance);
        instances.add(instance);
        armNode = instance.getNode("RightUpperArm");
        anim.animate("Idle", -1, 1f, null, 0.15f);
        anim.current.speed = 0f;
    }

    /**
     * Atualiza pose e animação a partir do estado do Player.
     * @param p estado de física (posição, direção, velocidade, chão)
     */
    public void update(Player p, float dt) {
        // Posição e rotação do modelo: os pés ficam no chão (pos.y), o corpo olha para facing
        instance.transform.setToTranslation(p.pos.x, p.pos.y, p.pos.z)
                .rotate(Vector3.Y, p.facing * MathUtils.radiansToDegrees)
                .scale(MODEL_SCALE, MODEL_SCALE, MODEL_SCALE);

        // Estado desejado pela física
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
                applyClip(p);
            }
        } else {
            candidate = current;
            candidateTime = 0f;
        }

        // Velocidade de reprodução acompanha o movimento real
        switch (current) {
            case IDLE:
                anim.current.speed = 1f;   // respiração do clipe Idle
                break;
            case WALK:
                anim.current.speed = MathUtils.clamp(p.speed / WALK_CLIP_SPEED, 0.6f, 1.3f);
                break;
            case RUN:
                anim.current.speed = MathUtils.clamp(p.speed / RUN_CLIP_SPEED, 0.7f, 1.3f);
                break;
            case JUMP:
                anim.current.speed = 1f;
                break;
        }
        anim.current.speed *= LIMB_SPEED_SCALE;
        // Desfaz o ajuste do braço do quadro anterior (senão ele gira sem parar)
        if (armOverridden) {
            armNode.rotation.set(armBase);
            armOverridden = false;
        }
        anim.update(dt);

        // Braço direito esticado para a frente (ex.: alcançar o cadeado da porteira)
        if (reach > 0.001f && armNode != null) {
            armBase.set(armNode.rotation);
            armNode.rotation.mulLeft(tmpQ.setFromAxisRad(Vector3.X, -reach * 1.2f));
            armOverridden = true;
            instance.calculateTransforms();
        }
    }

    /** 0 = braço solto, 1 = braço totalmente esticado para a frente. */
    public void setReach(float r) {
        reach = Math.max(0f, Math.min(1f, r));
    }

    private void applyClip(Player p) {
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
