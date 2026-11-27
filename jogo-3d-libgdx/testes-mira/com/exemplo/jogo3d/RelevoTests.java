package com.exemplo.jogo3d;

import com.badlogic.gdx.ApplicationAdapter;
import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.backends.headless.HeadlessApplication;
import com.badlogic.gdx.backends.headless.HeadlessApplicationConfiguration;
import com.badlogic.gdx.graphics.GL20;

import java.io.DataOutputStream;
import java.lang.reflect.Proxy;
import java.util.ArrayDeque;

/** Relevo do mapa battle royale: variação, zonas planas, alcance do jogador e paredões. */
public class RelevoTests extends ApplicationAdapter {
    private static int ok = 0, falhas = 0;

    static void check(String nome, boolean cond, String info) {
        if (cond) { ok++; System.out.println("  OK     " + nome + (info.isEmpty() ? "" : "  [" + info + "]")); }
        else { falhas++; System.out.println("  FALHA  " + nome + "  [" + info + "]"); }
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
            falhas++;
        }
        System.out.println("\nRESULTADO: " + ok + " ok, " + falhas + " falhas");
        System.exit(falhas == 0 ? 0 : 1);
    }

    private void run() throws Exception {
        long t0 = System.nanoTime();
        World w = new World();
        w.create();
        double ms = (System.nanoTime() - t0) / 1e6;
        System.out.println("Montagem do mundo (relevo + terreno): " + String.format("%.0f", ms) + " ms");

        int n = World.ALT_N;
        float passo = World.ALT_PASSO;
        float[][] h = new float[n][n];
        float mn = 1e9f, mx = -1e9f;
        for (int j = 0; j < n; j++) for (int i = 0; i < n; i++) {
            float x = -World.HALF + i * passo, z = -World.HALF + j * passo;
            h[j][i] = w.heightAt(x, z);
            mn = Math.min(mn, h[j][i]);
            mx = Math.max(mx, h[j][i]);
        }
        System.out.println("Altura: mínima " + String.format("%.1f", mn) + " m, máxima " + String.format("%.1f", mx) + " m");

        System.out.println("== Variação do relevo ==");
        check("há grandes variações de altura (amplitude > 90 m)", mx - mn > 90f, String.format("%.0f m", mx - mn));
        check("nenhum ponto abaixo de -40 m nem acima de 220 m", mn > -40f && mx < 220f, String.format("%.0f .. %.0f", mn, mx));

        System.out.println("== Inclinação ==");
        // Medida igual à que o jogador sente: subida entre dois pontos vizinhos da grade (3 m)
        int paredao = 0, encosta = 0, total = 0, penhasco = 0;
        for (int j = 0; j < n; j++) for (int i = 0; i < n; i++) {
            float x = -World.HALF + i * passo, z = -World.HALF + j * passo;
            boolean pen = Relevo.emPenhasco(x, z);
            for (int k = 0; k < 2; k++) {
                int ii = i + (k == 0 ? 1 : 0), jj = j + (k == 1 ? 1 : 0);
                if (ii >= n || jj >= n) continue;
                float g = Math.abs(h[jj][ii] - h[j][i]) / passo;
                total++;
                if (g > 0.95f) { if (pen) penhasco++; else paredao++; }
                else if (g > 0.6f) encosta++;
            }
        }
        check("paredões fora dos penhascos são raros (< 1% dos trechos do mapa)", paredao < 0.01 * total,
                String.format("%.2f%% dos trechos", 100.0 * paredao / total));
        System.out.println("  INFO   penhascos pequenos (paredão de propósito): " + String.format("%.2f%%", 100.0 * penhasco / total));
        System.out.println("  INFO   encostas fortes (34° a 43°): " + String.format("%.1f%%", 100.0 * encosta / total));

        System.out.println("== Lugares planos ==");
        float range = 0f;
        for (float dx = -8f; dx <= 8f; dx += 1f) for (float dz = -8f; dz <= 8f; dz += 1f) {
            float hh = w.heightAt(dx, dz);
            range = Math.max(range, Math.abs(hh - w.heightAt(0f, 0f)));
        }
        check("nascimento plano (8 m em volta, até 1 m de desnível)", range < 1f, String.format("%.2f m", range));
        float tr = 0f, t0h = w.heightAt(World.TOWN_X, World.TOWN_Z);
        for (float dx = -45f; dx <= 45f; dx += 3f) for (float dz = -45f; dz <= 45f; dz += 3f)
            if (dx * dx + dz * dz <= 45f * 45f) tr = Math.max(tr, Math.abs(w.heightAt(World.TOWN_X + dx, World.TOWN_Z + dz) - t0h));
        check("vila plana (pegada de 45 m de raio, até 3 m)", tr < 3f, String.format("%.2f m", tr));

        System.out.println("== Rio raso ==");
        int ok2 = 0, tot2 = 0;
        for (float z = -500f; z <= 500f; z += 50f) {
            float xr = World.riverX(z);
            tot2++;
            if (w.heightAt(xr, z) < w.heightAt(xr + 8f, z) - 1f) ok2++;
        }
        check("o leito do rio fica abaixo das margens (todo o trecho)", ok2 == tot2, ok2 + "/" + tot2);

        System.out.println("== Alcance do jogador ==");
        int step = 6;
        int nn = World.ALT_N;
        boolean[][] vis = new boolean[(int) (World.SIZE / step) + 1][(int) (World.SIZE / step) + 1];
        int m = vis.length;
        int si = (int) ((World.HALF) / step), sj = si;
        ArrayDeque<int[]> fila = new ArrayDeque<>();
        fila.add(new int[]{si, sj});
        vis[si][sj] = true;
        int alcancados = 1, caminaveis = 0;
        int[][] dirs = {{1, 0}, {-1, 0}, {0, 1}, {0, -1}, {1, 1}, {1, -1}, {-1, 1}, {-1, -1}};
        while (!fila.isEmpty()) {
            int[] c = fila.poll();
            float x0 = -World.HALF + c[0] * step, z0 = -World.HALF + c[1] * step;
            for (int[] d : dirs) {
                int a = c[0] + d[0], b = c[1] + d[1];
                if (a < 0 || b < 0 || a >= m || b >= m || vis[a][b]) continue;
                float x1 = -World.HALF + a * step, z1 = -World.HALF + b * step;
                if (!w.podeAndar(x0, z0, x1, z1)) continue;
                vis[a][b] = true;
                alcancados++;
                fila.add(new int[]{a, b});
            }
        }
        for (int j = 0; j < m; j++) for (int i = 0; i < m; i++) {
            float x = -World.HALF + i * step, z = -World.HALF + j * step;
            if (Math.hypot(x, z) < 1000) caminaveis++;
        }
        double frac = (double) alcancados / (m * m);
        check("do nascimento dá para alcançar a maior parte do mapa (> 80%)", frac > 0.80, String.format("%.1f%%", 100 * frac));
        int pico = 0; float alto = -1e9f; int pi = 0, pj = 0;
        for (int j = 0; j < m; j++) for (int i = 0; i < m; i++) {
            float hh = w.heightAt(-World.HALF + i * step, -World.HALF + j * step);
            if (hh > alto) { alto = hh; pi = i; pj = j; }
        }
        check("o ponto mais alto do mapa é alcançável", vis[pi][pj], String.format("pico %.0f m", alto));

        System.out.println("== Exportação para conferência ==");
        String saida = System.getProperty("alturas.saida", "/tmp/claude-0/alturas.bin");
        try (DataOutputStream out = new DataOutputStream(new java.io.FileOutputStream(saida))) {
            out.writeInt(n);
            out.writeFloat(passo);
            for (int j = 0; j < n; j++) for (int i = 0; i < n; i++) out.writeFloat(h[j][i]);
        }
        System.out.println("  INFO   alturas gravadas em " + saida);

        System.out.println("\n" + (falhas == 0 ? "Todos os testes de relevo passaram." : "Há falhas."));
    }

    public static void main(String[] args) {
        new HeadlessApplication(new RelevoTests(), new HeadlessApplicationConfiguration());
    }
}
