package com.exemplo.jogo3d;


/** Tela MIRA E SENSIBILIDADE: conversão dos valores para 0–200, toque, arrasto, liga/desliga, restaurar e voltar. */
public class AimUiTests {
    static int pass = 0, fail = 0;

    static void check(String name, boolean ok, String info) {
        System.out.println((ok ? "  OK   " : "  FALHA") + "  " + name + (info.isEmpty() ? "" : "  [" + info + "]"));
        if (ok) pass++; else fail++;
    }

    public static void main(String[] args) {
        System.out.println("== Conversão dos valores atuais para a escala 0–200 ==");
        AimSettings.reset();
        check("sensibilidade padrão 100% vira 100", AimSettings.toSlider(0) == 100, "" + AimSettings.toSlider(0));
        check("mira 2x 60% vira 60", AimSettings.toSlider(1) == 60, "" + AimSettings.toSlider(1));
        check("mira 4x 35% vira 35", AimSettings.toSlider(2) == 35, "" + AimSettings.toSlider(2));
        check("abertura AKM 100% vira 100", AimSettings.toSlider(AimSettings.ABERTURA_0) == 100, "" + AimSettings.toSlider(AimSettings.ABERTURA_0));
        check("a tela não tem mais itens de assistência de mira", AimSettings.NAMES.length == 14, "" + AimSettings.NAMES.length);
        boolean semAssist = true;
        for (String n : AimSettings.NAMES) {
            String b = n.toLowerCase();
            if (b.contains("assist") || b.contains("abdominal") || b.contains("fov") || b.contains("resist")) semAssist = false;
        }
        check("nenhum item fala de assistência, abdômen, FOV ou resistência", semAssist, "");

        System.out.println("== Escala inteira: toda barra vai de 0 a 200 ==");
        boolean todas = true;
        for (int i = 0; i < AimSettings.NAMES.length; i++) {
            int lo = AimSettings.toSlider(i);
            AimSettings.setSlider(i, 0);
            int zero = AimSettings.toSlider(i);
            AimSettings.setSlider(i, 200);
            int max = AimSettings.toSlider(i);
            if (zero != 0 || max < 150) todas = false;
            AimSettings.set(i, lo / 100f);
        }
        check("cada barra vai de 0 até o máximo", todas, "");

        System.out.println("== Sensi X e Y: só valem com o botão de atirar pressionado ==");
        AimSettings.reset();
        AimController semTiro = new AimController();
        semTiro.addDrag(100f, 50f);
        semTiro.update(1f / 30f, 1080f, false, null, 1f, false);
        float yaw0 = semTiro.yawDelta, pit0 = semTiro.pitchDelta;
        AimSettings.set(AimSettings.SENSI_X, 2f);      // sensi X 200%
        AimSettings.set(AimSettings.SENSI_Y, 0.5f);    // sensi Y 50%
        AimController fora = new AimController();
        fora.addDrag(100f, 50f);
        fora.update(1f / 30f, 1080f, false, null, 1f, false);
        check("sem atirar, sensi X/Y não mudam a câmera",
                Math.abs(fora.yawDelta - yaw0) < 1e-7f && Math.abs(fora.pitchDelta - pit0) < 1e-7f, "");
        AimController tiro = new AimController();
        tiro.addDrag(100f, 50f);
        tiro.update(1f / 30f, 1080f, false, null, 1f, true);
        check("atirando, sensi X 200% dobra o giro horizontal",
                Math.abs(tiro.yawDelta - 2f * yaw0) < 1e-6f, String.format("%.5f vs %.5f", tiro.yawDelta, 2f * yaw0));
        check("atirando, sensi Y 50% mete metade na vertical",
                Math.abs(tiro.pitchDelta - 0.5f * pit0) < 1e-6f, String.format("%.5f vs %.5f", tiro.pitchDelta, 0.5f * pit0));
        check("sensi X/Y aparecem como barras de 0 a 200", AimSettings.toSlider(AimSettings.SENSI_X) == 200 && AimSettings.toSlider(AimSettings.SENSI_Y) == 50,
                AimSettings.toSlider(AimSettings.SENSI_X) + " / " + AimSettings.toSlider(AimSettings.SENSI_Y));
        AimSettings.reset();
        check("RESTAURAR PADRÃO devolve sensi X/Y para 100", AimSettings.toSlider(AimSettings.SENSI_X) == 100 && AimSettings.toSlider(AimSettings.SENSI_Y) == 100, "");

        System.out.println("== Arrastar a barra muda o parâmetro do jogo ==");
        AimSettings.reset();
        AimSettingsUi ui = new AimSettingsUi();
        ui.open = true;
        ui.layout(1280, 720);
        float[] t = ui.trackOf(0);
        float x25 = t[0] + (t[1] - t[0]) * 0.25f, x75 = t[0] + (t[1] - t[0]) * 0.75f;
        ui.press(x25, t[2]);
        check("tocar a 25% da barra põe a sensibilidade em 50", AimSettings.toSlider(0) == 50, "" + AimSettings.toSlider(0));
        check("o valor do jogo muda na hora (general = 0,5)", Math.abs(AimSettings.general - 0.5f) < 0.02f, "" + AimSettings.general);
        ui.drag(x75, t[2]);
        check("arrastar até 75% põe em 150", AimSettings.toSlider(0) == 150, "" + AimSettings.toSlider(0));
        ui.drag(t[1] + 500f, t[2]);
        check("arrastar além da barra prende em 200", AimSettings.toSlider(0) == 200, "" + AimSettings.toSlider(0));
        ui.release();
        ui.drag(t[0], t[2]);
        check("depois de soltar o arrasto não continua", AimSettings.toSlider(0) == 200, "" + AimSettings.toSlider(0));

        System.out.println("== Restaurar e voltar ==");
        ui.press(1280 * 0.08f, 720 * 0.03f + 5f);   // botão RESTAURAR PADRÃO (canto inferior esquerdo)
        check("RESTAURAR PADRÃO volta a sensibilidade para 100", AimSettings.toSlider(0) == 100, "" + AimSettings.toSlider(0));
        ui.press(1280 * 0.92f, 720 * 0.03f + 5f);   // botão VOLTAR (canto inferior direito)
        check("VOLTAR fecha a tela", !ui.open, "");

        AimSettings.reset();
        System.out.println("\nRESULTADO: " + pass + " ok, " + fail + " falhas");
        System.exit(fail == 0 ? 0 : 1);
    }
}
