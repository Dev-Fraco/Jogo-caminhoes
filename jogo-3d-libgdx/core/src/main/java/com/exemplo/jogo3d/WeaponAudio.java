package com.exemplo.jogo3d;

import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.audio.Sound;
import com.badlogic.gdx.math.MathUtils;

/**
 * Sons das armas: um estampido por categoria, recarga, pente vazio, sacar a arma e impactos por
 * material (terra, madeira, pedra, barro, metal, carne). Arquivo que não existir é ignorado (a
 * integração fica pronta para receber o asset). Gerenciamento: intervalo mínimo por som e limite de
 * vozes por janela de 100 ms, para uma rajada rápida não empilhar sons sem fim.
 */
final class WeaponAudio {
    private static final int MAX_VOICES_PER_WINDOW = 7;
    private final Sound[] fire = new Sound[WeaponConfig.Category.values().length];
    private final Sound[] impact = new Sound[Surface.values().length];
    private final float[] impactPitch = new float[Surface.values().length];
    private Sound reload, empty, equip, farShot, cartridge, whizz;
    private float casingT = -1f, lastWhiz = -1f;
    private float now = 0f;
    private float windowStart = 0f;
    private int voices = 0;
    private final float[] lastFire = new float[8], lastImpact = new float[8];
    int played = 0;   // total de sons tocados (testes)

    WeaponAudio() {
        String[] f = {"tiro_pistola", "tiro_revolver", "tiro_smg", "tiro_fuzil", "tiro_espingarda", "tiro_precisao"};
        for (int i = 0; i < f.length && i < fire.length; i++) fire[i] = load(f[i] + ".wav");
        impact[Surface.TERRA.ordinal()] = load("imp_terra.wav");
        impact[Surface.MADEIRA.ordinal()] = load("imp_madeira.wav");
        impact[Surface.PEDRA.ordinal()] = load("imp_pedra.wav");
        impact[Surface.BARRO.ordinal()] = impact[Surface.TERRA.ordinal()];   // taipa: batida surda de barro
        impact[Surface.METAL.ordinal()] = load("imp_metal.wav");
        impact[Surface.CARNE.ordinal()] = load("acerto.wav");
        for (int i = 0; i < impactPitch.length; i++) impactPitch[i] = 1f;
        impactPitch[Surface.BARRO.ordinal()] = 1.25f;
        reload = load("recarga.wav");
        empty = load("vazio.wav");
        equip = load("troca.wav");
        farShot = load("tiro_longe.wav");
        cartridge = load("cartucho.wav");
        whizz = load("zunido.wav");
    }

    private static Sound load(String file) {
        try {
            return Gdx.audio.newSound(Gdx.files.internal("audio/" + file));
        } catch (Throwable t) {
            return null;   // asset ausente: segue sem o som
        }
    }

    void update(float dt) {
        now += dt;
        if (casingT >= 0f) {   // o cartucho vazio cai depois de um instante
            casingT -= dt;
            if (casingT < 0f && cartridge != null) cartridge.play(0.4f, MathUtils.random(0.94f, 1.06f), 0f);
        }
        if (now - windowStart > 0.1f) {
            windowStart = now;
            voices = 0;
        }
    }

    private boolean budget() {
        if (voices >= MAX_VOICES_PER_WINDOW) return false;
        voices++;
        played++;
        return true;
    }

    /** Estampido do jogador (por categoria). */
    void fire(WeaponConfig.Category cat, boolean shotgunPellets) {
        Sound s = fire[cat.ordinal()];
        int k = cat.ordinal();
        if (s == null || now - lastFire[k] < 0.03f || !budget()) return;
        lastFire[k] = now;
        s.play(0.85f, MathUtils.random(0.95f, 1.05f), 0f);
        casingT = 0.12f;
    }

    /** Bala que passa perto do jogador (sem acertar): assobio, mais alto quanto mais perto. */
    void whiz(float dist) {
        if (whizz == null || now - lastWhiz < 0.25f || !budget()) return;
        lastWhiz = now;
        whizz.play(MathUtils.clamp(0.9f - dist * 0.3f, 0.15f, 0.9f), MathUtils.random(0.95f, 1.05f), 0f);
    }

    /** Estampido distante de outro atirador, mais baixo com a distância. */
    void distantShot(float dist) {
        if (farShot == null || !budget()) return;
        farShot.play(MathUtils.clamp(1f - dist / 140f, 0.08f, 0.9f), MathUtils.random(0.92f, 1.08f), 0f);
    }

    /** Impacto no material (volume cai com a distância). */
    void impact(Surface s, float dist) {
        Sound snd = impact[s.ordinal()];
        int k = s.ordinal();
        if (snd == null || now - lastImpact[k] < 0.05f || !budget()) return;
        lastImpact[k] = now;
        snd.play(MathUtils.clamp(0.7f - dist / 140f, 0.1f, 0.7f), impactPitch[k] * MathUtils.random(0.92f, 1.08f), 0f);
    }

    void reload() { if (reload != null && budget()) reload.play(0.7f); }

    void empty() { if (empty != null && budget()) empty.play(0.7f); }

    void equip() { if (equip != null && budget()) equip.play(0.7f); }

    void dispose() {
        for (Sound s : fire) if (s != null) s.dispose();
        boolean[] done = new boolean[impact.length];
        for (int i = 0; i < impact.length; i++) {
            if (impact[i] == null) continue;
            boolean dup = false;
            for (int j = 0; j < i; j++) if (impact[j] == impact[i]) dup = true;
            if (!dup) impact[i].dispose();
        }
        for (Sound s : new Sound[]{reload, empty, equip, farShot, cartridge, whizz}) if (s != null) s.dispose();
    }
}
