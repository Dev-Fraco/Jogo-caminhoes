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

        System.out.println("== Progresso ==");
        int nv0 = Progresso.nivel(), xp0 = Progresso.xp();
        Progresso.ganha(Progresso.xpParaNivel(nv0) - xp0, 0);
        check("juntar o XP do nível sobe 1 nível", Progresso.nivel() == nv0 + 1 && Progresso.xp() == 0, "nível " + Progresso.nivel());
        boolean primeira = Progresso.resgataRecompensa(), segunda = Progresso.resgataRecompensa();
        // as preferências persistem entre execuções: a recompensa pode já ter sido resgatada hoje
        check("recompensa diária vale uma vez por dia", !segunda && !Progresso.recompensaDisponivel(), primeira ? "resgatada agora" : "já resgatada hoje");
        check("não gasta mais moedas do que tem", !Progresso.gasta(Progresso.moedas() + 1), "");

        System.out.println("== Loja e estoque ==");
        Progresso.ganha(1000, 0);
        int m0 = Progresso.moedas(), e0 = Progresso.estoque(Progresso.TIPO_LOJA[1]);
        boolean comprou = Progresso.compra(1);
        check("comprar bandagem gasta moedas e põe no estoque", comprou && Progresso.moedas() == m0 - Progresso.PRECO_LOJA[1] && Progresso.estoque(Progresso.TIPO_LOJA[1]) == e0 + 1, "");
        int[] tirado = Progresso.retiraEstoque();
        check("o estoque vai para a partida e zera", tirado[Progresso.TIPO_LOJA[1]] >= 1 && Progresso.estoque(Progresso.TIPO_LOJA[1]) == 0, "");

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

        System.out.println("== Painel: 1 em cima, 3 embaixo, nunca repete; tocar troca de lugar ==");
        wp.unequip(ch);
        wp.pickUp(new Weapons.Pickup(0, new ModelInstance(wp.models()[0]), 0, 0, 0), w, ch, pl);
        wp.pickUp(new Weapons.Pickup(2, new ModelInstance(wp.models()[2]), 0, 0, 0), w, ch, pl);
        wp.pickUp(new Weapons.Pickup(8, new ModelInstance(wp.models()[8]), 0, 0, 0), w, ch, pl);
        int[] o = wp.ordemHud();
        check("com 3 armas, o painel mostra 1 em cima e 3 embaixo, sem repetir", o.length == 4 && semRepetir(o) && o[0] >= 0 && o[1] >= 0 && o[2] >= 0 && o[3] >= 0, java.util.Arrays.toString(o));
        int topo = o[0], caixa0 = o[1];
        wp.tocarBaixo(0, ch);
        int[] d = wp.ordemHud();
        check("tocar na caixa 0 leva o item dela para a mão", d[0] == caixa0, java.util.Arrays.toString(d));
        check("o item que estava na mão ocupa a caixa 0", d[1] == topo, java.util.Arrays.toString(d));
        check("depois da troca, ainda sem repetição", semRepetir(d), java.util.Arrays.toString(d));
        wp.tocarBaixo(0, ch);
        check("tocar de volta devolve a ordem", wp.ordemHud()[0] == topo && wp.ordemHud()[1] == caixa0, java.util.Arrays.toString(wp.ordemHud()));
        wp.toggleHold(ch);
        int[] g = wp.ordemHud();
        check("punho sem arma: o punho vai para cima e as 3 armas ficam embaixo", g[0] == Weapons.ITEM_PUNHO && semRepetir(g), java.util.Arrays.toString(g));
        int p = -1;
        for (int i = 1; i <= 3; i++) if (g[i] == Weapons.ITEM_PUNHO) p = i;
        check("o punho não aparece duas vezes", p == -1, java.util.Arrays.toString(g));
        wp.tocarBaixo(0, ch);
        check("tocar numa arma depois de guardar a põe na mão", !wp.holstered() && wp.armed(), wp.heldName());
    }

    static boolean semRepetir(int[] o) {
        for (int i = 0; i < o.length; i++)
            for (int j = i + 1; j < o.length; j++)
                if (o[i] >= 0 && o[i] == o[j]) return false;
        return true;
    }

    public static void main(String[] args) {
        new HeadlessApplication(new ControlTests(), new HeadlessApplicationConfiguration());
    }
}
