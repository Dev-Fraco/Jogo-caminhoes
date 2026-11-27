package com.exemplo.jogo3d;

import com.badlogic.gdx.ApplicationAdapter;
import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.backends.headless.HeadlessApplication;
import com.badlogic.gdx.backends.headless.HeadlessApplicationConfiguration;
import com.badlogic.gdx.graphics.GL20;

import java.lang.reflect.Proxy;

/** Fuzil de precisão (AWM): luneta, um tiro por mira, recarga de 0,5 s ao largar a mira; o resto intacto. */
public class ScopeTests extends ApplicationAdapter {
    static int pass = 0, fail = 0;

    static void check(String name, boolean ok, String info) {
        System.out.println((ok ? "  OK   " : "  FALHA") + "  " + name + (info.isEmpty() ? "" : "  [" + info + "]"));
        if (ok) pass++; else fail++;
    }

    @Override
    public void create() {
        Gdx.gl = Gdx.gl20 = (GL20) Proxy.newProxyInstance(GL20.class.getClassLoader(), new Class[]{GL20.class}, (p, m, a) -> {
            Class<?> t = m.getReturnType();
            if (t == int.class) return 1;
            if (t == boolean.class) return true;
            if (t == float.class) return 0f;
            if (t == String.class) return "";
            return null;
        });
        try {
            run();
        } catch (Throwable t) {
            t.printStackTrace();
            fail++;
        }
        System.out.println("\nRESULTADO: " + pass + " ok, " + fail + " falhas");
        System.exit(fail == 0 ? 0 : 1);
    }

    void run() {
        int awm = java.util.Arrays.asList(Weapons.NAMES).indexOf("AWM");
        WeaponConfig cfg = WeaponConfig.BY_TYPE[awm];
        check("AWM é a última arma e tem luneta", Weapons.NAMES[awm].equals("AWM") && cfg.scope, "");
        check("só o AWM tem luneta", !WeaponConfig.AKM.scope && !WeaponConfig.PRECISAO.scope, "");
        check("AWM: 120 em qualquer parte do corpo", cfg.damageAt(WeaponConfig.Region.TORSO, 5f) == 120f
                && cfg.damageAt(WeaponConfig.Region.ARM, 80f) == 120f && cfg.damageAt(WeaponConfig.Region.LEG, 200f) == 120f, "");
        check("AWM: 900 na cabeça, a qualquer distância", cfg.damageAt(WeaponConfig.Region.HEAD, 5f) == 900f
                && cfg.damageAt(WeaponConfig.Region.HEAD, 250f) == 900f, "");
        check("recarga do tambor = 0,5 s", Math.abs(cfg.reloadTime - 0.5f) < 1e-6f, "" + cfg.reloadTime);

        World w = new World();
        w.create();
        Character ch = new Character();
        ch.create();
        Weapons wp = w.weapons;
        wp.giveStart(awm, ch);
        wp.tick(2f);   // terminar de sacar
        int mag0 = wp.ammo(), res0 = wp.reserveAmmo();

        check("sem mirar, não dispara", wp.tryFire(false, true) == 0 && wp.ammo() == mag0, "");
        wp.scopeAimUpdate(true);
        check("mirando, dispara um tiro", wp.tryFire(false, true) == 1, "");
        check("o tiro gasta uma bala do tambor", wp.ammo() == mag0 - 1, "" + wp.ammo());
        wp.tick(2f);
        check("depois do tiro, não dispara de novo mirando", wp.tryFire(false, true) == 0, "");
        wp.scopeAimUpdate(false);
        check("ao largar a mira, começa a recarregar", wp.reloading(), "");
        wp.tick(0.49f);
        check("ainda recarregando aos 0,49 s", wp.reloading(), "");
        wp.tick(0.06f);
        check("recarga termina em 0,5 s", !wp.reloading(), "");
        check("tambor cheio de novo e a reserva gastou 1", wp.ammo() == mag0 && wp.reserveAmmo() == res0 - 1,
                wp.ammo() + " / " + wp.reserveAmmo());
        wp.scopeAimUpdate(true);
        wp.tick(2f);
        check("depois de recarregar, mira e atira de novo", wp.tryFire(false, true) == 1, "");

        // Outras armas seguem como eram (automática, sem luneta)
        wp.giveStart(0, ch);
        wp.tick(2f);
        check("AKM continua no automático (sem luneta)", !WeaponConfig.BY_TYPE[0].scope && wp.tryFire(true, true) == 1, "");

        System.out.println("== Magnum 357: atraso do primeiro tiro e cadência ==");
        int mg = java.util.Arrays.asList(Weapons.NAMES).indexOf("MAGNUM 357");
        wp.giveStart(mg, ch);
        wp.tick(2f);
        check("primeiro aperto não atira na hora", wp.tryFire(true, false) == 0, "");
        wp.tick(0.2f);
        check("0,2 s depois do aperto: ainda não atira", wp.tryFire(true, false) == 0, "");
        wp.tick(0.06f);
        check("0,26 s depois do aperto: primeiro tiro", wp.tryFire(true, false) == 1, "");
        wp.tick(1.50f);
        check("1,50 s depois do tiro: ainda não", wp.tryFire(true, false) == 0, "");
        wp.tick(0.06f);
        check("1,56 s depois do tiro: segundo tiro (segurando)", wp.tryFire(true, false) == 1, "");
        wp.tryFire(false, false);
        wp.tick(1f);
        check("soltou e apertou de novo: espera 0,25 s outra vez", wp.tryFire(true, false) == 0, "");
    }

    public static void main(String[] args) {
        new HeadlessApplication(new ScopeTests(), new HeadlessApplicationConfiguration());
    }
}
