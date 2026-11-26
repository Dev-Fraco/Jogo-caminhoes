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
    static final String[] NAMES = {"AKM", "AUG", "GROZA", "M16A4", "M416", "SCAR-L"};
    private static final String[] FILES = {"akm", "aug", "groza", "m16a4", "m416", "scarl"};
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
    private final int[] slot = {-1, -1};   // duas armas levadas (tipo, ou -1 = vazio)
    private int activeSlot = 0;            // a que está na mão
    private boolean holstered = false;     // guardada (fora da mão)
    private ModelInstance held;
    private final Vector3 hand = new Vector3();
    // Munição de cada arma (fica com a arma ao trocar)
    private final int[] mag = new int[FILES.length], reserve = new int[FILES.length];
    float reloadT = 0f;          // > 0: recarregando (s restantes)
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
            models[i] = new G3dModelLoader(new JsonReader()).loadModel(Gdx.files.internal("models/armas/" + FILES[i] + ".g3dj"));
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
                iconFbo[i] = new com.badlogic.gdx.graphics.glutils.FrameBuffer(com.badlogic.gdx.graphics.Pixmap.Format.RGBA8888, 256, 128, true);
            icons[i] = Items.renderIcon(batch, env, models[i], iconFbo[i], 90f);
        }
    }

    com.badlogic.gdx.graphics.g2d.TextureRegion icon() { return heldType >= 0 ? icons[heldType] : null; }

    /** Configuração da arma na mão (null se desarmado). */
    WeaponConfig config() { return heldType >= 0 ? WeaponConfig.BY_TYPE[heldType] : null; }

    int ammo() { return heldType >= 0 ? mag[heldType] : 0; }

    int reserveAmmo() { return heldType >= 0 ? reserve[heldType] : 0; }

    boolean reloading() { return reloadT > 0f; }

    float reloadProgress() {
        WeaponConfig c = config();
        return c == null || reloadT <= 0f ? 0f : 1f - reloadT / c.reloadTime;
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
        cooldown = Math.max(0f, cooldown - dt);
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
        if (c == null || reloadT > 0f || equipT > 0f) return 0;
        // Continuação da rajada (não precisa do botão)
        if (burstLeft > 0) {
            if (burstT > 0f) return 0;
            if (mag[heldType] <= 0) { burstLeft = 0; cooldown = c.fireInterval; return 0; }
            mag[heldType]--;
            burstLeft--;
            burstT = c.burstGap;
            if (burstLeft == 0) cooldown = c.fireInterval;
            kickPos = Math.min(kickPos + c.kick, c.kick * 2f);
            return 1;
        }
        if (cooldown > 0f) return 0;
        boolean wants = c.mode == WeaponConfig.FireMode.AUTO ? held : pressed;
        if (!wants) return 0;
        if (mag[heldType] <= 0) {
            cooldown = 0.3f;
            emptyT = 0.25f;
            events |= EV_EMPTY;
            startReload();   // pente vazio: clique e começa a recarregar sozinho (se tiver reserva)
            return -1;
        }
        mag[heldType]--;
        cooldown = c.fireInterval;
        kickPos = Math.min(kickPos + c.kick, c.kick * 2f);
        if (c.mode == WeaponConfig.FireMode.BURST) {
            burstLeft = Math.min(c.burstCount - 1, mag[heldType]);
            burstT = c.burstGap;
            if (burstLeft == 0) cooldown = c.fireInterval;
            else cooldown = 0f;   // enquanto durar a rajada o controle é do burstLeft
        }
        return 1;
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
        slot[0] = -1;
        slot[1] = -1;
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

    /** Pega a arma do chão; se já tinha uma, a antiga fica no chão no lugar. */
    /** Pega a arma do chão. Com slot livre, ela entra nele; com os dois cheios, a da mão cai no lugar. */
    boolean pickUp(Pickup g, World w, Character ch, Player player) {
        if (slot[0] == g.type || slot[1] == g.type) return false;   // a mesma arma não entra duas vezes (a munição é dela)
        ground.removeValue(g, true);
        w.instances.removeValue(g.inst, true);
        int empty = slot[0] < 0 ? 0 : slot[1] < 0 ? 1 : -1;
        if (empty >= 0) {
            slot[empty] = g.type;
            activeSlot = empty;
        } else {
            Random r = new Random();
            drop(w, slot[activeSlot], player.pos.x + 0.6f * MathUtils.sin(player.facing + 1.2f),
                    player.pos.z + 0.6f * MathUtils.cos(player.facing + 1.2f), r);
            slot[activeSlot] = g.type;
        }
        equipNew(g.type, ch);
        return true;
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

    /** Troca para a outra arma (se houver). Com uma arma só, guarda ou saca a que está na mão. */
    void swap(Character ch) {
        int other = activeSlot == 0 ? 1 : 0;
        if (slot[other] >= 0) {
            activeSlot = other;
            equipNew(slot[other], ch);
            return;
        }
        if (heldType < 0) return;
        if (!holstered) holster(ch);
        else equipNew(heldType, ch);
    }

    /** Guarda a arma: some da mão (a animação de guardar fica por conta da pose do braço). */
    void holster(Character ch) {
        if (heldType < 0 || holstered) return;
        holstered = true;
        if (held != null) ch.instances.removeValue(held, true);
        reloadT = 0f;
        burstLeft = 0;
        ch.setArmed(false);
    }

    boolean holstered() { return holstered; }

    boolean hasWeapon() { return slot[0] >= 0 || slot[1] >= 0; }

    /** Texto do botão: trocar (há outra arma), guardar ou sacar. */
    String swapLabel() {
        if (holstered) return "SACAR";
        int other = activeSlot == 0 ? 1 : 0;
        return slot[other] >= 0 ? "TROCAR" : "GUARDAR";
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
    }
}
