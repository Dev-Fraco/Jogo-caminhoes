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

        System.out.println("== Troca rápida: alterna a arma da mão com a última usada ==");
        wp.unequip(ch);
        wp.pickUp(new Weapons.Pickup(0, new ModelInstance(wp.models()[0]), 0, 0, 0), w, ch, pl);
        int munAntes = wp.magOf(0), resAntes = wp.reserveOf(0);
        wp.toggleHold(ch);
        wp.ordemHud();
        check("guardar o fuzil: o punho fica na mão e o fuzil vira a última arma", !wp.armed() && wp.ultimoItem() == 0, "ultimo=" + wp.ultimoItem());
        wp.trocaRapida(ch);
        check("troca rápida volta ao fuzil", wp.heldName().equals("AKM") && wp.armed(), wp.heldName());
        wp.trocaRapida(ch);
        check("de novo, volta aos punhos", !wp.armed() && wp.hasWeapon(), "");
        wp.trocaRapida(ch);
        check("alterna sem parar (fuzil de novo)", wp.heldName().equals("AKM"), wp.heldName());
        check("a troca não mexe na munição", wp.magOf(0) == munAntes && wp.reserveOf(0) == resAntes, wp.magOf(0) + "/" + wp.reserveOf(0));

        wp.pickUp(new Weapons.Pickup(8, new ModelInstance(wp.models()[8]), 0, 0, 0), w, ch, pl);
        wp.ordemHud();
        check("pegar a pistola na mão: a referência vira o fuzil", wp.ultimoItem() == 0, "ultimo=" + wp.ultimoItem());
        wp.toggleHold(ch);
        wp.ordemHud();
        wp.trocaRapida(ch);
        check("troca rápida leva à pistola (última arma usada)", wp.heldName().equals("MAGNUM 357") && wp.armed(), wp.heldName());
        int[] oo = wp.ordemHud();
        int pa = -1;
        for (int i = 1; i <= 3; i++) if (oo[i] == 0) pa = i - 1;
        wp.tocarBaixo(pa, ch);
        check("tocar manualmente no fuzil: a referência vira a pistola", wp.heldName().equals("AKM") && wp.ultimoItem() == 2, "ultimo=" + wp.ultimoItem());
        wp.trocaRapida(ch);
        check("depois da seleção manual, a troca rápida volta à pistola", wp.heldName().equals("MAGNUM 357") && wp.armed(), wp.heldName());

        System.out.println("== SCAR: 5 tiros por segundo, independente do FPS ==");
        for (double fps : new double[]{30, 60, 144, 240}) {
            prepararScar(wp, w, ch, pl);
            java.util.List<Double> t = tirosContinuos(wp, 1.0 / fps, 8.0);
            check("SCAR com pente cheio dispara 30 tiros (" + (int) fps + " fps)", t.size() == 30, "" + t.size());
            double pausa = 0, maior = 0;
            for (int i = 1; i < t.size(); i++) {
                double intervalo = t.get(i) - t.get(i - 1);
                maior = Math.max(maior, Math.abs(intervalo - 0.20));
            }
            if (t.size() > 1) pausa = t.get(t.size() - 1) - t.get(0);
            check("pente vazio em ~5,8 s (" + (int) fps + " fps)", Math.abs(pausa - 5.8) <= 1.0 / fps + 1e-6, String.format("%.3f s", pausa));
            check("intervalo de 0,20 s entre tiros (" + (int) fps + " fps)", maior <= 1.0 / fps + 1e-6, String.format("desvio máx %.4f s", maior));
        }

        System.out.println("== SCAR: soltar o botão para o disparo na hora ==");
        prepararScar(wp, w, ch, pl);
        int tiros = 0, apos = 0;
        double dt = 1.0 / 60.0, agora = 0;
        boolean primeiro = true;
        while (agora < 1.0) {
            wp.tick((float) dt);
            if (wp.tryFire(true, primeiro) == 1) tiros++;
            primeiro = false;
            agora += dt;
        }
        for (int i = 0; i < 60; i++) {
            wp.tick((float) dt);
            if (wp.tryFire(false, false) == 1) apos++;
        }
        check("atirou enquanto segurava e parou ao soltar", tiros >= 4 && apos == 0, "tiros=" + tiros + " depois de soltar=" + apos);

        System.out.println("== GROZA: dano por região, queda com a distância e proteção ==");
        WeaponConfig groza = WeaponConfig.GROZA;
        float corpo20 = groza.damageAt(WeaponConfig.Region.TORSO, 20f);
        check("GROZA: corpo 61 até 35 m", Math.abs(corpo20 - 61f) < 0.01f, "" + corpo20);
        float cab20 = groza.damageAt(WeaponConfig.Region.HEAD, 20f);
        check("GROZA: cabeça 122 (2×)", Math.abs(cab20 - 122f) < 0.01f, "" + cab20);
        float braco20 = groza.damageAt(WeaponConfig.Region.ARM, 20f);
        check("GROZA: membros 46", Math.abs(braco20 - 46f) < 0.1f, "" + braco20);
        float longe = groza.damageAt(WeaponConfig.Region.TORSO, 120f);
        check("GROZA: cai até 60% no alcance máximo", Math.abs(longe - 36.6f) < 0.05f, "" + longe);
        check("GROZA: a queda é contínua (50 m > 80 m)", groza.damageAt(WeaponConfig.Region.TORSO, 50f) > groza.damageAt(WeaponConfig.Region.TORSO, 80f), "");
        check("GROZA: capacete reduz a cabeça à metade", groza.fatorArmadura(WeaponConfig.Region.HEAD, true, false) == 0.5f, "");
        check("GROZA: colete reduz o tronco em 30%", groza.fatorArmadura(WeaponConfig.Region.TORSO, false, true) == 0.7f, "");
        check("GROZA: membros sem proteção", groza.fatorArmadura(WeaponConfig.Region.ARM, true, true) == 1f, "");
        check("outras armas não têm proteção", WeaponConfig.AKM.fatorArmadura(WeaponConfig.Region.HEAD, true, true) == 1f, "");
        check("AKM segue com a curva antiga (sem queda linear nem armadura)", !WeaponConfig.AKM.quedaLinear && !WeaponConfig.AKM.armadura, "");

        System.out.println("== GROZA: 4,5 tiros por segundo, pente de 30, independente do FPS ==");
        for (double fps : new double[]{30, 60, 144, 240}) {
            prepararArma(wp, w, ch, pl, 2);
            java.util.List<Double> t = tirosContinuos(wp, 1.0 / fps, 8.0);
            check("GROZA com pente cheio dispara 30 tiros (" + (int) fps + " fps)", t.size() == 30, "" + t.size());
            double maior = 0;
            for (int i = 1; i < t.size(); i++) maior = Math.max(maior, Math.abs((t.get(i) - t.get(i - 1)) - 0.22));
            double span = t.size() > 1 ? t.get(t.size() - 1) - t.get(0) : 0;
            check("GROZA: intervalo de 0,22 s (" + (int) fps + " fps)", maior <= 1.0 / fps + 1e-6, String.format("desvio máx %.4f s, pente em %.3f s", maior, span));
        }
    }

    /** Arma (tipo) na mão, com o pente cheio e a animação de sacar terminada. */
    static void prepararArma(Weapons wp, World w, Character ch, Player pl, int tipo) {
        wp.unequip(ch);
        wp.pickUp(new Weapons.Pickup(tipo, new ModelInstance(wp.models()[tipo]), 0, 0, 0), w, ch, pl);
        if (wp.magOf(tipo) < WeaponConfig.BY_TYPE[tipo].magazine) {
            wp.startReload();
            wp.tick(2f);
        }
        for (int i = 0; i < 100; i++) wp.tick(0.02f);
    }

    /** SCAR na mão, com o pente cheio e a animação de sacar terminada. */
    static void prepararScar(Weapons wp, World w, Character ch, Player pl) {
        wp.unequip(ch);
        wp.pickUp(new Weapons.Pickup(5, new ModelInstance(wp.models()[5]), 0, 0, 0), w, ch, pl);
        if (wp.magOf(5) < 30) {
            wp.startReload();
            wp.tick(2f);
        }
        for (int i = 0; i < 100; i++) wp.tick(0.02f);   // deixa acabar o sacar
    }

    /** Simula o botão de tiro segurado num quadro de dt segundos; para no clique de pente vazio. */
    static java.util.List<Double> tirosContinuos(Weapons wp, double dt, double limite) {
        java.util.List<Double> t = new java.util.ArrayList<>();
        double agora = 0;
        boolean primeiro = true;
        while (agora < limite) {
            wp.tick((float) dt);
            int r = wp.tryFire(true, primeiro);
            primeiro = false;
            if (r == -1) break;
            if (r == 1) t.add(agora);
            agora += dt;
        }
        return t;
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
