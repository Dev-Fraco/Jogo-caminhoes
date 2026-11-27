package com.exemplo.jogo3d;

import com.badlogic.gdx.ApplicationAdapter;
import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.backends.headless.HeadlessApplication;
import com.badlogic.gdx.backends.headless.HeadlessApplicationConfiguration;
import com.badlogic.gdx.graphics.GL20;

import java.lang.reflect.Proxy;

/** Roda de emotes do lobby: cada emote toca duas vezes, volta ao Idle, é interrompido por outro e espaços vazios não tocam. */
public class EmoteTests extends ApplicationAdapter {
    static int pass = 0, fail = 0;

    static void check(String name, boolean ok, String info) {
        System.out.println((ok ? "  OK   " : "  FALHA") + "  " + name + (info.isEmpty() ? "" : "  [" + info + "]"));
        if (ok) pass++; else fail++;
    }

    Character ch;
    Player pl;
    Emotes em;

    /** Avança o tempo (1/60 s) com a roda e o personagem, como o lobby faz a cada quadro. */
    void passar(float segundos) {
        int n = Math.round(segundos * 60f);
        for (int i = 0; i < n; i++) {
            em.update(ch, 1f / 60f);
            ch.update(pl, 1f / 60f);
        }
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
        em = new Emotes();
        passar(0.5f);

        System.out.println("== Os emotes existem no personagem ==");
        check("Saudação (ByeBye) está no modelo", ch.temClipe("Emote_ByeBye"), "");
        check("Dança (MichaelJackson) está no modelo", ch.temClipe("Emote_MichaelJackson"), "");

        System.out.println("== Espaço sem arquivo não faz nada ==");
        em.executar(4, ch);   // Flexão: sem arquivo
        check("Flexão (sem arquivo) não inicia emote", !em.emoteAtivo(), "");

        System.out.println("== Emote toca duas vezes e volta ao Idle ==");
        em.executar(6, ch);   // Saudação: ByeBye (4,75 s)
        check("Saudação inicia", em.emoteAtivo(), "");
        passar(5.0f);         // passou de uma vez
        check("depois da 1ª vez ainda está em execução (2ª vez)", em.emoteAtivo(), "");
        passar(5.0f);         // passou da 2ª vez
        check("depois da 2ª vez termina", !em.emoteAtivo(), "");
        check("volta ao Idle (sem clipe único ativo)", ch.onceFinished(), "");

        System.out.println("== Outro emote interrompe o atual ==");
        em.executar(6, ch);
        passar(1f);
        em.executar(0, ch);   // Dança: interrompe a saudação
        check("a dança começa e está ativa", em.emoteAtivo(), "");
        passar(19.5f);        // dura 2 × 18,9 s: ainda não acabou
        check("a dança (2 vezes) ainda está tocando depois de 19,5 s", em.emoteAtivo(), "");
        passar(19.5f);
        check("a dança termina depois das duas vezes", !em.emoteAtivo(), "");

        System.out.println("== Roda: o toque cai no espaço certo (topo = Dança, horário) ==");
        int W = 1280, H = 720;
        float raio = Math.min(W, H) * 0.46f * 0.85f;   // roda fechada (abertura 0)
        check("topo é o espaço 0 (Dança)", em.espacoEm(W / 2f, H / 2f + raio * 0.8f, W, H) == 0, "");
        check("direita-topo é o espaço 1 (Provocação)", em.espacoEm(W / 2f + raio * 0.6f, H / 2f + raio * 0.6f, W, H) == 1, "");
        check("direita é o espaço 2 (Vitória)", em.espacoEm(W / 2f + raio * 0.8f, H / 2f, W, H) == 2, "");
        check("embaixo é o espaço 4 (Flexão)", em.espacoEm(W / 2f, H / 2f - raio * 0.8f, W, H) == 4, "");
        check("fora da roda é -2", em.espacoEm(W / 2f + raio * 1.5f, H / 2f, W, H) == -2, "");
        check("centro é -1", em.espacoEm(W / 2f, H / 2f, W, H) == -1, "");
    }

    public static void main(String[] args) {
        new HeadlessApplication(new EmoteTests(), new HeadlessApplicationConfiguration());
    }
}
