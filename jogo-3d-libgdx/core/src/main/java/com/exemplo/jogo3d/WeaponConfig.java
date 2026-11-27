package com.exemplo.jogo3d;

import com.badlogic.gdx.math.MathUtils;

/**
 * Configuração central das armas: todo dano, multiplicador, cadência, recuo e comportamento da
 * assistência de mira fica aqui (nada espalhado pelo código).
 *
 * Categoria: define como a assistência age (mais contida nas de precisão, suave nas de rajada,
 * coerente com a dispersão nas espingardas) e a sensibilidade própria de cada tipo (AimSettings).
 */
final class WeaponConfig {

    /** Regiões do corpo que um tiro pode acertar. */
    enum Region {
        HEAD("CABEÇA"), TORSO("TRONCO"), ARM("BRAÇO"), LEG("PERNA");
        final String label;
        Region(String label) { this.label = label; }
    }

    /** Como o botão de disparo age. */
    enum FireMode { AUTO("AUTO"), SEMI("SEMI"), BURST("RAJADA");
        final String label;
        FireMode(String label) { this.label = label; }
    }

    enum Category {
        //            nome            força   atrito  rastreio  máx °/s  raio×
        PISTOLA("Pistola", 1.00f, 0.35f, 0.55f, 28f, 1.00f),
        REVOLVER("Revólver", 0.85f, 0.35f, 0.45f, 24f, 0.90f),
        SUBMETRALHADORA("Submetralhadora", 0.80f, 0.30f, 0.60f, 22f, 1.10f),
        FUZIL("Fuzil", 0.75f, 0.30f, 0.55f, 20f, 1.00f),
        ESPINGARDA("Espingarda", 0.90f, 0.25f, 0.45f, 26f, 1.25f),
        PRECISAO("Precisão", 0.40f, 0.45f, 0.30f, 10f, 0.60f);

        final String label;
        final float assist;      // multiplica a força da atração
        final float friction;    // quanto a mira "pesa" passando sobre o alvo (0..1)
        final float tracking;    // quanto acompanha o movimento lateral do alvo (0..1)
        final float maxDegPerSec;// teto da correção automática (evita puxão brusco)
        final float radiusScale; // multiplica o raio de atração

        Category(String label, float assist, float friction, float tracking, float maxDegPerSec, float radiusScale) {
            this.label = label;
            this.assist = assist;
            this.friction = friction;
            this.tracking = tracking;
            this.maxDegPerSec = maxDegPerSec;
            this.radiusScale = radiusScale;
        }
    }

    final String name;
    final Category category;
    final FireMode mode;
    final int burstCount;        // tiros por toque no modo rajada
    final float burstGap;        // intervalo entre os tiros da rajada (s)
    final float damage;          // dano base no tronco a curta distância
    final float headMul, torsoMul, armMul, legMul;
    final float fireInterval;    // s entre tiros (semi/auto) ou entre rajadas (rajada: depois do último tiro)
    final int magazine, reserve;
    final float reloadTime;
    final float range;           // alcance máximo (m)
    final float falloffStart, falloffMin;   // dano cai a partir dessa distância até falloffMin×
    final float spreadHip, spreadAds;       // dispersão (graus) sem e com mira
    final float recoilPitch, recoilYaw;     // coice da mira por tiro (graus)
    final int pellets;           // espingarda: chumbos por disparo
    final float kick;            // recuo visual da arma (m)
    final float flash;           // tamanho do clarão (1 = fuzil)
    final float equipTime;       // s para sacar a arma

    private WeaponConfig(String name, Category category, FireMode mode, int burstCount, float burstGap, float damage,
                         float headMul, float armMul, float legMul, float fireInterval, int magazine, int reserve,
                         float reloadTime, float range, float falloffStart, float falloffMin, float spreadHip,
                         float spreadAds, float recoilPitch, float recoilYaw, int pellets, float kick, float flash,
                         float equipTime) {
        this.name = name;
        this.category = category;
        this.mode = mode;
        this.burstCount = burstCount;
        this.burstGap = burstGap;
        this.damage = damage;
        this.headMul = headMul;
        this.torsoMul = 1f;
        this.armMul = armMul;
        this.legMul = legMul;
        this.fireInterval = fireInterval;
        this.magazine = magazine;
        this.reserve = reserve;
        this.reloadTime = reloadTime;
        this.range = range;
        this.falloffStart = falloffStart;
        this.falloffMin = falloffMin;
        this.spreadHip = spreadHip;
        this.spreadAds = spreadAds;
        this.recoilPitch = recoilPitch;
        this.recoilYaw = recoilYaw;
        this.pellets = pellets;
        this.kick = kick;
        this.flash = flash;
        this.equipTime = equipTime;
    }

    boolean automatic() { return mode == FireMode.AUTO; }

    float multiplier(Region r) {
        switch (r) {
            case HEAD: return headMul;
            case ARM: return armMul;
            case LEG: return legMul;
            default: return torsoMul;
        }
    }

    /** Dano de um acerto: base × região × queda com a distância. */
    float damageAt(Region r, float dist) {
        if (flat) return r == Region.HEAD ? flatHead : flatBody;
        if (separate) {   // espingarda: cabeça 35, peito 12 e membros 10 até 5 m; depois cai até 25%
            float base = r == Region.HEAD ? 35f : r == Region.TORSO ? 12f : 10f;
            float k = MathUtils.clamp((dist - 5f) / 12f, 0f, 1f);
            return base * (1f - 0.75f * k);
        }
        // AWM: dano fixo, sem queda com a distância (cabeça 900, resto do corpo 120)
        if (scope) return r == Region.HEAD ? 900f : 120f;
        if (quedaLinear) {
            // Queda linear: dano cheio até falloffStart e cai até falloffMin × no alcance máximo (região × base)
            float k = MathUtils.clamp((dist - falloffStart) / Math.max(1f, range - falloffStart), 0f, 1f);
            return damage * multiplier(r) * (1f + (falloffMin - 1f) * k);
        }
        float fall = 1f;
        if (r == Region.HEAD || r == Region.TORSO) {
            // Cabeça e peito: mais dano de perto (+20% até 10 m) e bem menos de longe (cai até 60% do mínimo)
            float k = MathUtils.clamp((dist - 10f) / Math.max(1f, range - 10f), 0f, 1f);
            fall = dist <= 10f ? 1.2f : 1.2f + (falloffMin * 0.6f - 1.2f) * k;
        } else if (dist > falloffStart) {
            float k = Math.min(1f, (dist - falloffStart) / Math.max(1f, range - falloffStart));
            fall = 1f + (falloffMin - 1f) * k;
        }
        return damage * multiplier(r) * fall;
    }

    /** Luneta: a arma usa a mira com zoom, sem assistência, um tiro por mira. */
    boolean scope = false;

    WeaponConfig asScope() { scope = true; return this; }

    /**
     * Cada projétil tem dano e indicador próprios (espingarda M1014). Dano: 12 no peito e 35 na cabeça
     * até 5 m; depois cai até 25% aos 17 m.
     */
    boolean separate = false;

    /** Dano fixo (sem queda com a distância): cabeça e corpo, com os membros iguais ao corpo. */
    boolean flat = false;
    float flatHead, flatBody;

    WeaponConfig asSeparate() { separate = true; return this; }

    WeaponConfig asFlat(float head, float body) { flat = true; flatHead = head; flatBody = body; return this; }

    /** Queda linear com a distância (GROZA): sem o bônus de perto das armas comuns, o dano-base vale até falloffStart. */
    boolean quedaLinear = false;

    WeaponConfig comQuedaLinear() { quedaLinear = true; return this; }

    /**
     * Proteção de capacete e colete do alvo: capacete reduz o dano na cabeça, colete reduz o dano no tronco.
     * Só armas com armadura (GROZA) aplicam; as demais recebem dano cheio.
     */
    boolean armadura = false;

    WeaponConfig comArmadura() { armadura = true; return this; }

    /** Fator do dano pela proteção do alvo (1 = sem proteção). */
    float fatorArmadura(Region r, boolean capacete, boolean colete) {
        if (!armadura) return 1f;
        if (r == Region.HEAD && capacete) return 0.5f;
        if (r == Region.TORSO && colete) return 0.7f;
        return 1f;
    }

    /** Tempo entre apertar o botão e o primeiro tiro (s). */
    float firstShotDelay = 0f;

    WeaponConfig withFirstShotDelay(float s) { firstShotDelay = s; return this; }

    /**
     * Cadência exata: o intervalo entre tiros é mantido em média independente do FPS (o excedente de um
     * quadro é descontado do próximo tiro). Só as armas que pedem isso usam; as demais seguem como estavam.
     */
    boolean cadenciaExata = false;

    WeaponConfig comCadenciaExata() { cadenciaExata = true; return this; }

    /** Raio (m) do grupo de chumbos num tiro que erra: sai do corpo do alvo e cresce com a distância. */
    /** Raio (m) em volta do ponto de mira onde caem os chumbos de um tiro que acerta (fica no corpo). */
    static final float SHOT_HIT_R = 0.2f;

    /**
     * Chance de a espingarda pegar o alvo da mira, pela distância: 100% até 3 m, 80% de 3,5 a 6 m,
     * 40% de 6 a 10 m e 0% depois de 10 m (transições suaves entre as faixas).
     */
    static float shotgunHitChance(float d) {
        if (d <= 3f) return 1f;
        if (d <= 3.5f) return MathUtils.lerp(1f, 0.8f, (d - 3f) / 0.5f);
        if (d <= 6f) return 0.8f;
        if (d <= 6.5f) return MathUtils.lerp(0.8f, 0.4f, (d - 6f) / 0.5f);
        if (d <= 10f) return 0.4f;
        if (d <= 10.5f) return MathUtils.lerp(0.4f, 0f, (d - 10f) / 0.5f);
        return 0f;
    }

    static float pelletRadius(float d) { float e = Math.max(0f, d - 5f); return 0.2f + 0.009f * d * d + 0.025f * e * e; }

    // ---------- Tabela das armas ----------
    // Os parâmetros, em ordem:  nome, categoria, modo, tiros/rajada, intervalo da rajada, dano, ×cabeça, ×braço, ×perna,
    //   intervalo, pente, reserva, recarga, alcance, queda a partir de, queda mínima, dispersão quadril, dispersão mira,
    //   coice vertical, coice lateral, chumbos, recuo visual (m), clarão, tempo de sacar
    static final WeaponConfig AKM = new WeaponConfig("AKM", Category.FUZIL, FireMode.AUTO, 1, 0f, 30f, 2.0f, 0.75f, 0.75f,
            0.100f, 30, 120, 1.4f, 140f, 40f, 0.65f, 3.2f, 0.9f, 0.85f, 0.35f, 1, 0.075f, 1.1f, 0.55f);
    static final WeaponConfig AUG = new WeaponConfig("AUG", Category.FUZIL, FireMode.AUTO, 1, 0f, 26f, 2.0f, 0.75f, 0.75f,
            0.085f, 30, 120, 1.6f, 150f, 50f, 0.70f, 2.6f, 0.6f, 0.55f, 0.25f, 1, 0.055f, 1.0f, 0.50f);
    // Alto dano, alcance longo e boa estabilidade: corpo 61, cabeça 122 (2×), membros 46 (0,754×); ~9 tiros/s.
    // Queda linear com a distância (35 m cheio, 60% no alcance) e proteção de capacete/colete.
    static final WeaponConfig GROZA = new WeaponConfig("GROZA", Category.FUZIL, FireMode.AUTO, 1, 0f, 61f, 2.0f, 0.7541f, 0.7541f,
            0.110f, 30, 120, 1.7f, 120f, 35f, 0.60f, 3.0f, 0.8f, 0.75f, 0.35f, 1, 0.070f, 1.1f, 0.55f)
            .comQuedaLinear().comArmadura().comCadenciaExata();
    static final WeaponConfig M16A4 = new WeaponConfig("M16A4", Category.FUZIL, FireMode.BURST, 3, 0.065f, 31f, 2.1f, 0.75f, 0.75f,
            0.260f, 30, 120, 1.2f, 160f, 60f, 0.75f, 2.4f, 0.5f, 0.55f, 0.18f, 1, 0.065f, 1.0f, 0.55f);
    static final WeaponConfig M416 = new WeaponConfig("M416", Category.FUZIL, FireMode.AUTO, 1, 0f, 27f, 2.0f, 0.75f, 0.75f,
            0.090f, 30, 120, 1.1f, 150f, 50f, 0.70f, 2.5f, 0.6f, 0.55f, 0.22f, 1, 0.055f, 1.0f, 0.50f);
    static final WeaponConfig SCARL = new WeaponConfig("SCAR-L", Category.FUZIL, FireMode.AUTO, 1, 0f, 28f, 2.0f, 0.75f, 0.75f,
            0.100f, 30, 120, 1.3f, 150f, 50f, 0.70f, 2.6f, 0.6f, 0.62f, 0.25f, 1, 0.060f, 1.0f, 0.50f).comCadenciaExata();
    // Fuzil de precisão AWM: luneta (zoom real), sem assistência de mira, um tiro por mira e recarga de 0,5 s
    static final WeaponConfig AWM = new WeaponConfig("AWM", Category.PRECISAO, FireMode.SEMI, 1, 0f, 85f, 2.4f, 0.8f, 0.8f,
            1.200f, 5, 20, 0.5f, 300f, 150f, 0.85f, 6.0f, 0.05f, 3.20f, 0.20f, 1, 0.140f, 1.4f, 0.70f).asScope();
    // Categorias que ainda não têm modelo 3D no jogo (prontas para quando a arma entrar)
    static final WeaponConfig PISTOLA = new WeaponConfig("Pistola", Category.PISTOLA, FireMode.SEMI, 1, 0f, 22f, 1.8f, 0.8f, 0.8f,
            0.200f, 12, 48, 0.4f, 60f, 15f, 0.55f, 2.2f, 0.9f, 0.90f, 0.20f, 1, 0.050f, 0.7f, 0.35f);
    static final WeaponConfig REVOLVER = new WeaponConfig("Revólver", Category.REVOLVER, FireMode.SEMI, 1, 0f, 45f, 2.0f, 0.8f, 0.8f,
            0.550f, 6, 30, 2.0f, 70f, 20f, 0.6f, 2.4f, 0.7f, 2.20f, 0.30f, 1, 0.110f, 1.3f, 0.45f);
    static final WeaponConfig SUBMETRALHADORA = new WeaponConfig("Submetralhadora", Category.SUBMETRALHADORA, FireMode.AUTO, 1, 0f, 19f, 1.8f, 0.8f, 0.8f,
            0.065f, 32, 128, 0.8f, 70f, 18f, 0.55f, 3.0f, 1.2f, 0.40f, 0.30f, 1, 0.040f, 0.8f, 0.40f);
    static final WeaponConfig ESPINGARDA = new WeaponConfig("Espingarda", Category.ESPINGARDA, FireMode.SEMI, 1, 0f, 18f, 1.5f, 0.8f, 0.8f,
            0.850f, 5, 25, 2.8f, 35f, 8f, 0.25f, 5.5f, 4.0f, 3.00f, 0.50f, 8, 0.130f, 1.7f, 0.60f);
    static final WeaponConfig PRECISAO = new WeaponConfig("Rifle de precisão", Category.PRECISAO, FireMode.SEMI, 1, 0f, 85f, 2.4f, 0.8f, 0.8f,
            1.400f, 5, 20, 2.3f, 300f, 150f, 0.85f, 6.0f, 0.05f, 3.20f, 0.20f, 1, 0.140f, 1.4f, 0.70f);
    // Arma dos bots (rifle de alavanca): lento e preciso
    static final WeaponConfig RIFLE_INIMIGO = new WeaponConfig("Rifle de alavanca", Category.FUZIL, FireMode.SEMI, 1, 0f, 11f, 2.0f, 0.75f, 0.75f,
            0.45f, 15, 999, 2.5f, 90f, 30f, 0.6f, 3.0f, 3.0f, 0.5f, 0.2f, 1, 0.06f, 1f, 0.5f);

    /** Configuração das armas do jogo, na ordem de Weapons.NAMES. */
    // Espingarda M1014: 8 projéteis por disparo, 0,8 s entre tiros (segurando, automático), carregador de 5
    static final WeaponConfig M1014 = new WeaponConfig("M1014", Category.ESPINGARDA, FireMode.AUTO, 1, 0f, 12f, 2.92f, 0.8f, 0.8f,
            0.8f, 5, 30, 2.4f, 40f, 5f, 0.25f, 0f, 0f, 0f, 0f, 8, 0.13f, 1.7f, 0.6f).asSeparate();

    // Revólver Magnum .357 (pistola do arsenal): 210 na cabeça e 50 no corpo, de qualquer distância
    static final WeaponConfig MAGNUM357 = new WeaponConfig("MAGNUM 357", Category.REVOLVER, FireMode.AUTO, 1, 0f, 50f, 4.2f, 1f, 1f,
            0.777f, 6, 30, 2.0f, 70f, 20f, 0.6f, 2.4f, 0.7f, 2.20f, 0.30f, 1, 0.110f, 1.3f, 0.45f).asFlat(210f, 50f).withFirstShotDelay(0.25f);

    static final WeaponConfig[] BY_TYPE = {AKM, AUG, GROZA, M16A4, M416, SCARL, AWM, M1014, MAGNUM357};
}
