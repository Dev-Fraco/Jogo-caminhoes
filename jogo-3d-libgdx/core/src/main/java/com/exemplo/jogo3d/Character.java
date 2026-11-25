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
 * Personagem real (Mixamo, convertido para .g3dj).
 * Animações: "walk" (andar), "run" (correr) e "jump" (no ar).
 * O modelo está em centímetros, por isso a escala é 0.01 (1.8 m de altura).
 */
public class Character {

    static final float MODEL_SCALE = 0.01f;

    final Array<ModelInstance> instances = new Array<>();
    private Model model;
    private ModelInstance instance;
    private AnimationController anim;
    private String current = "";

    public void create() {
        model = new G3dModelLoader(new JsonReader()).loadModel(Gdx.files.internal("models/player.g3dj"));
        instance = new ModelInstance(model);
        anim = new AnimationController(instance);
        instances.add(instance);
        play("walk");
        anim.current.speed = 0f; // começa parado
    }

    private void play(String name) {
        if (name.equals(current)) return;
        current = name;
        anim.animate(name, -1, 1f, null, 0.2f);
    }

    /**
     * @param speed01 0 = parado, 0..1 = andando, perto de 1 = correndo
     * @param grounded se está no chão
     */
    public void update(float x, float y, float z, float yawRad, float speed01, boolean grounded, float dt) {
        instance.transform.setToTranslation(x, y, z)
                .rotate(Vector3.Y, yawRad * MathUtils.radiansToDegrees)
                .scale(MODEL_SCALE, MODEL_SCALE, MODEL_SCALE);

        if (!grounded) {
            play("jump");
            anim.current.speed = 1f;
        } else if (speed01 > 0.85f) {
            play("run");
            anim.current.speed = 1f;
        } else if (speed01 > 0.05f) {
            play("walk");
            anim.current.speed = 0.6f + 0.6f * speed01;
        } else {
            play("walk");
            anim.current.speed = 0f; // parado: segura a pose
        }
        anim.update(dt);
    }

    public void dispose() {
        model.dispose();
    }
}
