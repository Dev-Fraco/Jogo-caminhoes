package com.exemplo.jogo3d;

import com.badlogic.gdx.ApplicationAdapter;
import com.badlogic.gdx.backends.headless.HeadlessApplication;
import com.badlogic.gdx.backends.headless.HeadlessApplicationConfiguration;

import java.io.File;

/** Quadrantes dos climas, texturas e pedaços do terreno (cada pedaço num único clima). */
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

        System.out.println("== Texturas ==");
        for (Clima c : Clima.values()) {
            File f = new File(c.arquivo);
            check("textura de " + c + " existe", f.exists(), c.arquivo);
        }

        System.out.println("== Pedaços do terreno ==");
        float chunk = World.SIZE / World.CHUNKS;
        boolean todos = true;
        int misturados = 0;
        for (int ci = 0; ci < World.CHUNKS; ci++) {
            for (int cj = 0; cj < World.CHUNKS; cj++) {
                float x0 = -World.HALF + ci * chunk, z0 = -World.HALF + cj * chunk;
                Clima ref = Clima.quadrante(x0 + 0.01f, z0 + 0.01f);
                for (float dx : new float[]{0.01f, chunk - 0.01f})
                    for (float dz : new float[]{0.01f, chunk - 0.01f})
                        if (Clima.quadrante(x0 + dx, z0 + dz) != ref) { todos = false; misturados++; }
            }
        }
        check("cada pedaço do terreno fica num único clima", todos, "pedaços misturados: " + misturados);
        check("o meio do mapa cai na borda de pedaços (CHUNKS par)", World.CHUNKS % 2 == 0, "CHUNKS = " + World.CHUNKS);

        System.out.println("\n" + (falhas == 0 ? "Todos os testes de clima passaram." : "Há falhas."));
    }

    public static void main(String[] args) {
        new HeadlessApplication(new ClimaTests(), new HeadlessApplicationConfiguration());
    }
}
