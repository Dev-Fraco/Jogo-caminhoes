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
    static final int COUNT = 80;   // bandos do battle royale: todos saltam do avião
    private static final float WAVE_DELAY = 25f;

    final Array<Enemy> list = new Array<>();
    private final Model body;
    private final Model[] guns;
    Airplane air;                  // avião de onde saltam os bots
    boolean released;              // o jogador saltou: os bots também saltam (no seu tempo)
    private final Random rnd = new Random(1915);
    int kills = 0;
    private float waveT = -1f;
    private long frame = 0;
    /** Disparos dos inimigos neste quadro (para o som e o rastro): muzzle → ponto. */
    final Array<Vector3[]> shots = new Array<>();

    Enemies(World w, Model body, Model[] guns) {
        this.body = body;
        this.guns = guns;
        air = w.airplane;
        spawnWave(w, null);
    }

    void spawnWave(World w, Vector3 avoid) { spawnMore(w, avoid, COUNT); }

    /** Põe mais n bots (longe do jogador). */
    /** Os bots saltam (chamado quando o jogador salta). */
    void release() { released = true; }

    /** Bando no avião: fila de saída, cada fileira salta um pouco depois da outra. */
    void spawnDrop(int n) {
        for (int i = 0; i < n; i++) {
            Enemy e = new Enemy(body, null, 0f, 0f, rnd.nextFloat());
            int row = i / 8, col = i % 8;
            e.planDrop(row * 0.7f + MathUtils.random(0f, 0.4f), (row - 4.5f) * 5f, (col - 3.5f) * 3f, air);
            list.add(e);
        }
    }

    void spawnMore(World w, Vector3 avoid, int n) {
        if (air != null) {
            spawnDrop(n);
            return;
        }
        for (int i = 0; i < n; i++) {
            float x = 0f, z = 0f;
            for (int t = 0; t < 30; t++) {
                if (i % 3 == 0 && w.houses.size > 0) {
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
            list.add(new Enemy(body, null, x, z, rnd.nextFloat()));   // sem arma: pega no chão
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
            e.closeToCam = dx * dx + dz * dz < 60f * 60f;
            boolean fired;
            if (!e.visibleToCam && !e.airborne() && e.alive()) {
                // longe da câmera: atualiza a cada 3 quadros com o tempo acumulado (economia no celular)
                e.lodT += dt;
                if ((frame + i) % 3 != 0) continue;
                fired = e.update(e.lodT, w, this, playerPos, alive);
                e.lodT = 0f;
            } else {
                e.lodT = 0f;
                fired = e.update(dt, w, this, playerPos, alive);
            }
            if (fired) enemyShot(e, playerPos, sv, playerMove, stance);
            // corpos somem depois de um tempo; a arma que tinham cai no chão
            if (!e.alive() && e.deadT > 40f) {
                if (e.weapon != null) w.weapons.dropAt(w, e.weapon, e.pos.x, e.pos.z);
                list.removeIndex(i);
                i--;
            }
        }
        // Sobraram poucos (eles se matam): depois de um tempo chegam mais jogadores
        int left = alive();
        if (left <= 2) {
            if (waveT < 0f) waveT = WAVE_DELAY;
            waveT -= dt;
            if (waveT <= 0f) {
                waveT = -1f;
                spawnMore(w, playerPos, COUNT - left);
            }
        } else {
            waveT = -1f;
        }
    }

    /** Bot atirando em outro bot: acerta ou erra pela distância e movimento do alvo; o atingido revida. */
    private void botShot(Enemy e, Enemy t) {
        float d = e.pos.dst(t.pos);
        float p = MathUtils.clamp(0.55f - d * 0.009f - t.vel.len() * 0.04f, 0.06f, 0.5f);
        Vector3 to = new Vector3(t.pos).add(0f, 1.2f, 0f);
        boolean hit = MathUtils.random() < p;
        if (!hit) to.add(MathUtils.random(-1.2f, 1.2f), MathUtils.random(-0.6f, 1.2f), MathUtils.random(-1.2f, 1.2f));
        shots.add(new Vector3[]{new Vector3(e.muzzle), to});
        if (hit) {
            WeaponConfig.Region r = MathUtils.random() < 0.12f ? WeaponConfig.Region.HEAD : WeaponConfig.Region.TORSO;
            if (t.damage(WeaponConfig.RIFLE_INIMIGO.damageAt(r, d), e.pos)) e.botKills++;
            else t.retaliate(e);
        }
        alert(e.muzzle, 35f, e);   // o tiro chama quem estiver perto
    }

    private void enemyShot(Enemy e, Vector3 player, Survival sv, float playerMove, int stance) {
        if (e.targetEnemy != null) {
            botShot(e, e.targetEnemy);
            return;
        }
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
            if (!includeDead && (!e.alive() || e.airborne())) continue;
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
    void alert(Vector3 at, float radius) { alert(at, radius, null); }

    void alert(Vector3 at, float radius, Enemy except) {
        for (int i = 0; i < list.size; i++) {
            Enemy e = list.get(i);
            if (e != except && e.alive() && e.pos.dst2(at) < radius * radius) e.hear(at);
        }
    }

    /** Explosão de granada: dano pela distância em todos que estiverem perto. */
    int explosion(Vector3 at, float radius, float maxDamage) {
        int killed = 0;
        alert(at, 60f);
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
