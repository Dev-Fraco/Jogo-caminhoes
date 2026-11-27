package com.exemplo.jogo3d;

import com.badlogic.gdx.ApplicationAdapter;
import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.backends.headless.HeadlessApplication;
import com.badlogic.gdx.backends.headless.HeadlessApplicationConfiguration;
import com.badlogic.gdx.graphics.GL20;

import java.lang.reflect.Proxy;

/** Cada personagem carrega, tem as animações do Jake e troca de modelo sem sobrar instância. */
public class PersonagensTests extends ApplicationAdapter {
    private static int ok = 0, falhas = 0;

    static void check(String nome, boolean cond, String info) {
        if (cond) { ok++; System.out.println("  OK     " + nome + (info.isEmpty() ? "" : "  [" + info + "]")); }
        else { falhas++; System.out.println("  FALHA  " + nome + "  [" + info + "]"); }
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
            falhas++;
        }
        System.out.println("\nRESULTADO: " + ok + " ok, " + falhas + " falhas");
        System.exit(falhas == 0 ? 0 : 1);
    }

    private void run() {
        System.out.println("== Personagens ==");
        Character c = new Character();
        c.create();
        String[] anims = {"Idle", "Walk", "Run", "Jump", "LieDown", "Mirar", "GetUp", "Dying", "IdleKneel", "StandToSit"};
        for (int i = 0; i < Personagens.NOMES.length; i++) {
            Personagens.escolher(i);
            c.trocarModelo();
            StringBuilder falta = new StringBuilder();
            for (String a : anims) if (c.model().getAnimation(a) == null) falta.append(a).append(' ');
            boolean nos = c.instance().getNode("Hips") != null && c.instance().getNode("RightUpperArm") != null;
            check(Personagens.NOMES[i] + " tem as animações e os ossos", falta.length() == 0 && nos, "falta: [" + falta.toString().trim() + "]");
            check(Personagens.NOMES[i] + ": uma instância na cena após a troca", c.instances.size == 1, "" + c.instances.size);
        }
        Personagens.escolher(Personagens.PADRAO);
        check("a personagem padrão é a funcionária", Personagens.atual() == Personagens.PADRAO, Personagens.NOMES[Personagens.atual()]);
        System.out.println("\n" + (falhas == 0 ? "Todos os testes de personagens passaram." : "Há falhas."));
    }

    public static void main(String[] args) {
        new HeadlessApplication(new PersonagensTests(), new HeadlessApplicationConfiguration());
    }
}
