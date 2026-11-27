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

        System.out.println("== Transição suave ==");
        float[] w = new float[3];
        boolean soma1 = true;
        for (float x = -World.HALF; x <= World.HALF; x += 37f) for (float z = -World.HALF; z <= World.HALF; z += 37f) {
            Clima.pesos(x, z, w);
            if (Math.abs(w[0] + w[1] + w[2] - 1f) > 1e-4f) soma1 = false;
        }
        check("os pesos dos climas somam 1 em todo o mapa", soma1, "");
        Clima.pesos(0f, -300f, w);
        check("na divisa x = 0, inverno e mangue pesam igual", Math.abs(w[0] - w[1]) < 1e-4f && w[2] == 0f, String.format("%.2f %.2f %.2f", w[0], w[1], w[2]));
        Clima.pesos(-300f, 0f, w);
        check("na divisa z = 0 do lado esquerdo só há inverno", w[0] > 0.999f, String.format("%.3f", w[0]));
        float maior = 0f;
        for (float x = -World.HALF; x < World.HALF; x += 3f) for (float z = -World.HALF; z < World.HALF; z += 3f) {
            Clima.pesos(x, z, w);
            float[] v = new float[3];
            Clima.pesos(x + 3f, z, v);
            for (int k = 0; k < 3; k++) maior = Math.max(maior, Math.abs(w[k] - v[k]));
        }
        check("a mistura é contínua (vizinhos de 3 m mudam pouco)", maior < 0.12f, String.format("maior salto %.3f", maior));
        Clima.pesos(-10f, -300f, w);
        Clima.pesos(10f, -300f, new float[3]);
        check("a faixa tem a largura de FAIXA (40 m)", w[0] < 0.7f && w[0] > 0.5f, String.format("inverno a 10 m: %.2f", w[0]));

        System.out.println("\n" + (falhas == 0 ? "Todos os testes de clima passaram." : "Há falhas."));
    }

    public static void main(String[] args) {
        new HeadlessApplication(new ClimaTests(), new HeadlessApplicationConfiguration());
    }
}
