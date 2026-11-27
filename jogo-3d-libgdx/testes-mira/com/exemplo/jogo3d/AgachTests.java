package com.exemplo.jogo3d;

import com.badlogic.gdx.ApplicationAdapter;
import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.backends.headless.HeadlessApplication;
import com.badlogic.gdx.backends.headless.HeadlessApplicationConfiguration;
import com.badlogic.gdx.graphics.GL20;
import com.badlogic.gdx.math.Vector3;

import java.lang.reflect.Proxy;

/** Agachar pelo clipe do modelo: desce e segura parado, sobe pelo clipe e levanta na hora ao andar. */
public class AgachTests extends ApplicationAdapter {
    static int pass = 0, fail = 0;

    static void check(String name, boolean ok, String info) {
        System.out.println((ok ? "  OK   " : "  FALHA") + "  " + name + (info.isEmpty() ? "" : "  [" + info + "]"));
        if (ok) pass++; else fail++;
    }

    Character ch;
    Player pl;
    final Vector3 hip = new Vector3();

    float quadril() {
        ch.nodeWorld("Hips", hip);
        return hip.y;
    }

    void passar(float segundos) {
        int n = Math.round(segundos * 60f);
        for (int i = 0; i < n; i++) ch.update(pl, 1f / 60f);
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
        pl.speed = 0f;
        passar(1f);
        float em_pe = quadril();

        System.out.println("== Agachar parado: desce pelo clipe e segura ==");
        ch.setAgachado(true);
        passar(3f);
        float agachado = quadril();
        check("agachado, o quadril desce pelo menos 30 cm", em_pe - agachado > 0.3f,
                String.format("em pé %.2f, agachado %.2f", em_pe, agachado));
        passar(2f);
        check("agachado segura a pose (não volta sozinho)", Math.abs(quadril() - agachado) < 0.02f, String.format("%.3f", quadril()));

        System.out.println("== Levantar parado: sobe pelo clipe, não de repente ==");
        ch.setAgachado(false);
        passar(0.3f);
        check("ao levantar, ainda está baixo no primeiro instante", quadril() < agachado + 0.2f, String.format("%.3f", quadril()));
        passar(3f);
        check("depois de levantar, volta à altura em pé", Math.abs(quadril() - em_pe) < 0.05f, String.format("%.3f (em pé %.3f)", quadril(), em_pe));

        System.out.println("== Andando agachado: levanta na hora, sem o clipe de levantar ==");
        ch.setAgachado(true);
        passar(3f);
        pl.speed = 3f;                         // começou a andar
        ch.update(pl, 1f / 60f);
        passar(0.2f);
        check("andar cancela o agachar na hora (sem animação de levantar)", ch.onceFinished() && quadril() > agachado + 0.2f,
                String.format("quadril %.3f", quadril()));
        pl.speed = 0f;
    }

    public static void main(String[] args) {
        new HeadlessApplication(new AgachTests(), new HeadlessApplicationConfiguration());
    }
}
