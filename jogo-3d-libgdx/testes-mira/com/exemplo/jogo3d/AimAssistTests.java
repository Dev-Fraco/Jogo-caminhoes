package com.exemplo.jogo3d;

import com.badlogic.gdx.math.Vector3;
import java.util.ArrayList;
import java.util.List;

/**
 * Testes da assistência magnética (AimAssist), sem tela: a geometria é a da câmera real (pivô, reta da mira,
 * direção do tiro), e o alvo é um ponto no espaço cujo abdômen se move de forma controlada.
 *
 * Os testes medem números (erro angular, fração de resistência, quadros, FPS) e não apenas retornam
 * verdadeiro ou falso.
 */
public class AimAssistTests {
    static int pass = 0, fail = 0;
    static final float DEG = (float) (Math.PI / 180.0);
    static final float DIST = 20f;     // distância do alvo ao pivô (m)
    static final float CAM_DIST = 4f;  // distância da câmera ao pivô (m)

    static void check(String name, boolean ok, String info) {
        System.out.println((ok ? "  OK   " : "  FALHA") + "  " + name + (info.isEmpty() ? "" : "  [" + info + "]"));
        if (ok) pass++; else fail++;
    }

    /** Alvo de teste: abdômen num ponto controlado pelo teste. */
    static final class Alvo implements AimAssist.Candidato {
        final Vector3 b = new Vector3();
        boolean vivo = true;
        @Override public boolean vivo() { return vivo; }
        @Override public Vector3 abdomen() { return b; }
        /** Posiciona o abdômen na direção (yaw, elevação) a partir do pivô. */
        void mira(Vector3 pivo, float yawGrau, float elGrau) {
            float yaw = yawGrau * DEG, el = elGrau * DEG;
            b.set(pivo).add(MathUtilsLite.sin(yaw) * MathUtilsLite.cos(el) * DIST,
                    MathUtilsLite.sin(el) * DIST,
                    MathUtilsLite.cos(yaw) * MathUtilsLite.cos(el) * DIST);
        }
    }

    /** Cópia local de seno/cosseno (mesmos resultados de Math, sem a tabela aproximada do libGDX). */
    static final class MathUtilsLite {
        static float sin(float a) { return (float) Math.sin(a); }
        static float cos(float a) { return (float) Math.cos(a); }
    }

    static final AimAssist.Pivo PIVO_FIXO = (yq, out) -> out.set(0f, 1.5f, 0f);
    /** Pivô que depende do yaw (como o combate real: a câmera gira em torno do jogador). */
    static final AimAssist.Pivo PIVO_GIRANDO = (yq, out) -> out.set(-(float) Math.cos(yq) * 0.62f, 1.55f,
            (float) Math.sin(yq) * 0.62f);

    /** Erro angular (graus) entre a direção da mira e a reta do pivô até o ponto. */
    static float erroGrau(float yaw, float pitch, Vector3 ponto, AimAssist.Pivo pivo) {
        Vector3 p = new Vector3();
        pivo.em(yaw, p);
        Vector3 d = new Vector3();
        AimAssist.dirDe(yaw, pitch, d);
        Vector3 v = new Vector3(ponto).sub(p).nor();
        // atan2(|a×b|, a·b) é exato também para ângulos muito pequenos; acos perde precisão perto de 1
        float cx = d.y * v.z - d.z * v.y, cy = d.z * v.x - d.x * v.z, cz = d.x * v.y - d.y * v.x;
        float seno = (float) Math.sqrt(cx * cx + cy * cy + cz * cz);
        return (float) Math.toDegrees(Math.atan2(seno, d.dot(v)));
    }

    /** Elevação do abdômen acima da mira (graus; positivo = abdômen acima). */
    static float elevacaoErro(float pitch, Vector3 ponto, AimAssist.Pivo pivo, float yaw) {
        Vector3 p = new Vector3();
        pivo.em(yaw, p);
        float el = (float) Math.atan2(ponto.y - p.y, Math.hypot(ponto.x - p.x, ponto.z - p.z));
        return (float) Math.toDegrees(el + pitch);   // elevação da mira = -pitch
    }

    static Vector3 camera(float yaw, float pitch, AimAssist.Pivo pivo) {
        Vector3 p = new Vector3(), d = new Vector3();
        pivo.em(yaw, p);
        AimAssist.dirDe(yaw, pitch, d);
        return p.mulAdd(d, -CAM_DIST);
    }

    /** Um quadro. Devolve a saída; o chamador guarda yaw/pitch para o próximo. */
    static AimAssist.Saida quadro(AimAssist a, float dt, float yaw, float pitch, float manY, float manP,
                                  boolean seg, boolean press, List<AimAssist.Candidato> c, boolean visao,
                                  float fovGrau, AimAssist.Pivo pivo) {
        Vector3 cam = camera(yaw, pitch, pivo);
        return a.update(dt, yaw, pitch, manY, manP, seg, press, c, (o, d) -> visao, pivo, fovGrau, 100f, cam);
    }

    public static void main(String[] args) {
        final float fov = 7.2f;

        // ================= GRUPO 1 — travamento instantâneo =================
        System.out.println("== Grupo 1: travamento instantâneo no aperto do tiro ==");
        for (int caso = 0; caso < 4; caso++) {
            AimAssist.Pivo pv = caso % 2 == 0 ? PIVO_FIXO : PIVO_GIRANDO;
            float yawAlvo = new float[]{2.5f, -3f, 1.2f, 0.5f}[caso];
            float elAlvo = new float[]{-2f, 1.5f, -4f, 0.8f}[caso];
            Alvo al = new Alvo();
            Vector3 p0 = new Vector3();
            pv.em(0f, p0);
            al.mira(p0, yawAlvo, elAlvo);
            AimAssist a = new AimAssist();
            List<AimAssist.Candidato> c = new ArrayList<>();
            c.add(al);
            AimAssist.Saida s = quadro(a, 1f / 60f, 0f, 0f, 0f, 0f, true, true, c, true, fov, pv);
            // Erro do PRIMEIRO quadro, medido sobre a orientação que o tiro vai usar
            float err = erroGrau(s.yaw, s.pitch, al.b, pv);
            check(String.format("caso %d: snap no mesmo quadro do aperto (alvo %.1f°/%.1f°)", caso, yawAlvo, elAlvo),
                    s.snap && s.ativa && err < 1e-3f, String.format("erro no 1º quadro %.6f°", err));
            // Não há aproximação gradual: a orientação do snap é a exata, não uma fração dela
            Vector3 pv1 = new Vector3();
            pv.em(s.yaw, pv1);
            float yawExato = (float) Math.atan2(al.b.x - pv1.x, al.b.z - pv1.z);
            check(String.format("caso %d: a orientação é a exata, sem interpolação", caso),
                    Math.abs(AimAssist.wrapRad(s.yaw - yawExato)) < 1e-4f,
                    String.format("diferença %.6f°", Math.toDegrees(AimAssist.wrapRad(s.yaw - yawExato))));
        }

        System.out.println("== Grupo 1b: primeiro tiro usa a orientação já corrigida ==");
        {
            Alvo al = new Alvo();
            Vector3 p0 = new Vector3();
            PIVO_GIRANDO.em(0f, p0);
            al.mira(p0, 4f, 3f);
            AimAssist a = new AimAssist();
            List<AimAssist.Candidato> c = new ArrayList<>();
            c.add(al);
            // A direção do tiro é a da mira no quadro do aperto. O tiro passa pelo abdômen:
            AimAssist.Saida s = quadro(a, 1f / 60f, 0f, 0f, 0f, 0f, true, true, c, true, fov, PIVO_GIRANDO);
            Vector3 dir = new Vector3();
            AimAssist.dirDe(s.yaw, s.pitch, dir);
            Vector3 cam = camera(s.yaw, s.pitch, PIVO_GIRANDO);
            // A reta do tiro (origem na câmera, direção da mira) deve passar pelo abdômen
            Vector3 quase = new Vector3(cam).mulAdd(dir, cam.dst(al.b));
            check("o tiro do quadro do aperto passa pelo abdômen (erro < 1 cm)", quase.dst(al.b) < 0.01f,
                    String.format("%.4f m", quase.dst(al.b)));
        }

        System.out.println("== Grupo 1c: alvo em movimento durante o aperto ==");
        {
            Alvo al = new Alvo();
            Vector3 p0 = new Vector3();
            PIVO_FIXO.em(0f, p0);
            AimAssist a = new AimAssist();
            List<AimAssist.Candidato> c = new ArrayList<>();
            c.add(al);
            float yaw = 0f, pitch = 0f, pior = 0f;
            for (int i = 0; i < 180; i++) {
                // alvo corre lateralmente a 6°/s e sobe e desce de leve
                al.mira(p0, 2f + 0.1f * i, -1f + 0.5f * (float) Math.sin(i * 0.05));
                AimAssist.Saida s = quadro(a, 1f / 60f, yaw, pitch, 0f, 0f, true, i == 0, c, true, fov, PIVO_FIXO);
                yaw = s.yaw;
                pitch = s.pitch;
                if (i > 0) pior = Math.max(pior, erroGrau(yaw, pitch, al.b, PIVO_FIXO));
            }
            check("alvo em movimento: erro angular durante o acompanhamento ≤ 0,5°", pior <= 0.5f,
                    String.format("pior erro %.3f°", pior));
        }

        // ================= GRUPO 2 — resistência vertical =================
        System.out.println("== Grupo 2: resistência ao subir, progressiva com a distância (arrasto real) ==");
        {
            AimAssist a = new AimAssist();
            Alvo al = new Alvo();
            al.mira(new Vector3(0f, 1.5f, 0f), 0f, 0f);   // abdômen no centro da mira
            List<AimAssist.Candidato> c = new ArrayList<>();
            c.add(al);
            AimAssist.Saida s = quadro(a, 1f / 60f, 0f, 0f, 0f, 0f, true, true, c, true, fov, PIVO_FIXO);
            float yaw = s.yaw, pitch = s.pitch;
            float manual = 0.5f * DEG;                     // o dedo sobe 0,5° por quadro (30°/s a 60 FPS)
            float[] limiares = {0.5f, 1f, 2f, 4f, 8f};    // distância da mira ACIMA do abdômen (graus)
            float[] fracoes = new float[limiares.length];
            int prox = 0;
            for (int i = 0; i < 2000 && prox < limiares.length; i++) {
                float d = -elevacaoErro(pitch, al.b, PIVO_FIXO, yaw);   // positivo = mira acima do abdômen
                AimAssist.Saida q = quadro(a, 1f / 60f, yaw, pitch, 0f, -manual, true, false, c, true, fov, PIVO_FIXO);
                float subida = (float) Math.toDegrees(pitch - q.pitch); // subida líquida neste quadro
                if (d >= limiares[prox]) {
                    fracoes[prox] = 1f - subida / (manual / DEG);
                    prox++;
                }
                yaw = q.yaw;
                pitch = q.pitch;
            }
            boolean alcancou = prox == limiares.length;
            StringBuilder tab = new StringBuilder();
            boolean monotona = true;
            for (int k = 0; k < limiares.length; k++) {
                tab.append(String.format("%.1f°→%.0f%%  ", limiares[k], fracoes[k] * 100f));
                if (k > 0 && fracoes[k] + 1e-3f < fracoes[k - 1]) monotona = false;
            }
            System.out.println("    resistência por distância acima do abdômen: " + tab);
            check("o arrasto alcança todas as distâncias de teste", alcancou, "chegou a " + prox + " de " + limiares.length);
            check("resistência cresce com a distância (sem queda)", monotona, "");
            check("a resistência fica no teto de 95% (o capa é possível)", alcancou && fracoes[limiares.length - 1] <= 0.951f,
                    String.format("%.1f%%", fracoes[limiares.length - 1] * 100f));
            check("resistência é progressiva: no primeiro limiar é fraca, perto do teto é forte",
                    alcancou && fracoes[0] < 0.2f && fracoes[limiares.length - 1] > 0.8f,
                    String.format("%.0f%% → %.0f%%", fracoes[0] * 100f, fracoes[limiares.length - 1] * 100f));
        }

        System.out.println("== Grupo 2b: a força aponta para o abdômen em todas as posições ==");
        {
            // Abdômen acima da mira (força para cima) e abaixo (força para baixo), e à esquerda/direita
            AimAssist a = new AimAssist();
            Alvo al = new Alvo();
            al.mira(new Vector3(0f, 1.5f, 0f), 0f, 0f);   // no centro da mira, dentro do FOV
            List<AimAssist.Candidato> c = new ArrayList<>();
            c.add(al);
            AimAssist.Saida s0 = quadro(a, 1f / 60f, 0f, 0f, 0f, 0f, true, true, c, true, fov, PIVO_FIXO);
            // Salto do abdômen de 6° (o teste mede a direção da força; a magnitude fica no Grupo 2)
            al.mira(new Vector3(0f, 1.5f, 0f), 0f, -6f);      // abdômen abaixo da mira: sem dedo, a força sobe a mira
            AimAssist.Saida baixo = quadro(a, 1f / 60f, s0.yaw, s0.pitch, 0f, 0f, true, false, c, true, fov, PIVO_FIXO);
            check("abdômen abaixo da mira: a força aponta para baixo (mira desce)", baixo.pitch > s0.pitch,
                    String.format("Δpitch %.4f°", Math.toDegrees(baixo.pitch - s0.pitch)));
            al.mira(new Vector3(0f, 1.5f, 0f), 0f, 6f);       // abdômen acima da mira: a força sobe a mira
            AimAssist.Saida cima = quadro(a, 1f / 60f, s0.yaw, s0.pitch, 0f, 0f, true, false, c, true, fov, PIVO_FIXO);
            check("abdômen acima da mira: a força aponta para cima (mira sobe)", cima.pitch < s0.pitch,
                    String.format("Δpitch %.4f°", Math.toDegrees(cima.pitch - s0.pitch)));
            al.mira(new Vector3(0f, 1.5f, 0f), 6f, 0f);      // abdômen à direita: a força gira para a direita
            AimAssist.Saida dir = quadro(a, 1f / 60f, s0.yaw, s0.pitch, 0f, 0f, true, false, c, true, fov, PIVO_FIXO);
            check("abdômen à direita: a força gira para a direita (yaw cresce)", dir.yaw > s0.yaw,
                    String.format("Δyaw %.4f°", Math.toDegrees(dir.yaw - s0.yaw)));
        }

        // ================= GRUPO 3 — retorno e acima da cabeça =================
        System.out.println("== Grupo 3: subida até acima da cabeça e retorno ==");
        {
            AimAssist a = new AimAssist();
            Alvo al = new Alvo();
            al.mira(new Vector3(0f, 1.5f, 0f), 0f, 0f);   // abdômen fixo; cabeça ~ 8° acima dele
            List<AimAssist.Candidato> c = new ArrayList<>();
            c.add(al);
            AimAssist.Saida s = quadro(a, 1f / 60f, 0f, 0f, 0f, 0f, true, true, c, true, fov, PIVO_FIXO);
            float yaw = s.yaw, pitch = s.pitch;
            boolean sempreAtiva = true;
            // Sobe 20° (passa a cabeça e fica acima dela) com movimento intencional: 120°/s, 2° por quadro
            for (int i = 0; i < 10; i++) {
                s = quadro(a, 1f / 60f, yaw, pitch, 0f, -2f * DEG, true, false, c, true, fov, PIVO_FIXO);
                yaw = s.yaw;
                pitch = s.pitch;
                sempreAtiva &= s.ativa;
            }
            // Passa da cabeça (~8°) com o dedo, e sobe mais um pouco
            for (int i = 0; i < 6; i++) {
                s = quadro(a, 1f / 60f, yaw, pitch, 0f, -2f * DEG, true, false, c, true, fov, PIVO_FIXO);
                yaw = s.yaw;
                pitch = s.pitch;
            }
            float acimaAposSubir = elevacaoErro(pitch, al.b, PIVO_FIXO, yaw);
            check("subindo acima da cabeça: a mira está acima do abdômen", acimaAposSubir < -8f,
                    String.format("abdômen a %.1f° da mira", acimaAposSubir));
            check("subindo acima da cabeça: o alvo continua travado", sempreAtiva, "");
            // Dedo parado: a força age sem espera, e a mira desce
            float antes = erroGrau(yaw, pitch, al.b, PIVO_FIXO);
            AimAssist.Saida primeiro = quadro(a, 1f / 60f, yaw, pitch, 0f, 0f, true, false, c, true, fov, PIVO_FIXO);
            check("dedo parado acima da cabeça: a força atua já no primeiro quadro", primeiro.pitch > pitch,
                    String.format("Δpitch no 1º quadro %.4f°", Math.toDegrees(primeiro.pitch - pitch)));
            yaw = primeiro.yaw;
            pitch = primeiro.pitch;
            for (int i = 0; i < 180; i++) {   // 3 s parado
                s = quadro(a, 1f / 60f, yaw, pitch, 0f, 0f, true, false, c, true, fov, PIVO_FIXO);
                yaw = s.yaw;
                pitch = s.pitch;
            }
            float depois = erroGrau(yaw, pitch, al.b, PIVO_FIXO);
            check("dedo parado: a mira volta ao abdômen", depois < 0.2f && depois < antes,
                    String.format("erro %.3f° → %.3f°", antes, depois));
        }

        // ================= GRUPO 4 — progressão sem saltos =================
        System.out.println("== Grupo 4: arrastos curtos, médios e longos ==");
        {
            float[] arrastos = {1f, 4f, 10f};   // graus totais
            for (float total : arrastos) {
                AimAssist a = new AimAssist();
                Alvo al = new Alvo();
                al.mira(new Vector3(0f, 1.5f, 0f), 0f, 0f);
                List<AimAssist.Candidato> c = new ArrayList<>();
                c.add(al);
                AimAssist.Saida s = quadro(a, 1f / 60f, 0f, 0f, 0f, 0f, true, true, c, true, fov, PIVO_FIXO);
                float yaw = s.yaw, pitch = s.pitch;
                int n = 60;
                float subido = 0f, maxSalto = 0f, anterior = 0f;
                for (int i = 0; i < n; i++) {
                    float passo = total / n * DEG;
                    s = quadro(a, 1f / 60f, yaw, pitch, 0f, -passo, true, false, c, true, fov, PIVO_FIXO);
                    float dp = pitch - s.pitch;
                    subido += dp;
                    maxSalto = Math.max(maxSalto, Math.abs(dp - anterior));
                    anterior = dp;
                    yaw = s.yaw;
                    pitch = s.pitch;
                }
                float liquido = (float) Math.toDegrees(subido);
                System.out.printf("    arrasto de %.0f°: subiu %.2f° líquidos (%.0f%% resistidos), maior variação entre quadros %.3f°%n",
                        total, liquido, (1f - liquido / total) * 100f, Math.toDegrees(maxSalto));
                check(String.format("arrasto de %.0f°: sobe alguma coisa e a variação por quadro é suave", total),
                        liquido > 0f && Math.toDegrees(maxSalto) < 1.5f, "");
            }
        }

        // ================= GRUPO 5 — estabilidade =================
        System.out.println("== Grupo 5: estabilidade (sem inversões, sem troca de alvo) ==");
        {
            AimAssist a = new AimAssist();
            Alvo al = new Alvo();
            Vector3 p0 = new Vector3();
            PIVO_GIRANDO.em(0f, p0);
            al.mira(p0, 3f, 2f);
            List<AimAssist.Candidato> c = new ArrayList<>();
            c.add(al);
            AimAssist.Saida s = quadro(a, 1f / 60f, 0f, 0f, 0f, 0f, true, true, c, true, fov, PIVO_GIRANDO);
            float yaw = s.yaw, pitch = s.pitch;
            int inversoes = 0;
            float prevErr = erroGrau(yaw, pitch, al.b, PIVO_GIRANDO);
            for (int i = 0; i < 600; i++) {
                // dedo oscila com intenção (subir e descer) enquanto o alvo se move
                float manP = (float) Math.sin(i * 0.07) * 0.4f * DEG;
                al.mira(p0, 3f + 0.02f * i, 2f + 1.2f * (float) Math.sin(i * 0.011));
                s = quadro(a, 1f / 60f, yaw, pitch, 0f, manP, true, false, c, true, fov, PIVO_GIRANDO);
                yaw = s.yaw;
                pitch = s.pitch;
                if (!s.ativa) { check("a mira não perde o alvo durante o teste", false, "quadro " + i); break; }
                float err = erroGrau(yaw, pitch, al.b, PIVO_GIRANDO);
                if (i > 0 && err > prevErr + 0.5f) inversoes++;   // o erro cresce de repente: correção a menos
                prevErr = err;
            }
            check("estabilidade: nenhum salto de erro maior que 0,5° por quadro", inversoes == 0,
                    "saltos " + inversoes);
            check("a troca de alvo é zero (um único alvo travado)", a.ativa(), "");
        }

        // ================= GRUPO 6 — frequência de quadros =================
        System.out.println("== Grupo 6: mesma força em 30, 60, 90 e 120 FPS ==");
        {
            int[] fps = {30, 60, 90, 120};
            float[] erroFinal = new float[fps.length];
            for (int k = 0; k < fps.length; k++) {
                AimAssist a = new AimAssist();
                Alvo al = new Alvo();
                al.mira(new Vector3(0f, 1.5f, 0f), 0f, 0f);
                List<AimAssist.Candidato> c = new ArrayList<>();
                c.add(al);
                float dt = 1f / fps[k];
                AimAssist.Saida s = quadro(a, dt, 0f, 0f, 0f, 0f, true, true, c, true, fov, PIVO_FIXO);
                float yaw = s.yaw, pitch = s.pitch;
                // Sobe 10° em 0,5 s (mesma velocidade, em qualquer FPS), depois para e espera 1 s
                int quadrosSobe = Math.round(0.5f * fps[k]), quadrosParado = fps[k];
                for (int i = 0; i < quadrosSobe; i++) {
                    s = quadro(a, dt, yaw, pitch, 0f, -(10f / quadrosSobe) * DEG, true, false, c, true, fov, PIVO_FIXO);
                    yaw = s.yaw;
                    pitch = s.pitch;
                }
                float pico = erroGrau(yaw, pitch, al.b, PIVO_FIXO);
                for (int i = 0; i < quadrosParado; i++) {
                    s = quadro(a, dt, yaw, pitch, 0f, 0f, true, false, c, true, fov, PIVO_FIXO);
                    yaw = s.yaw;
                    pitch = s.pitch;
                }
                erroFinal[k] = erroGrau(yaw, pitch, al.b, PIVO_FIXO);
                System.out.printf("    %d FPS: erro com o dedo parado a %.3f°, retorno a %.3f° após 1 s%n", fps[k],
                        pico, erroFinal[k]);
            }
            float min = erroFinal[0], max = erroFinal[0];
            for (float e : erroFinal) { min = Math.min(min, e); max = Math.max(max, e); }
            check("FPS: o erro após 1 s parado é igual em 30, 60, 90 e 120 (diferença ≤ 0,05°)",
                    max - min <= 0.05f, String.format("%.3f° a %.3f°", min, max));
        }

        // ================= GRUPO 7 — invalidação e casos negativos =================
        System.out.println("== Grupo 7: invalidação e casos que não devem travar ==");
        {
            // Fora do FOV no aperto: nenhum snap
            AimAssist a = new AimAssist();
            Alvo longe = new Alvo();
            longe.mira(new Vector3(0f, 1.5f, 0f), 20f, 0f);   // 20° para o lado, fora do FOV de 7,2°
            List<AimAssist.Candidato> c = new ArrayList<>();
            c.add(longe);
            AimAssist.Saida s = quadro(a, 1f / 60f, 0f, 0f, 0f, 0f, true, true, c, true, fov, PIVO_FIXO);
            check("fora do FOV no aperto: não adquire nem gira a mira", !s.snap && !s.ativa && s.yaw == 0f, "");

            // Parede no caminho: não adquire
            AimAssist b = new AimAssist();
            Alvo atras = new Alvo();
            atras.mira(new Vector3(0f, 1.5f, 0f), 1f, 0f);
            List<AimAssist.Candidato> c2 = new ArrayList<>();
            c2.add(atras);
            AimAssist.Saida semVisao = quadro(b, 1f / 60f, 0f, 0f, 0f, 0f, true, true, c2, false, fov, PIVO_FIXO);
            check("parede no caminho: não adquire", !semVisao.snap && !semVisao.ativa, "");

            // Alvo morre durante o acompanhamento: a assistência encerra e não deixa correção residual
            AimAssist m = new AimAssist();
            Alvo morre = new Alvo();
            morre.mira(new Vector3(0f, 1.5f, 0f), 0f, 0f);
            List<AimAssist.Candidato> c3 = new ArrayList<>();
            c3.add(morre);
            AimAssist.Saida s3 = quadro(m, 1f / 60f, 0f, 0f, 0f, 0f, true, true, c3, true, fov, PIVO_FIXO);
            morre.mira(new Vector3(0f, 1.5f, 0f), 0f, -5f);   // a mira fica longe do abdômen...
            morre.vivo = false;                               // ...e o alvo morre
            AimAssist.Saida s4 = quadro(m, 1f / 60f, s3.yaw, s3.pitch, 0.1f * DEG, 0f, true, false, c3, true, fov, PIVO_FIXO);
            check("alvo morre: a assistência encerra no quadro da morte", !s4.ativa, "");
            check("alvo morre: sem correção residual (só o dedo)", Math.abs(s4.yaw - (s3.yaw + 0.1f * DEG)) < 1e-6f
                    && Math.abs(s4.pitch - s3.pitch) < 1e-6f, "");

            // Soltar o tiro: nenhuma correção depois disso
            AimAssist u = new AimAssist();
            Alvo solto = new Alvo();
            solto.mira(new Vector3(0f, 1.5f, 0f), 0f, 0f);
            List<AimAssist.Candidato> c4 = new ArrayList<>();
            c4.add(solto);
            AimAssist.Saida s5 = quadro(u, 1f / 60f, 0f, 0f, 0f, 0f, true, true, c4, true, fov, PIVO_FIXO);
            solto.mira(new Vector3(0f, 1.5f, 0f), 0f, -5f);
            AimAssist.Saida s6 = quadro(u, 1f / 60f, s5.yaw, s5.pitch, 0f, 0f, false, false, c4, true, fov, PIVO_FIXO);
            check("soltar o tiro: a assistência para e não deixa força residual",
                    !s6.ativa && s6.yaw == s5.yaw && s6.pitch == s5.pitch, "");
        }

        // ================= GRUPO 8 — nenhuma troca de alvo durante o tiro =================
        System.out.println("== Grupo 8: um alvo por sequência de tiro ==");
        {
            AimAssist a = new AimAssist();
            Alvo primeiro = new Alvo();
            primeiro.mira(new Vector3(0f, 1.5f, 0f), 1.5f, 0f);    // 1,5° do centro
            Alvo segundo = new Alvo();
            segundo.mira(new Vector3(0f, 1.5f, 0f), 0f, 0f);      // no centro, mas chega depois
            List<AimAssist.Candidato> c = new ArrayList<>();
            c.add(primeiro);
            AimAssist.Saida s = quadro(a, 1f / 60f, 0f, 0f, 0f, 0f, true, true, c, true, fov, PIVO_FIXO);
            c.add(segundo);   // entra no FOV durante o tiro
            float yaw = s.yaw, pitch = s.pitch;
            for (int i = 0; i < 120; i++) {
                s = quadro(a, 1f / 60f, yaw, pitch, 0f, 0f, true, false, c, true, fov, PIVO_FIXO);
                yaw = s.yaw;
                pitch = s.pitch;
            }
            check("o alvo travado é o do aperto: a mira vai para ele, não para o mais central",
                    erroGrau(yaw, pitch, primeiro.b, PIVO_FIXO) < 0.2f && erroGrau(yaw, pitch, segundo.b, PIVO_FIXO) > 0.5f,
                    String.format("erro ao 1º %.3f°, ao 2º %.3f°", erroGrau(yaw, pitch, primeiro.b, PIVO_FIXO),
                            erroGrau(yaw, pitch, segundo.b, PIVO_FIXO)));
        }

        // ================= GRUPO 9 — escolha do alvo: direção antes de distância =================
        System.out.println("== Grupo 9: prioridade pela direção da mira, distância só desempata ==");
        {
            AimAssist a = new AimAssist();
            Alvo perto = new Alvo();   // lateral, mais perto
            perto.mira(new Vector3(0f, 1.5f, 0f), 5f, 0f);
            Alvo centro = new Alvo();  // na direção da mira, mais longe
            centro.mira(new Vector3(0f, 1.5f, 0f), 0.2f, 0f);
            List<AimAssist.Candidato> c = new ArrayList<>();
            c.add(perto);
            c.add(centro);
            AimAssist.Saida s = quadro(a, 1f / 60f, 0f, 0f, 0f, 0f, true, true, c, true, fov, PIVO_FIXO);
            check("o alvo no centro vence o lateral, mesmo mais longe", erroGrau(s.yaw, s.pitch, centro.b, PIVO_FIXO) < 0.01f,
                    String.format("erro ao central %.4f°", erroGrau(s.yaw, s.pitch, centro.b, PIVO_FIXO)));
        }

        System.out.println("\nRESULTADO: " + pass + " ok, " + fail + " falhas");
        System.exit(fail == 0 ? 0 : 1);
    }
}
