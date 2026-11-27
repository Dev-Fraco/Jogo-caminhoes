package com.exemplo.jogo3d;

import com.badlogic.gdx.ApplicationAdapter;
import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.backends.headless.HeadlessApplication;
import com.badlogic.gdx.backends.headless.HeadlessApplicationConfiguration;
import com.badlogic.gdx.graphics.GL20;
import com.badlogic.gdx.graphics.g3d.Model;
import com.badlogic.gdx.math.MathUtils;
import com.badlogic.gdx.math.Vector3;

import java.lang.reflect.Proxy;

/**
 * Comportamento da assistência de mira em partida simulada, quadro a quadro: alvo parado, correndo lateralmente,
 * se aproximando, se afastando, dois inimigos, todas as categorias de arma e 30/60/90 FPS.
 * Cada checagem mede o efeito real (erro até a barriga, velocidade da correção, freio), não só o valor configurado.
 */
public class AimFluxoTests extends ApplicationAdapter {
    static int pass = 0, fail = 0;

    static void check(String name, boolean ok, String info) {
        System.out.println((ok ? "  OK   " : "  FALHA") + "  " + name + (info.isEmpty() ? "" : "  [" + info + "]"));
        if (ok) pass++; else fail++;
    }

    @Override
    public void create() {
        Gdx.gl = Gdx.gl20 = (GL20) Proxy.newProxyInstance(GL20.class.getClassLoader(), new Class[]{GL20.class}, (p, m, a) -> {
            Class<?> t = m.getReturnType();
            if (t == int.class) return 1;
            if (t == boolean.class) return true;
            if (t == float.class) return 0f;
            if (t == String.class) return "";
            return null;
        });
        try {
            run();
        } catch (Throwable t) {
            t.printStackTrace();
            fail++;
        }
        System.out.println("\nRESULTADO: " + pass + " ok, " + fail + " falhas");
        System.exit(fail == 0 ? 0 : 1);
    }

    private World w;
    private Model jake;
    private long frame = 10;
    private final Vector3 cam = new Vector3(0f, 1.7f, 0f);
    private float yaw, pitch;
    private static final float FPS_PADRAO = 60f;

    /** Resultado de um quadro da simulação. */
    static final class Medida {
        float passoGrau;   // correção deste quadro, em graus (horizontal + vertical juntas)
        float erroGrau;    // distância angular entre a mira e a barriga do alvo, em graus
        float freio;       // multiplicador de sensibilidade para o próximo quadro
    }

    private void run() {
        MathUtils.random.setSeed(7);
        w = new World();
        w.create();
        jake = ModelIO.load("models/jake/jake.g3dj");
        AimSettings.assistOn = true;

        System.out.println("== Alvo parado: a mira chega à barriga sem salto ==");
        Medida[] parado = cenarioParado(WeaponConfig.Category.FUZIL, 2.5f);
        // Aquisição (primeiros aquisicaoSeg): limite próprio; depois, o acompanhamento segue maxDegPerSec
        float passoAq = 0f, passoAcomp = 0f;
        for (int i = 0; i < parado.length; i++) {
            if (i / FPS_PADRAO < AimTuning.aquisicaoSeg) passoAq = Math.max(passoAq, parado[i].passoGrau);
            else passoAcomp = Math.max(passoAcomp, parado[i].passoGrau);
        }
        float limiteAq = AimTuning.aquisicaoVel / FPS_PADRAO, limiteGrau = WeaponConfig.Category.FUZIL.maxDegPerSec / FPS_PADRAO;
        check("aquisição respeita a velocidade própria (aquisicaoVel)", passoAq <= limiteAq * 1.002f + 1e-4f,
                String.format("maior passo %.3f°/quadro, limite %.3f°/quadro", passoAq, limiteAq));
        check("acompanhamento respeita maxDegPerSec da categoria (fuzil)", passoAcomp <= limiteGrau * 1.002f + 1e-4f,
                String.format("maior passo %.3f°/quadro, limite %.3f°/quadro", passoAcomp, limiteGrau));
        float tConv = tempoAteErro(parado, 0.5f, FPS_PADRAO);
        check("alvo parado: erro abaixo de 0,5° em menos de 1,5 s", tConv > 0f && tConv < 1.5f, String.format("%.2f s", tConv));
        check("alvo parado: erro final pequeno (≤ 0,2°)", parado[parado.length - 1].erroGrau <= 0.2f,
                String.format("%.3f°", parado[parado.length - 1].erroGrau));

        System.out.println("== Alvo correndo lateralmente: tracking acompanha ==");
        float erroComTracking = erroLateral(WeaponConfig.Category.FUZIL, 1f);
        float erroSemTracking = erroLateral(WeaponConfig.Category.FUZIL, 0f);
        check("tracking reduz o erro com alvo lateral (sem tracking fica atrás)", erroComTracking < erroSemTracking,
                String.format("com %.2f°, sem %.2f°", erroComTracking, erroSemTracking));
        check("tracking mantém o alvo dentro do cone (erro médio < 2°)", erroComTracking < 2f, String.format("%.2f°", erroComTracking));

        System.out.println("== Alvo se aproximando e se afastando ==");
        Medida[] perto = cenarioDistancia(WeaponConfig.Category.FUZIL, 40f, 10f, FPS_PADRAO);
        check("alvo se aproximando: erro até 1° depois de 0,7 s", erroDepois(perto, 0.7f, FPS_PADRAO) < 1f,
                String.format("%.2f°", erroDepois(perto, 0.7f, FPS_PADRAO)));
        Medida[] longe = cenarioDistancia(WeaponConfig.Category.FUZIL, 10f, 40f, FPS_PADRAO);
        check("alvo se afastando: erro até 1° depois de 0,7 s", erroDepois(longe, 0.7f, FPS_PADRAO) < 1f,
                String.format("%.2f°", erroDepois(longe, 0.7f, FPS_PADRAO)));
        check("freio ativo perto do alvo (sensibilidade menor que 1)", minFreio(perto) < 1f, String.format("%.3f", minFreio(perto)));

        System.out.println("== Dois inimigos: centro da mira vale mais que a distância ==");
        float raio = AimSettings.fovDeg() * WeaponConfig.Category.FUZIL.radiusScale;
        float pontoPerto = TargetDetection.pontuacao(3f, raio, 6f, 60f);   // 3° fora, a 6 m
        float pontoCentro = TargetDetection.pontuacao(0.3f, raio, 45f, 60f); // 0,3° fora, a 45 m
        check("o inimigo mais alinhado com a mira vence o mais perto e desalinhado", pontoCentro < pontoPerto,
                String.format("centro %.3f, perto %.3f", pontoCentro, pontoPerto));
        check("a distância ainda desempata entre alvos igualmente alinhados",
                TargetDetection.pontuacao(0.5f, raio, 5f, 60f) < TargetDetection.pontuacao(0.5f, raio, 50f, 60f), "");

        System.out.println("== Categorias de arma: cada uma tem efeito real ==");
        float tPistola = tempoAteErro(cenarioParado(WeaponConfig.Category.PISTOLA, 2.5f), 0.5f, FPS_PADRAO);
        float tPrecisao = tempoAteErro(cenarioParado(WeaponConfig.Category.PRECISAO, 2.5f), 0.5f, FPS_PADRAO);
        check("maxDegPerSec: precisão (10°/s) converge mais devagar que pistola (28°/s)", tPrecisao > tPistola,
                String.format("precisão %.2f s, pistola %.2f s", tPrecisao, tPistola));
        float fricPrec = minFreio(cenarioParado(WeaponConfig.Category.PRECISAO, 2.5f));
        float fricEsp = minFreio(cenarioParado(WeaponConfig.Category.ESPINGARDA, 2.5f));
        check("friction: precisão freia mais que espingarda", fricPrec < fricEsp,
                String.format("precisão %.3f, espingarda %.3f", fricPrec, fricEsp));
        float latFuzil = erroLateral(WeaponConfig.Category.FUZIL, 1f);
        float latSub = erroLateral(WeaponConfig.Category.SUBMETRALHADORA, 1f);
        check("tracking e assist diferenciam fuzil de submetralhadora", Math.abs(latFuzil - latSub) > 1e-3f,
                String.format("fuzil %.3f°, submetralhadora %.3f°", latFuzil, latSub));

        System.out.println("== Taxas de quadro: 30, 60 e 90 FPS ==");
        float t30 = tempoAteErro(cenarioParadoFps(30f), 0.5f, 30f);
        float t60 = tempoAteErro(cenarioParadoFps(60f), 0.5f, 60f);
        float t90 = tempoAteErro(cenarioParadoFps(90f), 0.5f, 90f);
        // Convergência em quadros: no máximo 1 quadro de diferença entre as taxas (a aquisição é curta)
        check("mesmo tempo de convergência em 30, 60 e 90 FPS (no máximo 1 quadro de 30 FPS)",
                t60 > 0f && Math.abs(t30 - t60) <= 1f / 30f + 1e-4f && Math.abs(t90 - t60) <= 1f / 30f + 1e-4f,
                String.format("30: %.2f s, 60: %.2f s, 90: %.2f s", t30, t60, t90));

        System.out.println("== Liberdade do jogador: o freio não trava a mira ==");
        check("freio nunca abaixo do piso (o jogador ainda movimenta a mira)",
                minFreio(cenarioParado(WeaponConfig.Category.PRECISAO, 2.5f)) >= AimTuning.frictionFloor - 1e-4f,
                String.format("%.3f, piso %.2f", minFreio(cenarioParado(WeaponConfig.Category.PRECISAO, 2.5f)), AimTuning.frictionFloor));

        System.out.println("== Revisão: mudança de direção, borda do cone, todas as armas, controle manual ==");
        // Mudança de direção: anda 1,5 s para a direita e depois volta para a esquerda
        float erroVira = erroAposVirar(WeaponConfig.Category.FUZIL, 1f);
        float erroViraSem = erroAposVirar(WeaponConfig.Category.FUZIL, 0f);
        check("mudança de direção: tracking mantém o erro baixo depois de virar", erroVira < 1.5f,
                String.format("com tracking %.2f°, sem %.2f°", erroVira, erroViraSem));
        check("mudança de direção: com tracking o erro é menor que sem", erroVira < erroViraSem,
                String.format("com %.2f°, sem %.2f°", erroVira, erroViraSem));

        // Limite maxDegPerSec em todas as armas, com o alvo perto da borda do cone (90% do cone)
        boolean todasRespeitam = true;
        StringBuilder detalhe = new StringBuilder();
        for (WeaponConfig.Category cat : WeaponConfig.Category.values()) {
            float cone = AimSettings.fovDeg() * cat.radiusScale;
            Medida[] borda = cenarioBorda(cat, 0.9f * cone);
            // aquisição (primeiros aquisicaoSeg): limite próprio; depois, o acompanhamento segue maxDegPerSec
            float aq = 0f, comp = 0f;
            for (int i = 0; i < borda.length; i++) {
                if (i / FPS_PADRAO < AimTuning.aquisicaoSeg) aq = Math.max(aq, borda[i].passoGrau);
                else comp = Math.max(comp, borda[i].passoGrau);
            }
            float limAq = AimTuning.aquisicaoVel / FPS_PADRAO, limite = cat.maxDegPerSec / FPS_PADRAO;
            boolean ok = aq <= limAq * 1.002f + 1e-4f && comp <= limite * 1.002f + 1e-4f;
            todasRespeitam &= ok;
            detalhe.append(String.format("%s aq %.3f/%.3f comp %.3f/%.3f; ", cat.name(), aq, limAq, comp, limite));
        }
        check("maxDegPerSec respeitado em todas as armas, alvo na borda do cone", todasRespeitam, detalhe.toString());

        // Controle manual: o freio no centro do alvo (pior caso) e a sensibilidade que sobra
        boolean pisoRespeitado = true;
        for (WeaponConfig.Category cat : WeaponConfig.Category.values()) {
            Medida[] centro = cenarioParado(cat, 2.5f);
            float min = minFreio(centro);
            pisoRespeitado &= min >= AimTuning.frictionFloor - 1e-4f;
            System.out.println(String.format("  INFO   freio no centro, %s: sensibilidade mínima %.3f (piso %.2f)",
                    cat.name(), min, AimTuning.frictionFloor));
        }
        check("controle manual: sensibilidade nunca abaixo do piso em nenhuma arma", pisoRespeitado, "");

        // Início do tiro: erro inicial e tempos (explica 0,45 s de deslizamento × convergência até 0,5°)
        Medida[] inicio = cenarioParado(WeaponConfig.Category.FUZIL, 2.5f);
        System.out.println(String.format("  INFO   início do tiro (fuzil): erro no 1º quadro %.2f°; até 0,5° em %.2f s; até 0,05° em %.2f s; deslizamento = %.2f s",
                inicio[0].erroGrau, tempoAteErro(inicio, 0.5f, FPS_PADRAO), tempoAteErro(inicio, 0.05f, FPS_PADRAO), AimTuning.aquisicaoSeg));

        System.out.println("== Subida da barriga à cabeça com o dedo (arrasto manual) ==");
        float[] sub = subidaParaCabeca(0.25f, 90);
        // sub[0] = arrasto total do dedo (°), sub[1] = correção total da assistência (°), sub[2] = quadros em que a assistência empurra contra o dedo
        // Acompanhamento de alvo rápido: a mira precisa correr atrás, então o limite contínuo é exercitado de verdade
        boolean limiteContinuo = true;
        StringBuilder det2 = new StringBuilder();
        for (WeaponConfig.Category cat : WeaponConfig.Category.values()) {
            Medida[] rapido = cenarioAlvoRapido(cat);
            float comp = 0f;
            for (int i = 0; i < rapido.length; i++) if (i / FPS_PADRAO >= AimTuning.aquisicaoSeg) comp = Math.max(comp, rapido[i].passoGrau);
            float limite = cat.maxDegPerSec / FPS_PADRAO;
            limiteContinuo &= comp <= limite * 1.002f + 1e-4f;
            det2.append(String.format("%s %.3f/%.3f; ", cat.name(), comp, limite));
        }
        check("acompanhamento de alvo rápido respeita maxDegPerSec em todas as armas", limiteContinuo, det2.toString());

        // Abdômen continua o ponto principal: depois de subir e parar, a mira volta suave ao abdômen
        float[] ret = retornoAbdomen(0.10f, 15, 180);   // sobe 1,5° e para por 3 s
        check("depois de parar de subir, a mira volta ao abdômen (≤0,4°)", ret[0] <= 0.4f,
                String.format("erro final %.2f°, erro logo após parar %.2f°", ret[0], ret[2]));
        check("retorno ao abdômen sem puxão brusco (≤0,2°/quadro)", ret[1] <= 0.2f,
                String.format("maior correção no retorno %.3f°/quadro", ret[1]));
        // Movimento do dedo tem prioridade: sem resistência, a atração não puxa contra um dedo que sobe devagar
        float contra = movimentoTemPrioridade();
        check("enquanto o dedo se move, a atração ao abdômen não puxa contra ele", Math.abs(contra) < 0.01f,
                String.format("correção contra o dedo %.4f°", contra));

        check("subida com o dedo: a mira nunca reverte o movimento do dedo (sem tremedeira)", sub[2] == 0f,
                String.format("quadros em que a mira não sobe com o dedo: %.0f; dedo %.2f°, assistência %.2f°", sub[2], sub[0], sub[1]));
        check("subida com o dedo: a resistência fica reduzida (≤15% do arrasto)", Math.abs(sub[1]) <= 0.15f * Math.abs(sub[0]) + 1e-3f,
                String.format("dedo %.2f°, assistência %.2f°", sub[0], sub[1]));

        System.out.println("\nRESULTADO: " + pass + " ok, " + fail + " falhas");
    }

    /** Alvo a 15 m correndo lateralmente a 6 m/s; a mira começa nele. Mede o passo do acompanhamento. */
    private Medida[] cenarioAlvoRapido(WeaponConfig.Category cat) {
        Enemy e = inimigo(-4f, 0f, 15f);
        cam.set(0f, 1.7f, 0f);
        return simula(e, t -> {
            float x = -4f + 6f * t;
            return new Vector3(x, w.groundAt(x, 15f), 15f);
        }, FPS_PADRAO, 2.0f, cat, 1f, true);
    }

    /**
     * A mira começa no abdômen, sobe com o dedo por 'frames' quadros (passoGrau por quadro) e depois para por
     * 'depois' quadros. Devolve {erro final em °, maior correção no retorno em °/quadro, erro logo após parar em °}.
     */
    private float[] retornoAbdomen(float passoGrau, int frames, int depois) {
        Enemy e = inimigo(0f, 0f, 25f);
        cam.set(0f, 1.7f, 0f);
        aimAt(new Vector3(e.hitbox.belly));
        AimAssist aa = new AimAssist();
        float dt = 1f / FPS_PADRAO, maxRet = 0f, logoApos = 0f;
        for (int i = 0; i < frames + depois; i++) {
            e.pos.set(0f, w.groundAt(0f, 25f), 25f);
            e.pose(0f);
            e.hitbox.update(++frame);
            float passo = i < frames ? (float) -Math.toRadians(passoGrau) : 0f;   // dedo para cima = pitch diminui
            pitch += passo;
            Vector3 d = dir();
            float camYaw = MathUtils.atan2(d.x, d.z), camPitch = -(float) Math.asin(MathUtils.clamp(d.y, -1f, 1f));
            aa.update(dt, cam, d, camYaw, camPitch, e, WeaponConfig.Category.FUZIL, true, i == 0, false);
            yaw += aa.dYaw;
            pitch += aa.dPitch;
            if (i >= frames) maxRet = Math.max(maxRet, (float) Math.toDegrees(Math.abs(aa.dPitch)));
            if (i == frames) logoApos = Math.abs(erroBarrigaSigned(e));
        }
        return new float[]{Math.abs(erroBarrigaSigned(e)), maxRet, logoApos};
    }

    /** Erro vertical com sinal, em °: positivo = o abdômen está acima da mira. */
    private float erroBarrigaSigned(Enemy e) {
        Vector3 b = e.hitbox.belly;
        float dx = b.x - cam.x, dy = b.y - cam.y, dz = b.z - cam.z;
        return (float) Math.toDegrees(MathUtils.atan2(dy, (float) Math.sqrt(dx * dx + dz * dz)) + pitch);
    }

    /** Mira 2° acima do abdômen, sem resistência, o dedo sobe devagar: quanto a atração puxa contra ele (°). */
    private float movimentoTemPrioridade() {
        float salvo = AimSettings.upResist;
        AimSettings.upResist = 0f;
        Enemy e = inimigo(0f, 0f, 25f);
        cam.set(0f, 1.7f, 0f);
        aimAt(new Vector3(e.hitbox.belly));
        pitch -= (float) Math.toRadians(2f);
        AimAssist aa = new AimAssist();
        float dt = 1f / FPS_PADRAO, soma = 0f;
        for (int i = 0; i < 60; i++) {
            e.pos.set(0f, w.groundAt(0f, 25f), 25f);
            e.pose(0f);
            e.hitbox.update(++frame);
            float passo = (float) -Math.toRadians(0.05f);   // devagar, abaixo do limiar de arrasto
            pitch += passo;
            Vector3 d = dir();
            float camYaw = MathUtils.atan2(d.x, d.z), camPitch = -(float) Math.asin(MathUtils.clamp(d.y, -1f, 1f));
            aa.update(dt, cam, d, camYaw, camPitch, e, WeaponConfig.Category.FUZIL, true, i == 0, false);
            yaw += aa.dYaw;
            pitch += aa.dPitch;
            if (i > 0) soma += aa.dPitch;   // o 1º quadro é o aperto do tiro (sem referência do dedo): a aquisição gruda aí
            
        }
        AimSettings.upResist = salvo;
        return (float) Math.toDegrees(soma);
    }

    // ---------- cenários de revisão ----------

    /**
     * Sobe a mira da barriga com o dedo (arrasto para cima), segurando o tiro, alvo parado a 25 m.
     * Devolve {arrasto total do dedo em °, correção total da assistência em °, quadros em que a assistência empurra contra o dedo}.
     */
    private float[] subidaParaCabeca(float passoGrau, int frames) {
        Enemy e = inimigo(0f, 0f, 25f);
        cam.set(0f, 1.7f, 0f);
        aimAt(new Vector3(e.hitbox.belly));
        AimAssist aa = new AimAssist();
        float dt = 1f / FPS_PADRAO;
        float dedo = 0f, assist = 0f;
        int contra = 0;
        for (int i = 0; i < frames; i++) {
            e.pos.set(0f, w.groundAt(0f, 25f), 25f);
            e.pose(0f);
            e.hitbox.update(++frame);
            // arrasto para cima: a mira sobe, o que diminui o pitch
            float passo = (float) -Math.toRadians(passoGrau);
            pitch += passo;
            dedo += passo;
            Vector3 d = dir();
            float camYaw = MathUtils.atan2(d.x, d.z), camPitch = -(float) Math.asin(MathUtils.clamp(d.y, -1f, 1f));
            aa.update(dt, cam, d, camYaw, camPitch, e, WeaponConfig.Category.FUZIL, true, i == 0, false);
            yaw += aa.dYaw;
            pitch += aa.dPitch;
            assist += aa.dPitch;
            // dedo para cima = pitch diminui: a mira deve subir junto (total < 0). Se não, há tremedeira.
            if (passo + aa.dPitch < 0f) {
                // sobe com o dedo: ok
            } else contra++;
        }
        return new float[]{(float) Math.toDegrees(dedo), (float) Math.toDegrees(assist), contra};
    }

    /** Alvo a 25 m que anda para a direita por 1,5 s e depois volta para a esquerda; erro médio depois de virar. */
    private float erroAposVirar(WeaponConfig.Category cat, float trackingScale) {
        Enemy e = inimigo(0f, 0f, 20f);
        cam.set(0f, 1.7f, 0f);   // a mira começa na altura do terreno do alvo + 1,5 m (o padrão da simulação)
        Medida[] m = simula(e, t -> {
            float x = t <= 1.5f ? 2.5f * t : 2.5f * 1.5f - 2.5f * (t - 1.5f);
            return new Vector3(x, w.groundAt(x, 20f), 20f);
        }, FPS_PADRAO, 3.5f, cat, trackingScale, true);
        miraInicial = null;
        float soma = 0f;
        int n = 0;
        for (int i = (int) (3.0f * FPS_PADRAO); i < m.length; i++) { soma += m[i].erroGrau; n++; }
        return soma / Math.max(1, n);
    }

    /** Alvo parado com a mira no centro e o alvo deslocado para a borda do cone (grau dado). */
    private Medida[] cenarioBorda(WeaponConfig.Category cat, float grauFora) {
        float d = 25f;
        float lado = d * (float) Math.tan(Math.toRadians(grauFora));
        Enemy e = inimigo(lado, 0f, d);
        // a mira começa no centro (x = 0), na altura do terreno + 1,5 m; o alvo fica na borda do cone
        miraInicial = new Vector3(0f, w.groundAt(0f, d) + 1.5f, d);
        cam.set(0f, 1.7f, 0f);
        Medida[] m = simula(e, t -> new Vector3(lado, w.groundAt(lado, d), d), FPS_PADRAO, 2.0f, cat, 1f, true);
        miraInicial = null;
        return m;
    }

    // ---------- cenários ----------

    /** Alvo parado a 25 m, 2° fora do centro, a mira começa na cabeça e o tiro fica apertado. */
    private Medida[] cenarioParado(WeaponConfig.Category cat, float seconds) {
        return cenarioParadoFps(FPS_PADRAO, cat, seconds);
    }

    private Medida[] cenarioParadoFps(float fps) {
        return cenarioParadoFps(fps, WeaponConfig.Category.FUZIL, 2.5f);
    }

    private Medida[] cenarioParado(WeaponConfig.Category cat, float seconds, float fps) {
        return cenarioParadoFps(fps, cat, seconds);
    }

    private Medida[] cenarioParadoFps(float fps, WeaponConfig.Category cat, float seconds) {
        Enemy e = inimigo(0f, 0f, 25f);
        // a mira começa na cabeça do alvo como ele está agora (0 m de lado, 25 m); depois o alvo fica 2° fora do centro
        miraInicial = new Vector3(e.hitbox.headCenter);
        cam.set(0f, 1.7f, 0f);
        Vector3 deslocado = new Vector3(0.87f, 0f, 25f);   // 0,87 m de lado a 25 m ≈ 2°
        Medida[] m = simula(e, t -> new Vector3(deslocado.x, w.groundAt(deslocado.x, deslocado.z), deslocado.z), fps, seconds, cat, 1f, true);
        miraInicial = null;
        return m;
    }

    private Medida[] cenarioParadoFps(float fps, WeaponConfig.Category cat) {
        return cenarioParadoFps(fps, cat, 2.5f);
    }

    /** Alvo correndo lateralmente a 20 m, a 2,5 m/s; a mira começa nele. */
    private float erroLateral(WeaponConfig.Category cat, float trackingScale) {
        Enemy e = inimigo(-6f, 0f, 20f);
        Medida[] m = simula(e, t -> new Vector3(-6f + 2.5f * t, w.groundAt(-6f + 2.5f * t, 20f), 20f), FPS_PADRAO, 3f, cat, trackingScale, true);
        float soma = 0f;
        int n = 0;
        for (int i = (int) (m.length * 0.6f); i < m.length; i++) { soma += m[i].erroGrau; n++; }
        return soma / Math.max(1, n);
    }

    /** Alvo que se aproxima ou se afasta: de d0 a d1 metros, a 6 m/s, 1° fora do centro. */
    private Medida[] cenarioDistancia(WeaponConfig.Category cat, float d0, float d1, float fps) {
        Enemy e = inimigo(0f, 0f, d0);
        float tDur = Math.abs(d1 - d0) / 6f;
        return simula(e, t -> {
            float z = d0 + (d1 - d0) * MathUtils.clamp(t / tDur, 0f, 1f);
            return new Vector3(z * (float) Math.tan(Math.toRadians(1f)), w.groundAt(z * 0.01745f, z), z);
        }, fps, tDur + 1f, cat, 1f, true);
    }

    // ---------- simulação ----------

    /** Função: tempo (s) → posição do alvo. */
    private interface Trajetoria { Vector3 em(float t); }

    /** Onde a mira começa (null = na cabeça do alvo no início da trajetória). */
    private Vector3 miraInicial;

    private Medida[] simula(Enemy e, Trajetoria tr, float fps, float seconds, WeaponConfig.Category cat, float trackingScale, boolean segurando) {
        AimAssist aa = new AimAssist();
        aa.trackingScale = trackingScale;
        aa.alcance = 70f;
        int n = Math.round(seconds * fps);
        float dt = 1f / fps;
        Medida[] out = new Medida[n];
        // a mira começa apontada para o alvo, na altura da cabeça (como um jogador que acabou de encontrar o inimigo)
        Vector3 p0 = tr.em(0f);
        Vector3 mira = miraInicial != null ? miraInicial : new Vector3(p0.x, p0.y + 1.5f, p0.z);
        aimAt(mira);
        for (int i = 0; i < n; i++) {
            float t = i * dt;
            Vector3 p = tr.em(t);
            e.pos.set(p.x, w.groundAt(p.x, p.z), p.z);
            e.pose(0f);
            e.hitbox.update(++frame);
            Vector3 d = dir();
            float camYaw = MathUtils.atan2(d.x, d.z), camPitch = -(float) Math.asin(MathUtils.clamp(d.y, -1f, 1f));
            boolean press = i == 0;
            aa.update(dt, cam, d, camYaw, camPitch, e, cat, segurando, press, false);
            yaw += aa.dYaw;
            pitch += aa.dPitch;
            Medida m = new Medida();
            m.passoGrau = (float) Math.toDegrees(Math.hypot(aa.dYaw, aa.dPitch));
            m.erroGrau = (float) Math.toDegrees(erroBarriga(e));
            m.freio = aa.friction;
            out[i] = m;
        }
        return out;
    }

    private void aimAt(Vector3 p) {
        Vector3 v = new Vector3(p).sub(cam);
        yaw = MathUtils.atan2(v.x, v.z);
        pitch = -MathUtils.atan2(v.y, (float) Math.sqrt(v.x * v.x + v.z * v.z));
    }

    private Vector3 dir() {
        float el = -pitch;
        return new Vector3((float) Math.sin(yaw) * (float) Math.cos(el), (float) Math.sin(el), (float) Math.cos(yaw) * (float) Math.cos(el));
    }

    /** Distância angular (rad) entre a mira e a barriga do alvo. */
    private float erroBarriga(Enemy e) {
        Vector3 b = e.hitbox.belly;
        float dx = b.x - cam.x, dy = b.y - cam.y, dz = b.z - cam.z;
        float eYaw = wrap(MathUtils.atan2(dx, dz) - yaw);
        float eP = MathUtils.atan2(dy, (float) Math.sqrt(dx * dx + dz * dz)) + pitch;
        return (float) Math.sqrt(eYaw * eYaw + eP * eP);
    }

    private static float wrap(float a) {
        while (a > MathUtils.PI) a -= MathUtils.PI2;
        while (a < -MathUtils.PI) a += MathUtils.PI2;
        return a;
    }

    private Enemy inimigo(float x, float y, float z) {
        Enemy e = new Enemy(jake, null, x, z, 0.3f);
        e.pos.y = w.groundAt(x, z);
        e.forceClip("Idle");
        for (int i = 0; i < 40; i++) e.pose(1f / 30f);
        e.hitbox.update(++frame);
        return e;
    }

    // ---------- medidas ----------

    private static float maxPasso(Medida[] m) {
        float max = 0f;
        for (Medida x : m) max = Math.max(max, x.passoGrau);
        return max;
    }

    private static float minFreio(Medida[] m) {
        float min = 1f;
        for (Medida x : m) min = Math.min(min, x.freio);
        return min;
    }

    /** Primeiro instante (s) em que o erro fica abaixo de 'limiteGrau'; -1 se nunca. */
    private static float tempoAteErro(Medida[] m, float limiteGrau, float fps) {
        for (int i = 0; i < m.length; i++) if (m[i].erroGrau < limiteGrau) return i / fps;
        return -1f;
    }

    private static float erroDepois(Medida[] m, float segundos, float fps) {
        int i = Math.min(m.length - 1, Math.round(segundos * fps));
        return m[i].erroGrau;
    }

    public static void main(String[] args) {
        new HeadlessApplication(new AimFluxoTests(), new HeadlessApplicationConfiguration());
    }
}
