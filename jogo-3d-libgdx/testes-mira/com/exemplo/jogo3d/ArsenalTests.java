package com.exemplo.jogo3d;

/** Arsenal de treino: cada arma cadastrada aparece em uma aba, e as abas cobrem todas. */
public class ArsenalTests {
    static int pass = 0, fail = 0;

    static void check(String name, boolean ok, String info) {
        System.out.println((ok ? "  OK   " : "  FALHA") + "  " + name + (info.isEmpty() ? "" : "  [" + info + "]"));
        if (ok) pass++; else fail++;
    }

    public static void main(String[] args) {
        System.out.println("== Arsenal de treino: abas e armas ==");
        int total = 0;
        boolean allInOne = true;
        for (int t = 0; t < Arsenal.TABS.length; t++) total += Arsenal.listOf(t).length;
        check("todas as armas cadastradas aparecem em alguma aba", total == Weapons.NAMES.length,
                total + " de " + Weapons.NAMES.length);
        int[] seen = new int[Weapons.NAMES.length];
        for (int t = 0; t < Arsenal.TABS.length; t++) for (int v : Arsenal.listOf(t)) seen[v]++;
        for (int c : seen) if (c != 1) allInOne = false;
        check("cada arma só aparece em uma aba", allInOne, "");
        check("aba FUZIS tem os seis fuzis", Arsenal.listOf(0).length == 6, "" + Arsenal.listOf(0).length);
        check("AWM fica em SNIPERS", java.util.Arrays.asList(Arsenal.listOf(3)).stream().anyMatch(a -> a.length > 0 && Weapons.NAMES[a[0]].equals("AWM")) || Weapons.NAMES[Arsenal.listOf(3)[0]].equals("AWM"), "");
        check("M1014 fica em ESCOPETAS", Weapons.NAMES[Arsenal.listOf(2)[0]].equals("M1014"), "");
        System.out.println("== Magnum 357: dano fixo ==");
        com.exemplo.jogo3d.WeaponConfig m = com.exemplo.jogo3d.WeaponConfig.MAGNUM357;
        check("cabeça 210 em qualquer distância", m.damageAt(com.exemplo.jogo3d.WeaponConfig.Region.HEAD, 2f) == 210f
                && m.damageAt(com.exemplo.jogo3d.WeaponConfig.Region.HEAD, 60f) == 210f, "");
        check("peito 50 em qualquer distância", m.damageAt(com.exemplo.jogo3d.WeaponConfig.Region.TORSO, 2f) == 50f
                && m.damageAt(com.exemplo.jogo3d.WeaponConfig.Region.TORSO, 60f) == 50f, "");
        System.out.println("\nRESULTADO: " + pass + " ok, " + fail + " falhas");
        System.exit(fail == 0 ? 0 : 1);
    }
}
