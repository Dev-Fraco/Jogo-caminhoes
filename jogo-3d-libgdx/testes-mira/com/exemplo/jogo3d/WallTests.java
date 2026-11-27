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
        System.out.println("== Arena: o jogador consegue pôr parede ==");
        World arenaW = new World(false, true);
        arenaW.create();
        String avisoArena = arenaW.placeWall(0f, 0f, 0f);
        check("na arena a parede é posta (sem aviso de muro não carregado)", avisoArena == null && arenaW.walls.size == 1, "aviso " + avisoArena);

        arenaW.limpaParedes();
        check("começo de round tira as paredes do round anterior", arenaW.walls.size == 0, "muros " + arenaW.walls.size);

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

        // Aparece de uma vez, sem animação: já está na base do terreno
        float y0 = wall.mi.transform.getTranslation(new Vector3()).y;
        check("aparece de uma vez, sem subir do chão", Math.abs(y0 - wall.groundY) < 1e-4f, String.format("y %.3f, chão %.3f", y0, wall.groundY));

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

        // Sem restrição: pode pôr muro em cima de outro
        String overlap = tryPlace(w, px, pz);
        check("pode pôr muro em cima de outro (sem restrição)", overlap == null, overlap == null ? "" : overlap);

        // Sem encaixe automático: o muro vai exatamente onde foi pedido
        World.WallSpot sp = new World.WallSpot();
        String msgEnc = w.wallSpot(wall.x + 4.4f, wall.z, 0f, 0.55f, sp);
        check("muro ao lado cabe em qualquer lugar", msgEnc == null, msgEnc == null ? "" : msgEnc);
        check("sem encaixe: fica onde foi pedido (4,4 m)", Math.abs(sp.x - (wall.x + 4.4f)) < 0.01f && Math.abs(sp.z - wall.z) < 0.01f,
                String.format("dx %.2f dz %.2f", sp.x - wall.x, sp.z - wall.z));
        int wallsBefore = w.walls.size;
        if (msgEnc == null) w.placeWallSpot(sp);
        check("o segundo muro entra no mundo", msgEnc == null && w.walls.size == wallsBefore + 1, "" + w.walls.size);
        // Sombra: em cima de outro muro também cabe (sem vermelho)
        String msgInside = w.wallSpot(px, pz, 0f, 0f, sp);
        check("sombra: em cima de outro muro também cabe", msgInside == null, msgInside == null ? "" : msgInside);

        // Tiro: o muro aguenta 400 de dano e quebra ao chegar a zero (rachaduras aparecem a cada impacto)
        int nBefore = w.walls.size;
        StoneWall alvo = w.walls.get(0);
        World.Obstacle pedra = alvo.cols.get(0);
        com.badlogic.gdx.math.Vector3 de = new com.badlogic.gdx.math.Vector3(alvo.x, 1f, alvo.z + 6f);
        w.damageObstacle(pedra, 200f, new com.badlogic.gdx.math.Vector3(pedra.x, 1f, pedra.z), de);
        check("muro aguenta 200 de dano", w.walls.size == nBefore && alvo.hp == 200f, "vida " + alvo.hp);
        check("cada impacto racha o muro", alvo.rachas.size == 1, "rachaduras " + alvo.rachas.size);
        float alturaTiro = pedra.baseY + 1f;   // a parede pode estar num morro: o tiro é na altura dela
        com.badlogic.gdx.math.Vector3 ca = new com.badlogic.gdx.math.Vector3(pedra.x, alturaTiro, pedra.z + 3f), cb = new com.badlogic.gdx.math.Vector3(pedra.x, alturaTiro, pedra.z - 3f);
        World.Obstacle barrou = w.muroNaLinha(ca, cb, null);
        check("tiro que atravessa a parede é barrado pela própria parede", barrou != null && alvo.cols.contains(barrou, true), "");
        check("tiro longe da parede passa livre", w.muroNaLinha(new com.badlogic.gdx.math.Vector3(pedra.x + 30f, 1f, pedra.z + 3f), new com.badlogic.gdx.math.Vector3(pedra.x + 30f, 1f, pedra.z - 3f), null) == null, "");
        w.damageObstacle(pedra, 200f);
        check("muro quebra com 400 de dano", w.walls.size == nBefore - 1 && w.walls.indexOf(alvo, true) < 0, "muros " + w.walls.size);
        check("muro quebrado sai da colisão", w.obstacles.indexOf(pedra, true) < 0, "");

        // Sem limite de quantidade: quatro muros um dentro do outro
        int before4 = w.walls.size;
        for (int k = 0; k < 4; k++) tryPlace(w, px, pz);
        check("quatro muros no mesmo lugar, um dentro do outro", w.walls.size == before4 + 4, "" + w.walls.size);

        System.out.println("  (info) muros no mundo: " + w.walls.size + "; colisões por muro: " + w.walls.get(0).cols.size);
    }

    public static void main(String[] args) {
        HeadlessApplicationConfiguration cfg = new HeadlessApplicationConfiguration();
        new HeadlessApplication(new WallTests(), cfg);
    }
}
