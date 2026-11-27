package com.exemplo.jogo3d;

import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.graphics.g3d.Model;
import com.badlogic.gdx.graphics.g3d.ModelInstance;
import com.badlogic.gdx.graphics.g3d.loader.G3dModelLoader;
import com.badlogic.gdx.math.MathUtils;
import com.badlogic.gdx.math.Vector3;
import com.badlogic.gdx.utils.Array;
import com.badlogic.gdx.utils.JsonReader;

import java.util.Random;

/**
 * Armas do battle royale: seis fuzis espalhados no chão (dentro das casas, na frente das casas da
 * cidade e soltos pelo mapa). Perto de uma, dá para pegar; a arma fica na mão direita do personagem.
 */
final class Weapons {
    static final String[] NAMES = {"AKM", "AUG", "GROZA", "M16A4", "M416", "SCAR-L", "AWM", "M1014", "MAGNUM 357"};
    private static final String[] FILES = {"akm", "aug", "groza", "m16a4", "m416", "scarl", "awm", "m1014", "magnum357"};
    private static final float PICK_RANGE = 1.8f;

    /** Arma no chão. */
    static final class Pickup {
        final int type;
        final ModelInstance inst;
        final Vector3 pos = new Vector3();

        Pickup(int type, ModelInstance inst, float x, float y, float z) {
            this.type = type;
            this.inst = inst;
            pos.set(x, y, z);
        }
    }

    private final Model[] models = new Model[FILES.length];
    final Array<Pickup> ground = new Array<>();
    private int heldType = -1;
    static final int PISTOL_SLOT = 2;      // slots 0 e 1 = fuzis; slot 2 = pistola/revólver
    private final int[] slot = {-1, -1, -1};   // três armas levadas (tipo, ou -1 = vazio)
    private int activeSlot = 0;            // a que está na mão
    private boolean holstered = false;     // guardada pelo punho (sem arma na mão)

    /** Pistola e revólver vão para o slot de pistola; o resto, para os fuzis. */
    static boolean isPistol(int type) {
        WeaponConfig.Category c = WeaponConfig.BY_TYPE[type].category;
        return c == WeaponConfig.Category.PISTOLA || c == WeaponConfig.Category.REVOLVER;
    }
    private ModelInstance held;
    private final Vector3 hand = new Vector3();
    // Munição de cada arma (fica com a arma ao trocar)
    private final int[] mag = new int[FILES.length], reserve = new int[FILES.length];
    boolean infinite = false;    // munição infinita (modo treinamento)
    private float armT = -1f;    // tempo desde que o botão foi apertado (-1 = solto); atraso do primeiro tiro
    float reloadT = 0f;          // > 0: recarregando (s restantes)
    private boolean spent = false;     // luneta: já atirou (tem de sair da mira para recarregar o tambor)
    private boolean scopeAim = false;  // mirando na luneta agora
    private float cooldown = 0f;
    final Vector3 muzzle = new Vector3();   // ponta do cano no mundo (segue o recuo e a animação)
    final Vector3 barrel = new Vector3(0f, 0f, 1f);   // direção do cano
    boolean ads = false;         // mirando (o cano fica reto)
    float aimElev = 0f;          // elevação da mira (rad, + para cima): o cano acompanha
    // Modos de disparo
    private int burstLeft = 0;
    private float burstT = 0f;
    // Animação da arma
    private float kickPos = 0f;      // recuo visual (m), volta em ~0,1 s
    private float equipT = 0f, equipDur = 0.5f;
    private float emptyT = 0f;
    private float swayT = 0f;
    // Eventos para o áudio e os efeitos (consumidos pelo ShootingSystem)
    static final int EV_EQUIP = 1, EV_RELOAD = 2, EV_RELOAD_DONE = 4, EV_EMPTY = 8;
    int events = 0;
    private final Vector3[] muzzleLocal = new Vector3[FILES.length];
    private final Vector3 tmpV = new Vector3();

    Weapons() {
        for (int i = 0; i < FILES.length; i++) {
            models[i] = ModelIO.load("models/armas/" + FILES[i] + ".g3dj");
            mag[i] = WeaponConfig.BY_TYPE[i].magazine;
            reserve[i] = WeaponConfig.BY_TYPE[i].reserve;
            // Ponta do cano: o fim do modelo (+z), na altura do cano (acima do punho)
            com.badlogic.gdx.math.collision.BoundingBox bb = new com.badlogic.gdx.math.collision.BoundingBox();
            models[i].calculateBoundingBox(bb);
            muzzleLocal[i] = new Vector3(0f, Math.min(0.055f, bb.max.y * 0.5f), bb.max.z);
        }
    }

    Model[] models() { return models; }

    private final com.badlogic.gdx.graphics.glutils.FrameBuffer[] iconFbo = new com.badlogic.gdx.graphics.glutils.FrameBuffer[FILES.length];
    final com.badlogic.gdx.graphics.g2d.TextureRegion[] icons = new com.badlogic.gdx.graphics.g2d.TextureRegion[FILES.length];

    /** Ícone de cada arma (de lado, cano para a direita) para o painel de munição. */
    void renderIcons(com.badlogic.gdx.graphics.g3d.ModelBatch batch, com.badlogic.gdx.graphics.g3d.Environment env) {
        for (int i = 0; i < FILES.length; i++) {
            if (iconFbo[i] == null)
                iconFbo[i] = new com.badlogic.gdx.graphics.glutils.FrameBuffer(com.badlogic.gdx.graphics.Pixmap.Format.RGBA8888, 512, 256, true);   // ícones em alta resolução
            icons[i] = Items.renderIcon(batch, env, models[i], iconFbo[i], 90f);
            if (iconsHud[i] == null) iconsHud[i] = silhueta(iconFbo[i], icons[i]);
        }
    }

    /**
     * Silhueta branca do ícone da arma (mesma forma, sem sombreamento) para o painel do HUD. Se não der para
     * ler o framebuffer, usa o ícone normal.
     */
    private com.badlogic.gdx.graphics.g2d.TextureRegion silhueta(com.badlogic.gdx.graphics.glutils.FrameBuffer fbo,
                                                                 com.badlogic.gdx.graphics.g2d.TextureRegion normal) {
        try {
            int w = fbo.getWidth(), h = fbo.getHeight();
            fbo.begin();
            com.badlogic.gdx.graphics.Pixmap pm = com.badlogic.gdx.utils.ScreenUtils.getFrameBufferPixmap(0, 0, w, h);
            fbo.end();
            for (int y = 0; y < h; y++) {
                for (int x = 0; x < w; x++) {
                    int a = pm.getPixel(x, y) & 0xff;
                    int alpha = Math.min(255, (int) (a * 1.35f));   // borda um pouco mais firme
                    pm.drawPixel(x, y, 0xFFFFFF00 | alpha);
                }
            }
            com.badlogic.gdx.graphics.Texture t = new com.badlogic.gdx.graphics.Texture(pm, true);   // com mipmap: reduz sem serrilhar
            t.setFilter(com.badlogic.gdx.graphics.Texture.TextureFilter.MipMapLinearLinear,
                    com.badlogic.gdx.graphics.Texture.TextureFilter.Linear);
            pm.dispose();
            com.badlogic.gdx.graphics.g2d.TextureRegion r = new com.badlogic.gdx.graphics.g2d.TextureRegion(t);
            r.flip(false, true);
            return r;
        } catch (RuntimeException e) {
            return normal;
        }
    }

    com.badlogic.gdx.graphics.g2d.TextureRegion icon() { return heldType >= 0 ? icons[heldType] : null; }

    // Painel de armas: as duas armas levadas e o punho
    com.badlogic.gdx.graphics.g2d.TextureRegion iconOf(int type) { return type >= 0 ? icons[type] : null; }
    int magOf(int type) { return type >= 0 ? mag[type] : 0; }
    int reserveOf(int type) { return type >= 0 ? reserve[type] : 0; }
    int slotType(int s) { return slot[s]; }

    // ---- Inventário: slots fixos (1 e 2 = fuzis / grande porte; 3 = pistola) ----
    static final int SLOT_FUZIL_1 = 0, SLOT_FUZIL_2 = 1, SLOT_PISTOLA = 2;

    /** Antes de mudar a mão: o item que estava nela vira a última seleção válida (troca rápida). */
    private void registrarSaida(int novo) {
        int atual = (heldType < 0 || holstered) ? ITEM_PUNHO : activeSlot;
        if (atual != novo) ultimoItem = atual;
    }

    // ---- Ordem do painel de armas: 1 item em cima (na mão) e 3 embaixo; cada item aparece uma vez ----
    static final int ITEM_PUNHO = 3;            // código do punho no painel (armas: 0..2 = slot)
    private final int[] baixo = {-1, -1, -1};  // o que está em cada caixa de baixo (-1 = vazia)

    /** Item em cima: a arma na mão, ou o punho quando está sem arma. */
    private int itemTopo() { return (heldType < 0 || holstered) ? ITEM_PUNHO : activeSlot; }

    private boolean itemExiste(int c) { return c == ITEM_PUNHO || (c >= 0 && c < slot.length && slot[c] >= 0); }

    /**
     * Ordem atual do painel: [em cima, caixa 0, caixa 1, caixa 2]. Itens sem arma somem; o que sobe para a mão
     * deixa a caixa e o que estava na mão ocupa essa caixa. Nunca repete um item.
     */
    int[] ordemHud() {
        int top = itemTopo();
        // Referência da troca rápida: sempre que a mão muda (toque, punho, pegar arma), o item que estava na mão
        // passa a ser a última seleção válida
        for (int p = 0; p < baixo.length; p++) {
            int c = baixo[p];
            boolean repetido = false;
            for (int q = 0; q < p; q++) if (baixo[q] == c) repetido = true;
            if (c < 0 || c == top || !itemExiste(c) || repetido) baixo[p] = -1;
        }
        for (int c = 0; c <= ITEM_PUNHO; c++) {
            if (c == top || !itemExiste(c) || noBaixo(c)) continue;
            for (int p = 0; p < baixo.length; p++) if (baixo[p] < 0) { baixo[p] = c; break; }
        }
        return new int[]{top, baixo[0], baixo[1], baixo[2]};
    }

    private boolean noBaixo(int c) {
        for (int b : baixo) if (b == c) return true;
        return false;
    }

    private int ultimoItem = -1;    // última seleção válida antes da atual: alvo do botão de troca rápida

    /**
     * Troca rápida: alterna entre a arma da mão e a última usada (ex.: fuzil → punho → fuzil → punho).
     * Não recarrega nem mexe na munição: só troca a arma na mão, como um toque na caixa dela.
     */
    void trocaRapida(Character ch) {
        int[] o = ordemHud();
        int alvo = ultimoItem;
        if (alvo < 0 || alvo == o[0] || !itemExiste(alvo)) return;
        for (int p = 0; p < baixo.length; p++) {
            if (baixo[p] == alvo) {
                tocarBaixo(p, ch);
                return;
            }
        }
    }

    /** Item da última seleção válida (para o HUD e para os testes); -1 se não há. */
    int ultimoItem() { return ultimoItem; }

    /** Toque numa caixa de baixo: o item sobe para a mão e o que estava na mão ocupa a caixa. */
    void tocarBaixo(int p, Character ch) {
        ordemHud();
        if (p < 0 || p >= baixo.length || baixo[p] < 0) return;
        int c = baixo[p];
        baixo[p] = itemTopo();          // o item de cima desce para a mesma caixa
        if (c == ITEM_PUNHO) toggleHold(ch);
        else equipSlot(c, ch);
        ordemHud();
    }

    // Silhuetas dos ícones para o painel (alta resolução, sem sombreamento)
    private final com.badlogic.gdx.graphics.g2d.TextureRegion[] iconsHud = new com.badlogic.gdx.graphics.g2d.TextureRegion[FILES.length];
    com.badlogic.gdx.graphics.g2d.TextureRegion iconHud(int type) { return type >= 0 ? iconsHud[type] : null; }
    int activeSlotIndex() { return activeSlot; }
    int heldType() { return heldType; }
    int heldMag() { return magOf(heldType); }
    int heldReserve() { return reserveOf(heldType); }
    int heldMagazine() { return heldType >= 0 ? WeaponConfig.BY_TYPE[heldType].magazine : 1; }

    /** Começa com uma arma na mão (modo treinamento). */
    void giveStart(int type, Character ch) {
        for (int i = 0; i < slot.length; i++) slot[i] = -1;
        int s = isPistol(type) ? PISTOL_SLOT : 0;
        slot[s] = type;
        activeSlot = s;
        equipNew(type, ch);
    }

    /** Toque na caixa de uma arma (fuzil ou pistola): leva essa arma para a mão. */
    void equipSlot(int s, Character ch) {
        if (s < 0 || s >= slot.length || slot[s] < 0) return;
        if (!holstered && s == activeSlot) return;
        registrarSaida(s);
        activeSlot = s;
        equipNew(slot[s], ch);
    }

    /** Toque no punho: guarda a arma (sai da mão, fica só no HUD) e fica sem arma até tocar numa caixa. */
    void toggleHold(Character ch) {
        if (heldType < 0 || holstered) return;
        registrarSaida(ITEM_PUNHO);
        if (held != null) ch.instances.removeValue(held, true);
        held = null;
        holstered = true;
        reloadT = 0f;   // guardar cancela a recarga
        burstLeft = 0;
        ch.setArmed(false);
    }

    /** Configuração da arma na mão (null se desarmado). */
    WeaponConfig config() { return heldType >= 0 ? WeaponConfig.BY_TYPE[heldType] : null; }

    int ammo() { return heldType >= 0 ? mag[heldType] : 0; }

    int reserveAmmo() { return heldType >= 0 ? reserve[heldType] : 0; }

    boolean reloading() { return reloadT > 0f; }

    float reloadProgress() {
        WeaponConfig c = config();
        return c == null || reloadT <= 0f ? 0f : 1f - reloadT / c.reloadTime;
    }

    /** Luneta: ao largar a mira depois de um tiro, recarrega o tambor (0,5 s); só então mira e atira de novo. */
    void scopeAimUpdate(boolean aimed) {
        scopeAim = aimed;
        WeaponConfig c = config();
        if (c != null && c.scope && spent && !aimed) {
            spent = false;
            startReload();
        }
    }

    /** Começa a recarregar (se der). */
    boolean startReload() {
        WeaponConfig c = config();
        if (c == null || reloadT > 0f || mag[heldType] >= c.magazine || reserve[heldType] <= 0) return false;
        reloadT = c.reloadTime;
        burstLeft = 0;
        events |= EV_RELOAD;
        return true;
    }

    /** Tempo: cadência e recarga. */
    void tick(float dt) {
        WeaponConfig cc = config();
        if (cc != null && cc.cadenciaExata) cooldown = Math.max(-cc.fireInterval, cooldown - dt);   // deixa o excedente
        else cooldown = Math.max(0f, cooldown - dt);
        if (armT >= 0f) armT += dt;
        if (reloadT > 0f) {
            reloadT -= dt;
            if (reloadT <= 0f && heldType >= 0) {
                reloadT = 0f;
                int need = WeaponConfig.BY_TYPE[heldType].magazine - mag[heldType];
                int take = Math.min(need, reserve[heldType]);
                mag[heldType] += take;
                reserve[heldType] -= take;
                events |= EV_RELOAD_DONE;
            }
        }
        if (burstT > 0f) burstT -= dt;
        if (awmPress) awmHoldT += dt;
        if (emptyT > 0f) emptyT -= dt;
        if (equipT > 0f) equipT -= dt;
        kickPos -= kickPos * Math.min(1f, dt * 16f);   // volta ao lugar
        swayT += dt;
    }

    /**
     * Tenta disparar, respeitando o modo da arma e o tempo entre tiros (nunca um por quadro):
     * AUTO continua enquanto o botão estiver pressionado; SEMI um por toque; RAJADA dispara a
     * quantidade configurada por toque (os tiros seguintes saem sozinhos, no ritmo da rajada).
     * held = dedo no botão; pressed = acabou de apertar. Devolve 1 se disparou, -1 se o pente está
     * vazio (clique) e 0 se não.
     */
    int tryFire(boolean held, boolean pressed) {
        WeaponConfig c = config();
        if (c != null && !(c.mode == WeaponConfig.FireMode.AUTO ? held : pressed)) armT = -1f;   // soltou: zera o atraso
        if (c != null && c.scope) return tryFireAwm(c, held, pressed);   // AWM: regra própria (luneta e toque)
        if (c == null || reloadT > 0f || equipT > 0f) return 0;
        // Continuação da rajada (não precisa do botão)
        if (burstLeft > 0) {
            if (burstT > 0f) return 0;
            if (mag[heldType] <= 0) { burstLeft = 0; cooldown = c.fireInterval; return 0; }
            if (!infinite) mag[heldType]--;   // treino: munição infinita
            burstLeft--;
            burstT = c.burstGap;
            if (burstLeft == 0) cooldown = c.fireInterval;
            kickPos = Math.min(kickPos + c.kick, c.kick * 2f);
            return 1;
        }
        if (cooldown > 0f) return 0;
        boolean wants = c.mode == WeaponConfig.FireMode.AUTO ? held : pressed;
        if (!wants) { armT = -1f; return 0; }   // soltou o botão: o próximo aperto começa do zero
        if (c.firstShotDelay > 0f) {
            if (armT < 0f) { armT = 0f; return 0; }        // acabou de apertar: começa a contar
            if (armT < c.firstShotDelay) return 0;         // ainda no atraso do primeiro tiro
        }
        if (mag[heldType] <= 0) {
            cooldown = 0.3f;
            emptyT = 0.25f;
            events |= EV_EMPTY;
            if (!c.scope) startReload();   // pente vazio: clique e começa a recarregar sozinho (luneta: ao largar a mira)
            return -1;
        }
        if (!infinite) mag[heldType]--;   // treino: munição infinita
        cooldown = proximoIntervalo(c);
        kickPos = Math.min(kickPos + c.kick, c.kick * 2f);
        if (c.mode == WeaponConfig.FireMode.BURST) {
            burstLeft = Math.min(c.burstCount - 1, mag[heldType]);
            burstT = c.burstGap;
            if (burstLeft == 0) cooldown = c.fireInterval;
            else cooldown = 0f;   // enquanto durar a rajada o controle é do burstLeft
        }
        return 1;
    }

    /** AWM (luneta), regra própria: segurar só abre a luneta, sem disparar; toque rápido (solta em até 0,25 s)
     *  dispara um tiro e o tambor recarrega. Nunca dispara enquanto o botão segue apertado. */
    static final float AWM_TAP_MAX = 0.25f;
    private boolean awmPress = false;   // botão apertado desde o aperto (até soltar)
    private float awmHoldT = 0f;        // tempo segurando o botão (s)

    private int tryFireAwm(WeaponConfig c, boolean held, boolean pressed) {
        if (pressed) { awmPress = true; awmHoldT = 0f; }
        if (!awmPress || held) return 0;
        awmPress = false;                                   // soltou
        if (awmHoldT > AWM_TAP_MAX) return 0;               // segurou: a luneta fecha sem tiro
        if (reloadT > 0f || equipT > 0f || cooldown > 0f) return 0;
        if (mag[heldType] <= 0) {
            cooldown = 0.3f;
            emptyT = 0.25f;
            events |= EV_EMPTY;
            startReload();
            return -1;
        }
        if (!infinite) mag[heldType]--;   // treino: munição infinita
        cooldown = c.fireInterval;
        kickPos = Math.min(kickPos + c.kick, c.kick * 2f);
        startReload();                    // o tambor recarrega (0,5 s) depois de cada tiro
        return 1;
    }

    /**
     * Tempo até o próximo tiro. Armas comuns: o intervalo inteiro. Cadência exata: cooldown (<= 0) é o quanto o
     * tiro atrasou além do ponto previsto; o próximo tiro sai no ponto previsto seguinte, sem acumular atraso.
     * Atraso grande (pausa, quadro longo) não gera rajada de tiros atrasados: reinicia o ritmo.
     */
    private float proximoIntervalo(WeaponConfig c) {
        if (!c.cadenciaExata) return c.fireInterval;
        if (cooldown < -c.fireInterval * 0.5f) return c.fireInterval;
        return c.fireInterval + cooldown;
    }

    /** Recuo visual atual da arma (m). */
    float kickOffset() { return kickPos; }

    /** Modo de disparo da arma na mão (para o painel). */
    String modeLabel() { WeaponConfig c = config(); return c == null ? "" : c.mode.label; }

    /** Tempo de sacar restante (0 = pronta). */
    boolean drawing() { return equipT > 0f; }

    /** Quanto do sacar ainda falta (1 = começando a sacar, 0 = pronta). */
    float drawAmount() { return equipT > 0f ? equipT / equipDur : 0f; }

    /** Lê e zera os eventos (som de trocar, recarregar, vazio). */
    int takeEvents() { int e = events; events = 0; return e; }

    /** Larga tudo (ao morrer): volta desarmado. */
    void unequip(Character ch) {
        if (held != null) ch.instances.removeValue(held, true);
        held = null;
        heldType = -1;
        for (int i = 0; i < slot.length; i++) slot[i] = -1;
        activeSlot = 0;
        holstered = false;
        reloadT = 0f;
        burstLeft = 0;
        ch.setArmed(false);
    }

    boolean armed() { return heldType >= 0 && !holstered; }

    String heldName() { return heldType >= 0 ? NAMES[heldType] : ""; }

    /** Espalha as armas: dentro das casas de taipa, na frente das casas da cidade e soltas pelo mapa. */
    void scatter(World w, Random rnd) {
        // Dentro das casas de taipa (roça e cidade): canto livre do cômodo, longe do fogão e da rede
        for (int i = 0; i < w.houses.size; i++) {
            Vector3 p = new Vector3(-2.4f, 0f, -1.5f).mul(w.houses.get(i).t);
            drop(w, rnd.nextInt(FILES.length), p.x, p.z, rnd);
        }
        // Na calçada, na frente das casas da cidade feitas em código (e da capela)
        for (int i = 0; i < w.boxes.size; i++) {
            World.Box b = w.boxes.get(i);
            if (b.hx < 2f) continue;   // torre do sino
            Vector3 p = new Vector3(b.hx * 0.45f, 0f, b.hz + 1.0f).mul(b.t);
            drop(w, rnd.nextInt(FILES.length), p.x, p.z, rnd);
        }
        // Soltas pelo mapa
        for (int i = 0; i < 48; i++) {
            float[] p = w.openSpot(rnd);
            drop(w, rnd.nextInt(FILES.length), p[0], p[1], rnd);
        }
    }

    /** Deixa uma arma no chão em (x, z) (um bot morreu com ela). */
    void dropAt(World w, WeaponConfig cfg, float x, float z) {
        int type = -1;
        for (int i = 0; i < WeaponConfig.BY_TYPE.length; i++) if (WeaponConfig.BY_TYPE[i] == cfg) type = i;
        if (type >= 0) drop(w, type, x, z, new Random());
    }

    /** Põe uma arma deitada de lado no chão. */
    private void drop(World w, int type, float x, float z, Random rnd) {
        float y = w.groundAt(x, z);
        ModelInstance mi = new ModelInstance(models[type]);
        mi.transform.setToTranslation(x, y + 0.04f, z).rotate(Vector3.Y, rnd.nextFloat() * 360f).rotate(Vector3.Z, 90f);
        w.instances.add(mi);
        ground.add(new Pickup(type, mi, x, y, z));
    }

    /** Arma no chão ao alcance (a mais perto), ou null. */
    Pickup nearest(Vector3 p) {
        Pickup best = null;
        float bd = PICK_RANGE * PICK_RANGE;
        for (int i = 0; i < ground.size; i++) {
            Pickup g = ground.get(i);
            float dx = g.pos.x - p.x, dz = g.pos.z - p.z, dy = g.pos.y - p.y;
            float d = dx * dx + dz * dz;
            if (d < bd && Math.abs(dy) < 1.5f) {
                bd = d;
                best = g;
            }
        }
        return best;
    }

    /** Pistola vai para o slot 3 (a antiga cai no chão); fuzil e arma de grande porte, para o slot 1 ou 2 livre. */
    static final int COLETA_NAO = 0, COLETA_OK = 1, COLETA_ESCOLHA = 2;
    private Pickup pendente = null;   // arma de grande porte esperando a escolha de qual fuzil substituir

    /**
     * Coleta de uma arma do chão. Mesma arma não entra duas vezes. Pistola só no slot 3. Fuzil no slot 1 ou 2 livre;
     * com os dois cheios, devolve COLETA_ESCOLHA e a arma fica pendente até o jogador escolher o que substituir.
     */
    int coletar(Pickup g, World w, Character ch, Player player) {
        for (int s : slot) if (s == g.type) return COLETA_NAO;
        if (isPistol(g.type)) {
            tirarDoChao(g, w);
            if (slot[SLOT_PISTOLA] >= 0) dropNoJogador(w, player, slot[SLOT_PISTOLA]);
            colocarNoSlot(SLOT_PISTOLA, g.type, ch);
            return COLETA_OK;
        }
        int livre = slot[SLOT_FUZIL_1] < 0 ? SLOT_FUZIL_1 : slot[SLOT_FUZIL_2] < 0 ? SLOT_FUZIL_2 : -1;
        if (livre >= 0) {
            tirarDoChao(g, w);
            colocarNoSlot(livre, g.type, ch);
            return COLETA_OK;
        }
        pendente = g;
        return COLETA_ESCOLHA;
    }

    /** Coleta simples: true se a arma entrou no inventário agora. */
    boolean pickUp(Pickup g, World w, Character ch, Player player) {
        return coletar(g, w, ch, player) == COLETA_OK;
    }

    /** Arma de grande porte pendente (dois fuzis cheios), ou null. */
    Pickup pendente() { return pendente; }

    /** Escolhida a substituição: o fuzil do slot s sai do inventário (cai no chão) e entra a arma pendente. */
    boolean substituirPendente(int s, World w, Character ch, Player player) {
        if (pendente == null || (s != SLOT_FUZIL_1 && s != SLOT_FUZIL_2) || slot[s] < 0) return false;
        Pickup g = pendente;
        pendente = null;
        tirarDoChao(g, w);
        dropNoJogador(w, player, slot[s]);
        colocarNoSlot(s, g.type, ch);
        return true;
    }

    /** Cancela a coleta pendente: a arma continua no chão. */
    void cancelarPendente() { pendente = null; }

    private void colocarNoSlot(int s, int type, Character ch) {
        registrarSaida(s);
        slot[s] = type;
        activeSlot = s;
        equipNew(type, ch);
    }

    private void tirarDoChao(Pickup g, World w) {
        ground.removeValue(g, true);
        w.instances.removeValue(g.inst, true);
    }

    private void dropNoJogador(World w, Player player, int type) {
        drop(w, type, player.pos.x + 0.6f * MathUtils.sin(player.facing + 1.2f),
                player.pos.z + 0.6f * MathUtils.cos(player.facing + 1.2f), new Random());
    }


    /** Põe a arma do tipo na mão, com a animação de sacar. */
    private void equipNew(int type, Character ch) {
        if (held != null) ch.instances.removeValue(held, true);
        heldType = type;
        holstered = false;
        reloadT = 0f;   // trocar de arma cancela a recarga
        burstLeft = 0;
        cooldown = 0.1f;
        kickPos = 0f;
        equipDur = Math.max(0.1f, WeaponConfig.BY_TYPE[heldType].equipTime);
        equipT = equipDur;   // anima o sacar e bloqueia o tiro até terminar
        events |= EV_EQUIP;
        held = new ModelInstance(models[heldType]);
        ch.instances.add(held);
        ch.setArmed(true);
    }

    /** Troca para a próxima arma levada, na ordem dos slots. */
    void swap(Character ch) {
        for (int k = 1; k < slot.length; k++) {
            int s = (activeSlot + k) % slot.length;
            if (slot[s] >= 0) {
                registrarSaida(s);
                activeSlot = s;
                equipNew(slot[s], ch);
                return;
            }
        }
    }

    boolean holstered() { return holstered; }

    boolean hasWeapon() { return slot[0] >= 0 || slot[1] >= 0 || slot[2] >= 0; }

    /** Há outra arma levada para trocar? */
    boolean hasOtherWeapon() {
        for (int k = 1; k < slot.length; k++) if (slot[(activeSlot + k) % slot.length] >= 0) return true;
        return false;
    }

    /** Texto do botão de troca (guardar e sacar foram removidos). */
    String swapLabel() {
        return "TROCAR";
    }

    private static float smooth(float x) {
        x = MathUtils.clamp(x, 0f, 1f);
        return x * x * (3f - 2f * x);
    }

    /**
     * A arma na mão direita. O cano acompanha a mira (para cima e para baixo); baixa ao andar. Por cima:
     * recuo do tiro (para trás e o cano sobe), recarga (cano desce, o pente sai e entra), sacar (sobe
     * de baixo), pente vazio (sacudida). O cano calculado (muzzle/barrel) segue tudo isso.
     */
    void update(Character ch, Player player) {
        if (held == null) return;
        WeaponConfig c = WeaponConfig.BY_TYPE[heldType];
        ch.handWorld(false, hand);
        float down = ads ? 0f : player.speed > 0.25f ? 24f : 4f;
        down -= aimElev * MathUtils.radiansToDegrees * 0.85f;
        float roll = 0f, drop = 0f, back = 0f;
        if (reloadT > 0f) {
            // 0..1: abaixa, tira o pente, enfia o novo, levanta
            float p = 1f - reloadT / c.reloadTime;
            float lowered = smooth(p / 0.18f) * (1f - smooth((p - 0.82f) / 0.18f));
            down += 42f * lowered;
            drop = 0.10f * lowered;
            roll = lowered * (14f * MathUtils.sin(p * MathUtils.PI * 5f) * (p > 0.25f && p < 0.8f ? 1f : 0.3f));
            back = 0.05f * lowered * (p > 0.4f && p < 0.65f ? 1f : 0f);
        }
        if (equipT > 0f) {
            float q = equipT / equipDur;   // 1 → 0
            down += 75f * q * q;
            drop += 0.18f * q;
            roll += 12f * q;
        }
        if (emptyT > 0f) roll += 6f * MathUtils.sin(emptyT * 90f) * (emptyT / 0.25f);
        // respiração leve parado (não deixa a arma completamente imóvel)
        float breath = player.speed < 0.25f && reloadT <= 0f ? 0.4f * MathUtils.sin(swayT * 1.7f) : 0f;
        held.transform.setToTranslation(hand).rotate(Vector3.Y, player.facing * MathUtils.radiansToDegrees)
                .rotate(Vector3.X, down + breath)
                .rotate(Vector3.Z, roll)
                .translate(0f, -drop, -kickPos - back)
                .rotate(Vector3.X, -kickPos * 110f);   // no tiro o cano sobe
        Vector3 ml = muzzleLocal[heldType];
        muzzle.set(ml).mul(held.transform);
        barrel.set(ml.x, ml.y, ml.z + 1f).mul(held.transform).sub(muzzle).nor();
    }

    void dispose() {
        for (Model m : models) if (m != null) m.dispose();
        for (com.badlogic.gdx.graphics.glutils.FrameBuffer f : iconFbo) if (f != null) f.dispose();
        for (int i = 0; i < iconsHud.length; i++)
            if (iconsHud[i] != null && iconsHud[i] != icons[i]) iconsHud[i].getTexture().dispose();   // só as silhuetas geradas
    }
}
