package com.exemplo.jogo3d;

import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.audio.Sound;
import com.badlogic.gdx.files.FileHandle;
import com.badlogic.gdx.math.MathUtils;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;

/**
 * Sons da sala personalizada gerados em código (sem arquivos de áudio): impacto do abate, vitória e derrota.
 * O som do abate toca no mesmo quadro em que o emblema aparece, por isso fica em sincronia.
 */
final class Sons {
    static final int RATE = 22050;

    final Sound abate, vitoria, derrota;

    private Sons(Sound abate, Sound vitoria, Sound derrota) {
        this.abate = abate;
        this.vitoria = vitoria;
        this.derrota = derrota;
    }

    static Sons carregar() {
        return new Sons(
                Gdx.audio.newSound(escreve("abate", abate())),
                Gdx.audio.newSound(escreve("vitoria", melodia(new float[]{523f, 659f, 784f, 1047f}, new float[]{0.16f, 0.16f, 0.16f, 0.6f}))),
                Gdx.audio.newSound(escreve("derrota", melodia(new float[]{330f, 294f, 262f, 196f}, new float[]{0.26f, 0.26f, 0.26f, 0.7f}))));
    }

    void dispose() {
        abate.dispose();
        vitoria.dispose();
        derrota.dispose();
    }

    /** Impacto de caveira: pancada grave com um tinido metálico por cima. */
    static float[] abate() {
        int n = RATE * 6 / 10;
        float[] out = new float[n];
        for (int i = 0; i < n; i++) {
            float t = i / (float) RATE;
            float pancada = (float) Math.sin(2 * Math.PI * (90f - 50f * t) * t) * (float) Math.exp(-t * 9f);
            float tinido = (float) (Math.sin(2 * Math.PI * 1320f * t) + 0.5 * Math.sin(2 * Math.PI * 1980f * t))
                    * (float) Math.exp(-t * 6f) * 0.35f;
            out[i] = MathUtils.clamp(pancada * 0.9f + tinido, -1f, 1f);
        }
        return out;
    }

    /** Sequência de notas com decaimento suave, para vitória (subindo) ou derrota (descendo). */
    static float[] melodia(float[] freq, float[] dur) {
        int total = 0;
        for (float d : dur) total += (int) (d * RATE);
        float[] out = new float[total];
        int pos = 0;
        for (int k = 0; k < freq.length; k++) {
            int n = (int) (dur[k] * RATE);
            for (int i = 0; i < n; i++) {
                float t = i / (float) RATE;
                float v = (float) (0.6 * Math.sin(2 * Math.PI * freq[k] * t) + 0.25 * Math.sin(2 * Math.PI * 2 * freq[k] * t));
                out[pos++] = MathUtils.clamp(v * (float) Math.exp(-t * 2.5f) * 0.6f, -1f, 1f);
            }
        }
        return out;
    }

    /** Grava o WAV (16 bits mono) no armazenamento local e devolve o arquivo para o Sound. */
    private static FileHandle escreve(String nome, float[] s) {
        int dataLen = s.length * 2;
        ByteBuffer b = ByteBuffer.allocate(44 + dataLen).order(ByteOrder.LITTLE_ENDIAN);
        b.put("RIFF".getBytes()).putInt(36 + dataLen).put("WAVE".getBytes());
        b.put("fmt ".getBytes()).putInt(16).putShort((short) 1).putShort((short) 1).putInt(RATE)
                .putInt(RATE * 2).putShort((short) 2).putShort((short) 16);
        b.put("data".getBytes()).putInt(dataLen);
        for (float v : s) b.putShort((short) (MathUtils.clamp(v, -1f, 1f) * 32000f));
        FileHandle fh = Gdx.files.local("som_" + nome + ".wav");
        fh.writeBytes(b.array(), false);
        return fh;
    }
}
