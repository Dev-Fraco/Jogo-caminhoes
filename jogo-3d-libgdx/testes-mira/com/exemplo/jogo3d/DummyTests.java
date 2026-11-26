package com.exemplo.jogo3d;

import com.badlogic.gdx.ApplicationAdapter;
import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.backends.headless.HeadlessApplication;
import com.badlogic.gdx.backends.headless.HeadlessApplicationConfiguration;
import com.badlogic.gdx.graphics.GL20;
import com.badlogic.gdx.graphics.g3d.Model;
import com.badlogic.gdx.math.Vector3;

import java.lang.reflect.Proxy;

/** Boneco de treino (Mannequin): sem esqueleto, parado, com cápsulas fixas por região do corpo. */
public class DummyTests extends ApplicationAdapter {
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

    /** Raio de frente para o boneco (de -Z para +Z, como o tiro do jogador): região acertada. */
    static long frame = 7L;   // a hitbox recalcula só quando o quadro muda

    static WeaponConfig.Region shoot(Enemy e, float x, float y) {
        Hitbox.Hit h = new Hitbox.Hit();
        e.hitbox.update(++frame);
        boolean got = e.hitbox.raycast(new Vector3(x, y, -3f), new Vector3(0f, 0f, 1f), h);
        return got ? h.region : null;
    }

    void run() {
        Model m = ModelIO.load("models/mannequin.g3dj");
        World wt = new World(true);
        wt.create();
        Enemies en = new Enemies(wt, null, null, m);
        en.spawnDummies(wt);
        Enemy e = en.list.get(0);
        e.pos.set(0f, 0f, 0f);
        e.facing = 0f;
        e.pose(0f);   // põe o modelo no lugar (sem animação)
        check("boneco de treino não tem esqueleto nem animação", e.dummy && e.hitbox != null, "");
        check("cabeça", shoot(e, 0f, 1.76f) == WeaponConfig.Region.HEAD, "");
        check("peito", shoot(e, 0f, 1.30f) == WeaponConfig.Region.TORSO, "");
        check("braço", shoot(e, 0.32f, 1.00f) == WeaponConfig.Region.ARM, "");
        check("perna", shoot(e, 0.10f, 0.30f) == WeaponConfig.Region.LEG, "");
        check("tiro longe do corpo não acerta", shoot(e, 1.5f, 1.3f) == null, "");
        e.pos.set(2f, 0f, 1f);
        e.pose(0f);
        check("boneco anda junto com a posição (acerta no lugar novo)", shoot(e, 2f, 1.30f) == WeaponConfig.Region.TORSO
                && shoot(e, 0f, 1.30f) == null, "");
    }

    public static void main(String[] args) {
        new HeadlessApplication(new DummyTests(), new HeadlessApplicationConfiguration());
    }
}
