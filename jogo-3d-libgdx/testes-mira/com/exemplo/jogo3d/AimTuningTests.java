package com.exemplo.jogo3d;

/** Configuração da mira (fase A): valores padrão neutros e limites documentados. */
public class AimTuningTests {
    static int pass = 0, fail = 0;

    static void check(String name, boolean ok, String info) {
        System.out.println((ok ? "  OK   " : "  FALHA") + "  " + name + (info.isEmpty() ? "" : "  [" + info + "]"));
        if (ok) pass++; else fail++;
    }

    public static void main(String[] args) {
        System.out.println("== Padrões neutros: nada muda no comportamento ==");
        AimTuning.restaurarPadroes();
        check("atração na tela = 1 (taxa atual)", AimTuning.snapRange == 1f, "");
        check("sem atenuação por distância", AimTuning.distFalloff == 0f, "");
        check("prioridade por distância ligada (como hoje)", AimTuning.distPriority, "");
        check("coeficiente de prioridade = 1 (mínimo documentado)", AimTuning.distPrioCoef == 1f, "");
        check("sensibilidade de rotação neutra", AimTuning.rotSensitiveness == 1f, "");
        check("sem teto de dispersão extra", AimTuning.scatterMax == 0f, "");
        check("sem convergência extra", AimTuning.shrinkSpeed == 0f, "");

        System.out.println("== Limites documentados ==");
        AimTuning.snapRange = 3f; AimTuning.distFalloff = -2f; AimTuning.validar();
        check("atração limitada a 0..1 (acima)", AimTuning.snapRange == 1f, "" + AimTuning.snapRange);
        check("atenuação limitada a 0..1 (abaixo)", AimTuning.distFalloff == 0f, "" + AimTuning.distFalloff);
        AimTuning.snapRange = -0.5f; AimTuning.validar();
        check("atração não fica negativa", AimTuning.snapRange == 0f, "");
        AimTuning.distPrioCoef = 0.2f; AimTuning.validar();
        check("coeficiente de prioridade nunca abaixo de 1", AimTuning.distPrioCoef == 1f, "" + AimTuning.distPrioCoef);
        AimTuning.distPrioMin = 20f; AimTuning.distPrioMax = 5f; AimTuning.validar();
        check("distância máxima nunca menor que a mínima", AimTuning.distPrioMax == 20f, "" + AimTuning.distPrioMax);
        AimTuning.scatterMax = -3f; AimTuning.shrinkSpeed = -1f; AimTuning.rotSensitiveness = -2f; AimTuning.validar();
        check("dispersão, convergência e sensibilidade não ficam negativas",
                AimTuning.scatterMax == 0f && AimTuning.shrinkSpeed == 0f && AimTuning.rotSensitiveness == 0f, "");

        AimTuning.restaurarPadroes();
        System.out.println("\nRESULTADO: " + pass + " ok, " + fail + " falhas");
        System.exit(fail == 0 ? 0 : 1);
    }
}
