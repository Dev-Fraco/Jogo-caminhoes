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
    static final float HEIGHT = 1.895f;   // altura acima da base

    final ModelInstance mi;
    final float x, z, groundY, yawDeg;
    final Array<World.Obstacle> cols = new Array<>();

    StoneWall(Model model, float x, float groundY, float z, float yawDeg) {
        this.mi = new ModelInstance(model);
        this.x = x;
        this.z = z;
        this.groundY = groundY;
        this.yawDeg = yawDeg;
        mi.transform.setToTranslation(x, groundY, z).rotate(Vector3.Y, yawDeg);
    }
}
