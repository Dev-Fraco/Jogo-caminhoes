package com.exemplo.jogo3d;

import com.badlogic.gdx.graphics.g3d.Model;
import com.badlogic.gdx.graphics.g3d.ModelInstance;
import com.badlogic.gdx.math.Quaternion;
import com.badlogic.gdx.math.Vector3;
import com.badlogic.gdx.utils.Array;

/**
 * Corda com física (integração de Verlet): cada ponto tem inércia e gravidade, a distância entre
 * pontos vizinhos é fixa, e as duas pontas ficam presas. Quando as pontas se mexem, a corda balança
 * e assenta sozinha, como uma corda de verdade. É desenhada como uma série de gomos finos.
 */
final class Rope {
    private static final float DAMPING = 0.985f;   // perda de energia por passo (ar)
    private static final int ITERATIONS = 12;       // passes da restrição de comprimento

    private final int n;
    private final Vector3[] p, q;                   // posição atual e anterior de cada ponto
    final ModelInstance[] segs;
    private float length;
    private boolean started = false;
    private final Vector3 tmp = new Vector3(), d = new Vector3(), mid = new Vector3();
    private final Quaternion rot = new Quaternion();

    Rope(Model segModel, int points) {
        n = points;
        p = new Vector3[n];
        q = new Vector3[n];
        for (int i = 0; i < n; i++) {
            p[i] = new Vector3();
            q[i] = new Vector3();
        }
        segs = new ModelInstance[n - 1];
        for (int i = 0; i < n - 1; i++) segs[i] = new ModelInstance(segModel);
    }

    /** Recomeça reta entre a e b. O comprimento fica maior que a distância (folga), para a corda cair um pouco. */
    void reset(Vector3 a, Vector3 b, float slack) {
        length = a.dst(b) * slack;
        for (int i = 0; i < n; i++) {
            p[i].set(a).lerp(b, i / (float) (n - 1));
            q[i].set(p[i]);
        }
        started = true;
    }

    /** Um passo da física com as pontas em a e b, e atualiza os gomos. */
    void update(float dt, Vector3 a, Vector3 b) {
        if (!started) reset(a, b, 1.06f);   // rédeas com pouca folga
        dt = Math.min(Math.max(dt, 1e-4f), 1f / 30f);
        float g = -9.8f * dt * dt;
        // Inércia + gravidade
        for (int i = 1; i < n - 1; i++) {
            tmp.set(p[i]);
            p[i].x += (p[i].x - q[i].x) * DAMPING;
            p[i].y += (p[i].y - q[i].y) * DAMPING + g;
            p[i].z += (p[i].z - q[i].z) * DAMPING;
            q[i].set(tmp);
        }
        p[0].set(a);
        p[n - 1].set(b);
        // Comprimento fixo entre os pontos (se as pontas se afastam além do comprimento, a corda estica)
        float seg = Math.max(length, a.dst(b)) / (n - 1);
        for (int it = 0; it < ITERATIONS; it++) {
            for (int i = 0; i < n - 1; i++) {
                d.set(p[i + 1]).sub(p[i]);
                float len = d.len();
                if (len < 1e-6f) continue;
                float diff = (len - seg) / len;
                boolean pinA = i == 0, pinB = i + 1 == n - 1;
                if (pinA && pinB) continue;
                if (pinA) p[i + 1].mulAdd(d, -diff);
                else if (pinB) p[i].mulAdd(d, diff);
                else {
                    p[i].mulAdd(d, diff * 0.5f);
                    p[i + 1].mulAdd(d, -diff * 0.5f);
                }
            }
        }
        // Gomos: uma caixa fina de comprimento 1 (eixo z), esticada entre dois pontos
        for (int i = 0; i < n - 1; i++) {
            d.set(p[i + 1]).sub(p[i]);
            float len = Math.max(d.len(), 0.001f);
            mid.set(p[i]).add(p[i + 1]).scl(0.5f);
            rot.setFromCross(Vector3.Z, d.scl(1f / len));
            segs[i].transform.set(mid, rot).scale(1f, 1f, len);
        }
    }

    void addTo(Array<ModelInstance> list) {
        for (ModelInstance s : segs) if (!list.contains(s, true)) list.add(s);
    }

    void removeFrom(Array<ModelInstance> list) {
        for (ModelInstance s : segs) list.removeValue(s, true);
        started = false;
    }
}
