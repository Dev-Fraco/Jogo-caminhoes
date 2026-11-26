package com.exemplo.jogo3d;

import com.badlogic.gdx.math.Vector3;
import com.badlogic.gdx.utils.Array;

/**
 * Fogueiras acesas pelo jogador com lenha (no máximo 3, para o mapa não ficar cheio de chamas). Perto de
 * uma fogueira o jogador se aquece e recupera vida devagar. As chamas ficam no mapa até o fim da sessão.
 */
final class Camp {
    static final int MAX = 3;
    static final float RANGE = 4f;   // raio de calor (m)
    static final float WARMTH = 2f;  // vida por segundo perto da fogueira
    private final Array<Vector3> fires = new Array<>();

    /** Acende uma fogueira em p. Devolve false se já há o máximo. */
    boolean light(Vector3 p, World w) {
        if (fires.size >= MAX) return false;
        Vector3 at = new Vector3(p);
        fires.add(at);
        w.lightFire(at);
        return true;
    }

    /** Vida por segundo de aquecimento em p (0 se longe de todas as fogueiras). */
    float warmth(Vector3 p) {
        for (int i = 0; i < fires.size; i++) {
            Vector3 f = fires.get(i);
            float dx = f.x - p.x, dz = f.z - p.z;
            if (dx * dx + dz * dz < RANGE * RANGE) return WARMTH;
        }
        return 0f;
    }

    int count() { return fires.size; }
}
