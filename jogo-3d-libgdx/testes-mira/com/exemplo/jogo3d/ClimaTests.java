package com.exemplo.jogo3d;

import com.badlogic.gdx.ApplicationAdapter;
import com.badlogic.gdx.backends.headless.HeadlessApplication;
import com.badlogic.gdx.backends.headless.HeadlessApplicationConfiguration;

/** Quadrantes e mistura dos climas do mapa. */
public class ClimaTests extends ApplicationAdapter {
    private static int ok = 0, falhas = 0;

    static void check(String nome, boolean cond, String info) {
        if (cond) { ok++; System.out.println("  OK     " + nome + (info.isEmpty() ? "" : "  [" + info + "]")); }
        else { falhas++; System.out.println("  FALHA  " + nome + "  [" + info + "]"); }
    }

    @Override
    public void create() {
        try {
            run();
        } catch (Throwable t) {
            t.printStackTrace();
            falhas++;
        }
        System.out.println("\nRESULTADO: " + ok + " ok, " + falhas + " falhas");
        System.exit(falhas == 0 ? 0 : 1);
    }

    private void run() {
        System.out.println("== Quadrantes do mapa ==");
        check("1 (esquerda de cima) é inverno", Clima.quadrante(-100f, -100f) == Clima.INVERNO, "");
        check("2 (direita de cima) é mangue", Clima.quadrante(100f, -100f) == Clima.MANGUE, "");
        check("3 (esquerda de baixo) é inverno", Clima.quadrante(-100f, 100f) == Clima.INVERNO, "");
        check("4 (direita de baixo) é deserto", Clima.quadrante(100f, 100f) == Clima.DESERTO, "");

        System.out.println("== Mistura do chão ==");
        float[] longe = {0.5f, 0.4f, 0.3f};
        Clima.mistura(-300f, -300f, longe);
        check("longe da borda, quadrante 1 fica branco-azulado", longe[0] > 0.85f && longe[2] > 0.85f, String.format("%.2f %.2f %.2f", longe[0], longe[1], longe[2]));
        float[] deserto = {0.5f, 0.4f, 0.3f};
        Clima.mistura(300f, 300f, deserto);
        check("deserto (quadrante 4) mantém a cor da região", deserto[0] == 0.5f && deserto[1] == 0.4f && deserto[2] == 0.3f, "");
        float[] mangue = {0.5f, 0.4f, 0.3f};
        Clima.mistura(300f, -300f, mangue);
        check("longe da borda, quadrante 2 fica verde-lama", mangue[1] < 0.4f && mangue[0] < 0.4f, String.format("%.2f %.2f %.2f", mangue[0], mangue[1], mangue[2]));
        float[] borda = {0.5f, 0.4f, 0.3f};
        Clima.mistura(0f, 0f, borda);
        check("na borda (0,0) a cor é intermediária", borda[0] > 0.3f && borda[0] < 0.9f, String.format("%.2f", borda[0]));
        float[] suavizada = {0.5f, 0.4f, 0.3f};
        Clima.mistura(-1f, 0f, suavizada);
        float[] antes = {0.5f, 0.4f, 0.3f};
        Clima.mistura(-2f, 0f, antes);
        check("a transição é suave (pontos vizinhos com cores vizinhas)", Math.abs(suavizada[0] - antes[0]) < 0.02f, String.format("%.3f x %.3f", suavizada[0], antes[0]));

        System.out.println("\n" + (falhas == 0 ? "Todos os testes de clima passaram." : "Há falhas."));
    }

    public static void main(String[] args) {
        new HeadlessApplication(new ClimaTests(), new HeadlessApplicationConfiguration());
    }
}
