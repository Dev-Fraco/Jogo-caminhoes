package com.exemplo.jogo3d;

import java.util.Random;

/** Movimento dos bots da arena de mira: correr constante e veloz, andar mais lento com pausas, parado fixo. */
public class BotMiraTests {
    static int pass = 0, fail = 0;

    static void check(String name, boolean ok, String info) {
        System.out.println((ok ? "  OK   " : "  FALHA") + "  " + name + (info.isEmpty() ? "" : "  [" + info + "]"));
        if (ok) pass++; else fail++;
    }

    public static void main(String[] args) {
        Random r = new Random(3);
        System.out.println("== Bot que corre: velocidade constante e vai e volta ==");
        BotMira corre = new BotMira(BotMira.Tipo.CORRENDO, -35f, 35f, 44f);
        float x0 = corre.x();
        corre.passo(1f, r);
        check("correndo anda a 5,5 m/s", Math.abs((corre.x() - x0) - 5.5f) < 0.01f, String.format("%.3f", corre.x() - x0));
        check("correndo usa a animação de corrida", corre.clipe().equals("Run"), corre.clipe());
        int inverteu = 0;
        float ultimo = corre.x();
        int sinal = 1;
        for (int i = 0; i < 60 * 30; i++) {          // 30 s
            corre.passo(1f / 60f, r);
            if (Math.signum(corre.x() - ultimo) != sinal && Math.abs(corre.x() - ultimo) > 1e-6f) { sinal = -sinal; inverteu++; }
            ultimo = corre.x();
        }
        check("correndo muda de direção nos limites (vai e volta)", inverteu >= 2, "inversões em 30 s: " + inverteu);
        check("correndo nunca sai da faixa", corre.x() >= -35f - 1e-3f && corre.x() <= 35f + 1e-3f, String.format("%.2f", corre.x()));

        System.out.println("== Bot que anda: mais lento, com pausas ==");
        BotMira anda = new BotMira(BotMira.Tipo.ANDANDO, -20f, 20f, 24f);
        float a0 = anda.x();
        anda.passo(1f, r);
        check("andando é mais lento que correndo", Math.abs(anda.x() - a0) < 5.5f && Math.abs(anda.x() - a0) > 1.5f, String.format("%.3f", anda.x() - a0));
        check("andando usa a animação de caminhada", anda.clipe().equals("Walk"), anda.clipe());
        int paradas = 0;
        boolean estava = false;
        for (int i = 0; i < 60 * 60; i++) {         // 60 s
            anda.passo(1f / 60f, r);
            boolean emPausa = anda.clipe().equals("Idle");
            if (emPausa && !estava) paradas++;
            estava = emPausa;
        }
        check("andando faz pausas naturais nos limites", paradas >= 2, "pausas em 60 s: " + paradas);
        check("andando nunca sai da faixa", anda.x() >= -20f - 1e-3f && anda.x() <= 20f + 1e-3f, String.format("%.2f", anda.x()));

        System.out.println("== Bot parado: não anda e encara o jogador ==");
        BotMira par = new BotMira(BotMira.Tipo.PARADO, -2f, 2f, 10f);
        float p0 = par.x();
        for (int i = 0; i < 600; i++) par.passo(1f / 60f, r);
        check("parado não se move", Math.abs(par.x() - p0) < 1e-6f, "");
        check("parado usa a animação de espera", par.clipe().equals("Idle"), par.clipe());
        float ang = par.passo(0f, r);
        check("parado olha para o jogador (origem)", Math.abs(MathUtils_wrap(ang - (float) Math.atan2(0f - par.x(), 0f - par.z))) < 1e-4f, "");

        System.out.println("== Morte e volta ==");
        corre.reinicia();
        check("reinicia na ponta da faixa", Math.abs(corre.x() - (-35f)) < 1e-6f, String.format("%.2f", corre.x()));
        check("respawn em 2,5 s", BotMira.RESPAWN_SEG == 2.5f, "");

        System.out.println("\nRESULTADO: " + pass + " ok, " + fail + " falhas");
        System.exit(fail == 0 ? 0 : 1);
    }

    static float MathUtils_wrap(float a) {
        while (a > Math.PI) a -= 2 * Math.PI;
        while (a < -Math.PI) a += 2 * Math.PI;
        return a;
    }
}
