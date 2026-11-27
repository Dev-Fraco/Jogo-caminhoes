package com.exemplo.jogo3d;

import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.graphics.GL20;
import com.badlogic.gdx.graphics.Texture;
import com.badlogic.gdx.graphics.g2d.BitmapFont;
import com.badlogic.gdx.graphics.g2d.GlyphLayout;
import com.badlogic.gdx.graphics.g2d.SpriteBatch;
import com.badlogic.gdx.graphics.g2d.TextureRegion;
import com.badlogic.gdx.graphics.glutils.ShapeRenderer;
import com.badlogic.gdx.math.Matrix4;

import java.util.HashMap;
import java.util.Map;

/**
 * Lobby do SEM LIMITES – BATTLE ROYALE (fundo preto). Layout da tela de referência, em coordenadas
 * proporcionais (cabe em qualquer celular), com os ícones da folha enviada. Todos os botões agem:
 * jogar, treinamento, configurações, armas (arsenal: a arma escolhida entra na partida), e painéis
 * com personagem, inventário, loja (moedas e diamantes), eventos, passe, recompensas, amigos, mensagens e chat.
 */
final class Lobby {
    enum Act { NONE, BATTLE, TRAINING, SETTINGS }

    // Tela de referência (px) e a escala uniforme para a tela atual
    private static final float RW = 1672f, RH = 941f;
    private static final String[] ICONS = {"armas", "personagem", "inventario", "loja", "config", "evento", "passe",
            "recompensas", "eventos", "treino", "jogar", "amigos", "mensagens", "moedas", "diamantes", "fechar"};
    private static final float[] GOLD = {0.98f, 0.78f, 0.25f, 1f}, WHITE = {1f, 0.96f, 0.88f, 1f},
            DARK = {0.08f, 0.06f, 0.05f, 0.92f}, BROWN = {0.22f, 0.14f, 0.08f, 1f}, RED = {0.9f, 0.15f, 0.15f, 1f},
            INK = {0.10f, 0.06f, 0.02f, 1f}, MUTED = {0.8f, 0.75f, 0.65f, 1f};

    // Áreas tocáveis (ref): id, x, y, w, h
    private static final Object[][] HIT = {
            {"perfil", 338f, 14f, 382f, 76f}, {"moedas+", 1106f, 28f, 30f, 30f}, {"diamantes+", 1346f, 28f, 30f, 30f},
            {"amigos", 1418f, 14f, 62f, 62f}, {"mensagens", 1500f, 14f, 62f, 62f}, {"config", 1585f, 14f, 62f, 62f},
            {"armas", 15f, 185f, 290f, 66f}, {"personagem", 15f, 280f, 290f, 66f}, {"inventario", 15f, 370f, 290f, 66f},
            {"loja", 15f, 462f, 290f, 66f}, {"configuracoes", 15f, 555f, 290f, 66f},
            {"evento", 1255f, 130f, 400f, 135f}, {"passe", 1270f, 285f, 380f, 85f}, {"recompensas", 1335f, 395f, 315f, 70f},
            {"eventos", 1335f, 480f, 315f, 72f}, {"treino", 1245f, 628f, 390f, 78f}, {"jogar", 1130f, 722f, 520f, 176f},
            {"chat", 15f, 850f, 890f, 68f}};
    // Painel aberto: fechar (X) e o botão de resgate das recompensas
    private static final float[] CLOSE = {1280f, 160f, 52f, 52f}, CLAIM = {1100f, 600f, 240f, 60f};

    private final Map<String, Texture> tex = new HashMap<>();
    private final Arsenal arsenal = new Arsenal();
    private boolean arsenalOpen = false;
    private int weaponChoice = -1;          // arma escolhida no arsenal: entra na próxima partida
    private String panel = null;            // painel de informação aberto (null = nenhum)
    private String toast = null;            // aviso curto
    private float toastT;
    private final float passe = 0.6f;

    private float s, ox, oy;                // escala e deslocamento (px da tela por px da referência)
    private int screenW, screenH;
    private final GlyphLayout layout = new GlyphLayout();

    /** Arma escolhida no arsenal (-1 = nenhuma). */
    int weaponChoice() { return weaponChoice; }

    boolean arsenalOpen() { return arsenalOpen; }

    private float[] rect(String id) {
        for (Object[] h : HIT) if (h[0].equals(id)) return new float[]{(Float) h[1], (Float) h[2], (Float) h[3], (Float) h[4]};
        return null;
    }

    private static boolean in(float[] r, float x, float y) { return x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3]; }

    /** Toque na tela (coordenadas com origem embaixo). */
    Act press(float x, float yb, int W, int H) {
        scale(W, H);
        float rx = (x - ox) / s, ry = RH - (yb - oy) / s;   // de volta à referência (origem em cima)
        if (arsenalOpen) {
            Arsenal.Act a = arsenal.press(x, yb);
            if (a == Arsenal.Act.CLOSE) arsenalOpen = false;
            else if (a == Arsenal.Act.EQUIP) {
                weaponChoice = arsenal.sel;
                arsenalOpen = false;
                toast("Arma escolhida: " + Weapons.NAMES[weaponChoice] + " (entra na partida)");
            }
            return Act.NONE;
        }
        if (panel != null) {
            if (in(CLOSE, rx, ry)) panel = null;
            else if ("Recompensas".equals(panel) && Progresso.recompensaDisponivel() && in(CLAIM, rx, ry)) {
                if (Progresso.resgataRecompensa()) toast("+" + Progresso.MOEDAS_DIARIA + " moedas");
            } else if ("Loja".equals(panel) && (in(rect("moedas+"), rx, ry) || in(rect("diamantes+"), rx, ry))) {
                toast("Pacotes em breve");
            } else if ("Personagem".equals(panel)) {
                for (int i = 0; i < Personagens.NOMES.length; i++) {
                    if (in(usarRect(i), rx, ry) && Personagens.atual() != i) {
                        Personagens.escolher(i);
                        toast(Personagens.NOMES[i] + " é a personagem principal (entra na próxima partida)");
                    }
                }
            }
            return Act.NONE;
        }
        float[] r;
        if ((r = rect("armas")) != null && in(r, rx, ry)) { arsenal.open(weaponChoice); arsenalOpen = true; return Act.NONE; }
        if (in(rect("jogar"), rx, ry)) return Act.BATTLE;
        if (in(rect("treino"), rx, ry)) return Act.TRAINING;
        if (in(rect("config"), rx, ry) || in(rect("configuracoes"), rx, ry)) return Act.SETTINGS;
        String[][] panels = {{"perfil", "Personagem"}, {"personagem", "Personagem"}, {"inventario", "Inventário"},
                {"loja", "Loja"}, {"moedas+", "Loja"}, {"diamantes+", "Loja"}, {"evento", "Evento especial"},
                {"passe", "Passe de batalha"}, {"recompensas", "Recompensas"}, {"eventos", "Eventos"},
                {"amigos", "Amigos"}, {"mensagens", "Mensagens"}, {"chat", "Chat"}};
        for (String[] p : panels) if (in(rect(p[0]), rx, ry)) { panel = p[1]; return Act.NONE; }
        return Act.NONE;
    }

    /** Arrastar na grade do arsenal (lobby). */
    void drag(float yb) { if (arsenalOpen) arsenal.drag(yb); }

    void release() { if (arsenalOpen) arsenal.release(); }

    private void toast(String t) { toast = t; toastT = 2.2f; }

    private void scale(int W, int H) {
        screenW = W;
        screenH = H;
        s = Math.min(W / RW, H / RH);
        ox = (W - RW * s) / 2f;
        oy = (H - RH * s) / 2f;
    }

    private Texture icon(String name) {
        Texture t = tex.get(name);
        if (t == null) {
            t = new Texture(Gdx.files.internal("hud2/lobby/" + name + ".png"));
            t.setFilter(Texture.TextureFilter.Linear, Texture.TextureFilter.Linear);
            tex.put(name, t);
        }
        return t;
    }

    // ---------- desenho ----------

    /** Desenha o lobby inteiro (e o arsenal ou painel, se abertos) em tela cheia. */
    void draw(SpriteBatch batch, ShapeRenderer shapes, BitmapFont font, Weapons weapons, Matrix4 proj, int W, int H, float dt) {
        scale(W, H);
        Gdx.gl.glClearColor(0f, 0f, 0f, 1f);
        Gdx.gl.glClear(GL20.GL_COLOR_BUFFER_BIT | GL20.GL_DEPTH_BUFFER_BIT);
        Gdx.gl.glEnable(GL20.GL_BLEND);
        Gdx.gl.glBlendFunc(GL20.GL_SRC_ALPHA, GL20.GL_ONE_MINUS_SRC_ALPHA);
        if (toastT > 0f) toastT -= dt;
        drawMain(batch, shapes, font, proj);
        if (panel != null) drawPanel(batch, shapes, font, proj);
        if (toastT > 0f && toast != null) drawToast(batch, shapes, font, proj);
        if (arsenalOpen) arsenal.draw(batch, shapes, font, weapons, W, H);
        Gdx.gl.glDisable(GL20.GL_BLEND);
    }

    private void fill(ShapeRenderer sh, float rx, float ry, float rw, float rh, float[] c) {
        sh.setColor(c[0], c[1], c[2], c[3]);
        sh.rect(ox + rx * s, oy + (RH - ry - rh) * s, rw * s, rh * s);
    }

    private void edge(ShapeRenderer sh, float rx, float ry, float rw, float rh, float[] c) {
        sh.setColor(c[0], c[1], c[2], c[3]);
        sh.rect(ox + rx * s, oy + (RH - ry - rh) * s, rw * s, rh * s);
    }

    private void img(SpriteBatch b, String name, float rx, float ry, float rw, float rh) {
        Texture t = icon(name);
        // mantém a proporção da arte dentro da caixa (sem distorcer)
        float k = Math.min(rw / t.getWidth(), rh / t.getHeight());
        float w = t.getWidth() * k, h = t.getHeight() * k;
        float x = rx + (rw - w) / 2f, y = ry + (rh - h) / 2f;
        b.draw(t, ox + x * s, oy + (RH - y - h) * s, w * s, h * s);
    }

    private void text(SpriteBatch b, BitmapFont f, String t, float rx, float ry, float sc, float[] c, boolean right) {
        f.getData().setScale(s * sc);
        f.setColor(c[0], c[1], c[2], c[3]);
        layout.setText(f, t);
        f.draw(b, t, ox + rx * s - (right ? layout.width : 0f), oy + (RH - ry) * s);
    }

    private void box(ShapeRenderer sh, float rx, float ry, float rw, float rh, boolean hl) {
        fill(sh, rx, ry, rw, rh, DARK);
        if (hl) edge(sh, rx, ry, rw, rh, GOLD);
    }

    private void drawMain(SpriteBatch b, ShapeRenderer sh, BitmapFont font, Matrix4 proj) {
        // Fundos e bordas
        sh.setProjectionMatrix(proj);
        sh.begin(ShapeRenderer.ShapeType.Filled);
        box(sh, 338, 14, 382, 76, false);
        box(sh, 930, 22, 215, 50, false);
        box(sh, 1170, 22, 215, 50, false);
        fill(sh, 1106, 28, 30, 30, GOLD);
        fill(sh, 1346, 28, 30, 30, GOLD);
        for (String id : new String[]{"amigos", "mensagens", "config"}) { float[] r = rect(id); box(sh, r[0], r[1], r[2], r[3], false); }
        box(sh, 15, 850, 890, 68, false);
        float[][] menu = {{15, 185}, {15, 280}, {15, 370}, {15, 462}, {15, 555}};
        for (float[] m : menu) box(sh, m[0], m[1], 290, 66, false);
        box(sh, 1255, 130, 400, 135, false);
        box(sh, 1270, 285, 380, 85, false);
        box(sh, 1335, 395, 315, 70, false);
        box(sh, 1335, 480, 315, 72, false);
        box(sh, 1245, 628, 390, 78, false);
        fill(sh, 1130, 722, 520, 176, GOLD);
        // Barra de experiência e passe
        fill(sh, 445, 78, 270, 8, BROWN);
        fill(sh, 445, 78, 270 * Progresso.xp() / (float) Progresso.xpParaNivel(Progresso.nivel()), 8, GOLD);
        fill(sh, 1392, 340, 250, 12, BROWN);
        fill(sh, 1392, 340, 250 * passe, 12, GOLD);
        sh.end();
        sh.begin(ShapeRenderer.ShapeType.Line);
        sh.setColor(GOLD[0], GOLD[1], GOLD[2], 1f);
        for (float[] m : menu) edge(sh, m[0], m[1], 290, 66, GOLD);
        edge(sh, 1255, 130, 400, 135, GOLD);
        edge(sh, 1270, 285, 380, 85, GOLD);
        edge(sh, 1335, 395, 315, 70, GOLD);
        edge(sh, 1335, 480, 315, 72, GOLD);
        edge(sh, 1245, 628, 390, 78, GOLD);
        edge(sh, 930, 22, 215, 50, GOLD);
        edge(sh, 1170, 22, 215, 50, GOLD);
        edge(sh, 338, 14, 382, 76, GOLD);
        edge(sh, 15, 850, 890, 68, GOLD);
        sh.end();
        // Ícones, textos e avisos
        b.setProjectionMatrix(proj);
        b.begin();
        img(b, "logo", 6, 0, 330, 134);
        img(b, "personagem", 344, 20, 70, 64);
        text(b, font, "JOGADOR", 428, 46, 1.9f, WHITE, false);
        text(b, font, "Nv. " + Progresso.nivel(), 428, 72, 1.4f, GOLD, false);
        text(b, font, Progresso.xp() + " / " + Progresso.xpParaNivel(Progresso.nivel()), 715, 72, 1.3f, WHITE, true);
        img(b, "moedas", 934, 24, 46, 46);
        text(b, font, String.format("%,d", Progresso.moedas()).replace(',', '.'), 1000, 56, 2.0f, WHITE, false);
        img(b, "diamantes", 1174, 24, 46, 46);
        text(b, font, String.valueOf(Progresso.diamantes()), 1240, 56, 2.0f, WHITE, false);
        text(b, font, "+", 1110, 52, 2.0f, INK, false);
        text(b, font, "+", 1350, 52, 2.0f, INK, false);
        img(b, "amigos", 1418, 14, 62, 62);
        img(b, "mensagens", 1500, 14, 62, 62);
        img(b, "config", 1585, 14, 62, 62);
        // menu lateral
        img(b, "armas", 24, 190, 58, 58);
        text(b, font, "ARMAS", 100, 226, 2.0f, WHITE, false);
        img(b, "personagem", 24, 285, 58, 58);
        text(b, font, "PERSONAGEM", 100, 321, 2.0f, WHITE, false);
        img(b, "inventario", 24, 375, 58, 58);
        text(b, font, "INVENTÁRIO", 100, 411, 2.0f, WHITE, false);
        img(b, "loja", 24, 467, 58, 58);
        text(b, font, "LOJA", 100, 503, 2.0f, WHITE, false);
        img(b, "config", 24, 560, 58, 58);
        text(b, font, "CONFIGURAÇÕES", 100, 596, 2.0f, WHITE, false);
        // painéis da direita
        img(b, "evento", 1274, 150, 54, 54);
        text(b, font, "EVENTO ESPECIAL", 1345, 172, 1.6f, GOLD, false);
        text(b, font, "A SECA DE 1915", 1345, 210, 1.9f, WHITE, false);
        img(b, "passe", 1290, 295, 62, 62);
        text(b, font, "PASSE DE BATALHA", 1392, 330, 1.7f, WHITE, false);
        img(b, "recompensas", 1344, 402, 58, 58);
        text(b, font, "RECOMPENSAS", 1414, 428, 1.6f, WHITE, false);
        text(b, font, "DIÁRIAS", 1414, 455, 1.6f, WHITE, false);
        img(b, "eventos", 1344, 488, 58, 58);
        text(b, font, "EVENTOS", 1416, 528, 2.0f, WHITE, false);
        img(b, "treino", 1262, 636, 62, 62);
        text(b, font, "TREINAMENTO", 1340, 684, 2.1f, WHITE, false);
        img(b, "jogar", 1150, 740, 140, 140);
        text(b, font, "JOGAR", 1300, 826, 4.2f, INK, false);
        // chat
        img(b, "mensagens", 24, 858, 52, 52);
        text(b, font, "Global", 92, 892, 1.8f, GOLD, false);
        text(b, font, "|", 190, 892, 1.8f, WHITE, false);
        text(b, font, "Bem-vindo ao Nordeste – Seca Braba!", 215, 892, 1.8f, WHITE, false);
        b.end();
        // Notificações (pontinhos vermelhos)
        sh.begin(ShapeRenderer.ShapeType.Filled);
        sh.setColor(RED[0], RED[1], RED[2], 1f);
        for (float[] d : new float[][]{{1476, 18}, {1556, 18}, {292, 374}, {1640, 398}}) {
            sh.circle(ox + d[0] * s, oy + (RH - d[1]) * s, 9f * s);
        }
        sh.end();
    }

    // Cards do painel de personagens: uma coluna por personagem, com a miniatura e o botão USAR
    private static final float CARD_Y = 260f, CARD_W = 150f, CARD_H = 470f, CARD_GAP = 10f;
    private static float cardX(int i) { return 365f + i * (CARD_W + CARD_GAP); }
    private static float[] usarRect(int i) { return new float[]{cardX(i) + 10f, CARD_Y + 400f, CARD_W - 20f, 44f}; }

    /** Texto centralizado num ponto (x do centro, em referência). */
    private void ctext(SpriteBatch b, BitmapFont f, String t, float cx, float ry, float sc, float[] c) {
        f.getData().setScale(s * sc);
        layout.setText(f, t);
        float w = layout.width / s;
        text(b, f, t, cx - w / 2f, ry, sc, c, false);
    }

    private void cardFills(ShapeRenderer sh) {
        for (int i = 0; i < Personagens.NOMES.length; i++) {
            float x = cardX(i);
            if (i == Personagens.atual()) fill(sh, x - 3, CARD_Y - 3, CARD_W + 6, CARD_H + 6, GOLD);
            fill(sh, x, CARD_Y, CARD_W, CARD_H, DARK);
            float[] u = usarRect(i);
            boolean emUso = i == Personagens.atual();
            fill(sh, u[0], u[1], u[2], u[3], emUso ? BROWN : GOLD);
        }
    }

    private void cardTexts(SpriteBatch b, BitmapFont font) {
        for (int i = 0; i < Personagens.NOMES.length; i++) {
            float x = cardX(i);
            img(b, Personagens.MINIATURAS[i], x + 8, CARD_Y + 14, CARD_W - 16, 300);
            ctext(b, font, Personagens.NOMES[i].toUpperCase(), x + CARD_W / 2f, CARD_Y + 352, 0.85f, GOLD);
            float[] u = usarRect(i);
            boolean emUso = i == Personagens.atual();
            ctext(b, font, emUso ? "EM USO" : "USAR", u[0] + u[2] / 2f, u[1] + 32, 1.2f, emUso ? MUTED : INK);
        }
    }

    private void drawPanel(SpriteBatch b, ShapeRenderer sh, BitmapFont font, Matrix4 proj) {
        boolean cartoes = "Personagem".equals(panel);
        sh.setProjectionMatrix(proj);
        sh.begin(ShapeRenderer.ShapeType.Filled);
        sh.setColor(0f, 0f, 0f, 0.72f);
        sh.rect(0, 0, screenW, screenH);   // véu escuro (cobre a tela inteira)
        fill(sh, 330, 150, 1010, 640, DARK);
        fill(sh, 1280, 160, 52, 52, GOLD);
        if ("Recompensas".equals(panel)) fill(sh, CLAIM[0], CLAIM[1], CLAIM[2], CLAIM[3], !Progresso.recompensaDisponivel() ? BROWN : GOLD);
        if (cartoes) cardFills(sh);
        sh.end();
        sh.begin(ShapeRenderer.ShapeType.Line);
        edge(sh, 330, 150, 1010, 640, GOLD);
        sh.end();
        b.setProjectionMatrix(proj);
        b.begin();
        img(b, "fechar", CLOSE[0] + 8, CLOSE[1] + 8, CLOSE[2] - 16, CLOSE[3] - 16);
        text(b, font, panel.toUpperCase(), 365, 214, 2.6f, GOLD, false);
        if (cartoes) {
            text(b, font, "Nível " + Progresso.nivel() + "   ·   XP " + Progresso.xp() + " / " + Progresso.xpParaNivel(Progresso.nivel()), 365, 246, 1.5f, MUTED, false);
            cardTexts(b, font);
        } else {
            String[] lines = body(panel);
            float y = 270;
            for (String l : lines) { text(b, font, l, 365, y, 1.7f, WHITE, false); y += 48; }
        }
        if ("Recompensas".equals(panel)) {
            text(b, font, !Progresso.recompensaDisponivel() ? "RESGATADA" : "RESGATAR", CLAIM[0] + CLAIM[2] / 2f, CLAIM[1] + 40, 1.9f, INK, true);
        }
        if ("Loja".equals(panel)) {
            img(b, "moedas", 365, 500, 60, 60);
            img(b, "diamantes", 365, 580, 60, 60);
        }
        b.end();
    }

    private String[] body(String p) {
        switch (p) {
            case "Personagem": return new String[]{"Nível " + Progresso.nivel(), "Experiência " + Progresso.xp() + " / " + Progresso.xpParaNivel(Progresso.nivel()), "Visual do personagem: em breve"};
            case "Inventário": return new String[]{"Kits, granadas e munição ficam com você nas partidas.", "Organização do inventário: em breve."};
            case "Loja": return new String[]{"Moedas: " + Progresso.moedas(), "Diamantes: " + Progresso.diamantes(), "Pacotes e itens: em breve"};
            case "Evento especial": return new String[]{"A SECA DE 1915", "Evento temporário: em breve."};
            case "Passe de batalha": {
                int pct = Progresso.xp() * 100 / Progresso.xpParaNivel(Progresso.nivel());
                return new String[]{"Nível do passe: " + Progresso.nivel(), "Progresso do nível: " + pct + "%",
                        "Cada nível subido dá " + Progresso.MOEDAS_NIVEL + " moedas (já creditadas)."};
            }
            case "Recompensas": return new String[]{"Recompensa diária: " + Progresso.MOEDAS_DIARIA + " moedas", !Progresso.recompensaDisponivel() ? "Você já resgatou a recompensa de hoje." : "Toque em RESGATAR."};
            case "Eventos": return new String[]{"Nenhum evento novo no momento."};
            case "Amigos": return new String[]{"Lista de amigos: em breve."};
            case "Mensagens": return new String[]{"Nenhuma mensagem nova."};
            case "Chat": return new String[]{"Global: Bem-vindo ao Nordeste – Seca Braba!", "Global: Chat ao vivo: em breve."};
            default: return new String[]{};
        }
    }

    private void drawToast(SpriteBatch b, ShapeRenderer sh, BitmapFont font, Matrix4 proj) {
        sh.setProjectionMatrix(proj);
        sh.begin(ShapeRenderer.ShapeType.Filled);
        fill(sh, 480, 880, 712, 46, DARK);
        sh.end();
        b.setProjectionMatrix(proj);
        b.begin();
        text(b, font, toast, 836, 912, 1.6f, WHITE, false);
        b.end();
    }

    void dispose() {
        for (Texture t : tex.values()) t.dispose();
        tex.clear();
    }
}
