package com.exemplo.jogo3d;

import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.audio.Sound;
import com.badlogic.gdx.math.MathUtils;

/**
 * Vida, energia (boost) e água do jogador, e o uso dos itens de cura.
 *
 * Cura: bandagem (4 s, +15 até 75%) e kit médico (8 s, enche a vida) — o personagem se abaixa e,
 * se andar, correr ou pular, cancela. Energia: analgésico (+60), injeção (+100) e energético (+40 e
 * mata um pouco a sede) — dá para usar andando. Com energia, a vida volta devagar e, acima de 60%,
 * corre um pouco mais. Água: a sede vem com o tempo; com a água no fim, perde vida. Bebe no poço.
 */
final class Survival {
    static final int MEDKIT = 0, BANDAGEM = 1, ANALGESICO = 2, INJECAO = 3, ENERGETICO = 4;
    static final int DRINK = 100;   // beber água no poço

    float health = 100f, boost = 0f, water = 100f;
    int using = -1;           // item em uso (ou DRINK), -1 = nada
    float useT, useDur;
    boolean dead = false;
    float deadT = 0f;
    float stun = 0f;          // clarão da granada atordoante (0..1 da tela branca)
    float hurt = 0f;          // vermelho de dano na tela
    String message = null;    // aviso curto (ex.: "VIDA JÁ ESTÁ CHEIA")
    float messageT = 0f;

    private static Sound healSound, drinkSound;

    Survival() {
        try {
            healSound = Gdx.audio.newSound(Gdx.files.internal("audio/curativo.wav"));
            drinkSound = Gdx.audio.newSound(Gdx.files.internal("audio/gole.wav"));
        } catch (Throwable t) {
            healSound = null;
            drinkSound = null;
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
            case DRINK: return 2.2f;
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
        if (isBoost(type) && boost >= 100f && !(type == ENERGETICO && water < 90f)) { say("ENERGIA JÁ ESTÁ CHEIA"); return false; }
        return using != type;
    }

    void start(int type) {
        using = type;
        useT = 0f;
        useDur = duration(type);
        Sound s = type == DRINK ? drinkSound : healSound;
        if (s != null) s.play(0.7f);
    }

    void cancel() {
        if (using >= 0) say("CANCELADO");
        using = -1;
    }

    /** Uso em andamento que exige ficar parado (cura e beber). */
    boolean usingStill() { return using >= 0 && (isHeal(using) || using == DRINK); }

    float progress() { return using < 0 ? 0f : MathUtils.clamp(useT / useDur, 0f, 1f); }

    /**
     * Um quadro. Devolve o item que acabou de ser usado (para tirar da mochila), ou -1.
     * moving = o jogador andou/correu/pulou (cancela cura e bebida).
     */
    int update(float dt, boolean moving) {
        if (messageT > 0f) messageT -= dt;
        stun = Math.max(0f, stun - dt * 0.28f);
        hurt = Math.max(0f, hurt - dt * 2.2f);
        if (dead) {
            deadT += dt;
            return -1;
        }
        // Sede e energia passam com o tempo
        water = Math.max(0f, water - dt * 100f / 600f);      // 10 min para secar
        if (water <= 0f) damage(dt * 0.6f, false);
        if (boost > 0f) {
            boost = Math.max(0f, boost - dt * 100f / 200f);  // ~3 min e meio de energia cheia
            health = Math.min(100f, health + dt * (boost > 60f ? 1.0f : 0.5f));
        }

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
            case ENERGETICO: boost = Math.min(100f, boost + 40f); water = Math.min(100f, water + 25f); break;
            case DRINK: water = 100f; break;
            default: break;
        }
    }

    /** Velocidade extra com a energia acima de 60%. */
    float speedMul() { return boost > 60f ? 1.08f : 1f; }

    void damage(float amount, boolean flash) {
        if (dead) return;
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
        water = 100f;
        using = -1;
        dead = false;
        deadT = 0f;
        stun = 0f;
        hurt = 0f;
    }

    static String verb(int type) {
        return type == DRINK ? "BEBENDO ÁGUA" : "USANDO " + Items.NAMES[type];
    }

    void dispose() {
        if (healSound != null) healSound.dispose();
        if (drinkSound != null) drinkSound.dispose();
    }
}
