package com.exemplo.jogo3d;

import com.badlogic.gdx.math.MathUtils;
import com.badlogic.gdx.math.Vector3;
import java.util.List;

/**
 * Assistência magnética de mira: o único sistema de assistência do jogo.
 *
 * Máquina de estados:
 *   IDLE    → nenhuma assistência. Sem tiro apertado, ou sem alvo válido no último aperto.
 *   ACTIVE  → alvo travado. Vale do aperto do tiro até soltá-lo, ou até o alvo ser invalidado.
 * O aperto do tiro é o único momento de aquisição. O SNAP acontece dentro de update(), no mesmo quadro
 * do aperto, antes do disparo: o primeiro tiro sai com a orientação já corrigida.
 *
 * Em ACTIVE, cada quadro faz UMA correção combinando a entrada manual e a força magnética:
 *   - a atração puxa a mira na direção do abdômen (vertical e horizontal), com taxa proporcional à distância
 *     angular (exponencial amortecida, nunca ultrapassa o alvo);
 *   - quando o dedo sobe e a força puxa para baixo, a força é limitada a uma fração do movimento do dedo
 *     (limiteResistenciaVertical): a resistência cresce com a distância, mas o dedo sempre sobe;
 *   - sem movimento do dedo, a força age inteira: é o retorno, sem espera.
 * A atração vale acima da cabeça: não há zona de desligamento pela altura da mira.
 *
 * Todas as posições são calculadas a partir do pivô da câmera (o ponto pelo qual a mira passa). A direção da
 * mira é, por construção, a reta pivô → abdômen, então o tiro sai exatamente para o abdômen após o SNAP.
 */
final class AimAssist {

    /** Um alvo que pode ser travado. O abdômen é a posição mundial atual (acompanha a animação). */
    interface Candidato {
        boolean vivo();
        Vector3 abdomen();
    }

    /** Confirma se há linha de visão da origem até o destino (sem parede no caminho). */
    interface Visao {
        boolean livre(Vector3 origem, Vector3 destino);
    }

    /** Pivô da câmera para um yaw. Depende do yaw porque a câmera gira em torno do jogador. */
    interface Pivo {
        Vector3 em(float yaw, Vector3 saida);
    }

    /** Resultado de um quadro: orientação final (rad) e diagnóstico para os testes. */
    static final class Saida {
        float yaw, pitch;      // orientação final da mira (rad). pitch positivo = câmera por cima
        boolean snap;          // o travamento instantâneo aconteceu neste quadro
        boolean ativa;         // há alvo travado após este quadro
        float erroYaw;         // erro horizontal até o abdômen antes da correção (rad)
        float erroEl;          // erro vertical até o abdômen antes da correção (rad). positivo = abdômen acima
        float resistencia;     // fração do movimento manual de subida que a força desfez (0..limite)
    }

    private enum Estado { IDLE, ACTIVE }

    private Estado estado = Estado.IDLE;
    private Candidato alvo;
    private float ultimoYawT, ultimoElT;   // ângulos do abdômen no quadro anterior (para o avanço)
    private boolean temAlvoAnterior;
    private final Vector3 belly = new Vector3(), pivot = new Vector3(), v = new Vector3(), dir = new Vector3();

    /** Esquece o alvo (troca de arma, morte do jogador, fim do combate). */
    void reset() {
        estado = Estado.IDLE;
        alvo = null;
        temAlvoAnterior = false;
    }

    boolean ativa() { return estado == Estado.ACTIVE; }

    /**
     * Um quadro da assistência. Chamar uma vez por quadro, DEPOIS da entrada manual e ANTES de calcular a
     * direção do tiro.
     *
     * @param yaw0       orientação horizontal antes da entrada manual deste quadro (rad)
     * @param pitch0     inclinação antes da entrada manual deste quadro (rad)
     * @param manYaw     giro horizontal que o dedo pediu neste quadro (rad, já com a sensibilidade)
     * @param manPitch   inclinação que o dedo pediu neste quadro (rad, já com a sensibilidade)
     * @param segurando  botão de tiro está pressionado
     * @param pressionou o botão de tiro foi apertado neste quadro (aquisição)
     * @param candidatos alvos possíveis (usados só no aperto)
     * @param visao      linha de visão (paredes)
     * @param pivo       pivô da câmera para um yaw
     * @param fovGrau    raio do FOV de assistência (graus), já com o multiplicador da categoria
     * @param alcance    alcance máximo da arma (m)
     * @param cam        posição da câmera neste quadro (origem dos tiros)
     */
    Saida update(float dt, float yaw0, float pitch0, float manYaw, float manPitch, boolean segurando,
                 boolean pressionou, List<Candidato> candidatos, Visao visao, Pivo pivo,
                 float fovGrau, float alcance, Vector3 cam) {
        float yaw = yaw0 + manYaw, pitch = pitch0 + manPitch;
        Saida saida = new Saida();
        saida.snap = false;

        if (!segurando) {   // soltou o tiro: encerra e não deixa nenhuma correção residual
            reset();
            return fill(saida, yaw, pitch);
        }

        // 1. AQUISIÇÃO: só no aperto do tiro. Escolhe o alvo e aplica a orientação na hora.
        if (pressionou) {
            Candidato escolhido = escolher(yaw, pitch, candidatos, visao, pivo, fovGrau, alcance, cam);
            if (escolhido == null) {
                reset();
                return fill(saida, yaw, pitch);
            }
            alvo = escolhido;
            estado = Estado.ACTIVE;
            temAlvoAnterior = false;
            if (AimTuning.snapHabilitado) {
                float[] ang = anguloPara(escolhido.abdomen(), pivo, yaw);
                yaw = ang[0];
                pitch = ang[1];
                saida.snap = true;
            }
        }

        if (estado != Estado.ACTIVE) return fill(saida, yaw, pitch);

        // 2. VALIDADE: alvo morto, fora do alcance ou atrás de parede invalida o travamento
        belly.set(alvo.abdomen());
        if (!alvo.vivo() || cam.dst(belly) > alcance || !visao.livre(cam, belly)) {
            reset();
            return fill(saida, yaw, pitch);
        }

        // 3. CORREÇÃO MAGNÉTICA: uma única vez por quadro, combinando a entrada manual e a força
        float[] ang = anguloPara(belly, pivo, yaw);
        float yawT = ang[0], elT = -ang[1];
        float ffYaw = 0f, ffEl = 0f;
        if (temAlvoAnterior) {   // avanço: o abdômen andou isto desde o quadro anterior; a mira acompanha sem atraso
            ffYaw = wrapRad(yawT - ultimoYawT);
            ffEl = elT - ultimoElT;
        }
        ultimoYawT = yawT;
        ultimoElT = elT;
        temAlvoAnterior = true;
        float erroYaw = wrapRad(ang[0] - yaw);
        float erroEl = -ang[1] - (-pitch);   // elevação: positiva = abdômen acima da mira
        float manEl = -manPitch;             // positivo = o dedo sobe
        float dtMax = AimTuning.velocidadeMaxGrauS * MathUtils.degreesToRadians * dt;

        float kp = AimTuning.atracaoVerticalBase + AimTuning.atracaoVerticalPorGrau * Math.abs(erroEl) * MathUtils.radiansToDegrees;
        float fracV = 1f - (float) Math.exp(-kp * dt);   // exponencial amortecida: nunca passa do abdômen
        float rEl = MathUtils.clamp(erroEl * fracV + ffEl, -dtMax, dtMax);
        if (manEl * rEl < 0f) {   // a força se opõe ao dedo: só desfaz uma fração dele
            float teto = AimTuning.limiteResistenciaVertical * Math.abs(manEl);
            rEl = MathUtils.clamp(rEl, -teto, teto);
            saida.resistencia = Math.abs(manEl) > 1e-6f ? Math.abs(rEl) / Math.abs(manEl) : 0f;
        }

        float fracH = 1f - (float) Math.exp(-AimTuning.atracaoHorizontal * dt);
        float rY = MathUtils.clamp(erroYaw * fracH + ffYaw, -dtMax, dtMax);
        if (manYaw * rY < 0f) {
            float teto = AimTuning.limiteResistenciaHorizontal * Math.abs(manYaw);
            rY = MathUtils.clamp(rY, -teto, teto);
        }

        yaw += rY;
        pitch -= rEl;   // elevação = -pitch: subir a mira reduz o pitch
        saida.erroYaw = erroYaw;
        saida.erroEl = erroEl;
        return fill(saida, yaw, pitch);
    }

    /** Escolhe o alvo válido mais próximo da mira. A distância só desempata alvos quase na mesma direção. */
    private Candidato escolher(float yaw, float pitch, List<Candidato> cands, Visao visao, Pivo pivo,
                               float fovGrau, float alcance, Vector3 cam) {
        pivo.em(yaw, pivot);
        dirDe(yaw, pitch, dir);
        Candidato melhor = null;
        float melhorAng = Float.MAX_VALUE, melhorDist = Float.MAX_VALUE;
        for (Candidato c : cands) {
            if (!c.vivo()) continue;
            Vector3 b = c.abdomen();
            float dist = cam.dst(b);
            if (dist > alcance) continue;
            v.set(b).sub(pivot);
            float ang = anguloRedondo(v, dir);
            // Dentro do FOV angular, OU perto o bastante da linha da mira (perto do boneco o ângulo é grande)
            float along = v.dot(dir);
            float perp = (float) Math.sqrt(Math.max(0f, v.len2() - along * along));
            if (ang > fovGrau && perp > AimTuning.raioAcaoPerto) continue;   // fora do FOV: nunca adquirido
            if (!visaoLivre(visao, cam, b)) continue;             // parede no caminho
            boolean melhorQue = melhor == null
                    || ang < melhorAng - AimTuning.desempateGrau
                    || (Math.abs(ang - melhorAng) <= AimTuning.desempateGrau && dist < melhorDist);
            if (melhorQue) {
                melhor = c;
                melhorAng = ang;
                melhorDist = dist;
            }
        }
        return melhor;
    }

    private static boolean visaoLivre(Visao visao, Vector3 cam, Vector3 b) {
        return visao.livre(cam, b);
    }

    /**
     * Yaw e pitch que colocam a mira sobre o ponto, com a câmera girando em torno do pivô. O pivô depende do
     * yaw, então repete algumas vezes até convergir (converge em 2 a 3 passos: o deslocamento é pequeno).
     */
    private float[] anguloPara(Vector3 ponto, Pivo pivo, float yawInicial) {
        float yawS = yawInicial, pitchS = 0f;
        for (int i = 0; i < 3; i++) {
            pivo.em(yawS, pivot);
            v.set(ponto).sub(pivot);
            yawS = (float) Math.atan2(v.x, v.z);
            float h = (float) Math.sqrt(v.x * v.x + v.z * v.z);
            pitchS = -(float) Math.atan2(v.y, h);   // elevação = -pitch
        }
        return new float[]{yawS, pitchS};
    }

    /** Direção da mira para (yaw, pitch): é a reta do pivô que a câmera olha. */
    static void dirDe(float yaw, float pitch, Vector3 out) {
        float cp = (float) Math.cos(pitch);
        out.set((float) Math.sin(yaw) * cp, -(float) Math.sin(pitch), (float) Math.cos(yaw) * cp);
    }

    /**
     * Distância angular do alvo ao centro da mira, medida na tela (tangente): o FOV vira um círculo com o
     * mesmo raio na horizontal e na vertical, sem o formato de cone do ângulo de abertura.
     * Retorna graus. Atrás da câmera, 180.
     */
    static float anguloRedondo(Vector3 v, Vector3 dir) {
        float prof = v.dot(dir);
        if (prof <= 1e-4f) return 180f;
        float rx = -dir.z, rz = dir.x;
        float rl = (float) Math.sqrt(rx * rx + rz * rz);
        if (rl < 1e-4f) { rx = 1f; rz = 0f; rl = 1f; }   // mirando reto para cima ou para baixo
        rx /= rl;
        rz /= rl;
        float ux = -rz * dir.y, uy = rz * dir.x - rx * dir.z, uz = rx * dir.y;
        float ul = (float) Math.sqrt(ux * ux + uy * uy + uz * uz);
        if (ul < 1e-4f) return 0f;
        float tx = (v.x * rx + v.z * rz) / prof;
        float ty = (v.x * ux + v.y * uy + v.z * uz) / (ul * prof);
        return MathUtils.radiansToDegrees * (float) Math.atan(Math.sqrt(tx * tx + ty * ty));
    }

    static float wrapRad(float a) {
        while (a > MathUtils.PI) a -= MathUtils.PI2;
        while (a < -MathUtils.PI) a += MathUtils.PI2;
        return a;
    }

    private Saida fill(Saida saida, float yaw, float pitch) {
        saida.yaw = yaw;
        saida.pitch = pitch;
        saida.ativa = estado == Estado.ACTIVE;
        return saida;
    }
}
