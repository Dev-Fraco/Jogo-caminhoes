package com.exemplo.jogo3d;

import com.badlogic.gdx.ApplicationAdapter;
import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.backends.headless.HeadlessApplication;
import com.badlogic.gdx.backends.headless.HeadlessApplicationConfiguration;
import com.badlogic.gdx.graphics.GL20;
import com.badlogic.gdx.math.MathUtils;

import java.lang.reflect.Proxy;

/**
 * Rotação do personagem e da câmera (estilo Free Fire), três situações separadas:
 *  1. parado: a câmera gira, o corpo não;
 *  2. andando: a câmera gira, o corpo e a direção de andar não mudam;
 *  3. correndo: o corpo gira suavemente até a câmera e corre para onde ela aponta.
 */
public class MoveRotTests extends ApplicationAdapter {
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

    /** Anda/corre por 'segundos' quadros de 1/30 s; a câmera gira de camIni a camFim ao longo do tempo. */
    static void simular(Player p, World w, float inX, float inY, boolean run, float camIni, float camFim, float segundos) {
        int n = Math.round(segundos * 30f);
        for (int i = 0; i < n; i++) {
            float cam = MathUtils.lerp(camIni, camFim, (i + 1) / (float) n);
            p.update(1f / 30f, inX, inY, cam, false, run, w);
        }
    }

    void run() {
        World w = new World();
        w.create();

        System.out.println("== 1. Parado: a câmera gira, o corpo fica ==");
        Player p1 = new Player();
        p1.spawn(0f, 0f, 0f);
        p1.facing = 0.3f;
        float x0 = p1.pos.x, z0 = p1.pos.z;
        simular(p1, w, 0f, 0f, false, 0f, 2.5f, 2f);
        check("parado, girar a câmera não gira o corpo", Math.abs(p1.facing - 0.3f) < 1e-4f, String.format("corpo %.3f rad", p1.facing));
        check("parado, girar a câmera não move o personagem", Math.abs(p1.pos.x - x0) < 1e-4f && Math.abs(p1.pos.z - z0) < 1e-4f, "");

        System.out.println("== 2. Andando: o analógico é relativo à câmera; o corpo vira para onde anda ==");
        Player p2 = new Player();
        p2.spawn(0f, 0f, 0f);
        p2.facing = 0f;
        float x2 = p2.pos.x, z2 = p2.pos.z;
        simular(p2, w, 0f, 1f, false, 1.2f, 1.2f, 2f);   // câmera parada apontando para 1,2 rad; analógico para a frente
        float dxAnda = p2.pos.x - x2, dzAnda = p2.pos.z - z2;
        float dirAnda = MathUtils.atan2(dxAnda, dzAnda);
        check("andando, o personagem anda para onde a câmera olha (não para onde o corpo está)",
                Math.abs(MathUtils.atan2(MathUtils.sin(dirAnda - 1.2f), MathUtils.cos(dirAnda - 1.2f))) < 0.1f,
                String.format("andou para %.3f rad (câmera 1.200)", dirAnda));
        check("andando, o corpo vira para a direção de andar", Math.abs(MathUtils.atan2(MathUtils.sin(p2.facing - 1.2f), MathUtils.cos(p2.facing - 1.2f))) < 0.1f,
                String.format("corpo %.3f rad", p2.facing));

        System.out.println("== 3. Correndo: o corpo gira suave até a câmera e corre para onde ela aponta ==");
        Player p3 = new Player();
        p3.spawn(0f, 0f, 0f);
        p3.facing = 0f;
        float alvo = 1.2f;
        simular(p3, w, 0f, 0f, true, 0f, alvo, 0.1f);
        check("correndo, o corpo começa a virar (não instantâneo)", p3.facing > 0.05f && p3.facing < alvo - 0.1f,
                String.format("corpo %.3f rad aos 0,1 s", p3.facing));
        simular(p3, w, 0f, 0f, true, alvo, alvo, 2f);
        check("correndo, o corpo termina virado para a câmera", Math.abs(MathUtils.atan2(MathUtils.sin(p3.facing - alvo), MathUtils.cos(p3.facing - alvo))) < 0.05f,
                String.format("corpo %.3f rad, câmera %.3f rad", p3.facing, alvo));
        float x3 = p3.pos.x, z3 = p3.pos.z;
        simular(p3, w, 0f, 0f, true, alvo, alvo, 1f);
        float dx3 = p3.pos.x - x3, dz3 = p3.pos.z - z3;
        float dir = MathUtils.atan2(dx3, dz3);
        check("correndo, o personagem anda para onde a câmera aponta",
                Math.abs(MathUtils.atan2(MathUtils.sin(dir - alvo), MathUtils.cos(dir - alvo))) < 0.1f,
                String.format("andou para %.3f rad (câmera %.3f)", dir, alvo));

        System.out.println("== 4. Correndo com a câmera girando continuamente (como o dedo arrastando) ==");
        Player p4 = new Player();
        p4.spawn(0f, 0f, 0f);
        p4.facing = 0f;
        float camAtual = 0f, erroMax = 0f;
        for (int i = 0; i < 90; i++) {   // 3 s girando a câmera a 2 rad/s, sem joystick
            camAtual += 2f / 30f;
            p4.update(1f / 30f, 0f, 0f, camAtual, false, true, w);
            if (i > 15) erroMax = Math.max(erroMax, Math.abs(MathUtils.atan2(MathUtils.sin(p4.facing - camAtual), MathUtils.cos(p4.facing - camAtual))));
        }
        check("correndo com a câmera girando, o corpo acompanha (erro < 0,3 rad)", erroMax < 0.3f, String.format("erro máx %.3f rad", erroMax));

        System.out.println("== 5. Andando de lado (analógico para a direita, sem correr): anda e não fica girando ==");
        Player p5 = new Player();
        p5.spawn(0f, 0f, 0f);
        p5.facing = 0.5f;
        float x5 = p5.pos.x, z5 = p5.pos.z, f5 = p5.facing;
        simular(p5, w, 1f, 0f, false, 0f, 0f, 2f);
        float dist5 = (float) Math.sqrt((p5.pos.x - x5) * (p5.pos.x - x5) + (p5.pos.z - z5) * (p5.pos.z - z5));
        check("andando de lado, o personagem anda", dist5 > 2f, String.format("andou %.2f m", dist5));
        float corpo5a = p5.facing;
        simular(p5, w, 1f, 0f, false, 0f, 0f, 1f);
        check("andando de lado, o corpo não fica girando", Math.abs(p5.facing - corpo5a) < 0.05f, String.format("corpo %.3f rad (antes %.3f)", p5.facing, corpo5a));
        System.out.println("== 6. Analógico na diagonal, sem correr: anda e não gira ==");
        Player p6 = new Player();
        p6.spawn(0f, 0f, 0f);
        p6.facing = 0f;
        simular(p6, w, 0.7f, -0.7f, false, 0f, 0f, 2f);
        float corpo6a = p6.facing;
        simular(p6, w, 0.7f, -0.7f, false, 0f, 0f, 1f);
        check("diagonal, o corpo não gira sem parar", Math.abs(p6.facing - corpo6a) < 0.05f, String.format("corpo %.3f rad (antes %.3f)", p6.facing, corpo6a));
        System.out.println("\nRESULTADO: " + pass + " ok, " + fail + " falhas");
        System.exit(fail == 0 ? 0 : 1);
    }

    public static void main(String[] args) {
        new HeadlessApplication(new MoveRotTests(), new HeadlessApplicationConfiguration());
    }
}
