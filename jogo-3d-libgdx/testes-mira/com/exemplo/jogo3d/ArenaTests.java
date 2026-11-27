package com.exemplo.jogo3d;

import com.badlogic.gdx.ApplicationAdapter;
import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.backends.headless.HeadlessApplication;
import com.badlogic.gdx.backends.headless.HeadlessApplicationConfiguration;
import com.badlogic.gdx.graphics.GL20;

import java.lang.reflect.Proxy;

/** Arena livre: chão plano, muro contínuo que impede sair, movimento limitado ao retângulo; treino intacto. */
public class ArenaTests extends ApplicationAdapter {
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

    void run() {
        System.out.println("== Arena: mundo criado, chão plano e tamanho ==");
        World w = new World(false, true);
        w.create();
        check("arena é criada sem erro", w.arena && !w.training, "");
        check("chão plano (altura 0 em vários pontos)", w.heightAt(0f, 0f) == 0f && w.heightAt(20f, -12f) == 0f && w.groundAt(-25f, 15f) == 0f, "");
        check("2x a área do galpão (2400 m² contra 1200)", (2 * World.ARENA_HW) * (2 * World.ARENA_HD) == 2 * (2 * World.SHED_HW) * (2 * World.SHED_HD), "");
        check("muro de 4 m", World.ARENA_H == 4f, "");

        System.out.println("== Muro: o jogador não sai da arena ==");
        Player p = new Player();
        p.spawn(0f, 0f, 0f);
        p.facing = 0f;
        for (int i = 0; i < 600; i++) p.update(1f / 30f, 0f, 1f, 0f, false, true, w);   // corre para +z (fundo)
        check("correndo para o muro, o jogador para antes do muro", p.pos.z <= World.ARENA_HD - 0.5f, String.format("z=%.2f", p.pos.z));
        Player q = new Player();
        q.spawn(0f, 0f, 0f);
        q.facing = (float) Math.PI / 2f;
        for (int i = 0; i < 600; i++) q.update(1f / 30f, 0f, 1f, (float) Math.PI / 2f, false, true, w);   // corre para +x
        check("correndo para a lateral, também para antes do muro", q.pos.x <= World.ARENA_HW - 0.5f, String.format("x=%.2f", q.pos.x));
        Player c = new Player();
        c.spawn(0f, 0f, 0f);
        for (int i = 0; i < 900; i++) c.update(1f / 30f, 1f, 1f, (float) Math.PI / 4f, false, true, w);   // diagonal no canto
        check("no canto, fica dentro do retângulo", c.pos.x <= World.ARENA_HW && c.pos.z <= World.ARENA_HD, String.format("x=%.2f z=%.2f", c.pos.x, c.pos.z));

        System.out.println("== Arena sem caixas nem containers ==");
        check("a arena não tem peças de cobertura", w.coberturaArena.isEmpty(), "peças " + w.coberturaArena.size());
        check("nascimento livre: nada ocupa o centro", !w.arenaOcupado(0f, 0f, 1.2f), "");

        System.out.println("== Treino e battle royale não mudam ==");
        World tr = new World(true);
        tr.create();
        check("treino continua sem arena", !tr.arena && tr.training, "");
        World br = new World(false);
        check("battle royale continua sem arena", !br.arena && !br.training, "");
    }

    public static void main(String[] args) {
        new HeadlessApplication(new ArenaTests(), new HeadlessApplicationConfiguration());
    }
}
