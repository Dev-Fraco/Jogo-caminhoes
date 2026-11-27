package com.exemplo.jogo3d;

import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.Input;
import com.badlogic.gdx.graphics.Texture;
import com.badlogic.gdx.graphics.g2d.BitmapFont;
import com.badlogic.gdx.graphics.g2d.GlyphLayout;
import com.badlogic.gdx.graphics.g2d.SpriteBatch;
import com.badlogic.gdx.graphics.glutils.ShapeRenderer;
import com.badlogic.gdx.math.Matrix4;

import java.util.Random;

/**
 * Tela SALA PERSONALIZADA (sobre o lobby). Telas: menu (criar ou entrar), criar sala (formato, jogadores por equipe,
 * mapa), entrar por código, e a sala (duas equipes, líder, convidar amigos, iniciar). Usa as regras de {@link Sala} e
 * {@link SalaManager}, que o servidor vai substituir depois. Só o líder remove jogadores e inicia.
 */
final class SalaUi {
    enum Tela { MENU, CRIAR, ENTRAR, SALA }

    /** O que a tela pediu ao jogo (o jogo executa): nada, voltar ao lobby, ou iniciar a partida da sala. */
    enum Acao { NENHUMA, VOLTAR, INICIAR }

    static final String EU = "JOGADOR";                   // nome do jogador neste aparelho
    static final String[] FORMATOS = {"1x1", "2x1", "3x1", "4x1", "2x2", "3x3", "4x4", "PERSONALIZADO"};
    static final int[][] PARES = {{1, 1}, {2, 1}, {3, 1}, {4, 1}, {2, 2}, {3, 3}, {4, 4}, {0, 0}};
    static final String MAPA = "ARENA LIVRE";

    private static final float RW = 1672f, RH = 941f;
    private static final float[] DARK = {0.08f, 0.06f, 0.05f, 0.94f}, GOLD = {0.98f, 0.78f, 0.25f, 1f},
            WHITE = {1f, 0.96f, 0.88f, 1f}, INK = {0.10f, 0.06f, 0.02f, 1f}, AZUL = {0.12f, 0.45f, 0.95f, 1f},
            VERMELHO = {0.90f, 0.15f, 0.15f, 1f}, VERDE = {0.25f, 0.9f, 0.35f, 1f}, CINZA = {0.35f, 0.33f, 0.3f, 1f},
            MUTED = {0.75f, 0.7f, 0.6f, 1f}, ERRO = {1f, 0.45f, 0.35f, 1f};

    private final SalaManager gerente;
    private Tela tela = Tela.MENU;
    private Sala sala;
    private int formato = 6;                              // 4x4 por padrão
    private int tamA = 4, tamB = 4;                       // personalizado
    private String codigoDigitado = "";
    private String mensagem = "", erroMensagem = "";
    private boolean amigosAbertos = false;
    private int testes = 0;                               // jogadores de teste adicionados (só neste aparelho)
    private boolean aberta = false;                       // a tela está aparecendo

    private Texture logo, preview, modo, pixel;
    private BitmapFont fonte;                             // fonte do lobby (definida em draw)
    private final GlyphLayout layout = new GlyphLayout();
    private float s, ox, oy;

    SalaUi(Random sorteio) {
        this.gerente = new SalaManager(sorteio);
    }

    /** Carrega as imagens (uma vez). */
    private void carregar() {
        if (pixel != null) return;
        logo = new Texture(Gdx.files.internal("hud2/lobby/logo.png"));
        preview = new Texture(Gdx.files.internal("hud2/lobby/arena_preview.jpg"));
        modo = new Texture(Gdx.files.internal("hud2/lobby/modo_4x4.png"));
        preview.setFilter(Texture.TextureFilter.Linear, Texture.TextureFilter.Linear);
        modo.setFilter(Texture.TextureFilter.Linear, Texture.TextureFilter.Linear);
        logo.setFilter(Texture.TextureFilter.Linear, Texture.TextureFilter.Linear);
        com.badlogic.gdx.graphics.Pixmap pm = new com.badlogic.gdx.graphics.Pixmap(1, 1, com.badlogic.gdx.graphics.Pixmap.Format.RGBA8888);
        pm.setColor(1f, 1f, 1f, 1f);
        pm.fill();
        pixel = new Texture(pm);
        pm.dispose();
    }

    void dispose() {
        if (pixel == null) return;
        logo.dispose();
        preview.dispose();
        modo.dispose();
        pixel.dispose();
        pixel = null;
    }

    /** Abre a tela no menu da sala personalizada. */
    void abrir() {
        carregar();
        aberta = true;
        tela = sala == null ? Tela.MENU : Tela.SALA;
        erroMensagem = "";
    }

    Sala sala() { return sala; }

    boolean aberta() { return aberta; }

    void fechar() { aberta = false; amigosAbertos = false; }

    // ---------- escala e retângulos (referência 1672 x 941, origem em cima) ----------

    private void escala(int W, int H) {
        s = Math.min(W / RW, H / RH);
        ox = (W - RW * s) / 2f;
        oy = (H - RH * s) / 2f;
    }

    private void preenche(ShapeRenderer sh, float x, float y, float w, float h, float[] c) {
        sh.setColor(c[0], c[1], c[2], c[3]);
        sh.rect(ox + x * s, oy + (RH - y - h) * s, w * s, h * s);
    }

    private void contorno(ShapeRenderer sh, float x, float y, float w, float h, float[] c) {
        sh.setColor(c[0], c[1], c[2], c[3]);
        sh.rect(ox + x * s, oy + (RH - y - h) * s, w * s, h * s);
    }

    private void texto(SpriteBatch b, String t, float x, float y, float sc, float[] c, boolean centro) {
        fonte.getData().setScale(s * sc);
        fonte.setColor(c[0], c[1], c[2], c[3]);
        layout.setText(fonte, t);
        float px = ox + x * s - (centro ? layout.width / 2f : 0f);
        fonte.draw(b, t, px, oy + (RH - y) * s);
    }

    private void textoCentro(SpriteBatch b, String t, float x, float y, float w, float sc, float[] c) {
        fonte.getData().setScale(s * sc);
        fonte.setColor(c[0], c[1], c[2], c[3]);
        layout.setText(fonte, t);
        fonte.draw(b, t, ox + (x + w / 2f) * s - layout.width / 2f, oy + (RH - y) * s);
    }

    private static boolean dentro(float[] r, float x, float y) {
        return x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];
    }

    // ---------- botões compartilhados ----------

    private static final float[] VOLTAR_X = {1560f, 28f, 70f, 70f};
    private static final float[] VOLTAR = {20f, 30f, 60f, 60f};

    private static float[] r(float x, float y, float w, float h) { return new float[]{x, y, w, h}; }

    // Menu
    private static final float[] MENU_CRIAR = r(420, 300, 830, 150), MENU_ENTRAR = r(420, 500, 830, 150);
    // Criar sala
    private static final float[] CHIP_BASE = r(420, 200, 140, 70);
    private static final float[] CRIAR_BTN = r(1010, 520, 560, 120);
    private static final float[] PREV_AREA = r(420, 430, 520, 296);
    // Entrar
    private static final float[] CAMPO = r(436, 340, 800, 110), ENTRAR_BTN = r(636, 500, 400, 120);
    // Sala
    private static final float[] SIDE_SALA = r(20, 160, 280, 100), SIDE_CONVIDAR = r(20, 400, 280, 100);
    private static final float[] ID_BOX = r(480, 130, 470, 90), COPIAR = r(965, 145, 95, 60);
    private static final float[] MODO_BOX = r(1100, 130, 470, 90);
    private static final float[] EQ_A = r(420, 250, 580, 620), EQ_B = r(1090, 250, 580, 620);
    private static final float[] CANCELAR = r(1030, 880, 300, 55), INICIAR = r(1350, 880, 300, 55),
            TESTE = r(420, 880, 380, 55);
    private static final float[] AMIGOS_FECHAR = r(1100, 230, 70, 70);

    private static float[] slot(int equipe, int i) {
        float x = equipe == Sala.A ? 440f : 1110f;
        return r(x, 330 + i * 72f, 540, 62);
    }

    private static float[] chip(int i) { return r(420 + i * 150f, 200, 140, 70); }

    private static float[] stepper(int linha, int tipo) {
        // tipo: 0 menos, 1 valor, 2 mais
        float y = 320 + linha * 90f;
        if (tipo == 0) return r(420, y, 60, 60);
        if (tipo == 1) return r(490, y, 120, 60);
        return r(620, y, 60, 60);
    }

    // ---------- desenho ----------

    void draw(SpriteBatch b, ShapeRenderer sh, BitmapFont font, Matrix4 proj, int W, int H) {
        carregar();
        fonte = font;   // a mesma fonte do lobby (mesmas escalas de texto)
        escala(W, H);
        // fundo escuro cobrindo o lobby
        sh.setProjectionMatrix(proj);
        sh.begin(ShapeRenderer.ShapeType.Filled);
        sh.setColor(0.04f, 0.04f, 0.04f, 0.98f);
        sh.rect(0, 0, W, H);
        preenche(sh, 0, 0, RW, 112, new float[]{0.09f, 0.08f, 0.06f, 1f});
        if (tela == Tela.MENU) { preenche(sh, MENU_CRIAR[0], MENU_CRIAR[1], MENU_CRIAR[2], MENU_CRIAR[3], GOLD); preenche(sh, MENU_ENTRAR[0], MENU_ENTRAR[1], MENU_ENTRAR[2], MENU_ENTRAR[3], DARK); }
        if (tela == Tela.CRIAR) desenhaCriarShapes(sh);
        if (tela == Tela.ENTRAR) { preenche(sh, CAMPO[0], CAMPO[1], CAMPO[2], CAMPO[3], DARK); preenche(sh, ENTRAR_BTN[0], ENTRAR_BTN[1], ENTRAR_BTN[2], ENTRAR_BTN[3], GOLD); }
        if (tela == Tela.SALA && sala != null) desenhaSalaShapes(sh);
        if (amigosAbertos) preenche(sh, 430, 200, 800, 500, DARK);
        sh.end();
        sh.begin(ShapeRenderer.ShapeType.Line);
        if (tela == Tela.MENU) { contorno(sh, MENU_ENTRAR[0], MENU_ENTRAR[1], MENU_ENTRAR[2], MENU_ENTRAR[3], GOLD); }
        if (tela == Tela.CRIAR) contornosCriar(sh);
        if (tela == Tela.ENTRAR) contorno(sh, CAMPO[0], CAMPO[1], CAMPO[2], CAMPO[3], GOLD);
        if (tela == Tela.SALA && sala != null) contornosSala(sh);
        if (amigosAbertos) contorno(sh, 430, 200, 800, 500, GOLD);
        sh.end();
        b.setProjectionMatrix(proj);
        b.begin();
        b.draw(logo, ox + 20 * s, oy + (RH - 110) * s, 100 * s, 100 * s);
        texto(b, "SALA PERSONALIZADA", 140, 70, 2.4f, GOLD, false);
        switch (tela) {
            case MENU: desenhaMenuTexto(b); break;
            case CRIAR:
                b.setColor(1f, 1f, 1f, 1f);
                b.draw(preview, ox + PREV_AREA[0] * s, oy + (RH - PREV_AREA[1] - PREV_AREA[3]) * s, PREV_AREA[2] * s, PREV_AREA[3] * s);
                desenhaCriarTexto(b);
                break;
            case ENTRAR: desenhaEntrarTexto(b); break;
            case SALA: if (sala != null) desenhaSalaTexto(b); break;
        }
        if (amigosAbertos) desenhaAmigos(b);
        b.end();
    }

    private void desenhaMenuTexto(SpriteBatch b) {
        textoCentro(b, "CRIAR SALA", MENU_CRIAR[0], MENU_CRIAR[1] + 45, MENU_CRIAR[2], 2.6f, INK);
        textoCentro(b, "ENTRAR NA SALA", MENU_ENTRAR[0], MENU_ENTRAR[1] + 45, MENU_ENTRAR[2], 2.6f, WHITE);
        textoCentro(b, "Monte uma partida 4x4 com amigos e jogue na arena.", 420, 700, 830, 1.5f, MUTED);
        desenhaVoltar(b);
    }

    private void desenhaVoltar(SpriteBatch b) {
        texto(b, "X", VOLTAR_X[0] + 24, VOLTAR_X[1] + 50, 2.4f, GOLD, false);
    }

    private void desenhaCriarShapes(ShapeRenderer sh) {
        for (int i = 0; i < FORMATOS.length; i++) {
            float[] c = chip(i);
            preenche(sh, c[0], c[1], c[2], c[3], i == formato ? GOLD : DARK);
        }
        preenche(sh, PREV_AREA[0], PREV_AREA[1], PREV_AREA[2], PREV_AREA[3], DARK);
        if (PARES[formato][0] == 0) {   // personalizado: botões de mais e menos
            for (int linha = 0; linha < 2; linha++) {
                for (int tipo = 0; tipo < 3; tipo++) {
                    float[] c = stepper(linha, tipo);
                    preenche(sh, c[0], c[1], c[2], c[3], DARK);
                }
            }
        }
        boolean valido = Sala.formatoValido(valorA(), valorB());
        preenche(sh, CRIAR_BTN[0], CRIAR_BTN[1], CRIAR_BTN[2], CRIAR_BTN[3], valido ? GOLD : CINZA);
    }

    private void contornosCriar(ShapeRenderer sh) {
        for (int i = 0; i < FORMATOS.length; i++) contorno(sh, chip(i)[0], chip(i)[1], chip(i)[2], chip(i)[3], GOLD);
        contorno(sh, PREV_AREA[0], PREV_AREA[1], PREV_AREA[2], PREV_AREA[3], GOLD);
        if (PARES[formato][0] == 0) for (int linha = 0; linha < 2; linha++) for (int tipo = 0; tipo < 3; tipo++) {
            float[] c = stepper(linha, tipo);
            contorno(sh, c[0], c[1], c[2], c[3], GOLD);
        }
    }

    private void desenhaCriarTexto(SpriteBatch b) {
        texto(b, "MODO", 150, 245, 1.9f, WHITE, false);
        for (int i = 0; i < FORMATOS.length; i++) {
            float[] c = chip(i);
            String t = FORMATOS[i];
            float sc = i == FORMATOS.length - 1 ? 1.2f : 1.9f;
            textoCentro(b, t, c[0], c[1] + 22, c[2], sc, i == formato ? INK : WHITE);
        }
        texto(b, "JOGADORES POR EQUIPE", 150, 380, 1.9f, WHITE, false);
        if (PARES[formato][0] == 0) {
            texto(b, "EQUIPE A", 150, 350, 1.6f, AZUL, false);
            texto(b, "EQUIPE B", 150, 440, 1.6f, VERMELHO, false);
            textoCentro(b, "-", 420, 320 + 46, 60, 2.2f, WHITE);
            textoCentro(b, "+", 620, 320 + 46, 60, 2.2f, WHITE);
            textoCentro(b, "-", 420, 410 + 46, 60, 2.2f, WHITE);
            textoCentro(b, "+", 620, 410 + 46, 60, 2.2f, WHITE);
            textoCentro(b, String.valueOf(tamA), 490, 320 + 46, 120, 2.2f, WHITE);
            textoCentro(b, String.valueOf(tamB), 490, 410 + 46, 120, 2.2f, WHITE);
        } else {
            textoCentro(b, PARES[formato][0] + " x " + PARES[formato][1], 420, 330, 520, 2.2f, WHITE);
        }
        texto(b, "Total: " + (valorA() + valorB()) + " de 8   (mín. 1 por equipe)", 420, 752, 1.4f, MUTED, false);
        texto(b, "MAPA", 150, 560, 1.9f, WHITE, false);
        texto(b, MAPA, 420, 800, 1.9f, GOLD, false);
        textoCentro(b, "CRIAR SALA", CRIAR_BTN[0], CRIAR_BTN[1] + 40, CRIAR_BTN[2], 2.4f, Sala.formatoValido(valorA(), valorB()) ? INK : MUTED);
        if (!erroMensagem.isEmpty()) texto(b, erroMensagem, 420, 820, 1.6f, ERRO, false);
        desenhaVoltar(b);
    }

    private void desenhaEntrarTexto(SpriteBatch b) {
        textoCentro(b, "ENTRAR NA SALA", 0, 130, RW, 2.6f, WHITE);
        textoCentro(b, "CÓDIGO DA SALA", 0, 300, RW, 1.9f, WHITE);
        String t = codigoDigitado.isEmpty() ? "Toque para digitar o código..." : codigoDigitado;
        texto(b, t, CAMPO[0] + 24, CAMPO[1] + 68, 2.2f, codigoDigitado.isEmpty() ? CINZA : WHITE, false);
        textoCentro(b, "ENTRAR", ENTRAR_BTN[0], ENTRAR_BTN[1] + 40, ENTRAR_BTN[2], 2.6f, INK);
        if (!erroMensagem.isEmpty()) textoCentro(b, erroMensagem, 0, 680, RW, 1.8f, ERRO);
        desenhaVoltar(b);
    }

    private void desenhaSalaShapes(ShapeRenderer sh) {
        preenche(sh, SIDE_SALA[0], SIDE_SALA[1], SIDE_SALA[2], SIDE_SALA[3], GOLD);
        preenche(sh, SIDE_CONVIDAR[0], SIDE_CONVIDAR[1], SIDE_CONVIDAR[2], SIDE_CONVIDAR[3], DARK);
        preenche(sh, ID_BOX[0], ID_BOX[1], ID_BOX[2], ID_BOX[3], DARK);
        preenche(sh, COPIAR[0], COPIAR[1], COPIAR[2], COPIAR[3], GOLD);
        preenche(sh, MODO_BOX[0], MODO_BOX[1], MODO_BOX[2], MODO_BOX[3], DARK);
        preenche(sh, EQ_A[0], EQ_A[1], EQ_A[2], EQ_A[3], DARK);
        preenche(sh, EQ_B[0], EQ_B[1], EQ_B[2], EQ_B[3], DARK);
        preenche(sh, 420, 250, 580, 70, AZUL);
        preenche(sh, 1090, 250, 580, 70, VERMELHO);
        for (int e = Sala.A; e <= Sala.B; e++) for (int i = 0; i < sala.tamanho[e]; i++) {
            float[] c = slot(e, i);
            boolean cheio = sala.nomes[e][i] != null;
            preenche(sh, c[0], c[1], c[2], c[3], cheio ? new float[]{0.12f, 0.1f, 0.08f, 1f} : new float[]{0.06f, 0.06f, 0.06f, 1f});
            if (cheio && sala.prontos[e][i]) preenche(sh, c[0] + c[2] - 44, c[1] + 22, 18, 18, VERDE);   // pronto
        }
        preenche(sh, CANCELAR[0], CANCELAR[1], CANCELAR[2], CANCELAR[3], DARK);
        boolean pode = sala.erroParaIniciar(sala.lider()) == Sala.Erro.NENHUM && sala.lider().equals(EU);
        preenche(sh, INICIAR[0], INICIAR[1], INICIAR[2], INICIAR[3], pode ? GOLD : CINZA);
        preenche(sh, TESTE[0], TESTE[1], TESTE[2], TESTE[3], DARK);
    }

    private void contornosSala(ShapeRenderer sh) {
        contorno(sh, CANCELAR[0], CANCELAR[1], CANCELAR[2], CANCELAR[3], VERMELHO);
        contorno(sh, TESTE[0], TESTE[1], TESTE[2], TESTE[3], GOLD);
        for (int e = Sala.A; e <= Sala.B; e++) for (int i = 0; i < sala.tamanho[e]; i++) {
            float[] c = slot(e, i);
            contorno(sh, c[0], c[1], c[2], c[3], e == Sala.A ? AZUL : VERMELHO);
        }
    }

    private void desenhaSalaTexto(SpriteBatch b) {
        texto(b, "ID DA SALA:", 500, 185, 1.7f, WHITE, false);
        texto(b, sala.codigo, 700, 185, 2.4f, GOLD, false);
        texto(b, "COPIAR", COPIAR[0] + 10, COPIAR[1] + 40, 1.4f, INK, false);
        texto(b, "MODO: " + (sala.tamanho[Sala.A] == sala.tamanho[Sala.B] ? sala.tamanho[Sala.A] + "x" + sala.tamanho[Sala.B] : sala.tamanho[Sala.A] + " x " + sala.tamanho[Sala.B]), 1130, 185, 1.9f, WHITE, false);
        textoCentro(b, "EQUIPE A  (" + sala.ocupados(Sala.A) + "/" + sala.tamanho[Sala.A] + ")", 420, 270, 580, 2f, WHITE);
        textoCentro(b, "EQUIPE B  (" + sala.ocupados(Sala.B) + "/" + sala.tamanho[Sala.B] + ")", 1090, 270, 580, 2f, WHITE);
        texto(b, "VS", 1010, 520, 2.4f, GOLD, true);
        for (int e = Sala.A; e <= Sala.B; e++) for (int i = 0; i < sala.tamanho[e]; i++) {
            float[] c = slot(e, i);
            String nome = sala.nomes[e][i];
            if (nome == null) {
                texto(b, "vaga livre", c[0] + 110, c[1] + 18, 1.6f, CINZA, false);
                continue;
            }
            texto(b, nome, c[0] + 110, c[1] + 18, 1.9f, WHITE, false);
            if (nome.equals(sala.lider())) texto(b, "LÍDER", c[0] + c[2] - 120, c[1] + 18, 1.3f, GOLD, false);

        }
        texto(b, "SALA", 60, 222, 1.9f, INK, false);
        texto(b, "CONFIGURAÇÕES", 60, 340, 1.5f, WHITE, false);
        texto(b, CONVIDAR_TXT, 40, 455, 1.5f, WHITE, false);
        texto(b, "CANCELAR SALA", CANCELAR[0] + 40, CANCELAR[1] + 15, 1.9f, WHITE, false);
        textoCentro(b, "INICIAR", INICIAR[0], INICIAR[1] + 15, INICIAR[2], 2.4f,
                sala.erroParaIniciar(EU) == Sala.Erro.NENHUM ? INK : MUTED);
        texto(b, "+ TESTE", TESTE[0] + 40, TESTE[1] + 15, 1.9f, GOLD, false);
        texto(b, motivoInicio(), 420, 860, 1.6f, sala.erroParaIniciar(EU) == Sala.Erro.NENHUM ? VERDE : MUTED, false);
        if (!mensagem.isEmpty()) texto(b, mensagem, 420, 905, 1.6f, GOLD, false);
    }

    private static final String CONVIDAR_TXT = "CONVIDAR AMIGOS";

    private String motivoInicio() {
        switch (sala.erroParaIniciar(EU)) {
            case NENHUM: return "Tudo pronto: o líder pode iniciar.";
            case EQUIPE_VAZIA: return "Cada equipe precisa de pelo menos 1 jogador.";
            case NAO_PRONTOS: return "Aguardando todos ficarem prontos.";
            case NAO_E_LIDER: return "Só o líder inicia a partida.";
            case JA_INICIOU: return "A partida já começou.";
            default: return "";
        }
    }

    private void desenhaAmigos(SpriteBatch b) {
        texto(b, "CONVIDAR AMIGOS", 460, 280, 2.2f, GOLD, false);
        texto(b, "Você ainda não tem amigos adicionados.", 460, 380, 1.7f, WHITE, false);
        texto(b, "Adicione amigos para convidá-los para a sala.", 460, 430, 1.5f, MUTED, false);
        texto(b, "X", AMIGOS_FECHAR[0] + 24, AMIGOS_FECHAR[1] + 50, 2.4f, GOLD, false);
    }

    // ---------- valores e toques ----------

    private int valorA() { return PARES[formato][0] == 0 ? tamA : PARES[formato][0]; }

    private int valorB() { return PARES[formato][0] == 0 ? tamB : PARES[formato][1]; }

    /** Toque na tela (coordenadas com origem embaixo). Devolve a ação para o jogo. */
    Acao toque(float x, float yb, int W, int H) {
        escala(W, H);
        float rx = (x - ox) / s, ry = RH - (yb - oy) / s;   // de volta à referência (origem em cima)
        if (amigosAbertos) {
            if (dentro(AMIGOS_FECHAR, rx, ry)) amigosAbertos = false;
            return Acao.NENHUMA;
        }
        if (dentro(VOLTAR_X, rx, ry) || dentro(VOLTAR, rx, ry)) {
            if (tela == Tela.SALA || tela == Tela.MENU) return Acao.VOLTAR;
            tela = Tela.MENU;
            erroMensagem = "";
            return Acao.NENHUMA;
        }
        switch (tela) {
            case MENU:
                if (dentro(MENU_CRIAR, rx, ry)) { tela = Tela.CRIAR; erroMensagem = ""; }
                else if (dentro(MENU_ENTRAR, rx, ry)) { tela = Tela.ENTRAR; erroMensagem = ""; codigoDigitado = ""; }
                break;
            case CRIAR: toqueCriar(rx, ry); break;
            case ENTRAR: toqueEntrar(rx, ry); break;
            case SALA: return toqueSala(rx, ry);
        }
        return Acao.NENHUMA;
    }

    private void toqueCriar(float rx, float ry) {
        for (int i = 0; i < FORMATOS.length; i++) if (dentro(chip(i), rx, ry)) { formato = i; erroMensagem = ""; return; }
        if (PARES[formato][0] == 0) {
            if (dentro(stepper(0, 0), rx, ry)) tamA = Math.max(1, tamA - 1);
            else if (dentro(stepper(0, 2), rx, ry)) tamA = Math.min(Sala.MAX_POR_EQUIPE, tamA + 1);
            else if (dentro(stepper(1, 0), rx, ry)) tamB = Math.max(1, tamB - 1);
            else if (dentro(stepper(1, 2), rx, ry)) tamB = Math.min(Sala.MAX_POR_EQUIPE, tamB + 1);
        }
        if (dentro(CRIAR_BTN, rx, ry)) {
            Sala nova = gerente.criar(valorA(), valorB(), MAPA, EU);
            if (nova == null) { erroMensagem = "Formato inválido: cada equipe precisa de 1 a 7, com no máximo 8 no total."; return; }
            sala = nova;
            tela = Tela.SALA;
            mensagem = "Sala criada. Código: " + nova.codigo;
            erroMensagem = "";
        }
    }

    private void toqueEntrar(float rx, float ry) {
        if (dentro(CAMPO, rx, ry)) { abrirDigitacao(); return; }
        if (dentro(ENTRAR_BTN, rx, ry)) {
            entrarComCodigo(codigoDigitado);
        }
    }

    /** Entra pelo código digitado: mostra o motivo se não der. */
    void entrarComCodigo(String codigo) {
        Sala[] achou = new Sala[1];
        Sala.Erro e = gerente.entrar(codigo == null ? "" : codigo.trim(), EU, achou);
        switch (e) {
            case NENHUM:
                sala = achou[0];
                tela = Tela.SALA;
                erroMensagem = "";
                mensagem = "Você entrou na sala " + sala.codigo + ".";
                break;
            case CODIGO_INVALIDO: erroMensagem = "Código não encontrado. Confira os números e tente de novo."; break;
            case SALA_CHEIA: erroMensagem = "Essa sala está cheia."; break;
            case JA_INICIOU: erroMensagem = "A partida dessa sala já começou."; break;
            case NOME_EM_USO: erroMensagem = "Você já está nessa sala."; break;
            default: erroMensagem = "Não foi possível entrar na sala."; break;
        }
    }

    private void abrirDigitacao() {
        Gdx.input.getTextInput(new Input.TextInputListener() {
            @Override public void input(String texto) {
                codigoDigitado = texto == null ? "" : texto.replaceAll("[^0-9]", "");
                if (codigoDigitado.length() > SalaManager.CODIGO_TAMANHO)
                    codigoDigitado = codigoDigitado.substring(0, SalaManager.CODIGO_TAMANHO);
            }
            @Override public void canceled() { }
        }, "Código da sala", codigoDigitado, "Ex.: 742519");
    }

    private Acao toqueSala(float rx, float ry) {
        if (sala == null) return Acao.VOLTAR;
        if (dentro(SIDE_CONVIDAR, rx, ry)) { amigosAbertos = true; return Acao.NENHUMA; }
        if (dentro(COPIAR, rx, ry)) {
            Gdx.app.getClipboard().setContents(sala.codigo);
            mensagem = "Código copiado: " + sala.codigo;
            return Acao.NENHUMA;
        }
        if (dentro(CANCELAR, rx, ry)) {
            gerente.fechar(sala.codigo);
            sala = null;
            tela = Tela.MENU;
            mensagem = "";
            return Acao.NENHUMA;
        }
        if (dentro(TESTE, rx, ry)) { adicionarTeste(); return Acao.NENHUMA; }
        if (dentro(INICIAR, rx, ry)) {
            Sala.Erro e = sala.iniciar(EU);
            if (e == Sala.Erro.NENHUM) return Acao.INICIAR;
            mensagem = motivoInicio();
            return Acao.NENHUMA;
        }
        for (int e = Sala.A; e <= Sala.B; e++) for (int i = 0; i < sala.tamanho[e]; i++) {
            if (!dentro(slot(e, i), rx, ry)) continue;
            String nome = sala.nomes[e][i];
            if (nome == null) return Acao.NENHUMA;
            if (nome.equals(EU)) {                                    // o próprio jogador troca de equipe
                Sala.Erro erro = sala.trocarEquipe(EU, e == Sala.A ? Sala.B : Sala.A);
                mensagem = erro == Sala.Erro.NENHUM ? "Você trocou de equipe." : "Essa equipe está cheia.";
            } else if (sala.lider().equals(EU)) {                    // líder remove os outros
                sala.remover(EU, nome);
                mensagem = nome + " saiu da sala.";
            }
            return Acao.NENHUMA;
        }
        return Acao.NENHUMA;
    }

    /** Local (sem servidor): adiciona um jogador de teste para montar as equipes. */
    private void adicionarTeste() {
        testes++;
        String nome = "TESTE" + (testes < 10 ? "0" : "") + testes;
        Sala.Erro e = sala.entrar(nome);
        if (e == Sala.Erro.NENHUM) {
            sala.marcarPronto(nome, true);
            mensagem = nome + " entrou na sala.";
        } else {
            mensagem = "Não há mais vagas.";
        }
    }

    // ---------- consultas para o jogo ----------

    /** Jogadores da sala que estão na partida (inclui o jogador). */
    int jogadoresDaSala() { return sala == null ? 1 : sala.ocupados(); }

    /** Fecha a sala depois que a partida começa (o líder já iniciou). */
    void partidaComecou() {
        if (sala != null) gerente.fechar(sala.codigo);
        sala = null;
        tela = Tela.MENU;
        amigosAbertos = false;
    }

}
