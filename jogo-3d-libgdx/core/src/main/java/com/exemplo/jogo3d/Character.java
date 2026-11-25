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

    static final float MODEL_SCALE = 0.01f;
    static final float STATE_HOLD = 0.12f;   // tempo mínimo para trocar de animação (s)
    // Velocidade "natural" de cada animação (m/s), para sincronizar os passos com o movimento
    static final float WALK_CLIP_SPEED = 1.8f;   // medido no clipe: quadril anda ~1,8 m/s
    static final float RUN_CLIP_SPEED = 5.8f;    // medido no clipe: quadril anda ~5,8 m/s

    private enum State { IDLE, WALK, RUN, JUMP }

    final Array<ModelInstance> instances = new Array<>();
    private Model model;
    private ModelInstance instance;
    private AnimationController anim;

    private State current = State.IDLE;
    private State candidate = State.IDLE;
    private float candidateTime = 0f;

    public void create() {
        model = new G3dModelLoader(new JsonReader()).loadModel(Gdx.files.internal("models/player.g3dj"));
        instance = new ModelInstance(model);
        anim = new AnimationController(instance);
        instances.add(instance);
        anim.animate("walk", -1, 1f, null, 0.15f);
        anim.current.speed = 0f;   // começa parado (pose de andar congelada)
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
                anim.current.speed = 0f;
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
        anim.update(dt);
    }

    private void applyClip(Player p) {
        String clip;
        switch (current) {
            case JUMP: clip = "jump"; break;
            case RUN: clip = "run"; break;
            case WALK: clip = "walk"; break;
            default: clip = "walk"; break;   // parado: segura a pose do andar
        }
        anim.animate(clip, -1, 1f, null, 0.15f);
    }

    public void dispose() {
        model.dispose();
    }
}
