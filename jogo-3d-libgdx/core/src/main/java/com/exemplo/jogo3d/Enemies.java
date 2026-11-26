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
    static final int COUNT = 1;    // um só: alvo parado ao lado do cemitério, para ajustar a mira

    final Array<Enemy> list = new Array<>();
    private final Model body;
    private final Model[] guns;
    private final Random rnd = new Random(1915);
    int kills = 0;
    private long frame = 0;
    /** Disparos dos inimigos neste quadro (para o som e o rastro): muzzle → ponto. */
    final Array<Vector3[]> shots = new Array<>();

    Enemies(World w, Model body, Model[] guns) {
        this.body = body;
        this.guns = guns;
        spawnTarget(w);
    }

    /** Põe o alvo parado: no chão, 5 m fora da cerca do cemitério, de frente para ele. */
    void spawnTarget(World w) {
        list.clear();
        float cx = w.hasCem ? w.cemX : 0f, cz = w.hasCem ? w.cemZ : 0f;
        float[][] offs = {{World.CEM_HW + 5f, 0f}, {-(World.CEM_HW + 5f), 0f}, {0f, World.CEM_HD + 5f},
                {0f, -(World.CEM_HD + 5f)}, {World.CEM_HW + 9f, 4f}};
        float bx = cx + offs[0][0], bz = cz + offs[0][1];
        for (float[] o : offs) {
            if (!blocked(w, cx + o[0], cz + o[1])) { bx = cx + o[0]; bz = cz + o[1]; break; }
        }
        Enemy e = new Enemy(body, null, bx, bz, 0.3f);
        e.dummy = true;
        e.pos.y = w.groundAt(bx, bz);
        e.facing = MathUtils.atan2(cx - bx, cz - bz);
        list.add(e);
    }

    /** Há algum obstáculo a menos de 1 m deste ponto? */
    private static boolean blocked(World w, float x, float z) {
        for (int i = 0; i < w.obstacles.size; i++) {
            World.Obstacle o = w.obstacles.get(i);
            if (Math.hypot(x - o.x, z - o.z) < o.radius + 1f) return true;
        }
        return false;
    }

    /** Partida nova: o alvo volta para o seu lugar. */
    void reset(World w) { spawnTarget(w); }

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
            if (!e.visibleToCam && e.alive()) {
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
