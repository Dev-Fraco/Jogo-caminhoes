package com.exemplo.jogo3d;

import com.badlogic.gdx.math.Vector3;

/**
 * Registro dos tiros (raio instantâneo, sem projétil):
 * 1. O raio sai da câmera, na direção da mira (com a dispersão da arma), começando na altura do
 *    personagem (o que fica entre a câmera e o personagem não conta).
 * 2. Acha o primeiro obstáculo do mundo e, antes dele, o primeiro inimigo (a cápsula mais próxima:
 *    uma região só por raio).
 * 3. Confere do CANO da arma até esse ponto: se houver parede no meio (personagem encostado numa
 *    quina, câmera vendo por cima), o tiro para na parede. Assim nunca atravessa construções.
 */
final class HitDetection {
    /** Resultado reutilizado (sem criar objetos a cada tiro). */
    static final class Result {
        Enemy enemy;
        WeaponConfig.Region region;
        final Vector3 point = new Vector3();
        float distance;      // do cano até o ponto (para a queda de dano)
        boolean hitWorld;    // acertou chão/parede (para a poeira)
    }

    private final Hitbox.Hit hit = new Hitbox.Hit();
    private final Vector3 start = new Vector3(), toPoint = new Vector3();

    /**
     * @param cam    posição da câmera
     * @param dir    direção do tiro (normalizada, já com dispersão)
     * @param muzzle ponta do cano
     */
    Result shoot(Vector3 cam, Vector3 dir, Vector3 muzzle, float range, Enemies enemies, World w, Result out) {
        out.enemy = null;
        out.region = null;
        out.hitWorld = false;
        // começa na altura do personagem, ao longo do raio da câmera
        float skip = Math.max(0f, (muzzle.x - cam.x) * dir.x + (muzzle.y - cam.y) * dir.y + (muzzle.z - cam.z) * dir.z);
        start.set(cam).mulAdd(dir, skip);
        float tWorld = w.raycast(start, dir, range);
        Enemy e = enemies != null ? enemies.raycast(start, dir, tWorld, false, hit) : null;
        if (e != null) {
            out.point.set(hit.point);
        } else {
            out.point.set(start).mulAdd(dir, tWorld);
            out.hitWorld = tWorld < range;
        }
        // Do cano até o ponto: parede no meio?
        toPoint.set(out.point).sub(muzzle);
        float len = toPoint.len();
        if (len > 0.05f) {
            toPoint.scl(1f / len);
            float block = w.raycast(muzzle, toPoint, len - 0.05f);
            if (block < len - 0.06f) {
                out.point.set(muzzle).mulAdd(toPoint, block);
                out.hitWorld = true;
                e = null;
                len = block;
            }
        }
        out.distance = len;
        if (e != null) {
            out.enemy = e;
            out.region = hit.region;
        }
        return out;
    }
}
