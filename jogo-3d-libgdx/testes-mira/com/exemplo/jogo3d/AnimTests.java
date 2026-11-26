package com.exemplo.jogo3d;

import com.badlogic.gdx.ApplicationAdapter;
import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.backends.headless.HeadlessApplication;
import com.badlogic.gdx.backends.headless.HeadlessApplicationConfiguration;
import com.badlogic.gdx.graphics.GL20;
import com.badlogic.gdx.math.Vector3;

import java.lang.reflect.Proxy;

/** Animações de combate no modelo real do Jake: a mão da arma se move do jeito certo e não atravessa o corpo. */
public class AnimTests extends ApplicationAdapter {
    static int pass = 0, fail = 0;

    static void check(String name, boolean ok, String info) {
        System.out.println((ok ? "  OK   " : "  FALHA") + "  " + name + (info.isEmpty() ? "" : "  [" + info + "]"));
        if (ok) pass++; else fail++;
    }

    Character ch;
    Player pl;
    final Vector3 hand = new Vector3(), spine = new Vector3(), chest = new Vector3(), tmp = new Vector3();

    void frames(int n, float dt) {
        for (int i = 0; i < n; i++) ch.update(pl, dt);
    }

    void measure() {
        ch.handWorld(false, hand);
        ch.nodeWorld("Spine", spine);
        ch.nodeWorld("Spine2", chest);
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

    void run() {
        ch = new Character();
        ch.create();
        pl = new Player();
        pl.spawn(0f, 0f, 0f);
        pl.facing = 0f;   // olhando para +z
        ch.setArmed(true);
        frames(60, 1f / 30f);
        measure();
        float hz0 = hand.z - spine.z, hy0 = hand.y - spine.y, hc0 = hand.dst(chest);

        System.out.println("== Mirar: braço da arma à frente, sem atravessar o corpo ==");
        ch.setArmPose(1f, 0f, 0f, 0f, 0f);
        frames(60, 1f / 30f);
        measure();
        float hz1 = hand.z - spine.z;
        check("mirando: a mão vai para a frente do corpo", hz1 - hz0 > 0.15f, String.format("%.2f m → %.2f m", hz0, hz1));
        check("mirando: a mão fica à frente do tronco (não atravessa)", hz1 > 0.15f, String.format("%.2f m", hz1));
        ch.setArmPose(0f, 0f, 0f, 0f, 0f);
        frames(60, 1f / 30f);

        System.out.println("== Guardar / sacar: braço baixo ==");
        ch.setArmPose(0f, 0f, 0f, 1f, 0f);
        frames(60, 1f / 30f);
        measure();
        float hy1 = hand.y - spine.y;
        check("guardando: a mão desce em relação ao tronco", hy0 - hy1 > 0.08f, String.format("%.2f m → %.2f m", hy0, hy1));
        ch.setArmPose(0f, 0f, 0f, 0f, 0f);
        frames(60, 1f / 30f);

        System.out.println("== Recarregar: arma ao peito ==");
        ch.setArmPose(0f, 0f, 1f, 0f, 0f);
        frames(60, 1f / 30f);
        measure();
        float hc1 = hand.dst(chest);
        check("recarregando: a mão se aproxima do peito", hc0 - hc1 > 0.05f, String.format("%.2f m → %.2f m", hc0, hc1));
        ch.setArmPose(0f, 0f, 0f, 0f, 0f);
        frames(60, 1f / 30f);

        System.out.println("== Coice: o antebraço se mexe no tiro e volta ==");
        measure();
        Vector3 before = new Vector3(hand);
        ch.setArmPose(0f, 1f, 0f, 0f, 0f);
        frames(4, 1f / 30f);
        measure();
        float kickMove = hand.dst(before);
        check("no tiro a mão se mexe (animação visual de coice)", kickMove > 0.005f, String.format("%.3f m", kickMove));
        ch.setArmPose(0f, 0f, 0f, 0f, 0f);
        frames(60, 1f / 30f);
        measure();
        check("depois do coice a mão volta à posição", hand.dst(before) < 0.02f, String.format("%.3f m", hand.dst(before)));

        System.out.println("== Levar tiro: corpo inclina ==");
        Vector3 headBefore = new Vector3(), hipBefore = new Vector3();
        ch.nodeWorld("Head", headBefore);
        ch.nodeWorld("Hips", hipBefore);
        float leanBefore = headBefore.z - hipBefore.z;
        ch.setArmPose(0f, 0f, 0f, 0f, 1f);
        frames(60, 1f / 30f);
        Vector3 headAfter = new Vector3(), hipAfter = new Vector3();
        ch.nodeWorld("Head", headAfter);
        ch.nodeWorld("Hips", hipAfter);
        float leanAfter = headAfter.z - hipAfter.z;
        check("levando tiro: a cabeça vai para trás (efeito pequeno: ~9 mm, a revisar)", leanBefore - leanAfter > 0.005f,
                String.format("%.3f m → %.3f m", leanBefore, leanAfter));
        ch.setArmPose(0f, 0f, 0f, 0f, 0f);
    }

    public static void main(String[] args) {
        new HeadlessApplication(new AnimTests(), new HeadlessApplicationConfiguration());
    }
}
