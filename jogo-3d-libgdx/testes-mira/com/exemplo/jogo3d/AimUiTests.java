package com.exemplo.jogo3d;


import com.badlogic.gdx.ApplicationAdapter;
import com.badlogic.gdx.backends.headless.HeadlessApplication;
import com.badlogic.gdx.backends.headless.HeadlessApplicationConfiguration;

/**
 * Tela MIRA E SENSIBILIDADE: conversão dos valores para 0–200, toque, arrasto, rolagem vertical,
 * resoluções, persistência, restaurar e voltar.
 *
 * Roda num HeadlessApplication (sem tela) para que as Preferences existam de verdade e a persistência
 * possa ser verificada. Nenhum teste chama draw(), então não há chamada de OpenGL.
 */
public class AimUiTests extends ApplicationAdapter {
    static int pass = 0, fail = 0;

    static void check(String name, boolean ok, String info) {
        System.out.println((ok ? "  OK   " : "  FALHA") + "  " + name + (info.isEmpty() ? "" : "  [" + info + "]"));
        if (ok) pass++; else fail++;
    }

    public static void main(String[] args) {
        new HeadlessApplication(new AimUiTests(), new HeadlessApplicationConfiguration());
    }

    @Override
    public void create() {
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

        System.out.println("== Rolagem vertical: alcançar a última opção ==");
        AimSettings.reset();
        AimSettingsUi sc = new AimSettingsUi();
        sc.open = true;
        sc.layout(1280, 720);
        int ultimo = AimSettingsUi.RIGHT[AimSettingsUi.RIGHT.length - 1];
        check("a coluna das armas tem conteúdo além da tela (precisa rolar)", sc.maxScrollOf(1) > 1f,
                String.format("%.1f px", sc.maxScrollOf(1)));
        check("ao abrir, a lista começa no topo", sc.scrollOf(1) == 0f, "" + sc.scrollOf(1));
        check("a última opção começa fora da área visível", !sc.linhaVisivel(ultimo), "");
        // Deslizar o dedo para cima na área livre do painel direito
        float[] pan = sc.panelOf(1), view = sc.viewOf();
        float livreX = pan[0] + pan[2] * 0.08f, meioY = view[0] + view[1] * 0.5f;
        sc.press(livreX, meioY);
        sc.drag(livreX, meioY + 400f);
        check("deslizar o dedo para cima rola a lista", sc.scrollOf(1) > 1f, String.format("%.1f px", sc.scrollOf(1)));
        sc.layout(1280, 720);
        check("rolando até o fim, a última opção fica inteira à vista", sc.linhaVisivel(ultimo), "");
        sc.drag(livreX, meioY + 5000f);
        sc.layout(1280, 720);
        check("a rolagem para no fim do conteúdo", sc.scrollOf(1) <= sc.maxScrollOf(1) + 0.01f,
                String.format("%.1f de %.1f", sc.scrollOf(1), sc.maxScrollOf(1)));
        sc.drag(livreX, meioY - 5000f);
        check("a rolagem para no topo", sc.scrollOf(1) >= 0f, "" + sc.scrollOf(1));
        sc.release();
        check("a coluna que cabe inteira não rola", sc.maxScrollOf(0) == 0f, "" + sc.maxScrollOf(0));

        System.out.println("== Slider e rolagem não se confundem ==");
        AimSettings.reset();
        AimSettingsUi mix = new AimSettingsUi();
        mix.open = true;
        mix.layout(1280, 720);
        float[] tb = mix.trackOf(AimSettingsUi.RIGHT[0]);
        mix.press(tb[0] + (tb[1] - tb[0]) * 0.5f, tb[2]);
        float rolagemAntes = mix.scrollOf(1);
        mix.drag(tb[0] + (tb[1] - tb[0]) * 0.9f, tb[2] + 300f);
        check("arrastando a barra o valor muda", AimSettings.toSlider(AimSettingsUi.RIGHT[0]) == 180,
                "" + AimSettings.toSlider(AimSettingsUi.RIGHT[0]));
        check("arrastando a barra a lista NÃO rola", mix.scrollOf(1) == rolagemAntes, "" + mix.scrollOf(1));
        mix.release();
        int valorAntes = AimSettings.toSlider(AimSettingsUi.RIGHT[0]);
        float[] pan2 = mix.panelOf(1), view2 = mix.viewOf();
        mix.press(pan2[0] + pan2[2] * 0.08f, view2[0] + view2[1] * 0.5f);
        mix.drag(pan2[0] + pan2[2] * 0.08f, view2[0] + view2[1] * 0.5f + 300f);
        check("rolando a área livre nenhum valor muda", AimSettings.toSlider(AimSettingsUi.RIGHT[0]) == valorAntes,
                "" + AimSettings.toSlider(AimSettingsUi.RIGHT[0]));
        mix.release();
        AimSettingsUi tap = new AimSettingsUi();
        tap.open = true;
        tap.layout(1280, 720);
        float[] pan3 = tap.panelOf(1), view3 = tap.viewOf();
        tap.press(pan3[0] + pan3[2] * 0.08f, view3[0] + view3[1] * 0.5f);
        tap.drag(pan3[0] + pan3[2] * 0.08f, view3[0] + view3[1] * 0.5f + 8f);
        check("um toque com tremor de 8 px não rola (limiar de 12 px)", tap.scrollOf(1) == 0f, "" + tap.scrollOf(1));
        tap.release();

        System.out.println("== Resoluções e proporções de celular ==");
        int[][] telas = {{1280, 720}, {1600, 720}, {2400, 1080}, {1920, 800}, {960, 540}, {2340, 1080}};
        boolean dentro = true, alcanca = true;
        StringBuilder det = new StringBuilder();
        for (int[] d : telas) {
            AimSettingsUi u = new AimSettingsUi();
            u.open = true;
            u.layout(d[0], d[1]);
            float[] v = u.viewOf();
            for (int c = 0; c < 2; c++) {
                int[] lista = c == 0 ? AimSettingsUi.LEFT : AimSettingsUi.RIGHT;
                float[] pn = u.panelOf(c);
                for (int idx : lista) {
                    float[] tr = u.trackOf(idx);
                    if (tr[0] < pn[0] || tr[1] > pn[0] + pn[2] || tr[1] > d[0]) dentro = false;
                }
                // Rolando até o fim, a última linha da coluna tem de caber inteira
                float fim = u.maxScrollOf(c);
                float ycUltimo = v[0] + v[1] - (lista.length - 0.5f) * u.rowHeight() + fim;
                if (ycUltimo - u.rowHeight() * 0.5f < v[0] - 0.5f) alcanca = false;
            }
            det.append(d[0]).append("x").append(d[1]).append(" ");
        }
        check("as barras ficam dentro do painel em todas as resoluções", dentro, det.toString());
        check("em todas as resoluções a rolagem alcança a última opção", alcanca, det.toString());

        System.out.println("== Persistência dos valores ==");
        AimSettings.reset();
        AimSettings.set(0, 1.3f);
        AimSettings.set(AimSettings.ABERTURA_0 + 2, 0.7f);
        AimSettings.save();
        AimSettings.reset();
        check("depois de RESTAURAR, a sensibilidade volta a 100", AimSettings.toSlider(0) == 100, "" + AimSettings.toSlider(0));
        AimSettings.load();
        check("os valores salvos voltam ao carregar", AimSettings.toSlider(0) == 130
                        && AimSettings.toSlider(AimSettings.ABERTURA_0 + 2) == 70,
                AimSettings.toSlider(0) + " / " + AimSettings.toSlider(AimSettings.ABERTURA_0 + 2));
        AimSettings.reset();
        AimSettings.save();

        AimSettings.reset();
        System.out.println("\nRESULTADO: " + pass + " ok, " + fail + " falhas");
        System.exit(fail == 0 ? 0 : 1);
    }
}
