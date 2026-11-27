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

        System.out.println("== Fase B: cada parâmetro muda a mira (funções usadas pelo jogo a cada quadro) ==");
        AimTuning.restaurarPadroes();
        float antiga = 0.5f / 10f + 0.25f * 30f / 60f;   // fórmula de sempre: ang/raio + 0,25 × dist/alcance
        check("padrões reproduzem a pontuação de antes", Math.abs(TargetDetection.pontuacao(0.5f, 10f, 30f, 60f) - antiga) < 1e-5f, "");
        check("padrões reproduzem a força de antes (sem queda, taxa 1)", AimAssist.forca(2f, 40f, 70f, 1f, 0f) == 2f, "");

        AimTuning.snapRange = 0.5f;
        check("SnapRange 0,5 reduz a força de atração pela metade", Math.abs(AimAssist.forca(2f, 40f, 70f, AimTuning.snapRange, 0f) - 1f) < 1e-5f, "");
        AimTuning.snapRange = 0f;
        check("SnapRange 0 desliga a atração", AimAssist.forca(2f, 40f, 70f, AimTuning.snapRange, 0f) == 0f, "");
        AimTuning.restaurarPadroes();

        AimTuning.distFalloff = 1f;
        check("DistFalloff 1 zera a atração no alcance máximo", AimAssist.forca(1f, 70f, 70f, 1f, AimTuning.distFalloff) == 0f, "");
        float perto = AimAssist.forca(1f, 10f, 70f, 1f, AimTuning.distFalloff), longe = AimAssist.forca(1f, 50f, 70f, 1f, AimTuning.distFalloff);
        check("DistFalloff diminui a atração conforme a distância", perto > longe && longe > 0f, perto + " > " + longe);
        AimTuning.distFalloff = 0.5f;
        check("DistFalloff 0,5 deixa metade da força no alcance", Math.abs(AimAssist.forca(1f, 70f, 70f, 1f, AimTuning.distFalloff) - 0.5f) < 1e-5f, "");
        AimTuning.restaurarPadroes();

        AimTuning.distPriority = false;
        check("DistPriority desligada: alvo escolhido só pelo ângulo",
                TargetDetection.pontuacao(0.5f, 10f, 10f, 60f) == TargetDetection.pontuacao(0.5f, 10f, 50f, 60f), "");
        AimTuning.restaurarPadroes();
        check("DistPriority ligada: alvo mais longe pontua pior",
                TargetDetection.pontuacao(0.5f, 10f, 50f, 60f) > TargetDetection.pontuacao(0.5f, 10f, 10f, 60f), "");

        AimTuning.distPrioMin = 20f; AimTuning.distPrioMax = 30f;
        check("DistprioMin/Max: abaixo do mínimo conta como o mínimo",
                TargetDetection.pontuacao(0.5f, 10f, 5f, 60f) == TargetDetection.pontuacao(0.5f, 10f, 20f, 60f), "");
        check("DistprioMin/Max: acima do máximo conta como o máximo",
                TargetDetection.pontuacao(0.5f, 10f, 90f, 60f) == TargetDetection.pontuacao(0.5f, 10f, 30f, 60f), "");
        AimTuning.restaurarPadroes();

        AimTuning.distPrioCoef = 3f;
        float termoCoef3 = TargetDetection.pontuacao(0f, 10f, 30f, 60f);
        check("DistprioCoef 3 triplica o peso da distância", Math.abs(termoCoef3 - 3f * 0.25f * 30f / 60f) < 1e-5f, "" + termoCoef3);
        AimTuning.restaurarPadroes();

        AimTuning.restaurarPadroes();
        AimTuning.restaurarPadroes();
        System.out.println("\nRESULTADO: " + pass + " ok, " + fail + " falhas");
        System.exit(fail == 0 ? 0 : 1);
    }
}
