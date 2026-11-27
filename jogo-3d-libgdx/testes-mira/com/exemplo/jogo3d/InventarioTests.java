package com.exemplo.jogo3d;

import com.badlogic.gdx.ApplicationAdapter;
import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.backends.headless.HeadlessApplication;
import com.badlogic.gdx.backends.headless.HeadlessApplicationConfiguration;
import com.badlogic.gdx.graphics.GL20;
import com.badlogic.gdx.graphics.g3d.ModelInstance;

import java.lang.reflect.Proxy;

/** Inventário: pegar uma arma com outra na mão mantém as duas (chão e arsenal do treino). */
public class InventarioTests extends ApplicationAdapter {
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
        World w = new World();
        w.create();
        Character ch = new Character();
        ch.create();
        Player pl = new Player();
        pl.spawn(0f, 0f, 0f);
        Weapons wp = w.weapons;

        System.out.println("== Pegar no chão com outra arma na mão ==");
        Weapons.Pickup a = new Weapons.Pickup(0, new ModelInstance(wp.models()[0]), 0, 0, 0);
        Weapons.Pickup b = new Weapons.Pickup(2, new ModelInstance(wp.models()[2]), 0, 0, 0);
        w.instances.add(a.inst);
        w.instances.add(b.inst);
        wp.ground.add(a);
        wp.ground.add(b);
        wp.coletar(a, w, ch, pl);
        wp.coletar(b, w, ch, pl);
        check("as duas armas continuam no inventário", wp.slotType(0) == 0 && wp.slotType(1) == 2, wp.slotType(0) + "," + wp.slotType(1));
        check("a segunda fica na mão e a primeira continua no HUD", wp.heldName().equals("GROZA") && java.util.Arrays.stream(wp.ordemHud()).anyMatch(v -> v == 0), wp.heldName());

        System.out.println("== Arsenal do treino com outra arma na mão ==");
        World w3 = new World();
        w3.create();
        Character c3 = new Character();
        c3.create();
        Player p3 = new Player();
        p3.spawn(0f, 0f, 0f);
        Weapons wa = w3.weapons;
        wa.giveStart(0, c3);   // AKM na mão
        wa.equipDoArsenal(2, w3, c3, p3);   // arsenal: GROZA
        check("escolher GROZA no arsenal mantém o AKM", wa.slotType(0) == 0 && wa.slotType(1) == 2, wa.slotType(0) + "," + wa.slotType(1));
        check("a GROZA fica na mão", wa.heldName().equals("GROZA"), wa.heldName());
        wa.equipDoArsenal(0, w3, c3, p3);   // arsenal: AKM (já levada)
        check("escolher uma arma já levada só a saca", wa.heldName().equals("AKM") && wa.slotType(1) == 2, wa.heldName());
        wa.equipDoArsenal(3, w3, c3, p3);   // terceiro fuzil: pede escolha
        check("terceiro fuzil no arsenal pede escolha (não apaga nada)", wa.pendente() != null && wa.slotType(0) == 0 && wa.slotType(1) == 2, "");
        System.out.println("\nRESULTADO: " + pass + " ok, " + fail + " falhas");
        System.exit(fail == 0 ? 0 : 1);
    }

    public static void main(String[] args) {
        new HeadlessApplication(new InventarioTests(), new HeadlessApplicationConfiguration());
    }
}
