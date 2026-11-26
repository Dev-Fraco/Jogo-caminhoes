package com.exemplo.jogo3d;

import com.badlogic.gdx.ApplicationAdapter;
import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.backends.headless.HeadlessApplication;
import com.badlogic.gdx.backends.headless.HeadlessApplicationConfiguration;
import com.badlogic.gdx.graphics.GL20;
import com.badlogic.gdx.math.MathUtils;
import com.badlogic.gdx.math.Vector3;

import java.lang.reflect.Proxy;

/** Muro de pedra e taipa (botão PAREDE): sai do chão, bloqueia tiro e passagem, e protege quem está dentro do U. */
public class WallTests extends ApplicationAdapter {
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

    /** Põe um muro com a frente virada para +z (yaw 0) num ponto do mapa que aceite. */
    static String tryPlace(World w, float x, float z) {
        return w.placeWall(x, z, 0f);
    }

    void run() {
        MathUtils.random.setSeed(5);
        World w = new World();
        w.create();

        // Acha dois lugares livres e planos (ou mais, se precisar)
        float[] first = null;
        String lastMsg = null;
        for (int t = 0; t < 40 * 40 && first == null; t++) {
            float x = -390f + (t % 40) * 20f, z = -390f + (t / 40) * 20f;
            String msg = tryPlace(w, x, z);
            if (msg == null) first = new float[]{x, z};
            else lastMsg = msg;
        }
        check("acha um lugar livre para o muro", first != null, first == null ? "último aviso: " + lastMsg : "");
        if (first == null) return;
        StoneWall wall = w.walls.get(0);
        check("o muro entra na lista do mundo", w.walls.size == 1, "" + w.walls.size);

        // Surgindo do chão: começa abaixo, sobe e para na altura certa
        wall.update(0f);
        float y0 = wall.mi.transform.getTranslation(new Vector3()).y;
        check("sai de baixo do chão", y0 < wall.groundY - 1.5f, String.format("y %.2f, chão %.2f", y0, wall.groundY));
        wall.update(0.7f);
        float ym = wall.mi.transform.getTranslation(new Vector3()).y;
        check("sobe no meio do caminho", ym > y0 + 0.5f && ym < wall.groundY, String.format("y %.2f", ym));
        for (int i = 0; i < 30; i++) wall.update(0.1f);
        float y1 = wall.mi.transform.getTranslation(new Vector3()).y;
        check("termina na base do terreno e para", wall.risen() && Math.abs(y1 - wall.groundY) < 1e-3f, String.format("y %.3f", y1));

        // Pegada: o chão sob o muro não varia tanto (o lado alto fica enterrado)
        float px = first[0], pz = first[1];
        float ground = wall.groundY;
        // Jogador dentro do U: raios em volta do ponto onde ele está
        Vector3 eye = new Vector3(px, ground + 1.0f, pz);
        Vector3 f = new Vector3(0f, 0f, 1f);
        float front = w.raycast(eye, new Vector3(f), 3f);
        float rear = w.raycast(eye, new Vector3(f).scl(-1f), 3f);
        float side = w.raycast(eye, new Vector3(1f, 0f, 0f), 3f);
        float side2 = w.raycast(eye, new Vector3(-1f, 0f, 0f), 3f);
        check("dentro do U: a curva fica à frente, a menos de 1 m", front < 1.0f, String.format("%.2f m", front));
        check("dentro do U: as laterais são as paredes", side < 2.5f && side2 < 2.5f, String.format("%.2f / %.2f m", side, side2));
        check("dentro do U: a boca fica livre atrás do jogador", rear >= 2.99f, String.format("%.2f m", rear));

        // Tiro de fora, pela frente, na direção do jogador: a curva para a bala
        Vector3 shooter = new Vector3(px, ground + 1.4f, pz + 4f);
        float shot = w.raycast(shooter, new Vector3(0f, 0f, -1f), 10f);
        check("bala de fora da curva para na parede", shot < 3.5f, String.format("parou a %.2f m", shot));
        Vector3 back = new Vector3(px, ground + 1.4f, pz - 4f);
        float fromRear = w.raycast(back, new Vector3(0f, 0f, 1f), 10f);
        check("tiro pela boca do U chega ao jogador", fromRear > 3.5f, String.format("%.2f m", fromRear));

        // Passagem: quem vem de fora não atravessa a curva, e o jogador dentro não é empurrado para fora
        Vector3 inside = new Vector3(px, ground, pz);
        Vector3 before = new Vector3(inside);
        for (int i = 0; i < 5; i++) w.resolveCollisions(inside, 0.35f);
        check("o jogador fica dentro do U sem ser empurrado", inside.dst(before) < 0.05f, String.format("andou %.3f m", inside.dst(before)));

        Vector3 q = new Vector3(px, ground, pz + 4f);
        for (int i = 0; i < 200; i++) { q.z -= 0.05f; w.resolveCollisions(q, 0.35f); }
        check("não atravessa a curva por fora", q.z - pz > 0.7f, String.format("parou a %.2f m da origem", q.z - pz));

        // Pela lateral o U tem braços, não parede fechada: quem contorna por fora não entra no miolo
        Vector3 s = new Vector3(px + 4f, ground, pz);
        float closest = 99f;
        for (int i = 0; i < 200; i++) {
            s.x -= 0.05f;
            w.resolveCollisions(s, 0.35f);
            closest = Math.min(closest, (float) Math.hypot(s.x - px, s.z - pz));
        }
        check("pela lateral não entra no miolo do U", closest > 1.1f, String.format("chegou a %.2f m do centro", closest));

        // Pela boca (atrás do jogador) dá para entrar e ficar dentro
        Vector3 m = new Vector3(px, ground, pz - 4f);
        for (int i = 0; i < 200; i++) {
            m.z += 0.05f;
            w.resolveCollisions(m, 0.35f);
        }
        check("pela boca do U o jogador entra no miolo", Math.hypot(m.x - px, m.z - pz) < 0.8f, String.format("ficou a %.2f m do centro", Math.hypot(m.x - px, m.z - pz)));

        // Sem espaço: nada de muro em cima de outro
        String overlap = tryPlace(w, px, pz);
        check("não põe muro em cima de outro", overlap != null, overlap == null ? "" : overlap);

        // Limite: o mais antigo sai quando passa de MAX_WALLS
        int placed = 1;
        for (int t = 0; t < 40 * 40 && placed < World.MAX_WALLS + 2; t++) {
            float x = -390f + (t % 40) * 20f, z = -390f + (t / 40) * 20f;
            if (tryPlace(w, x, z) == null) placed++;
        }
        check("guarda no máximo " + World.MAX_WALLS + " muros", w.walls.size == World.MAX_WALLS, "" + w.walls.size);
        check("o primeiro (mais antigo) saiu", w.walls.indexOf(wall, true) < 0, "");

        System.out.println("  (info) muros no mundo: " + w.walls.size + "; colisões por muro: " + w.walls.get(0).cols.size);
    }

    public static void main(String[] args) {
        HeadlessApplicationConfiguration cfg = new HeadlessApplicationConfiguration();
        new HeadlessApplication(new WallTests(), cfg);
    }
}
