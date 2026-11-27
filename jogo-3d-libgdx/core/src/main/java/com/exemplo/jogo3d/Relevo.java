package com.exemplo.jogo3d;

import com.badlogic.gdx.math.MathUtils;

import java.util.ArrayList;
import java.util.Random;

/**
 * Relevo natural do mapa battle royale. É determinístico (mesma semente, mesmo mapa).
 *
 * Camadas somadas:
 * - formas grandes: montes (Gauss suave), colinas, vales e depressões, platôs (topo plano com borda
 *   íngreme) e pequenos penhascos (borda quase vertical, intransponível para o personagem);
 * - ruído em quatro escalas (de centenas de metros até ~16 m) para o terreno não parecer de formas
 *   geométricas;
 * - a serra existente (Regions.hillHeight) e a elevação das bordas do mapa.
 *
 * Lugares importantes (vila, fazendas, cemitério, açude, poço e o nascimento) são "protegidos": o
 * relevo em volta deles é trocado pela altura média da área, com transição suave, para que as
 * construções fiquem em chão plano.
 */
final class Relevo {
    private static final long SEMENTE = 1140L;

    // Tipos de forma
    private static final int MONTE = 0, COLINA = 1, VALE = 2, PLATO = 3, PENHASCO = 4;

    // Formas: centro, raio, altura (negativa no vale), largura da borda (platô e penhasco) e tipo
    private static final float[] FX, FZ, FR, FH, FE;
    private static final int[] FT;

    static {
        Random r = new Random(SEMENTE);
        ArrayList<float[]> lista = new ArrayList<>();
        // Montes grandes: raio de 240 a 320 m e altura de 55 a 95 m (encostas de até ~35°)
        for (int i = 0; i < 10; i++) lista.add(forma(r, MONTE, 240f, 320f, 40f, 70f, 0f, 200f));
        // Morros e colinas médias
        for (int i = 0; i < 55; i++) lista.add(forma(r, COLINA, 60f, 110f, 5f, 12f, 0f, 120f));
        // Vales e depressões (negativas)
        for (int i = 0; i < 20; i++) lista.add(forma(r, VALE, 90f, 150f, 8f, 14f, 0f, 140f));
        // Regiões elevadas: platôs com borda de 55 a 70 m
        for (int i = 0; i < 7; i++) lista.add(forma(r, PLATO, 110f, 150f, 12f, 20f, 0f, 200f));
        // Pequenos penhascos: 4 a 6 m de altura numa borda de 5 m
        for (int i = 0; i < 14; i++) lista.add(forma(r, PENHASCO, 25f, 40f, 4f, 6f, 0f, 200f));
        int n = lista.size();
        FX = new float[n]; FZ = new float[n]; FR = new float[n]; FH = new float[n]; FE = new float[n]; FT = new int[n];
        for (int i = 0; i < n; i++) {
            float[] f = lista.get(i);
            FX[i] = f[0]; FZ[i] = f[1]; FR[i] = f[2]; FH[i] = f[3]; FE[i] = f[4]; FT[i] = (int) f[5];
        }
    }

    /** Sorteia uma forma: posição fora do nascimento (distância mínima ao centro, 'minDist'). */
    private static float[] forma(Random r, int tipo, float rMin, float rMax, float hMin, float hMax, float minDist, float limite) {
        float x, z;
        do {
            x = (r.nextFloat() * 2f - 1f) * (World.HALF - 60f);
            z = (r.nextFloat() * 2f - 1f) * (World.HALF - 60f);
        } while (Math.hypot(x, z) < minDist + 200f && tipo == MONTE);
        float raio = rMin + r.nextFloat() * (rMax - rMin);
        float h = hMin + r.nextFloat() * (hMax - hMin);
        if (tipo == VALE) h = -h;
        float borda = tipo == PLATO ? 90f + r.nextFloat() * 20f : tipo == PENHASCO ? 5f : 0f;
        return new float[]{x, z, raio, h, borda, tipo};
    }

    // ---------- ruído ----------

    private static float valor(int i, int j) {
        int n = i * 374761393 + j * 668265263;
        n = (n ^ (n >>> 13)) * 1274126177;
        n ^= n >>> 16;
        return (n & 0xffff) / 65535f;
    }

    /** Ruído de valor suave em [-1, 1]. */
    static float ruido(float x, float z) {
        int i = (int) Math.floor(x), j = (int) Math.floor(z);
        float fx = x - i, fz = z - j;
        float u = fx * fx * (3f - 2f * fx), v = fz * fz * (3f - 2f * fz);
        float a = valor(i, j), b = valor(i + 1, j), c = valor(i, j + 1), d = valor(i + 1, j + 1);
        return (MathUtils.lerp(MathUtils.lerp(a, b, u), MathUtils.lerp(c, d, u), v)) * 2f - 1f;
    }

    /** Terreno ondulado em quatro escalas: de centenas de metros até ~16 m. */
    static float fbm(float x, float z) {
        // amplitudes pequenas nas escalas curtas: o ruído fino soma muita inclinação
        return 12f * ruido(x / 300f, z / 300f)
                + 5f * ruido(x / 120f + 7.3f, z / 120f - 3.1f)
                + 1.8f * ruido(x / 45f + 1.7f, z / 45f + 5.2f)
                + 0.6f * ruido(x / 16f, z / 16f + 2.2f);
    }

    // ---------- formas ----------

    private static float suave(float t) {
        t = MathUtils.clamp(t, 0f, 1f);
        return t * t * (3f - 2f * t);
    }

    private static float forma(int i, float d) {
        float R = FR[i];
        switch (FT[i]) {
            case MONTE:
            case COLINA:
            case VALE: {
                float t = d / R;
                if (t >= 1f) return 0f;
                float b = 1f - t * t;
                return FH[i] * b * b;   // (1 - t²)²: topo suave e encosta que vai a zero sem quina
            }
            default: {   // platô e penhasco: topo plano, borda de largura FE
                if (d >= R) return 0f;
                float inner = R - FE[i];
                if (d <= inner) return FH[i];
                return FH[i] * suave((R - d) / FE[i]);
            }
        }
    }

    // ---------- relevo bruto (sem as zonas protegidas) ----------

    /** Relevo natural sem proteção de lugares: a base de tudo. */
    static float bruto(float x, float z) {
        // domínio distorcido: as bordas das formas ficam irregulares, sem círculos perfeitos
        float wx = x + 45f * ruido(x / 260f + 11f, z / 260f + 3f);
        float wz = z + 45f * ruido(x / 260f - 4f, z / 260f + 17f);
        float y = 0f;
        for (int i = 0; i < FX.length; i++) {
            float dx = wx - FX[i], dz = wz - FZ[i];
            float d = (float) Math.sqrt(dx * dx + dz * dz);
            // formas longe da origem não entram se estiverem muito longe (poupa conta)
            if (d > FR[i] + 2f) continue;
            y += forma(i, d);
        }
        y += fbm(x, z);
        y += 0.5f * Regions.hillHeight(x, z);   // serra existente (suavizada: a borda da máscara era íngreme)
        // bordas do mapa: elevações irregulares
        float edge = Math.max(Math.abs(x), Math.abs(z));
        float k = suave((edge - 430f) / 110f);
        y += 16f * k * (0.6f + 0.4f * MathUtils.sin(x * 0.07f + 0.5f) * MathUtils.cos(z * 0.06f - 0.9f));
        return y;
    }

    // ---------- zonas protegidas ----------

    // Cada zona: x, z, raio pleno, largura da transição, altura média da área
    private static final ArrayList<float[]> PROTEGIDOS = new ArrayList<>();

    /** Apaga as zonas protegidas (antes de montar um novo mundo). */
    static void limpa() {
        PROTEGIDOS.clear();
    }

    /**
     * Protege um lugar: dentro de 'raio' o chão fica na altura média do relevo natural da área, e
     * em volta ele vai se ajustando ao relevo ao longo de 'transicao' metros. Devolve essa altura.
     */
    static float protege(float x, float z, float raio, float transicao) {
        // Já dentro do lugar plano de outra zona: fica com a altura dela (sem degrau)
        for (int k = 0; k < PROTEGIDOS.size(); k++) {
            float[] p = PROTEGIDOS.get(k);
            if (Math.hypot(x - p[0], z - p[1]) < p[2]) return p[4];
        }
        float soma = 0f;
        int n = 0;
        float passo = 6f;
        for (float dx = -raio; dx <= raio; dx += passo)
            for (float dz = -raio; dz <= raio; dz += passo)
                if (dx * dx + dz * dz <= raio * raio) {
                    soma += bruto(x + dx, z + dz);
                    n++;
                }
        float media = n > 0 ? soma / n : bruto(x, z);
        PROTEGIDOS.add(new float[]{x, z, raio, transicao, media});
        return media;
    }

    /** Verdadeiro perto de um penhasco pequeno: ali o paredão é de propósito (não é alisado). */
    static boolean emPenhasco(float x, float z) {
        for (int i = 0; i < FX.length; i++) {
            if (FT[i] != PENHASCO) continue;
            float dx = x - FX[i], dz = z - FZ[i];
            float d = (float) Math.sqrt(dx * dx + dz * dz);
            if (d > FR[i] - FE[i] - 4f && d < FR[i] + 8f) return true;   // só a borda (o topo plano é liso)
        }
        return false;
    }

    /** 0 dentro de um lugar protegido, 1 fora: quanto o relevo natural vale ali. */
    static float fator(float x, float z) {
        float f = 1f;
        for (int k = 0; k < PROTEGIDOS.size(); k++) {
            float[] p = PROTEGIDOS.get(k);
            float d = (float) Math.hypot(x - p[0], z - p[1]);
            f = Math.min(f, suave((d - p[2]) / p[3]));
        }
        return f;
    }

    /** Relevo final: o natural, com os lugares protegidos aplainados. */
    static float base(float x, float z) {
        float natural = bruto(x, z);
        float peso = 0f, soma = 0f, fator = 1f;
        for (int k = 0; k < PROTEGIDOS.size(); k++) {
            float[] p = PROTEGIDOS.get(k);
            float d = (float) Math.hypot(x - p[0], z - p[1]);
            float s = suave((d - p[2]) / p[3]);
            fator = Math.min(fator, s);
            // peso de cada lugar: 1 no meio dele, 0 fora da transição; a altura de referência é a média deles
            float w = 1f - s;
            if (w > 0f) { peso += w; soma += w * p[4]; }
        }
        if (peso <= 0f) return natural;
        float referencia = soma / peso;
        return referencia + (natural - referencia) * fator;
    }
}
