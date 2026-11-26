package com.exemplo.jogo3d;

import com.badlogic.gdx.math.Vector3;

/**
 * Dano dos tiros do jogador: base da arma × multiplicador da região (WeaponConfig) × queda com a
 * distância. Um disparo pode ter vários chumbos (espingarda): os acertos no mesmo inimigo somam e
 * viram UM número de dano (cabeça, se algum chumbo pegou na cabeça). Avisa o CombatFx (marcador,
 * número, cabeça, abate).
 */
final class DamageSystem {
    interface Listener {
        void onHit(Enemy e, Vector3 at, float damage, boolean head, boolean killed);
    }

    private static final int MAX = 8;
    private final Enemy[] who = new Enemy[MAX];
    private final float[] sum = new float[MAX];
    private final boolean[] head = new boolean[MAX];
    private final Vector3[] where = new Vector3[MAX];
    private int n;
    int kills;
    int headshots;
    private final Listener listener;

    DamageSystem(Listener l) {
        listener = l;
        for (int i = 0; i < MAX; i++) where[i] = new Vector3();
    }

    void beginShot() { n = 0; }

    /** Um raio que acertou: guarda (ainda não aplica). */
    void register(WeaponConfig cfg, HitDetection.Result r) {
        if (r.enemy == null || r.region == null) return;
        float dmg = cfg.damageAt(r.region, r.distance);
        int k = 0;
        while (k < n && who[k] != r.enemy) k++;
        if (k == n) {
            if (n == MAX) return;
            who[k] = r.enemy;
            sum[k] = 0f;
            head[k] = false;
            where[k].set(r.point);
            n++;
        }
        sum[k] += dmg;
        if (r.region == WeaponConfig.Region.HEAD) {
            head[k] = true;
            where[k].set(r.point);
        }
    }

    /** Aplica o dano somado de cada inimigo atingido neste disparo. */
    void endShot(Vector3 shooter) {
        for (int k = 0; k < n; k++) {
            Enemy e = who[k];
            if (!e.alive()) continue;
            float dmg = Math.round(sum[k]);
            boolean killed = e.damage(dmg, shooter);
            if (head[k]) headshots++;
            if (killed) kills++;
            if (listener != null) listener.onHit(e, where[k], dmg, head[k], killed);
            who[k] = null;
        }
        n = 0;
    }
}
