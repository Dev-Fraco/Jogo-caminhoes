package com.exemplo.jogo3d;

import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.Preferences;
import com.badlogic.gdx.graphics.Texture;
import com.badlogic.gdx.graphics.g2d.BitmapFont;
import com.badlogic.gdx.graphics.g2d.GlyphLayout;
import com.badlogic.gdx.graphics.g2d.SpriteBatch;
import com.badlogic.gdx.graphics.glutils.ShapeRenderer;
import com.badlogic.gdx.math.MathUtils;

/**
 * HUD em estilo couro (imagens recortadas da arte enviada).
 *
 * Cada elemento tem posição (fração da tela) e escala próprias. No modo de edição
 * (engrenagem no canto superior esquerdo) dá para arrastar, aumentar ou diminuir cada um.
 * As posições ficam salvas no aparelho (Preferences).
 */
public class Hud {

    static final class El {
        final String id, label, file;
        final float hf;          // altura padrão, fração da altura da tela
        final float aspectNoTex; // largura/altura quando não há textura (botão desenhado em código)
        float fx, fy;           // centro, fração de W e de H (origem embaixo à esquerda)
        float scale = 1f;       // escala escolhida pelo jogador
        Texture tex;

        El(String id, String label, String file, float hf, float aspectNoTex) {
            this.id = id;
            this.label = label;
            this.file = file;
            this.hf = hf;
            this.aspectNoTex = aspectNoTex;
        }

        float aspect() {
            return tex != null ? tex.getWidth() / (float) tex.getHeight() : aspectNoTex;
        }
    }

    static final String[] ORDER = {"status", "itens", "joystick", "mochila", "config", "correr", "pular", "agachar", "abrir"};
    static final float MIN_SCALE = 0.4f, MAX_SCALE = 2.2f;
    static final String PREFS = "hud_layout";

    private final El[] els = {
            new El("status", "Status", "hud/painel_status.png", 0.24f, 0f),
            new El("itens", "Itens", "hud/barra_itens.png", 0.17f, 0f),
            new El("joystick", "Joystick", "hud/joystick_base.png", 0.40f, 0f),
            new El("mochila", "Mochila", "hud/botao_mochila.png", 0.10f, 0f),
            new El("config", "Config", "hud/botao_config.png", 0.11f, 0f),
            new El("correr", "Correr", "hud/botao_correr.png", 0.17f, 0f),
            new El("pular", "Pular", "hud/botao_pular.png", 0.15f, 0f),
            new El("agachar", "Agachar", "hud/botao_agachar.png", 0.12f, 0f),
            new El("abrir", "Porteira", null, 0.10f, 4.6f),
    };
    private Texture knobTex;

    // Estado que o Main preenche a cada quadro
    boolean editing = false;
    boolean runOn = false;
    boolean jumpDown = false;
    boolean promptVisible = false;   // botão da porteira aparece
    String promptText = "ABRIR PORTEIRA";
    float joyX = 0f, joyY = 0f;      // -1..1 (posição do polegar no joystick)

    // Edição
    private String selected = null;
    private int dragPointer = -1;
    private float grabX, grabY;
    private final GlyphLayout layout = new GlyphLayout();
    private static final String[] EDIT_BUTTONS = {"-", "+", "Salvar", "Restaurar", "Fechar"};
    private final float[][] editRects = new float[EDIT_BUTTONS.length][4];

    public void create() {
        for (El e : els) {
            if (e.file != null) {
                e.tex = new Texture(Gdx.files.internal(e.file));
                e.tex.setFilter(Texture.TextureFilter.Linear, Texture.TextureFilter.Linear);
            }
        }
        knobTex = new Texture(Gdx.files.internal("hud/joystick_knob.png"));
        knobTex.setFilter(Texture.TextureFilter.Linear, Texture.TextureFilter.Linear);
        resetLayout(false);
        load();
    }

    // ---------- Tamanho e posição ----------

    /** Largura e altura em pixels do elemento, com a escala do jogador. */
    float width(El e) {
        return height(e) * e.aspect();
    }

    float height(El e) {
        return e.hf * Gdx.graphics.getHeight() * e.scale;
    }

    float centerX(El e) { return e.fx * Gdx.graphics.getWidth(); }
    float centerY(El e) { return e.fy * Gdx.graphics.getHeight(); }

    /** Retângulo (x, y, w, h) em pixels, origem embaixo à esquerda. */
    float[] rect(El e) {
        float w = width(e), h = height(e);
        return new float[]{centerX(e) - w / 2f, centerY(e) - h / 2f, w, h};
    }

    El get(String id) {
        for (El e : els) if (e.id.equals(id)) return e;
        return null;
    }

    /** Posições padrão (canto superior esquerdo, direito e inferior), sem escala do jogador. */
    void resetLayout(boolean onlyDefaultsOfMissing) {
        float W = Gdx.graphics.getWidth(), H = Gdx.graphics.getHeight(), m = 0.02f * H;
        for (El e : els) e.scale = 1f;
        El config = get("config"), status = get("status"), mochila = get("mochila"), itens = get("itens");
        El joy = get("joystick"), pular = get("pular"), agachar = get("agachar"), correr = get("correr"), abrir = get("abrir");

        float wC = width(config), hC = height(config);
        place(config, m + wC / 2f, H - m - hC / 2f, W, H);
        float wS = width(status), hS = height(status);
        place(status, m + wC + m + wS / 2f, H - m - hS / 2f, W, H);
        float wM = width(mochila), hM = height(mochila);
        place(mochila, m + wM / 2f, H - m - hC - m - hM / 2f, W, H);
        float wI = width(itens), hI = height(itens);
        place(itens, W - m - wI / 2f, H - m - hI / 2f, W, H);
        float hJ = height(joy), wJ = width(joy);
        place(joy, m + wJ / 2f, m + hJ / 2f, W, H);
        float wP = width(pular), hP = height(pular);
        place(pular, W - m - wP / 2f, m + hP / 2f, W, H);
        float wA = width(agachar), hA = height(agachar);
        place(agachar, W - m - wA / 2f, m + hP + m + hA / 2f, W, H);
        float wR = width(correr), hR = height(correr);
        place(correr, W - m - wP - m - wR / 2f, m + hR / 2f, W, H);
        place(abrir, W / 2f, 0.22f * H, W, H);
    }

    private void place(El e, float cx, float cy, float W, float H) {
        e.fx = MathUtils.clamp(cx / W, 0f, 1f);
        e.fy = MathUtils.clamp(cy / H, 0f, 1f);
    }

    // ---------- Persistência ----------

    private void load() {
        try {
            Preferences p = Gdx.app.getPreferences(PREFS);
            for (El e : els) {
                float x = p.getFloat(e.id + "_x", Float.NaN);
                float y = p.getFloat(e.id + "_y", Float.NaN);
                float s = p.getFloat(e.id + "_s", Float.NaN);
                if (!Float.isNaN(x) && !Float.isNaN(y)) { e.fx = x; e.fy = y; }
                if (!Float.isNaN(s)) e.scale = MathUtils.clamp(s, MIN_SCALE, MAX_SCALE);
            }
        } catch (Throwable t) {
            // sem preferências salvas: fica com o layout padrão
        }
    }

    private void save() {
        try {
            Preferences p = Gdx.app.getPreferences(PREFS);
            for (El e : els) {
                p.putFloat(e.id + "_x", e.fx);
                p.putFloat(e.id + "_y", e.fy);
                p.putFloat(e.id + "_s", e.scale);
            }
            p.flush();
        } catch (Throwable t) {
            // não conseguiu salvar: o layout continua valendo até fechar o jogo
        }
    }

    // ---------- Toque no jogo (fora da edição) ----------

    /** Elemento tocado, ou null. Considera só os elementos visíveis agora. */
    El hitTest(float x, float y) {
        for (int i = ORDER.length - 1; i >= 0; i--) {
            El e = get(ORDER[i]);
            if (e.id.equals("abrir") && !promptVisible) continue;
            float[] r = rect(e);
            if (x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3]) return e;
        }
        return null;
    }

    // ---------- Toque na edição ----------

    /** Dedo novo na tela durante a edição. */
    void editPress(int pointer, float x, float y) {
        for (int i = 0; i < EDIT_BUTTONS.length; i++) {
            float[] r = editRects[i];
            if (x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3]) {
                editButton(i);
                return;
            }
        }
        El e = hitTest(x, y);
        if (e != null) {
            selected = e.id;
            dragPointer = pointer;
            grabX = centerX(e) - x;
            grabY = centerY(e) - y;
        } else {
            selected = null;
        }
    }

    void editDrag(int pointer, float x, float y) {
        if (pointer != dragPointer || selected == null) return;
        El e = get(selected);
        float W = Gdx.graphics.getWidth(), H = Gdx.graphics.getHeight();
        float cx = MathUtils.clamp(x + grabX, 0f, W);
        float cy = MathUtils.clamp(y + grabY, 0f, H);
        e.fx = cx / W;
        e.fy = cy / H;
    }

    void editRelease(int pointer) {
        if (pointer == dragPointer) dragPointer = -1;
    }

    private void editButton(int i) {
        switch (EDIT_BUTTONS[i]) {
            case "-":
                if (selected != null) { El e = get(selected); e.scale = Math.max(MIN_SCALE, e.scale * 0.9f); }
                break;
            case "+":
                if (selected != null) { El e = get(selected); e.scale = Math.min(MAX_SCALE, e.scale * 1.1f); }
                break;
            case "Salvar":
                save();
                break;
            case "Restaurar":
                if (selected != null) resetOne(selected);
                else resetLayout(false);
                break;
            case "Fechar":
                save();
                editing = false;
                selected = null;
                dragPointer = -1;
                break;
            default:
                break;
        }
    }

    /** Volta só este elemento ao padrão; os outros continuam como o jogador deixou. */
    private void resetOne(String id) {
        float[][] saved = new float[els.length][3];
        for (int k = 0; k < els.length; k++) saved[k] = new float[]{els[k].fx, els[k].fy, els[k].scale};
        resetLayout(false);
        El def = get(id);
        float dfx = def.fx, dfy = def.fy;
        for (int k = 0; k < els.length; k++) {
            els[k].fx = saved[k][0];
            els[k].fy = saved[k][1];
            els[k].scale = saved[k][2];
        }
        El e = get(id);
        e.fx = dfx;
        e.fy = dfy;
        e.scale = 1f;
    }

    // ---------- Desenho ----------

    /** Desenha o HUD normal ou o modo de edição. */
    void draw(SpriteBatch batch, ShapeRenderer shapes, BitmapFont font) {
        int W = Gdx.graphics.getWidth(), H = Gdx.graphics.getHeight();
        computeEditRects(W, H);

        // Fundo do botão "abrir porteira" (couro escuro com borda)
        if (promptVisible || editing) {
            float[] r = rect(get("abrir"));
            shapes.begin(ShapeRenderer.ShapeType.Filled);
            shapes.setColor(0.42f, 0.26f, 0.13f, 0.92f);
            shapes.rect(r[0], r[1], r[2], r[3]);
            shapes.end();
            shapes.begin(ShapeRenderer.ShapeType.Line);
            shapes.setColor(0.95f, 0.8f, 0.45f, 1f);
            shapes.rect(r[0], r[1], r[2], r[3]);
            shapes.end();
        }

        batch.begin();
        for (El e : els) {
            if (e.id.equals("abrir") && !promptVisible && !editing) continue;
            float[] r = rect(e);
            float a = 1f;
            float tint = 1f;
            if (e.id.equals("correr") && runOn) tint = 1.25f;
            if (e.id.equals("pular") && jumpDown) tint = 1.25f;
            batch.setColor(tint, tint, tint, a);
            if (e.tex != null) {
                batch.draw(e.tex, r[0], r[1], r[2], r[3]);
            }
        }
        // Bolinha do joystick: acompanha o polegar
        El joy = get("joystick");
        float[] jr = rect(joy);
        float knobSize = jr[2] * 0.5f;
        float kx = centerX(joy) + joyX * jr[2] * 0.3f;
        float ky = centerY(joy) + joyY * jr[3] * 0.3f;
        batch.setColor(1f, 1f, 1f, 0.95f);
        batch.draw(knobTex, kx - knobSize / 2f, ky - knobSize / 2f, knobSize, knobSize);
        batch.setColor(1f, 1f, 1f, 1f);

        // Botão "abrir porteira": desenhado em código, com texto
        if (promptVisible || editing) {
            El abrir = get("abrir");
            float[] r = rect(abrir);
            font.setColor(0.98f, 0.9f, 0.7f, 1f);
            layout.setText(font, promptText);
            font.draw(batch, promptText, r[0] + (r[2] - layout.width) / 2f, r[1] + (r[3] + layout.height) / 2f);
        }
        batch.end();

        if (editing) {
            drawEdit(batch, shapes, font, W, H);
        }
    }

    private void drawEdit(SpriteBatch batch, ShapeRenderer shapes, BitmapFont font, int W, int H) {
        // Escurece o fundo e marca cada elemento
        shapes.begin(ShapeRenderer.ShapeType.Filled);
        shapes.setColor(0f, 0f, 0f, 0.35f);
        shapes.rect(0, 0, W, H);
        shapes.end();

        shapes.begin(ShapeRenderer.ShapeType.Line);
        for (El e : els) {
            if (e.id.equals("abrir")) { /* o botão do porteira também pode ser movido */ }
            float[] r = rect(e);
            boolean sel = e.id.equals(selected);
            shapes.setColor(sel ? 1f : 0.2f, sel ? 0.85f : 0.9f, sel ? 0.1f : 1f, 1f);
            shapes.rect(r[0], r[1], r[2], r[3]);
            if (sel) shapes.rect(r[0] - 2, r[1] - 2, r[2] + 4, r[3] + 4);
        }
        shapes.end();

        // Painel de controles na parte de baixo
        shapes.begin(ShapeRenderer.ShapeType.Filled);
        for (int i = 0; i < EDIT_BUTTONS.length; i++) {
            float[] r = editRects[i];
            shapes.setColor(0.42f, 0.26f, 0.13f, 0.95f);
            shapes.rect(r[0], r[1], r[2], r[3]);
        }
        shapes.end();

        batch.begin();
        for (El e : els) {
            float[] r = rect(e);
            font.setColor(e.id.equals(selected) ? 1f : 1f, e.id.equals(selected) ? 0.85f : 1f, e.id.equals(selected) ? 0.2f : 1f, 1f);
            layout.setText(font, e.label);
            font.draw(batch, e.label, r[0] + (r[2] - layout.width) / 2f, r[1] + r[3] + layout.height + 4f);
        }
        for (int i = 0; i < EDIT_BUTTONS.length; i++) {
            float[] r = editRects[i];
            layout.setText(font, EDIT_BUTTONS[i]);
            font.setColor(1f, 0.95f, 0.8f, 1f);
            font.draw(batch, EDIT_BUTTONS[i], r[0] + (r[2] - layout.width) / 2f, r[1] + (r[3] + layout.height) / 2f);
        }
        if (selected != null) {
            El e = get(selected);
            String info = e.label + "  -  tamanho " + Math.round(e.scale * 100f) + "%";
            layout.setText(font, info);
            font.setColor(1f, 0.9f, 0.5f, 1f);
            font.draw(batch, info, (W - layout.width) / 2f, editRects[0][1] + editRects[0][3] + 26f);
        } else {
            layout.setText(font, "Toque num elemento e arraste. Use + e - para mudar o tamanho.");
            font.setColor(1f, 0.95f, 0.8f, 1f);
            font.draw(batch, "Toque num elemento e arraste. Use + e - para mudar o tamanho.", (W - layout.width) / 2f,
                    editRects[0][1] + editRects[0][3] + 26f);
        }
        batch.end();
    }

    /** Posição dos botões da edição: uma fileira centralizada embaixo. */
    private void computeEditRects(int W, int H) {
        float bh = 0.09f * H;
        float gap = 0.015f * H;
        float total = 0f;
        float[] widths = new float[EDIT_BUTTONS.length];
        for (int i = 0; i < EDIT_BUTTONS.length; i++) {
            widths[i] = (EDIT_BUTTONS[i].length() <= 1) ? 0.08f * H : 0.22f * H;
            total += widths[i];
        }
        total += gap * (EDIT_BUTTONS.length - 1);
        float x = (W - total) / 2f;
        float y = 0.03f * H;
        for (int i = 0; i < EDIT_BUTTONS.length; i++) {
            editRects[i][0] = x;
            editRects[i][1] = y;
            editRects[i][2] = widths[i];
            editRects[i][3] = bh;
            x += widths[i] + gap;
        }
    }

    public void dispose() {
        for (El e : els) if (e.tex != null) e.tex.dispose();
        if (knobTex != null) knobTex.dispose();
    }
}
