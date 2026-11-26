package com.exemplo.jogo3d;

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
    final float damage;          // dano base no tronco a curta distância
    final float headMul, torsoMul, armMul, legMul;
    final float fireInterval;    // segundos entre tiros
    final boolean automatic;     // segurar o botão continua atirando
    final int magazine, reserve;
    final float reloadTime;
    final float range;           // alcance máximo (m)
    final float falloffStart, falloffMin;   // dano cai a partir dessa distância até falloffMin×
    final float spreadHip, spreadAds;       // dispersão (graus) sem e com mira
    final float recoilPitch, recoilYaw;     // coice por tiro (graus)
    final int pellets;           // espingarda: chumbos por disparo

    private WeaponConfig(String name, Category category, float damage, float headMul, float torsoMul, float armMul,
                         float legMul, float fireInterval, boolean automatic, int magazine, int reserve, float reloadTime,
                         float range, float falloffStart, float falloffMin, float spreadHip, float spreadAds,
                         float recoilPitch, float recoilYaw, int pellets) {
        this.name = name;
        this.category = category;
        this.damage = damage;
        this.headMul = headMul;
        this.torsoMul = torsoMul;
        this.armMul = armMul;
        this.legMul = legMul;
        this.fireInterval = fireInterval;
        this.automatic = automatic;
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
    }

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
        float fall = 1f;
        if (dist > falloffStart) {
            float k = Math.min(1f, (dist - falloffStart) / Math.max(1f, range - falloffStart));
            fall = 1f + (falloffMin - 1f) * k;
        }
        return damage * multiplier(r) * fall;
    }

    // ---------- Tabela das armas ----------
    //                         nome      categoria                dano cab  tron braç pern  interv auto  pente res  recarga alc  queda mín  disp.q disp.m coice  lado  chumbo
    static final WeaponConfig AKM = new WeaponConfig("AKM", Category.FUZIL, 30f, 2.0f, 1.0f, 0.75f, 0.75f, 0.100f, true, 30, 120, 2.6f, 140f, 40f, 0.65f, 3.2f, 0.9f, 0.85f, 0.35f, 1);
    static final WeaponConfig AUG = new WeaponConfig("AUG", Category.FUZIL, 26f, 2.0f, 1.0f, 0.75f, 0.75f, 0.085f, true, 30, 120, 2.8f, 150f, 50f, 0.70f, 2.6f, 0.6f, 0.55f, 0.25f, 1);
    static final WeaponConfig GROZA = new WeaponConfig("GROZA", Category.FUZIL, 29f, 2.0f, 1.0f, 0.75f, 0.75f, 0.080f, true, 30, 120, 2.9f, 120f, 35f, 0.60f, 3.0f, 0.8f, 0.75f, 0.35f, 1);
    static final WeaponConfig M16A4 = new WeaponConfig("M16A4", Category.FUZIL, 31f, 2.1f, 1.0f, 0.75f, 0.75f, 0.150f, false, 30, 120, 2.4f, 160f, 60f, 0.75f, 2.4f, 0.5f, 0.70f, 0.20f, 1);
    static final WeaponConfig M416 = new WeaponConfig("M416", Category.FUZIL, 27f, 2.0f, 1.0f, 0.75f, 0.75f, 0.090f, true, 30, 120, 2.3f, 150f, 50f, 0.70f, 2.5f, 0.6f, 0.55f, 0.22f, 1);
    static final WeaponConfig SCARL = new WeaponConfig("SCAR-L", Category.FUZIL, 28f, 2.0f, 1.0f, 0.75f, 0.75f, 0.095f, true, 30, 120, 2.5f, 150f, 50f, 0.70f, 2.6f, 0.6f, 0.62f, 0.25f, 1);
    // Categorias sem modelo 3D ainda (prontas para quando a arma entrar no jogo)
    static final WeaponConfig PISTOLA = new WeaponConfig("Pistola", Category.PISTOLA, 22f, 1.8f, 1.0f, 0.8f, 0.8f, 0.200f, false, 12, 48, 1.6f, 60f, 15f, 0.55f, 2.2f, 0.9f, 0.90f, 0.20f, 1);
    static final WeaponConfig REVOLVER = new WeaponConfig("Revólver", Category.REVOLVER, 45f, 2.0f, 1.0f, 0.8f, 0.8f, 0.550f, false, 6, 30, 3.2f, 70f, 20f, 0.6f, 2.4f, 0.7f, 2.20f, 0.30f, 1);
    static final WeaponConfig SUBMETRALHADORA = new WeaponConfig("Submetralhadora", Category.SUBMETRALHADORA, 19f, 1.8f, 1.0f, 0.8f, 0.8f, 0.065f, true, 32, 128, 2.0f, 70f, 18f, 0.55f, 3.0f, 1.2f, 0.40f, 0.30f, 1);
    static final WeaponConfig ESPINGARDA = new WeaponConfig("Espingarda", Category.ESPINGARDA, 18f, 1.5f, 1.0f, 0.8f, 0.8f, 0.850f, false, 5, 25, 4.0f, 35f, 8f, 0.25f, 5.5f, 4.0f, 3.00f, 0.50f, 8);
    static final WeaponConfig PRECISAO = new WeaponConfig("Rifle de precisão", Category.PRECISAO, 85f, 2.4f, 1.0f, 0.8f, 0.8f, 1.400f, false, 5, 20, 3.5f, 300f, 150f, 0.85f, 6.0f, 0.05f, 3.20f, 0.20f, 1);
    // Arma dos cangaceiros (inimigos): rifle de alavanca, preciso e lento
    static final WeaponConfig RIFLE_INIMIGO = new WeaponConfig("Rifle de alavanca", Category.FUZIL, 11f, 2.0f, 1.0f, 0.75f, 0.75f, 0.45f, false, 15, 999, 2.5f, 90f, 30f, 0.6f, 3.0f, 3.0f, 0.5f, 0.2f, 1);

    /** Configuração das armas do jogo, na ordem de Weapons.NAMES. */
    static final WeaponConfig[] BY_TYPE = {AKM, AUG, GROZA, M16A4, M416, SCARL};
}
