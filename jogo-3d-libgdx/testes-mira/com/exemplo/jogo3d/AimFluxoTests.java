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
        float passoMax = maxPasso(parado);
        float limiteGrau = WeaponConfig.Category.FUZIL.maxDegPerSec;
        check("passo máximo por quadro respeita maxDegPerSec da categoria (fuzil)",
                passoMax <= limiteGrau / FPS_PADRAO * 1.002f + 1e-4f,
                String.format("maior passo %.3f°/quadro, limite %.3f°/quadro", passoMax, limiteGrau / FPS_PADRAO));
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
        check("mesmo tempo de convergência em 30, 60 e 90 FPS (±20%)",
                t60 > 0f && Math.abs(t30 - t60) / t60 < 0.2f && Math.abs(t90 - t60) / t60 < 0.2f,
                String.format("30: %.2f s, 60: %.2f s, 90: %.2f s", t30, t60, t90));

        System.out.println("== Liberdade do jogador: o freio não trava a mira ==");
        check("freio nunca abaixo do piso (o jogador ainda movimenta a mira)",
                minFreio(cenarioParado(WeaponConfig.Category.PRECISAO, 2.5f)) >= AimTuning.frictionFloor - 1e-4f,
                String.format("%.3f, piso %.2f", minFreio(cenarioParado(WeaponConfig.Category.PRECISAO, 2.5f)), AimTuning.frictionFloor));

        System.out.println("\nRESULTADO: " + pass + " ok, " + fail + " falhas");
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
        return new Vector3(MathUtils.sin(yaw) * MathUtils.cos(el), MathUtils.sin(el), MathUtils.cos(yaw) * MathUtils.cos(el));
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
