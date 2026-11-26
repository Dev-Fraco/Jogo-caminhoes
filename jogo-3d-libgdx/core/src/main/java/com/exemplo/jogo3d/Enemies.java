package com.exemplo.jogo3d;

import com.badlogic.gdx.graphics.Camera;
import com.badlogic.gdx.graphics.g3d.Model;
import com.badlogic.gdx.graphics.g3d.ModelInstance;
import com.badlogic.gdx.math.MathUtils;
import com.badlogic.gdx.math.Vector3;
import com.badlogic.gdx.utils.Array;

import java.util.Random;

/**
 * Bando de cangaceiros: cria, atualiza, faz atirar no jogador (com chance de errar pela distância,
 * movimento e postura do jogador) e responde a raios (tiros) e explosões.
 * Quando o bando todo cai, outro chega depois de um tempo.
 */
final class Enemies {
    static final int COUNT = 10;
    private static final float WAVE_DELAY = 25f;

    final Array<Enemy> list = new Array<>();
    private final Model body;
    private final Model[] guns;
    private final Random rnd = new Random(1915);
    int kills = 0;
    private float waveT = -1f;
    private long frame = 0;
    /** Disparos dos inimigos neste quadro (para o som e o rastro): muzzle → ponto. */
    final Array<Vector3[]> shots = new Array<>();

    Enemies(World w, Model body, Model[] guns) {
        this.body = body;
        this.guns = guns;
        spawnWave(w, null);
    }

    void spawnWave(World w, Vector3 avoid) {
        list.clear();
        for (int i = 0; i < COUNT; i++) {
            float x = 0f, z = 0f;
            for (int t = 0; t < 30; t++) {
                if (i < 4 && w.houses.size > 0) {
                    Vector3 hp = w.houses.get(rnd.nextInt(w.houses.size)).t.getTranslation(new Vector3());
                    x = hp.x + (rnd.nextFloat() - 0.5f) * 14f;
                    z = hp.z + 6f + rnd.nextFloat() * 4f;
                } else {
                    float[] p = w.openSpot(rnd);
                    x = p[0];
                    z = p[1];
                }
                if (avoid == null || Math.hypot(x - avoid.x, z - avoid.z) > 45f) break;
            }
            Model g = guns != null && guns.length > 0 ? guns[rnd.nextInt(guns.length)] : null;
            list.add(new Enemy(body, g, x, z, rnd.nextFloat()));
        }
    }

    int alive() {
        int n = 0;
        for (int i = 0; i < list.size; i++) if (list.get(i).alive()) n++;
        return n;
    }

    long frame() { return frame; }

    /** Avança o quadro das hitboxes sem rodar o comportamento (testes). */
    void nextFrame() { frame++; }

    /**
     * Atualiza todos. Tiros dos inimigos que acertam vão para o Survival do jogador.
     * playerMove = velocidade do jogador; stance 0 em pé, 1 agachado, 2 deitado.
     */
    void update(float dt, World w, Vector3 playerPos, Survival sv, float playerMove, int stance, Camera cam, float drawDist) {
        frame++;
        shots.clear();
        boolean alive = sv == null || !sv.dead;
        float far = Math.max(drawDist, 150f);
        float near = far * far;
        for (int i = 0; i < list.size; i++) {
            Enemy e = list.get(i);
            float dx = e.pos.x - cam.position.x, dz = e.pos.z - cam.position.z;
            e.visibleToCam = dx * dx + dz * dz < near;
            if (e.update(dt, w, playerPos, alive, near)) enemyShot(e, playerPos, sv, playerMove, stance);
            // corpos somem depois de um tempo
            if (!e.alive() && e.deadT > 40f) { list.removeIndex(i); i--; }
        }
        if (alive() == 0) {
            if (waveT < 0f) waveT = WAVE_DELAY;
            waveT -= dt;
            if (waveT <= 0f) {
                waveT = -1f;
                spawnWave(w, playerPos);
            }
        }
    }

    private void enemyShot(Enemy e, Vector3 player, Survival sv, float playerMove, int stance) {
        float d = e.pos.dst(player);
        float p = 0.62f - d * 0.009f - playerMove * 0.05f - (stance == 1 ? 0.08f : stance == 2 ? 0.18f : 0f);
        p = MathUtils.clamp(p, 0.06f, 0.6f);
        Vector3 to = new Vector3(player).add(0f, stance == 2 ? 0.3f : stance == 1 ? 0.9f : 1.2f, 0f);
        boolean hitPlayer = MathUtils.random() < p;
        if (!hitPlayer) to.add(MathUtils.random(-1.2f, 1.2f), MathUtils.random(-0.6f, 1.2f), MathUtils.random(-1.2f, 1.2f));
        shots.add(new Vector3[]{new Vector3(e.muzzle), to});
        if (hitPlayer && sv != null) {
            WeaponConfig.Region r = MathUtils.random() < 0.12f ? WeaponConfig.Region.HEAD : WeaponConfig.Region.TORSO;
            sv.damage(WeaponConfig.RIFLE_INIMIGO.damageAt(r, d), true);
        }
    }

    /**
     * Raio contra todos os inimigos vivos (ou mortos, se includeDead), até maxT. Devolve o inimigo
     * atingido (o mais próximo) e preenche out; null se nada.
     */
    Enemy raycast(Vector3 o, Vector3 d, float maxT, boolean includeDead, Hitbox.Hit out) {
        out.t = maxT;
        out.region = null;
        Enemy best = null;
        for (int i = 0; i < list.size; i++) {
            Enemy e = list.get(i);
            if (!includeDead && !e.alive()) continue;
            // teste rápido antes de atualizar as cápsulas
            float ox = e.pos.x - o.x, oy = e.pos.y + 0.9f - o.y, oz = e.pos.z - o.z;
            float along = ox * d.x + oy * d.y + oz * d.z;
            if (along < -1.5f || along > maxT + 1.5f) continue;
            float px = ox - d.x * along, py = oy - d.y * along, pz = oz - d.z * along;
            if (px * px + py * py + pz * pz > 2.0f * 2.0f) continue;
            e.hitbox.update(frame);
            if (e.hitbox.raycast(o, d, out)) best = e;
        }
        return best;
    }

    /** Barulho de tiro/explosão: quem estiver no raio vem atrás. */
    void alert(Vector3 at, float radius) {
        for (int i = 0; i < list.size; i++) {
            Enemy e = list.get(i);
            if (e.alive() && e.pos.dst2(at) < radius * radius) e.hear();
        }
    }

    /** Explosão de granada: dano pela distância em todos que estiverem perto. */
    int explosion(Vector3 at, float radius, float maxDamage) {
        int killed = 0;
        alert(at, 90f);
        for (int i = 0; i < list.size; i++) {
            Enemy e = list.get(i);
            if (!e.alive()) continue;
            float d = at.dst(e.pos.x, e.pos.y + 0.9f, e.pos.z);
            if (d < radius) {
                float k = 1f - d / radius;
                if (e.damage(maxDamage * k * k + 8f * k, at)) { kills++; killed++; }
            }
        }
        return killed;
    }

    /** O que desenhar (corpo e arma), dentro da distância de desenho. */
    void collect(Array<ModelInstance> out) {
        for (int i = 0; i < list.size; i++) {
            Enemy e = list.get(i);
            if (!e.visibleToCam) continue;
            out.add(e.inst);
            if (e.gun != null) out.add(e.gun);
        }
    }
}
