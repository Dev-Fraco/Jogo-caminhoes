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
        World.Obstacle obstacle;   // muro que parou o tiro (para o dano na parede), ou null
        Enemy enemy;
        WeaponConfig.Region region;
        int bone;            // cápsula atingida (diz qual membro)
        final Vector3 point = new Vector3();
        float distance;      // do cano até o ponto (para a queda de dano)
        boolean hitWorld;    // acertou chão/parede (para a poeira)
        Surface surface = Surface.TERRA;   // material atingido (mundo ou carne)
        final Vector3 normal = new Vector3(0f, 1f, 0f);
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
        out.obstacle = null;
        out.hitWorld = false;
        // começa na altura do personagem, ao longo do raio da câmera
        float skip = Math.max(0f, (muzzle.x - cam.x) * dir.x + (muzzle.y - cam.y) * dir.y + (muzzle.z - cam.z) * dir.z);
        start.set(cam).mulAdd(dir, skip);
        float tWorld = w.raycast(start, dir, range);
        World.Obstacle firstHit = w.hitObstacle;
        out.surface = w.hitSurface;
        out.normal.set(w.hitNormal);
        Enemy e = enemies != null ? enemies.raycast(start, dir, tWorld, false, hit) : null;
        if (e != null) {
            out.point.set(hit.point);
            out.surface = Surface.CARNE;
            out.normal.set(dir).scl(-1f);
        } else {
            out.point.set(start).mulAdd(dir, tWorld);
            out.hitWorld = tWorld < range;
            out.obstacle = out.hitWorld ? firstHit : null;
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
                out.surface = w.hitSurface;   // a parede que o cano encontrou, não o alvo atrás dela
                out.obstacle = w.hitObstacle;
                out.normal.set(w.hitNormal);
                e = null;
                len = block;
            }
        }
        out.distance = len;
        if (e != null) {
            out.obstacle = null;
            out.enemy = e;
            out.region = hit.region;
            out.bone = hit.bone;
        }
        return out;
    }
}
