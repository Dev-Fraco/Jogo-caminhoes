package com.exemplo.jogo3d;

import com.badlogic.gdx.math.MathUtils;
import com.badlogic.gdx.math.Vector3;

/**
 * Escolhe o alvo da assistência de mira.
 *
 * Critérios: distância angular até a mira (o principal: quem está perto do centro da tela, não
 * quem está perto do personagem), distância real, campo de visão, vivo, e linha de visão livre
 * (chão, paredes e construções bloqueiam; basta a cabeça, o peito OU o quadril aparecer).
 * O alvo atual tem preferência: só troca se outro for claramente melhor (evita ficar pulando
 * entre dois inimigos lado a lado). Raios de visão: no máximo 3 por varredura, ~10 por segundo.
 */
final class TargetDetection {
    private static final float SCAN_EVERY = 0.1f;
    private static final float KEEP = 0.6f;          // outro alvo precisa ser 40% melhor para trocar
    private static final float FOV_HALF_DEG = 38f;    // fora disso não conta (fora da tela)

    Enemy target;
    private float targetScore = Float.MAX_VALUE;
    private float scanT;
    private final Vector3 q = new Vector3(), tmp = new Vector3();
    private final Enemy[] cand = new Enemy[3];
    private final float[] candScore = new float[3];
    int switches = 0;   // trocas de alvo (para os testes)

    /**
     * @param cam    posição da câmera
     * @param dir    direção da mira (normalizada)
     * @param radius raio de atração (graus)
     */
    void update(float dt, Vector3 cam, Vector3 dir, Enemies enemies, World w, float radius, float range) {
        update(dt, cam, dir, enemies, w, radius, range, false);
    }

    /**
     * Pontuação do alvo (menor = melhor) usada na escolha. ang/radius: quão perto do centro da mira.
     * Termo de distância (só com DistPriority ligada): coef × 0,25 × clamp(dist, min, max) / alcance.
     * Com os padrões (prioridade ligada, coef 1, min 0, max 1000) é a fórmula de sempre.
     */
    static float pontuacao(float ang, float radius, float dist, float range) {
        float termo = 0f;
        if (AimTuning.distPriority) {
            float d = MathUtils.clamp(dist, AimTuning.distPrioMin, AimTuning.distPrioMax);
            termo = AimTuning.distPrioCoef * 0.25f * d / Math.max(1f, range);
        }
        return ang / radius + termo;
    }

    /** Com o tiro apertado (firing), o alvo fica travado mesmo com a mira subindo bem para fora do cone: a força de volta segue atuando. */
    void update(float dt, Vector3 cam, Vector3 dir, Enemies enemies, World w, float radius, float range, boolean firing) {
        // Alvo morto ou longe demais da mira: larga na hora (não acompanha mortos)
        if (target != null) {
            if (!target.alive()) drop();
            else {
                target.hitbox.update(enemies.frame());
                float ang = angleTo(cam, dir, target.hitbox);
                float soltaEm = firing ? Math.max(radius * 1.5f, 40f) : radius * 1.5f;
                if (ang > soltaEm || cam.dst(target.pos) > range) drop();
            }
        }
        scanT -= dt;
        if (scanT > 0f) return;
        scanT = SCAN_EVERY;

        int n = 0;
        for (int i = 0; i < 3; i++) { cand[i] = null; candScore[i] = Float.MAX_VALUE; }
        for (int i = 0; i < enemies.list.size; i++) {
            Enemy e = enemies.list.get(i);
            if (!e.alive()) continue;
            float dist = cam.dst(e.pos);
            if (dist > range || dist < 0.8f) continue;
            // atrás da câmera ou fora do campo de visão: nem calcula as cápsulas
            tmp.set(e.pos).add(0f, 1f, 0f).sub(cam);
            float cos = tmp.dot(dir) / Math.max(1e-3f, tmp.len());
            if (cos < MathUtils.cosDeg(FOV_HALF_DEG)) continue;
            e.hitbox.update(enemies.frame());
            float ang = angleTo(cam, dir, e.hitbox);
            if (ang > radius) continue;
            float score = pontuacao(ang, radius, dist, range);
            // guarda os 3 melhores
            for (int k = 0; k < 3; k++) {
                if (score < candScore[k]) {
                    for (int m = 2; m > k; m--) { cand[m] = cand[m - 1]; candScore[m] = candScore[m - 1]; }
                    cand[k] = e;
                    candScore[k] = score;
                    break;
                }
            }
            n++;
        }
        // O atual continua valendo? (visível e dentro de 1,35× o raio)
        boolean currentOk = false;
        if (target != null) {
            float ang = angleTo(cam, dir, target.hitbox);
            currentOk = ang < radius * 1.35f && visible(cam, target, w);
            targetScore = pontuacao(ang, radius, cam.dst(target.pos), range);
            if (!currentOk) drop();
        }
        for (int k = 0; k < 3; k++) {
            Enemy c = cand[k];
            if (c == null) break;
            if (c == target) break;   // o atual já é o melhor
            if (currentOk && candScore[k] > targetScore * KEEP) break;   // não compensa trocar
            if (visible(cam, c, w)) {
                if (target != null && target != c) switches++;
                target = c;
                targetScore = candScore[k];
                break;
            }
        }
    }

    void drop() {
        target = null;
        targetScore = Float.MAX_VALUE;
    }

    /** Aparece alguma parte grande (peito, cabeça ou quadril)? */
    private boolean visible(Vector3 cam, Enemy e, World w) {
        return w.lineOfSight(cam, e.hitbox.chest) || w.lineOfSight(cam, e.hitbox.headCenter) || w.lineOfSight(cam, e.hitbox.pelvis);
    }

    /** Ângulo (graus) entre a mira e o ponto do corpo (quadril → topo da cabeça) mais perto do raio. */
    float angleTo(Vector3 cam, Vector3 dir, Hitbox hb) {
        closestOnSegment(cam, dir, hb.pelvis, hb.headTop, q);
        tmp.set(q).sub(cam);
        float len = tmp.len();
        if (len < 1e-3f) return 0f;
        float c = MathUtils.clamp(tmp.dot(dir) / len, -1f, 1f);
        return (float) Math.toDegrees(Math.acos(c));
    }

    /** Ponto do segmento [a, b] mais perto do raio (o, d). */
    static Vector3 closestOnSegment(Vector3 o, Vector3 d, Vector3 a, Vector3 b, Vector3 out) {
        float ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
        float wx = a.x - o.x, wy = a.y - o.y, wz = a.z - o.z;
        float aa = ux * ux + uy * uy + uz * uz;
        float bb = ux * d.x + uy * d.y + uz * d.z;
        float dd = ux * wx + uy * wy + uz * wz;
        float ee = d.x * wx + d.y * wy + d.z * wz;
        float den = aa - bb * bb;   // d tem comprimento 1
        float s = den > 1e-6f ? (bb * ee - dd) / den : 0f;
        s = MathUtils.clamp(s, 0f, 1f);
        return out.set(a.x + ux * s, a.y + uy * s, a.z + uz * s);
    }
}
