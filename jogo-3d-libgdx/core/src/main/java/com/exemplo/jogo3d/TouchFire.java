package com.exemplo.jogo3d;

/**
 * Botão de disparo na tela, sem disparo acidental: o toque só conta depois de ficar pressionado por
 * {@link #DEBOUNCE} segundos (um encostão de dedo de passagem não atira). Um toque normal dura bem mais.
 */
final class TouchFire {
    static final float DEBOUNCE = 0.045f;
    boolean heldNow;          // o disparo está valendo (armas automáticas seguem enquanto isso durar)
    boolean pressedThisFrame; // acabou de passar do limite: conta como um aperto (semi e rajada)
    private float heldT;

    /** touching = dedo no botão; ui = menu/editor aberto (cancela). */
    void update(float dt, boolean touching, boolean ui) {
        pressedThisFrame = false;
        if (!touching || ui) {
            heldT = 0f;
            heldNow = false;
            return;
        }
        heldT += dt;
        heldNow = heldT >= DEBOUNCE;
        pressedThisFrame = heldNow && heldT - dt < DEBOUNCE;
    }
}
