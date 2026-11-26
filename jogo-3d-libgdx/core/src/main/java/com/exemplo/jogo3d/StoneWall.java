package com.exemplo.jogo3d;

import com.badlogic.gdx.graphics.g3d.Model;
import com.badlogic.gdx.graphics.g3d.ModelInstance;
import com.badlogic.gdx.math.Vector3;
import com.badlogic.gdx.utils.Array;

/**
 * Muro de pedra e taipa em U, posto pelo jogador. Sai do chão em 1,4 s (sobe com desaceleração).
 * A origem do modelo é o meio da boca do U (z = 0); a curva fica para -z, em local.
 * A colisão são círculos ao longo das peças (lidos de models/parede_taipa_colisao.json).
 */
final class StoneWall {
    static final float HEIGHT = 1.895f;    // altura acima da base
    static final float RISE_TIME = 1.4f;   // tempo de subida
    static final float START = -2.1f;      // começa abaixo do chão (o topo e os postes somem)

    final ModelInstance mi;
    final float x, z, groundY, yawDeg;
    final Array<World.Obstacle> cols = new Array<>();
    private float t = 0f;

    StoneWall(Model model, float x, float groundY, float z, float yawDeg) {
        this.mi = new ModelInstance(model);
        this.x = x;
        this.z = z;
        this.groundY = groundY;
        this.yawDeg = yawDeg;
        apply(0f);
    }

    /** Avança a subida. Devolve true quando o muro já está inteiro. */
    boolean update(float dt) {
        t = Math.min(RISE_TIME, t + dt);
        apply(t);
        return t >= RISE_TIME;
    }

    boolean risen() { return t >= RISE_TIME; }

    private void apply(float time) {
        float k = time / RISE_TIME;
        float e = 1f - (1f - k) * (1f - k) * (1f - k);   // desaceleração ao chegar
        float y = groundY + START * (1f - e);
        mi.transform.setToTranslation(x, y, z).rotate(Vector3.Y, yawDeg);
    }
}
