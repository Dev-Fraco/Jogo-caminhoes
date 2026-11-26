package com.exemplo.jogo3d;

import com.badlogic.gdx.math.MathUtils;

import java.util.Arrays;
import java.util.Random;

/**
 * Regiões e relevo do mundo expandido. Tudo é função contínua da posição, então as transições entre
 * regiões são suaves (não há bordas retas). Usado pelo terreno (altura e cor do solo) e pela
 * distribuição da vegetação e dos objetos.
 *
 * - SERRA: morros e serras longe da estrada e da vila (o relevo sobe só ali).
 * - FONTE: beira do leito do rio seco (cacimbas e pés de árvore secas).
 * - VILA: o povoado (raio de 120 m do centro).
 * - FAZENDA: fazendas abandonadas (centros sorteados fixos, longe da estrada e da vila).
 * - ESTRADA: faixa de 25 m da estrada de terra.
 * - SERTAO: caatinga aberta, solo amarelado e seco (o resto).
 */
final class Regions {
    enum Region { SERTAO, SERRA, FONTE, VILA, FAZENDA, ESTRADA }

    /** Centros das fazendas abandonadas (fixos: o mesmo mapa em toda partida). */
    static final float[] FARM_X, FARM_Z;

    static {
        Random r = new Random(1915L * 7L);
        float[] fx = new float[7], fz = new float[7];
        int n = 0;
        for (int t = 0; t < 4000 && n < 7; t++) {
            float x = (r.nextFloat() * 2f - 1f) * 440f, z = (r.nextFloat() * 2f - 1f) * 440f;
            if (Math.abs(z - World.roadZ(x)) < 90f) continue;            // longe da estrada
            if (Math.hypot(x - World.TOWN_X, z - World.TOWN_Z) < 230f) continue;   // longe da vila
            if (Math.abs(x - World.riverX(z)) < 45f) continue;           // fora do leito do rio
            boolean apart = true;
            for (int k = 0; k < n && apart; k++) apart = Math.hypot(x - fx[k], z - fz[k]) >= 180f;
            if (!apart) continue;
            fx[n] = x;
            fz[n] = z;
            n++;
        }
        FARM_X = Arrays.copyOf(fx, n);
        FARM_Z = Arrays.copyOf(fz, n);
    }

    private Regions() {}

    private static float smooth(float t) {
        t = MathUtils.clamp(t, 0f, 1f);
        return t * t * (3f - 2f * t);
    }

    /** Onda suave do relevo, entre -1 e 1. */
    private static float wave(float x, float z) {
        return 0.55f * MathUtils.sin(x * 0.0061f + 0.8f) * MathUtils.cos(z * 0.0057f - 0.4f)
                + 0.30f * MathUtils.sin(x * 0.0139f - z * 0.0113f + 2.3f)
                + 0.15f * MathUtils.sin(x * 0.0271f + z * 0.0233f + 4.1f);
    }

    /** Quanto de serra pode haver aqui (0 perto da estrada, da vila e das fazendas; 1 longe de tudo). */
    static float hillMask(float x, float z) {
        float dr = Math.abs(z - World.roadZ(x));
        float m1 = smooth((dr - 100f) / 50f);
        float dt = (float) Math.hypot(x - World.TOWN_X, z - World.TOWN_Z);
        float m2 = smooth((dt - 170f) / 70f);
        float df = farmDist(x, z);
        float m3 = smooth((df - 80f) / 50f);
        return m1 * m2 * m3;
    }

    /** Altura extra das serras (m). Zero onde não há serra. */
    static float hillHeight(float x, float z) {
        float m = hillMask(x, z);
        if (m <= 0f) return 0f;
        float n = 0.5f + 0.5f * wave(x, z);
        float s = smooth((n - 0.45f) / 0.4f);
        return 30f * s * s * m;
    }

    /** Distância até a fazenda mais próxima (m). */
    static float farmDist(float x, float z) {
        float best = 1e9f;
        for (int i = 0; i < FARM_X.length; i++) best = Math.min(best, (float) Math.hypot(x - FARM_X[i], z - FARM_Z[i]));
        return best;
    }

    /** Região do ponto (pela ordem: vila, fazenda, fonte, estrada, serra, sertão). */
    static Region at(float x, float z) {
        if (Math.hypot(x - World.TOWN_X, z - World.TOWN_Z) < 120f) return Region.VILA;
        if (farmDist(x, z) < 60f) return Region.FAZENDA;
        if (Math.abs(x - World.riverX(z)) < 25f) return Region.FONTE;
        if (Math.abs(z - World.roadZ(x)) < 25f) return Region.ESTRADA;
        if (hillHeight(x, z) > 8f) return Region.SERRA;
        return Region.SERTAO;
    }

    /**
     * Cor do solo (multiplicador RGB, sem o sombreamento das encostas). Muda suave: o sertão é amarelado,
     * a serra é mais cinza e fria, a beira do rio é mais verde-seca e a vila e as fazendas são mais quentes.
     */
    static void tint(float x, float z, float[] out) {
        float h = smooth(hillHeight(x, z) / 30f);
        float r = MathUtils.lerp(1.00f, 0.84f, h), g = MathUtils.lerp(0.92f, 0.80f, h), b = MathUtils.lerp(0.74f, 0.76f, h);
        float rw = 0.5f * (1f - smooth(Math.abs(x - World.riverX(z)) / 35f));
        r = MathUtils.lerp(r, 0.80f, rw);
        g = MathUtils.lerp(g, 0.88f, rw);
        b = MathUtils.lerp(b, 0.70f, rw);
        float vf = 0.35f * (1f - smooth((float) Math.hypot(x - World.TOWN_X, z - World.TOWN_Z) / 180f));
        r = MathUtils.lerp(r, 1.00f, vf);
        g = MathUtils.lerp(g, 0.86f, vf);
        b = MathUtils.lerp(b, 0.66f, vf);
        out[0] = r;
        out[1] = g;
        out[2] = b;
    }
}
