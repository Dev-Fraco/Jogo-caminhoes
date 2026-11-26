package com.exemplo.jogo3d;
import com.badlogic.gdx.*;
import com.badlogic.gdx.backends.headless.*;
import com.badlogic.gdx.graphics.GL20;
import com.badlogic.gdx.graphics.PerspectiveCamera;
import com.badlogic.gdx.graphics.g3d.Model;
import com.badlogic.gdx.graphics.g3d.loader.G3dModelLoader;
import com.badlogic.gdx.math.Vector3;
import com.badlogic.gdx.utils.JsonReader;
import java.lang.reflect.Proxy;
public class AiSoak extends ApplicationAdapter {
  public void create() {
    Gdx.gl = Gdx.gl20 = (GL20) Proxy.newProxyInstance(GL20.class.getClassLoader(), new Class[]{GL20.class}, (p, m, a) -> { Class<?> t = m.getReturnType(); if (t == int.class) return 1; if (t == boolean.class) return true; if (t == float.class) return 0f; if (t == String.class) return ""; return null; });
    com.badlogic.gdx.math.MathUtils.random.setSeed(1915);
    World w = new World(); w.create();
    Model jake = new G3dModelLoader(new JsonReader()).loadModel(Gdx.files.internal("models/jake/jake.g3dj"));
    Weapons wp = new Weapons();
    Enemies en = new Enemies(w, jake, wp.models());
    en.release();
    Survival sv = new Survival();
    PerspectiveCamera cam = new PerspectiveCamera(67, 1920, 1080);
    // jogador parado perto de um inimigo
    Enemy first = en.list.get(0);
    Vector3 player = new Vector3(first.pos.x + 20f, 0f, first.pos.z);
    player.y = w.groundAt(player.x, player.z);
    cam.position.set(player).add(0, 2, -3); cam.update();
    int shots = 0, combat = 0; float minHp = 100;
    long t0 = System.nanoTime();
    for (int f = 0; f < 30 * 180; f++) {
      en.update(1f/30f, w, player, sv, 0f, 0, cam, 90f);
      sv.update(1f/30f, false);
      shots += en.shots.size;
      for (Enemy e : en.list) { if (e.state == Enemy.State.COMBAT) combat++; if (Float.isNaN(e.pos.x)) throw new RuntimeException("NaN"); }
      minHp = Math.min(minHp, sv.health);
      if (sv.dead) { System.out.println("jogador morreu no quadro " + f + " (" + f/30 + " s) depois de " + shots + " tiros inimigos"); sv.reset(); }
      if (f % 300 == 0) en.alert(player, 70f);   // o jogador atira de vez em quando
      if (f % 900 == 0) { // de tempos em tempos mata alguém, testa onda nova
        for (Enemy e : en.list) if (e.alive()) { e.damage(500, player); break; }
      }
    }
    double ms = (System.nanoTime() - t0) / 1e6 / (30 * 180);
    System.out.printf("3 min simulados: %d tiros inimigos, %d quadros-inimigo em combate, vivos agora %d, %.2f ms por quadro (10 inimigos, PC)%n", shots, combat, en.alive(), ms);
    // Bots entre si: jogador longe e morto de vista; eles precisam se encontrar e lutar
    sv.reset();
    Enemies e2 = new Enemies(w, jake, wp.models());
    e2.release();
    Vector3 far = new Vector3(-170f, 0f, -170f);
    int total = e2.list.size, botShots = 0, ever = 0;
    int engaged = 0;
    for (int f = 0; f < 30 * 240; f++) {
      e2.update(1f/30f, w, far, sv, 0f, 0, cam, 90f);
      botShots += e2.shots.size;
      if (f == 30 * 60) for (Enemy e : e2.list) if (e.targetEnemy != null) engaged++;
      // nenhum bot pode ter o jogador como alvo (ele está a centenas de metros)
      for (Enemy e : e2.list) if (e.targetPlayer) throw new RuntimeException("bot perseguindo jogador distante");
    }
    int botKills = 0; for (Enemy e : e2.list) botKills += e.botKills;
    System.out.println("bots entre si (4 min): " + botShots + " tiros, " + botKills + " abates entre bots, vivos " + e2.alive() + ", mirando outro bot no 1º min: " + engaged);
    System.exit(botKills > 0 ? 0 : 3);
  }
  public static void main(String[] a) { new HeadlessApplication(new AiSoak(), new HeadlessApplicationConfiguration()); }
}
