package com.exemplo.jogo3d;

import com.badlogic.gdx.graphics.g3d.Model;
import com.badlogic.gdx.graphics.g3d.ModelInstance;
import com.badlogic.gdx.math.Vector3;
import com.badlogic.gdx.utils.Array;

/**
 * Muro de pedra e taipa em U, posto pelo jogador: aparece de uma vez.
 * A origem do modelo é o meio da boca do U (z = 0); a curva fica para -z, em local.
 * A colisão são círculos ao longo das peças (lidos de models/parede_taipa_colisao.json).
 */
final class StoneWall {
    static final float HEIGHT = 2.3f;     // altura acima da base (o personagem não fica mais alto que o muro)
    static final float MODEL_HEIGHT = 1.895f;   // altura do modelo original
    static final float SCALE_Y = HEIGHT / MODEL_HEIGHT;

    /** Transformação do muro: na base (x, y, z), girado e esticado para a altura HEIGHT. */
    static com.badlogic.gdx.math.Matrix4 transform(float x, float y, float z, float yawDeg, com.badlogic.gdx.math.Matrix4 out) {
        return out.setToTranslation(x, y, z).rotate(Vector3.Y, yawDeg).scale(1f, SCALE_Y, 1f);
    }

    final ModelInstance mi;
    final float x, z, groundY, yawDeg;
    final Array<World.Obstacle> cols = new Array<>();
    static final float HP = 600f;   // dano para quebrar o muro
    float hp = HP;

    StoneWall(Model model, float x, float groundY, float z, float yawDeg) {
        this.mi = new ModelInstance(model);
        this.x = x;
        this.z = z;
        this.groundY = groundY;
        this.yawDeg = yawDeg;
        transform(x, groundY, z, yawDeg, mi.transform);
    }
}
