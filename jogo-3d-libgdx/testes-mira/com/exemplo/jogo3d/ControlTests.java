package com.exemplo.jogo3d;

import com.badlogic.gdx.ApplicationAdapter;
import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.backends.headless.HeadlessApplication;
import com.badlogic.gdx.backends.headless.HeadlessApplicationConfiguration;
import com.badlogic.gdx.graphics.GL20;
import com.badlogic.gdx.graphics.g3d.ModelInstance;
import com.badlogic.gdx.math.Vector3;

import java.lang.reflect.Proxy;

/** Controles mobile: disparo sem acidente, dois slots de arma com troca (guardar e sacar foram removidos). */
public class ControlTests extends ApplicationAdapter {
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
        System.out.println("== Disparo sem acidente (toque mínimo de 45 ms) ==");
        TouchFire tf = new TouchFire();
        tf.update(0.02f, true, false);
        check("toque de 20 ms não dispara", !tf.heldNow && !tf.pressedThisFrame, "");
        tf.update(0.03f, true, false);
        check("ao passar de 45 ms, conta como um aperto", tf.heldNow && tf.pressedThisFrame, "");
        tf.update(0.03f, true, false);
        check("segurando não repete o aperto (automáticas seguem com heldNow)", tf.heldNow && !tf.pressedThisFrame, "");
        tf.update(0.1f, false, false);
        check("soltar o dedo para o disparo", !tf.heldNow, "");

        World w = new World();
        w.create();
        Character ch = new Character();
        ch.create();
        Player pl = new Player();
        pl.spawn(0f, 0f, 0f);
        Weapons wp = w.weapons;
        Vector3 at = new Vector3();
        System.out.println("== Dois slots e troca ==");
        check("pegar a primeira arma", wp.pickUp(new Weapons.Pickup(0, new ModelInstance(wp.models()[0]), 0, 0, 0), w, ch, pl), "");
        check("com uma arma, o botão diz TROCAR (guardar foi removido)", wp.swapLabel().equals("TROCAR") && !wp.hasOtherWeapon(), wp.swapLabel());
        check("pegar a segunda arma (outro tipo)", wp.pickUp(new Weapons.Pickup(2, new ModelInstance(wp.models()[2]), 0, 0, 0), w, ch, pl), "");
        check("com duas armas, a da mão é a nova", wp.heldName().equals("GROZA"), wp.heldName());
        check("com duas armas, o botão diz TROCAR", wp.swapLabel().equals("TROCAR"), wp.swapLabel());
        check("não aceita a mesma arma duas vezes", !wp.pickUp(new Weapons.Pickup(0, new ModelInstance(wp.models()[0]), 0, 0, 0), w, ch, pl), "");
        wp.swap(ch);
        check("trocar: a outra arma (AKM) vai para a mão", wp.heldName().equals("AKM"), wp.heldName());
        check("a munição de cada arma fica com ela (AKM com pente cheio)", wp.ammo() == 30 && wp.reserveAmmo() == 120, wp.ammo() + "/" + wp.reserveAmmo());
        wp.swap(ch);
        check("trocar de volta: GROZA na mão", wp.heldName().equals("GROZA"), wp.heldName());

        System.out.println("== Punho guarda a arma; caixa da arma leva de volta ==");
        wp.unequip(ch);
        wp.pickUp(new Weapons.Pickup(1, new ModelInstance(wp.models()[1]), 0, 0, 0), w, ch, pl);
        wp.swap(ch);
        check("trocar com uma arma só não guarda: a arma continua na mão", !wp.holstered() && wp.armed(), "");
        wp.toggleHold(ch);
        check("tocar no punho guarda a arma: sem arma na mão, arma continua no HUD", wp.holstered() && !wp.armed() && wp.hasWeapon(), "");
        wp.equipSlot(0, ch);
        check("tocar na caixa do fuzil leva ele de volta para a mão", !wp.holstered() && wp.armed() && wp.heldName().equals("AUG"), wp.heldName());

        System.out.println("== Loot de inimigo morto ==");
        if (w.items != null) {
            int antes = w.items.ground.size;
            w.items.loot(w, 10f, 10f, new java.util.Random(7));
            int depois = w.items.ground.size;
            check("inimigo morto deixa 1 ou 2 itens no chão", depois - antes >= 1 && depois - antes <= 2, (depois - antes) + " itens");
        }

        System.out.println("== Três slots: dois fuzis e uma pistola ==");
        wp.unequip(ch);
        wp.pickUp(new Weapons.Pickup(8, new ModelInstance(wp.models()[8]), 0, 0, 0), w, ch, pl);
        check("pistola/revólver vai para o slot 2", wp.slotType(2) == 8 && wp.slotType(0) < 0 && wp.slotType(1) < 0, "");
        wp.pickUp(new Weapons.Pickup(0, new ModelInstance(wp.models()[0]), 0, 0, 0), w, ch, pl);
        check("fuzil com pistola levada vai para o slot 0 e fica na mão", wp.slotType(0) == 0 && wp.slotType(2) == 8 && wp.heldName().equals("AKM"), wp.heldName());
        wp.equipSlot(2, ch);
        check("tocar na caixa da pistola leva a pistola para a mão", wp.heldName().equals("MAGNUM 357") && !wp.holstered(), wp.heldName());
        wp.toggleHold(ch);
        check("punho com a pistola na mão guarda ela", wp.holstered() && !wp.armed() && wp.slotType(2) == 8, "");
        wp.equipSlot(0, ch);
        check("tocar no fuzil depois de guardar leva o fuzil", wp.heldName().equals("AKM") && wp.armed(), wp.heldName());
    }

    public static void main(String[] args) {
        new HeadlessApplication(new ControlTests(), new HeadlessApplicationConfiguration());
    }
}
