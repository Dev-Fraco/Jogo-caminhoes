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
 * Resistência magnética e atração ao abdômen, com o movimento real do dedo: subida lenta, rápida, constante,
 * com pausa, repetida, parada na cabeça, inimigo correndo, inimigo mudando de direção, todas as armas e 30/60/90 FPS.
 * Mede: intensidade da resistência, velocidade de subida com e sem assistência, inversões do movimento,
 * oscilação por quadro e capacidade de chegar e manter a mira na cabeça.
 */
public class AimMagneticoTests extends ApplicationAdapter {
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
    private long frame = 100;
    private final Vector3 cam = new Vector3(0f, 1.7f, 0f);
    private float yaw, pitch;

    /** Passo do dedo em graus por quadro (positivo = sobe). */
    interface Dedo { float passo(int i, float fps, float erroCabecaGrau); }
    /** Posição do alvo no tempo t (s). */
    interface Alvo { Vector3 em(float t); }

    /** Resultado de uma simulação. */
    static final class Sim {
        float[] usuario, assist, errHead, errBelly, errYaw, corrQuadro;   // graus; errHead > 0 = mira abaixo da cabeça
        int quadros;
        float fps;
    }

    private void run() {
        MathUtils.random.setSeed(11);
        w = new World();
        w.create();
        jake = ModelIO.load("models/jake/jake.g3dj");
        AimSettings.assistOn = true;
        WeaponConfig.Category fuzil = WeaponConfig.Category.FUZIL;
        Alvo parado = t -> new Vector3(0f, w.groundAt(0f, 25f), 25f);

        System.out.println("== Subida da barriga à cabeça com o dedo ==");
        Sim lenta = simula(60f, fuzil, 360, (i, f, eh) -> eh > 0.2f ? 0.05f : 0f, parado, true);
        Sim rapida = simula(60f, fuzil, 360, (i, f, eh) -> eh > 0.2f ? 0.40f : 0f, parado, true);
        Sim constante = simula(60f, fuzil, 360, (i, f, eh) -> eh > 0.2f ? 0.15f : 0f, parado, true);
        for (Sim s : new Sim[]{lenta, rapida, constante}) { /* métricas abaixo */ }
        check("subida lenta: chega à cabeça", alcancouCabeca(lenta), String.format("erro final %.2f°", lenta.errHead[lenta.quadros - 1]));
        check("subida rápida: chega à cabeça", alcancouCabeca(rapida), String.format("erro final %.2f°", rapida.errHead[rapida.quadros - 1]));
        check("subida constante: chega à cabeça", alcancouCabeca(constante), String.format("erro final %.2f°", constante.errHead[constante.quadros - 1]));
        check("subida lenta: resistência presente (entre 10%% e 95%% do movimento)", intensidade(lenta) > 0.10f && intensidade(lenta) < 0.95f,
                String.format("%.1f%% do movimento volta", 100f * intensidade(lenta)));
        check("subida rápida: a resistência não passa de 95%% (sempre sobe)", intensidade(rapida) <= 0.95f + 1e-3f,
                String.format("%.1f%%", 100f * intensidade(rapida)));
        check("sem inversões do movimento (subida lenta)", inversoes(lenta) == 0, "inversões " + inversoes(lenta));
        check("sem inversões do movimento (subida rápida)", inversoes(rapida) == 0, "inversões " + inversoes(rapida));
        check("sem inversões do movimento (subida constante)", inversoes(constante) == 0, "inversões " + inversoes(constante));
        System.out.println(String.format("  INFO   velocidade de subida: lenta %.2f°/s (sem assistência %.2f°/s), rápida %.2f°/s (sem %.2f°/s)",
                velSub(lenta), velSub(semAssist(0.05f)), velSub(rapida), velSub(semAssist(0.40f))));

        System.out.println("== Subida seguida de pausa: volta suave ao abdômen ==");
        Sim pausa = simula(60f, fuzil, 300, (i, f, eh) -> i < 60 ? 0.10f : 0f, parado, true);
        check("depois da pausa, a mira volta ao abdômen (≤0,4°)", Math.abs(pausa.errBelly[pausa.quadros - 1]) <= 0.4f,
                String.format("erro final %.2f°", pausa.errBelly[pausa.quadros - 1]));
        float maxRet = 0f;
        for (int i = 60; i < pausa.quadros; i++) maxRet = Math.max(maxRet, Math.abs(pausa.assist[i]));
        check("retorno ao abdômen sem puxão (≤0,2°/quadro)", maxRet <= 0.2f, String.format("%.3f°/quadro", maxRet));

        System.out.println("== Subida e descida repetidas ==");
        Sim vai = simula(60f, fuzil, 360, (i, f, eh) -> (i / 30) % 2 == 0 ? 0.12f : -0.12f, parado, true);
        check("subindo e descendo: a mira nunca inverte o movimento do dedo", inversoes(vai) == 0, "inversões " + inversoes(vai));

        System.out.println("== Segurar a mira na cabeça ==");
        Sim cabeca = simula(60f, fuzil, 360, (i, f, eh) -> i < 120 ? 0.12f : 0f, parado, true);
        int trocas = 0;
        for (int i = 121; i < cabeca.quadros - 1; i++) if (Math.signum(cabeca.assist[i]) != Math.signum(cabeca.assist[i + 1]) && Math.abs(cabeca.assist[i]) > 1e-4f) trocas++;
        check("parado na cabeça: a volta ao abdômen não treme (sem trocas de sentido)", trocas <= 2, "trocas " + trocas);

        System.out.println("== Inimigo correndo lateralmente enquanto a mira sobe ==");
        Alvo correndo = t -> new Vector3(-2.5f + 2.5f * t, w.groundAt(-2.5f + 2.5f * t, 25f), 25f);
        Sim lateral = simula(60f, fuzil, 360, (i, f, eh) -> eh > 0.2f ? 0.10f : 0f, correndo, true);
        check("alvo correndo: o tracking horizontal segue (erro lateral final ≤1°)", Math.abs(lateral.errYaw[lateral.quadros - 1]) <= 1f,
                String.format("erro lateral %.2f°", lateral.errYaw[lateral.quadros - 1]));
        check("alvo correndo: a mira chega à cabeça enquanto sobe", alcancouCabeca(lateral), String.format("erro vertical final %.2f°", lateral.errHead[lateral.quadros - 1]));
        check("alvo correndo: sem inversões do movimento", inversoes(lateral) == 0, "inversões " + inversoes(lateral));

        System.out.println("== Inimigo mudando de direção durante a subida ==");
        Alvo vira = t -> new Vector3(t <= 1.5f ? 2.5f * t : 2.5f * 1.5f - 2.5f * (t - 1.5f), w.groundAt(0f, 25f), 25f);
        Sim muda = simula(60f, fuzil, 360, (i, f, eh) -> eh > 0.2f ? 0.10f : 0f, vira, true);
        check("inimigo muda de direção: sem inversões do movimento", inversoes(muda) == 0, "inversões " + inversoes(muda));
        check("inimigo muda de direção: o erro lateral final fica ≤1,5°", Math.abs(muda.errYaw[muda.quadros - 1]) <= 1.5f,
                String.format("erro lateral %.2f°", muda.errYaw[muda.quadros - 1]));

        System.out.println("== Todas as categorias de arma ==");
        boolean todasSemInversao = true, todasChegam = true;
        StringBuilder det = new StringBuilder();
        for (WeaponConfig.Category cat : WeaponConfig.Category.values()) {
            Sim s = simula(60f, cat, 360, (i, f, eh) -> eh > 0.2f ? 0.15f : 0f, parado, true);
            todasSemInversao &= inversoes(s) == 0;
            todasChegam &= alcancouCabeca(s);
            det.append(String.format("%s %s/%s; ", cat.name(), alcancouCabeca(s) ? "cabeça" : "longe", inversoes(s)));
        }
        check("todas as armas: sem inversões", todasSemInversao, det.toString());
        check("todas as armas: chegam à cabeça", todasChegam, "");

        System.out.println("== 30, 60 e 90 FPS ==");
        int q30 = quadroCabeca(simula(30f, fuzil, 180, (i, f, eh) -> 0.15f * 60f / f, parado, true), 30f);
        int q60 = quadroCabeca(simula(60f, fuzil, 360, (i, f, eh) -> 0.15f * 60f / f, parado, true), 60f);
        int q90 = quadroCabeca(simula(90f, fuzil, 540, (i, f, eh) -> 0.15f * 60f / f, parado, true), 90f);
        check("mesmo tempo para chegar à cabeça em 30, 60 e 90 FPS (±0,1 s)",
                q30 > 0 && q60 > 0 && q90 > 0 && Math.abs(q30 / 30f - q60 / 60f) <= 0.1f && Math.abs(q90 / 90f - q60 / 60f) <= 0.1f,
                String.format("30: %.2f s, 60: %.2f s, 90: %.2f s", q30 / 30f, q60 / 60f, q90 / 90f));

        System.out.println("\nRESULTADO: " + pass + " ok, " + fail + " falhas");
    }

    // ---------- simulação ----------

    private Sim simula(float fps, WeaponConfig.Category cat, int frames, Dedo dedo, Alvo alvo, boolean assistOn) {
        boolean salvo = AimSettings.assistOn;
        AimSettings.assistOn = assistOn;
        Enemy e = new Enemy(jake, null, 0f, 0f, 0.3f);
        e.forceClip("Idle");
        for (int i = 0; i < 40; i++) e.pose(1f / 30f);
        cam.set(0f, 1.7f, 0f);
        Vector3 p0 = alvo.em(0f);
        e.pos.set(p0.x, w.groundAt(p0.x, p0.z), p0.z);
        e.pose(0f);
        e.hitbox.update(++frame);
        aimAt(new Vector3(e.hitbox.belly));   // a mira começa no abdômen
        AimAssist aa = new AimAssist();
        float dt = 1f / fps;
        Sim s = new Sim();
        s.fps = fps;
        s.quadros = frames;
        s.usuario = new float[frames];
        s.assist = new float[frames];
        s.errHead = new float[frames];
        s.errBelly = new float[frames];
        s.errYaw = new float[frames];
        s.corrQuadro = new float[frames];
        for (int i = 0; i < frames; i++) {
            float t = i * dt;
            Vector3 p = alvo.em(t);
            e.pos.set(p.x, w.groundAt(p.x, p.z), p.z);
            e.pose(0f);
            e.hitbox.update(++frame);
            float u = dedo.passo(i, fps, erroDeg(e.hitbox.headCenter));
            pitch -= (float) Math.toRadians(u);   // dedo para cima = pitch diminui
            Vector3 d = dir();
            float camYaw = MathUtils.atan2(d.x, d.z), camPitch = -(float) Math.asin(MathUtils.clamp(d.y, -1f, 1f));
            aa.update(dt, cam, d, camYaw, camPitch, e, cat, true, i == 0, false);
            yaw += aa.dYaw;
            pitch += aa.dPitch;
            s.usuario[i] = u;
            s.assist[i] = (float) Math.toDegrees(-aa.dPitch);   // > 0: a assistência ajuda a subir
            s.corrQuadro[i] = (float) Math.toDegrees(aa.dPitch);
            s.errBelly[i] = erroDeg(e.hitbox.belly);
            s.errHead[i] = erroDeg(e.hitbox.headCenter);
            Vector3 hc = e.hitbox.headCenter;
            s.errYaw[i] = (float) Math.toDegrees(wrap(MathUtils.atan2(hc.x - cam.x, hc.z - cam.z) - yaw));
        }
        AimSettings.assistOn = salvo;
        return s;
    }

    private Sim semAssist(float passo) {
        return simula(60f, WeaponConfig.Category.FUZIL, 360, (i, f, eh) -> passo, t -> new Vector3(0f, w.groundAt(0f, 25f), 25f), false);
    }

    private static float wrap(float a) {
        while (a > MathUtils.PI) a -= MathUtils.PI2;
        while (a < -MathUtils.PI) a += MathUtils.PI2;
        return a;
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

    /** Erro vertical em graus entre a mira e um ponto: positivo = o ponto está acima da mira. */
    private float erroDeg(Vector3 p) {
        float dx = p.x - cam.x, dy = p.y - cam.y, dz = p.z - cam.z;
        return (float) Math.toDegrees(MathUtils.atan2(dy, (float) Math.sqrt(dx * dx + dz * dz)) + pitch);
    }

    // ---------- métricas ----------

    /** Subida: fração do movimento do dedo que a assistência devolve, somada nos quadros em que o dedo sobe acima do abdômen. */
    private float intensidade(Sim s) {
        float dedo = 0f, volta = 0f;
        for (int i = 0; i < s.quadros; i++) {
            if (s.usuario[i] > 0f && s.errBelly[i] < 0f) {
                dedo += s.usuario[i];
                volta += Math.max(0f, -s.assist[i]);   // a resistência puxa a mira para baixo: parte negativa
            }
        }
        return dedo > 1e-4f ? volta / dedo : 0f;
    }

    /** Quadros em que o dedo sobe e a mira não sobe junto (movimento invertido). */
    private int inversoes(Sim s) {
        int n = 0;
        for (int i = 0; i < s.quadros; i++) {
            if (s.usuario[i] > 0f && s.usuario[i] + s.assist[i] < 0f) n++;
        }
        return n;
    }

    /** Velocidade média de subida da mira (°/s), nos quadros em que o dedo sobe. */
    private float velSub(Sim s) {
        float soma = 0f;
        int n = 0;
        for (int i = 0; i < s.quadros; i++) if (s.usuario[i] > 0f) { soma += s.usuario[i] + s.assist[i]; n++; }
        return n == 0 ? 0f : soma / n * s.fps;
    }

    /** Chegou à cabeça (erro ≤ 0,3°) e manteve nos últimos 30 quadros. */
    private boolean alcancouCabeca(Sim s) {
        for (int i = s.quadros - 30; i < s.quadros; i++) if (Math.abs(s.errHead[i]) > 0.3f) return false;
        return true;
    }

    private int quadroCabeca(Sim s, float fps) {
        for (int i = 0; i < s.quadros; i++) if (Math.abs(s.errHead[i]) <= 0.3f) return i;
        return -1;
    }

    public static void main(String[] args) {
        new HeadlessApplication(new AimMagneticoTests(), new HeadlessApplicationConfiguration());
    }
}
