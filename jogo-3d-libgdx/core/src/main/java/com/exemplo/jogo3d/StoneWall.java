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
    /** Dano para quebrar o muro. As rachaduras aparecem a cada impacto (World.tickWalls). */
    static final float HP = 400f;
    float hp = HP;
    /** Dono do muro: World.JOGADOR ou o inimigo que o pôs (o limite de muros é por dono). */
    Object dono;
    /** Matriz de repouso do muro e tremor restante depois de um impacto (segundos). */
    final com.badlogic.gdx.math.Matrix4 base = new com.badlogic.gdx.math.Matrix4();
    float tremor = 0f;
    /** Rachaduras na face do muro; cada uma cresce até o tamanho final. */
    final Array<Racha> rachas = new Array<>();

    /** Uma rachadura: fina, na face do muro, com a direção e o tamanho sorteados no impacto. */
    static final class Racha {
        final ModelInstance mi;
        final Vector3 pos;
        final float yawDeg, tiltDeg, comp;
        float crescimento = 0f;   // 0 a 1

        Racha(Model m, Vector3 pos, float yawDeg, float tiltDeg, float comp) {
            this.mi = new ModelInstance(m);
            this.pos = pos;
            this.yawDeg = yawDeg;
            this.tiltDeg = tiltDeg;
            this.comp = comp;
        }

        void aplica() {
            float k = Math.max(0.05f, crescimento);
            mi.transform.setToTranslation(pos).rotate(Vector3.Y, yawDeg).rotate(Vector3.Z, tiltDeg).scale(comp * k, 0.03f, 0.012f);
        }
    }

    StoneWall(Model model, float x, float groundY, float z, float yawDeg) {
        this.mi = new ModelInstance(model);
        this.x = x;
        this.z = z;
        this.groundY = groundY;
        this.yawDeg = yawDeg;
        transform(x, groundY, z, yawDeg, mi.transform);
        base.set(mi.transform);
    }
}
