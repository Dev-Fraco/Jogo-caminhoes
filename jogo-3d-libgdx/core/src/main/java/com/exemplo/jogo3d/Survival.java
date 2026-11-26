package com.exemplo.jogo3d;

import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.audio.Sound;
import com.badlogic.gdx.math.MathUtils;

/**
 * Vida e energia (boost) do jogador, e o uso dos itens de cura.
 *
 * Cura: bandagem (4 s, +15 até 75%) e kit médico (8 s, enche a vida) — o personagem se abaixa e,
 * se andar, correr ou pular, cancela. Energia: analgésico (+60), injeção (+100) e energético (+40) —
 * dá para usar andando. Com energia, a vida volta devagar e, acima de 60%, corre um pouco mais.
 * Descansar (fogueira, rede) recupera vida.
 */
final class Survival {
    static final int MEDKIT = 0, BANDAGEM = 1, ANALGESICO = 2, INJECAO = 3, ENERGETICO = 4;

    float health = 100f, boost = 0f;
    int using = -1;           // item em uso, -1 = nada
    float useT, useDur;
    boolean dead = false;
    float deadT = 0f;
    float stun = 0f;          // clarão da granada atordoante (0..1 da tela branca)
    float hurt = 0f;          // vermelho de dano na tela
    float shake = 0f;         // tremor da câmera ao levar tiro (m)
    float restBonus = 0f;     // vida por segundo de descanso (fogueira, rede)
    String message = null;    // aviso curto (ex.: "VIDA JÁ ESTÁ CHEIA")
    float messageT = 0f;

    private static Sound healSound;

    Survival() {
        try {
            healSound = Gdx.audio.newSound(Gdx.files.internal("audio/curativo.wav"));
        } catch (Throwable t) {
            healSound = null;
        }
    }

    static boolean isHeal(int type) { return type == MEDKIT || type == BANDAGEM; }
    static boolean isBoost(int type) { return type == ANALGESICO || type == INJECAO || type == ENERGETICO; }

    static float duration(int type) {
        switch (type) {
            case MEDKIT: return 8f;
            case BANDAGEM: return 4f;
            case ANALGESICO: return 6f;
            case INJECAO: return 6f;
            case ENERGETICO: return 4f;
            default: return 1f;
        }
    }

    /** Pode usar agora? Se não, deixa o motivo em message. */
    boolean canUse(int type) {
        if (dead || using >= 0 && using != type) {
            if (!dead) say("JÁ ESTÁ USANDO OUTRO ITEM");
            return false;
        }
        if (type == BANDAGEM && health >= 75f) { say("BANDAGEM SÓ CURA ATÉ 75%"); return false; }
        if (type == MEDKIT && health >= 100f) { say("VIDA JÁ ESTÁ CHEIA"); return false; }
        if (isBoost(type) && boost >= 100f) { say("ENERGIA JÁ ESTÁ CHEIA"); return false; }
        return using != type;
    }

    void start(int type) {
        using = type;
        useT = 0f;
        useDur = duration(type);
        if (healSound != null) healSound.play(0.7f);
    }

    void cancel() {
        if (using >= 0) say("CANCELADO");
        using = -1;
    }

    /** Uso em andamento que exige ficar parado (cura). */
    boolean usingStill() { return using >= 0 && isHeal(using); }

    float progress() { return using < 0 ? 0f : MathUtils.clamp(useT / useDur, 0f, 1f); }

    /**
     * Um quadro. Devolve o item que acabou de ser usado (para tirar da mochila), ou -1.
     * moving = o jogador andou/correu/pulou (cancela a cura).
     */
    int update(float dt, boolean moving) {
        if (messageT > 0f) messageT -= dt;
        stun = Math.max(0f, stun - dt * 0.28f);
        hurt = Math.max(0f, hurt - dt * 2.2f);
        if (dead) {
            deadT += dt;
            return -1;
        }
        if (boost > 0f) {
            boost = Math.max(0f, boost - dt * 100f / 200f);  // ~3 min e meio de energia cheia
            health = Math.min(100f, health + dt * (boost > 60f ? 1.0f : 0.5f));
        }
        if (restBonus > 0f) health = Math.min(100f, health + dt * restBonus);

        int done = -1;
        if (using >= 0) {
            if (moving && usingStill()) {
                cancel();
            } else {
                useT += dt;
                if (useT >= useDur) {
                    done = using;
                    apply(using);
                    using = -1;
                }
            }
        }
        return done;
    }

    private void apply(int type) {
        switch (type) {
            case MEDKIT: health = 100f; break;
            case BANDAGEM: health = Math.max(health, Math.min(75f, health + 15f)); break;
            case ANALGESICO: boost = Math.min(100f, boost + 60f); break;
            case INJECAO: boost = 100f; break;
            case ENERGETICO: boost = Math.min(100f, boost + 40f); break;
            default: break;
        }
    }

    /** Velocidade extra com a energia acima de 60%. */
    float speedMul() { return boost > 60f ? 1.08f : 1f; }

    void damage(float amount, boolean flash) {
        if (dead) return;
        if (flash) shake = Math.min(0.12f, shake + 0.02f + amount * 0.002f);   // tremor da câmera (tiro)
        health -= amount;
        if (flash) hurt = Math.min(0.8f, hurt + 0.3f + amount / 100f);
        if (health <= 0f) {
            health = 0f;
            dead = true;
            deadT = 0f;
            using = -1;
        }
    }

    void say(String m) {
        message = m;
        messageT = 2f;
    }

    /** Volta ao avião depois de morrer: tudo cheio de novo. */
    void reset() {
        health = 100f;
        boost = 0f;
        using = -1;
        dead = false;
        deadT = 0f;
        stun = 0f;
        hurt = 0f;
    }

    static String verb(int type) {
        return "USANDO " + Items.NAMES[type];
    }

    void dispose() {
        if (healSound != null) healSound.dispose();
    }
}
