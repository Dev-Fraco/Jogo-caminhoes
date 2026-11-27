package com.exemplo.jogo3d;

import com.badlogic.gdx.ApplicationAdapter;
import com.badlogic.gdx.backends.headless.HeadlessApplication;
import com.badlogic.gdx.backends.headless.HeadlessApplicationConfiguration;
import com.badlogic.gdx.math.MathUtils;
import com.badlogic.gdx.math.Vector3;

/** Espingarda M1014: 8 projéteis por disparo, dano por projétil, dispersão que cresce com a distância. */
public class ShotgunTests extends ShootTests {

    static void show(String name, boolean ok, String info) { check(name, ok, info); }

    @Override
    void run() {
        MathUtils.random.setSeed(1915);
        ShootingSystem.spreadScale = 0f;
        int m = java.util.Arrays.asList(Weapons.NAMES).indexOf("M1014");
        WeaponConfig c = WeaponConfig.BY_TYPE[m];

        System.out.println("== Dano por projétil (M1014) ==");
        show("cabeça 35 e peito 12 até 5 m", c.damageAt(WeaponConfig.Region.HEAD, 2f) == 35f
                && c.damageAt(WeaponConfig.Region.TORSO, 5f) == 12f, "");
        show("aos 17 m o dano cai para 25%", Math.abs(c.damageAt(WeaponConfig.Region.HEAD, 17f) - 35f * 0.25f) < 1e-3f,
                "" + c.damageAt(WeaponConfig.Region.HEAD, 17f));
        show("8 projéteis, 0,355 s entre disparos, carregador de 5, automática", c.pellets == 8 && c.fireInterval == 0.355f
                && c.magazine == 5 && c.mode == WeaponConfig.FireMode.AUTO && c.separate, "");
        show("dispersão cresce com a distância (17 m bem maior que 5 m)",
                WeaponConfig.pelletRadius(17f) > 3f * WeaponConfig.pelletRadius(5f) && WeaponConfig.pelletRadius(5f) < 0.7f,
                String.format("5 m: %.2f m, 17 m: %.2f m", WeaponConfig.pelletRadius(5f), WeaponConfig.pelletRadius(17f)));

        w = new World();
        w.create();
        ch = new Character();
        ch.create();
        jake = ch.model();
        float[] A = openArea();
        ax = A[0];
        az = A[1];
        gy = w.groundAt(ax, az);
        setup(m, null);

        System.out.println("== Disparo de perto (3 m) ==");
        cam.set(ax, gy + 1.6f, az);
        yaw = 0f;
        pitch = 0f;
        Enemy near = spawnEnemy(ax, az + 3f, MathUtils.PI, "Idle");
        aimAt(near.hitbox.chest);
        events.clear();
        int shots0 = sh.shotsFired, ammo0 = wp.ammo();
        step(1f / 30f, true, false);   // automática: segurando
        show("um disparo gasta uma bala, não uma por projétil", sh.shotsFired == shots0 + 1 && wp.ammo() == ammo0 - 1,
                "tiros " + (sh.shotsFired - shots0) + ", balas " + (ammo0 - wp.ammo()));
        boolean perPellet = !events.isEmpty();
        for (float[] e : events) if (e[0] != 12f && e[0] != 35f && e[0] != 10f) perPellet = false;
        show("cada projétil que acerta dá o seu número (12 peito, 35 cabeça, 10 membro; nunca somado)", perPellet && events.size() >= 1,
                "acertos " + events.size() + (events.isEmpty() ? "" : ", primeiro " + events.get(0)[0]));

        System.out.println("== Automático: 0,355 s entre disparos ==");
        wp.infinite = true;
        for (int f = 0; f < 30; f++) step(1f / 30f, false, false);   // 1 s parado: zera o intervalo do tiro anterior
        int s0 = sh.shotsFired;
        for (int f = 0; f < 60; f++) step(1f / 30f, true, false);   // 2 s segurando
        int fired = sh.shotsFired - s0;
        show("segurando por 2 s, dispara 6 vezes (0,355 s entre tiros)", fired == 6, "tiros " + fired);

        System.out.println("== Longe (17 m): quase nenhum chumbo acerta ==");
        wp.infinite = true;
        cam.set(ax, gy + 1.6f, az);
        yaw = 0f;
        pitch = 0f;
        Enemy far = spawnEnemy(ax, az + 17f, MathUtils.PI, "Idle");
        aimAt(far.hitbox.chest);
        events.clear();
        int far0 = sh.shotsFired;
        for (int f = 0; f < 30 * 32; f++) step(1f / 30f, true, false);   // segurando por 32 s: ~40 tiros de 0,8 s
        int shots = sh.shotsFired - far0;
        double perShot = events.size() / (double) Math.max(1, shots);
        show("aos 17 m, quase nenhum projétil acerta (menos de 1 a cada 10 tiros)", perShot < 0.1, String.format("%d acertos em %d tiros", events.size(), shots));

        System.out.println("== Chance de acerto por distância (tiro que pega o alvo da mira) ==");
        double h2 = hitRate(2f, 80), h45 = hitRate(4.5f, 80), h8 = hitRate(8f, 80), h12 = hitRate(12f, 80);
        show("até 3 m: pega quase 100% dos tiros", h2 >= 0.9, String.format("%.0f%%", h2 * 100));
        show("3,5 a 6 m: pega cerca de 80%", Math.abs(h45 - 0.8) <= 0.15, String.format("%.0f%%", h45 * 100));
        show("6 a 10 m: pega cerca de 40%", Math.abs(h8 - 0.4) <= 0.15, String.format("%.0f%%", h8 * 100));
        show("depois de 10 m: não pega", h12 <= 0.05, String.format("%.0f%%", h12 * 100));
        System.out.println("== Agrupamento da M1014: chumbos juntos e centrados na mira, em qualquer distância ==");
        for (float d : new float[]{2f, 5f, 8f}) {
            float maxAng = 0f, soma = 0f;
            int n = 400;
            for (int i = 0; i < n; i++) {
                float off = WeaponConfig.pelletOffsetM(true, d, (i + 0.5f) / n);   // grade uniforme de números aleatórios
                maxAng = Math.max(maxAng, off / d);
                soma += off;
            }
            show(String.format("a %.0f m, chumbos que pegam ficam em até %.2f° do centro da mira (grupo de 16 cm)", d, Math.toDegrees(WeaponConfig.SHOT_HIT_R / d)),
                    maxAng <= WeaponConfig.SHOT_HIT_R / d + 1e-6f, String.format("máx %.3f°", Math.toDegrees(maxAng)));
            show(String.format("a %.0f m, a maioria fica perto do centro (variação natural, sem todos iguais)", d),
                    soma / n < 0.7f * WeaponConfig.SHOT_HIT_R && WeaponConfig.pelletOffsetM(true, d, 0.9f) != WeaponConfig.pelletOffsetM(true, d, 0.2f),
                    String.format("média %.3f m", soma / n));
        }
        float missD = 6f;
        show("chumbos que erram continuam fora do boneco (a partir de 1,2 m)", WeaponConfig.pelletOffsetM(false, missD, 0f) >= 1.2f - 1e-6f, "");
    }

    /** Fração dos tiros (com pelo menos um chumbo) que acertam um alvo parado à distância d. */
    double hitRate(float d, int shots) {
        en.list.clear();
        cam.set(ax, gy + 1.6f, az);
        yaw = 0f;
        pitch = 0f;
        Enemy t = spawnEnemy(ax, az + d, MathUtils.PI, "Idle");
        t.dummy = true;   // não cai: continua no alvo
        aimAt(t.hitbox.chest);
        wp.infinite = true;
        int hits = 0, done = 0;
        for (int f = 0; f < 30 * 1 && false; f++) step(1f / 30f, false, false);
        for (int f = 0; done < shots && f < 30 * 60 * 3; f++) {
            int before = events.size(), s0 = sh.shotsFired;
            step(1f / 30f, true, false);
            if (sh.shotsFired != s0) {
                done++;
                if (events.size() > before) hits++;
            }
        }
        en.list.clear();
        return done == 0 ? 0 : hits / (double) done;
    }

    public static void main(String[] args) {
        new HeadlessApplication(new ShotgunTests(), new HeadlessApplicationConfiguration());
    }
}
