package com.exemplo.jogo3d;

import com.badlogic.gdx.graphics.g3d.ModelInstance;
import com.badlogic.gdx.math.Vector3;

/** Carroça: modelo, posição no chão e se está presa ao cavalo (então segue o cavalo). */
final class Cart {
    final ModelInstance inst;
    final Vector3 pos = new Vector3();
    boolean attached = false;
    World.Obstacle obstacle;   // colisão, enquanto a carroça está solta

    Cart(ModelInstance inst, World.Obstacle obstacle, Vector3 pos) {
        this.inst = inst;
        this.obstacle = obstacle;
        this.pos.set(pos);
    }
}
