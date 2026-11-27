package com.exemplo.jogo3d;

import com.badlogic.gdx.math.MathUtils;

import java.util.Random;

/**
 * Movimento dos bots da ARENA DE MIRA (sem IA de combate: não atiram, só se movem e recebem dano).
 * CORRENDO: vai e volta numa faixa, velocidade constante de corrida, sem pausa.
 * ANDANDO: caminha numa faixa mais curta e mais lenta, com pausas de 1 a 2 s nos limites.
 * PARADO: fica no lugar, virado para o jogador.
 */
final class BotMira {
    enum Tipo { PARADO, ANDANDO, CORRENDO }

    static final float VEL_ANDANDO = 1.8f, VEL_CORRENDO = 5.5f;
    static final float RESPAWN_SEG = 2.5f;

    final Tipo tipo;
    final float x0, x1, z;               // faixa (x0 a x1) na profundidade z
    private float x;
    private int sentido = 1;             // +1 vai para x1, -1 para x0
    private float pausa = 0f;

    BotMira(Tipo tipo, float x0, float x1, float z) {
        this.tipo = tipo;
        this.x0 = x0;
        this.x1 = x1;
        this.z = z;
        this.x = tipo == Tipo.PARADO ? (x0 + x1) / 2f : x0;
    }

    float x() { return x; }

    float velocidade() {
        switch (tipo) {
            case CORRENDO: return VEL_CORRENDO;
            case ANDANDO: return VEL_ANDANDO;
            default: return 0f;
        }
    }

    /** Animação de movimento: "Run", "Walk" ou "Idle" (também na pausa). */
    String clipe() {
        if (tipo == Tipo.PARADO || pausa > 0f) return "Idle";
        return tipo == Tipo.CORRENDO ? "Run" : "Walk";
    }

    /** Avança o movimento. Devolve o ângulo para onde o bot olha (radianos). */
    float passo(float dt, Random sorteio) {
        if (tipo == Tipo.PARADO) return (float) Math.atan2(0f - x, 0f - z);   // olha para o jogador (na origem)
        if (pausa > 0f) {
            pausa -= dt;
            return sentido > 0 ? MathUtils.PI / 2f : -MathUtils.PI / 2f;
        }
        x += sentido * velocidade() * dt;
        if (x >= x1) { x = x1; sentido = -1; pausa = pausaDoLimite(sorteio); }
        else if (x <= x0) { x = x0; sentido = 1; pausa = pausaDoLimite(sorteio); }
        return sentido > 0 ? MathUtils.PI / 2f : -MathUtils.PI / 2f;
    }

    /** Pausa natural só para o bot que anda; o que corre não para. */
    private float pausaDoLimite(Random sorteio) {
        if (tipo != Tipo.ANDANDO) return 0f;
        return 1f + sorteio.nextFloat();   // 1 a 2 s
    }

    /** Volta ao início da faixa depois de morrer. */
    void reinicia() {
        x = tipo == Tipo.PARADO ? (x0 + x1) / 2f : x0;
        sentido = 1;
        pausa = 0f;
    }
}
