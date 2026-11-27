package com.exemplo.jogo3d;

import com.badlogic.gdx.graphics.Camera;
import com.badlogic.gdx.graphics.g3d.Model;
import com.badlogic.gdx.graphics.g3d.ModelInstance;
import com.badlogic.gdx.math.MathUtils;
import com.badlogic.gdx.math.Vector3;
import com.badlogic.gdx.utils.Array;

import java.util.Random;

/**
 * Bando de cangaceiros: cria, atualiza, faz atirar no jogador (com chance de errar pela distância,
 * movimento e postura do jogador) e responde a raios (tiros) e explosões.
 * Quando o bando todo cai, outro chega depois de um tempo.
 */
final class Enemies {
    static final int COUNT = 2;    // treinamento: dois bonecos

    final Array<Enemy> list = new Array<>();
    private final Model dummyModel;   // boneco de treino (Mannequin); null = usa o modelo do personagem
    private final Model body;
    private final Model[] guns;
    private final Random rnd = new Random(1915);
    int kills = 0;
    private long frame = 0;
    /** Disparos dos inimigos neste quadro (para o som e o rastro): muzzle → ponto. */
    final Array<Vector3[]> shots = new Array<>();

    Enemies(World w, Model body, Model[] guns) {
        this(w, body, guns, null);
    }

    Enemies(World w, Model body, Model[] guns, Model dummyModel) {
        this.body = body;
        this.guns = guns;
        this.dummyModel = dummyModel;
    }

    /** Modo treinamento: dois bonecos parados no fundo do galpão, de frente para a porta. */
    void spawnDummies(World w) {
        list.clear();
        for (float x : new float[]{-3.5f, 3.5f}) {
            Enemy e = new Enemy(dummyModel != null ? dummyModel : body, null, x, World.TRAIN_DUMMY_Z, 0.3f);
            e.dummy = true;
            e.capacete = rnd.nextFloat() < 0.35f;   // proteção sorteada (mesmo gerador fixo do jogo)
            e.colete = rnd.nextFloat() < 0.35f;
            e.pos.y = w.groundAt(x, World.TRAIN_DUMMY_Z);
            e.facing = MathUtils.atan2(World.TRAIN_PLAYER_X - x, World.TRAIN_PLAYER_Z - World.TRAIN_DUMMY_Z);
            list.add(e);
        }
    }

    /**
     * Arena livre: bonecos parados espalhados pela área, no lugar dos outros jogadores da sala (teste local; o
     * servidor vai trazer os jogadores de verdade).
     */
    void spawnArena(World w, int quantidade) {
        list.clear();
        for (int i = 0; i < quantidade; i++) {
            float x = 0f, z = 0f;
            for (int t = 0; t < 60; t++) {   // fora da cobertura e do nascimento
                x = (rnd.nextFloat() * 2f - 1f) * (World.ARENA_HW - 8f);
                z = (rnd.nextFloat() * 2f - 1f) * (World.ARENA_HD - 8f);
                if (!w.arenaOcupado(x, z, 1.5f) && Math.sqrt(x * x + z * z) > 7f) break;
            }
            Enemy e = new Enemy(dummyModel != null ? dummyModel : body, null, x, z, 0.3f);
            e.dummy = true;
            e.pos.y = w.groundAt(x, z);
            e.facing = rnd.nextFloat() * MathUtils.PI2;
            list.add(e);
        }
    }

    /**
     * Arena (sala personalizada): inimigos com IA (atiram e morrem) e aliados parados (bonecos que não morrem), todos
     * espalhados fora do nascimento e da cobertura. O 'quantidade' de cada lado vem da sala.
     */
    void spawnArenaTimes(World w, String[] aliados, String[] inimigos, float precisao) {
        Model gunModel = guns != null && guns.length > 0 ? guns[0] : null;
        list.clear();
        abates.limpa();
        int total = aliados.length + inimigos.length;
        for (int i = 0; i < total; i++) {
            float x = 0f, z = 0f;
            for (int t = 0; t < 80; t++) {
                x = (rnd.nextFloat() * 2f - 1f) * (World.ARENA_HW - 6f);
                z = (rnd.nextFloat() * 2f - 1f) * (World.ARENA_HD - 6f);
                if (!w.arenaOcupado(x, z, 1.5f) && Math.sqrt(x * x + z * z) > 14f) break;
            }
            boolean azul = i < aliados.length;
            Enemy e = new Enemy(body, gunModel, x, z, rnd.nextFloat());
            e.nome = azul ? aliados[i] : inimigos[i - aliados.length];
            e.equipe = azul ? 0 : 1;
            e.precisao = precisao;
            e.weapon = WeaponConfig.BY_TYPE[0];          // todos começam armados (AKM); não há itens na arena
            e.pos.y = w.groundAt(x, z);
            e.facing = rnd.nextFloat() * MathUtils.PI2;
            list.add(e);
        }
    }

    /** Abates de bots e do jogador nesta arena (lidos pelo jogo a cada quadro). */
    final Abates abates = new Abates();

    /** Inimigos (equipe vermelha) que ainda estão vivos na arena. */
    int vivosInimigos() {
        int n = 0;
        for (int i = 0; i < list.size; i++) {
            Enemy e = list.get(i);
            if (e.equipe == 1 && e.alive()) n++;
        }
        return n;
    }

    /** Aliados (equipe azul, sem contar o jogador) que ainda estão vivos. */
    int aliadosVivos() {
        int n = 0;
        for (int i = 0; i < list.size; i++) {
            Enemy e = list.get(i);
            if (e.equipe == 0 && e.alive()) n++;
        }
        return n;
    }

    /** Aliado vivo de índice i (ordem da lista) ou null. */
    Enemy aliado(int i) {
        int k = 0;
        for (int j = 0; j < list.size; j++) {
            Enemy e = list.get(j);
            if (e.equipe != 0 || !e.alive()) continue;
            if (k == i) return e;
            k++;
        }
        return null;
    }

    /** Abates e XP só valem no battle royale: na arena de mira não contam nas estatísticas oficiais. */
    boolean progresso = true;

    /** Arena de mira: três bots (correndo, andando e parado) em distâncias diferentes, sem atirar. */
    void spawnMira(World w) {
        list.clear();
        BotMira.Tipo[] tipos = {BotMira.Tipo.PARADO, BotMira.Tipo.ANDANDO, BotMira.Tipo.CORRENDO};
        float[][] faixas = {{-2f, 2f, 10f}, {-20f, 20f, 26f}, {-35f, 35f, 46f}};   // x0, x1, z (curta, média, longa)
        for (int i = 0; i < tipos.length; i++) {
            BotMira b = new BotMira(tipos[i], faixas[i][0], faixas[i][1], faixas[i][2]);
            Enemy e = new Enemy(body, null, b.x(), b.z, 0.2f + i * 0.3f);
            e.bot = b;
            e.dummy = false;
            e.pos.set(b.x(), w.groundAt(b.x(), b.z), b.z);
            e.facing = (float) Math.atan2(-b.x(), -b.z);
            list.add(e);
        }
    }

    /** Partida nova do battle royale: nenhum boneco no mundo. */
    void clear() { list.clear(); }

    int alive() {
        int n = 0;
        for (int i = 0; i < list.size; i++) if (list.get(i).alive()) n++;
        return n;
    }

    long frame() { return frame; }

    /** Avança o quadro das hitboxes sem rodar o comportamento (testes). */
    void nextFrame() { frame++; }

    /**
     * Atualiza todos. Tiros dos inimigos que acertam vão para o Survival do jogador.
     * playerMove = velocidade do jogador; stance 0 em pé, 1 agachado, 2 deitado.
     */
    private final java.util.Random lootRnd = new java.util.Random();

    boolean ativo = true;   // falso na preparação da sala personalizada: os inimigos ficam parados

    void update(float dt, World w, Vector3 playerPos, Survival sv, float playerMove, int stance, Camera cam, float drawDist) {
        frame++;
        if (!ativo) return;
        shots.clear();
        boolean alive = sv == null || !sv.dead;
        float far = Math.max(drawDist, 150f);
        float near = far * far;
        for (int i = 0; i < list.size; i++) {
            Enemy e = list.get(i);
            // inimigo que morreu deixa o loot no chão, uma vez só (pega com o botão de coletar)
            if (!e.alive() && !e.lootDone) {
                e.lootDone = true;
                if (w.items != null) w.items.loot(w, e.pos.x, e.pos.z, lootRnd);
                if (!e.dummy && progresso) Progresso.ganha(Progresso.XP_INIMIGO, Progresso.MOEDAS_INIMIGO);   // XP e moedas pelo abate
            }
            float dx = e.pos.x - cam.position.x, dz = e.pos.z - cam.position.z;
            e.visibleToCam = dx * dx + dz * dz < near;
            e.closeToCam = dx * dx + dz * dz < 60f * 60f;
            boolean fired;
            if (!e.visibleToCam && e.alive()) {
                // longe da câmera: atualiza a cada 3 quadros com o tempo acumulado (economia no celular)
                e.lodT += dt;
                if ((frame + i) % 3 != 0) continue;
                fired = e.update(e.lodT, w, this, playerPos, alive);
                e.lodT = 0f;
            } else {
                e.lodT = 0f;
                fired = e.update(dt, w, this, playerPos, alive);
            }
            if (e.alive() && e.state == Enemy.State.COMBAT) {
                Vector3 alvo = e.targetEnemy != null ? e.targetEnemy.pos : (e.targetPlayer && alive ? playerPos : null);
                botParede(e, w, alvo, dt);
            }
            if (fired) enemyShot(e, playerPos, sv, playerMove, stance, w);
            // corpos somem depois de um tempo; a arma que tinham cai no chão
            if (!e.alive() && e.deadT > 40f) {
                if (e.weapon != null) w.weapons.dropAt(w, e.weapon, e.pos.x, e.pos.z);
                list.removeIndex(i);
                i--;
            }
        }
    }

    /**
     * Bot em combate põe uma parede de proteção à frente, voltada para o alvo, quando o alvo está a média
     * distância. Até World.BOT_MAX_WALLS por bot, com intervalo entre uma e outra.
     */
    private void botParede(Enemy e, World w, Vector3 alvo, float dt) {
        e.wallCd = Math.max(0f, e.wallCd - dt);
        if (alvo == null || e.wallCd > 0f || w.murosDe(e) >= World.BOT_MAX_WALLS) return;
        float dist = e.pos.dst(alvo);
        if (dist < 5f || dist > 22f) return;
        World.WallSpot s = new World.WallSpot();
        float yaw = MathUtils.atan2(alvo.x - e.pos.x, alvo.z - e.pos.z);
        if (w.wallSpot(e.pos.x, e.pos.z, yaw, 1.6f, s) == null) {
            w.placeWallSpot(s, e);
            e.wallCd = 12f;
        }
    }

    /** Bot atirando em outro bot: acerta ou erra pela distância e movimento do alvo; o atingido revida. */
    private void botShot(Enemy e, Enemy t, World w) {
        float d = e.pos.dst(t.pos);
        float p = MathUtils.clamp((0.55f - d * 0.009f - t.vel.len() * 0.04f) * e.precisao, 0.06f, 0.92f);
        Vector3 to = new Vector3(t.pos).add(0f, 1.2f, 0f);
        boolean hit = MathUtils.random() < p;
        if (!hit) to.add(MathUtils.random(-1.2f, 1.2f), MathUtils.random(-0.6f, 1.2f), MathUtils.random(-1.2f, 1.2f));
        shots.add(new Vector3[]{new Vector3(e.muzzle), to});
        Vector3 ponto = new Vector3();
        World.Obstacle parede = w.muroNaLinha(e.muzzle, to, ponto);
        if (parede != null) {   // parede de proteção na linha: ela leva o tiro
            w.damageObstacle(parede, WeaponConfig.RIFLE_INIMIGO.damageAt(WeaponConfig.Region.TORSO, d), ponto, e.muzzle);
            alert(e.muzzle, 35f, e);
            return;
        }
        if (hit) {
            WeaponConfig.Region r = MathUtils.random() < 0.12f ? WeaponConfig.Region.HEAD : WeaponConfig.Region.TORSO;
            t.ultimoAtacante = e.nome;
            if (t.damage(WeaponConfig.RIFLE_INIMIGO.damageAt(r, d), e.pos)) e.botKills++;
            else t.retaliate(e);
        }
        alert(e.muzzle, 35f, e);   // o tiro chama quem estiver perto
    }

    private void enemyShot(Enemy e, Vector3 player, Survival sv, float playerMove, int stance, World w) {
        if (e.targetEnemy != null) {
            botShot(e, e.targetEnemy, w);
            return;
        }
        float d = e.pos.dst(player);
        float p = 0.62f - d * 0.009f - playerMove * 0.05f - (stance == 1 ? 0.08f : stance == 2 ? 0.18f : 0f);
        p = MathUtils.clamp(p, 0.06f, 0.6f);
        Vector3 to = new Vector3(player).add(0f, stance == 2 ? 0.3f : stance == 1 ? 0.9f : 1.2f, 0f);
        boolean hitPlayer = MathUtils.random() < p;
        if (!hitPlayer) to.add(MathUtils.random(-1.2f, 1.2f), MathUtils.random(-0.6f, 1.2f), MathUtils.random(-1.2f, 1.2f));
        shots.add(new Vector3[]{new Vector3(e.muzzle), to});
        Vector3 ponto = new Vector3();
        World.Obstacle parede = w.muroNaLinha(e.muzzle, to, ponto);
        if (parede != null) {   // parede de proteção na linha: o tiro para nela
            w.damageObstacle(parede, WeaponConfig.RIFLE_INIMIGO.damageAt(WeaponConfig.Region.TORSO, d), ponto, e.muzzle);
            return;
        }
        if (hitPlayer && sv != null) {
            WeaponConfig.Region r = MathUtils.random() < 0.12f ? WeaponConfig.Region.HEAD : WeaponConfig.Region.TORSO;
            sv.damage(WeaponConfig.RIFLE_INIMIGO.damageAt(r, d), true);
        }
    }

    /**
     * Raio contra todos os inimigos vivos (ou mortos, se includeDead), até maxT. Devolve o inimigo
     * atingido (o mais próximo) e preenche out; null se nada.
     */
    Enemy raycast(Vector3 o, Vector3 d, float maxT, boolean includeDead, Hitbox.Hit out) {
        out.t = maxT;
        out.region = null;
        Enemy best = null;
        for (int i = 0; i < list.size; i++) {
            Enemy e = list.get(i);
            if (!includeDead && !e.alive()) continue;
            // teste rápido antes de atualizar as cápsulas
            float ox = e.pos.x - o.x, oy = e.pos.y + 0.9f - o.y, oz = e.pos.z - o.z;
            float along = ox * d.x + oy * d.y + oz * d.z;
            if (along < -1.5f || along > maxT + 1.5f) continue;
            float px = ox - d.x * along, py = oy - d.y * along, pz = oz - d.z * along;
            if (px * px + py * py + pz * pz > 2.0f * 2.0f) continue;
            e.hitbox.update(frame);
            if (e.hitbox.raycast(o, d, out)) best = e;
        }
        return best;
    }

    /** Barulho de tiro/explosão: quem estiver no raio vem atrás. */
    void alert(Vector3 at, float radius) { alert(at, radius, null); }

    void alert(Vector3 at, float radius, Enemy except) {
        for (int i = 0; i < list.size; i++) {
            Enemy e = list.get(i);
            if (e != except && e.alive() && e.pos.dst2(at) < radius * radius) e.hear(at);
        }
    }

    /** Explosão de granada: dano pela distância em todos que estiverem perto. */
    int explosion(Vector3 at, float radius, float maxDamage) {
        int killed = 0;
        alert(at, 60f);
        for (int i = 0; i < list.size; i++) {
            Enemy e = list.get(i);
            if (!e.alive()) continue;
            float d = at.dst(e.pos.x, e.pos.y + 0.9f, e.pos.z);
            if (d < radius) {
                float k = 1f - d / radius;
                if (e.damage(maxDamage * k * k + 8f * k, at)) { kills++; killed++; }
            }
        }
        return killed;
    }

    /** O que desenhar (corpo e arma), dentro da distância de desenho. */
    void collect(Array<ModelInstance> out) {
        for (int i = 0; i < list.size; i++) {
            Enemy e = list.get(i);
            if (!e.visibleToCam) continue;
            out.add(e.inst);
            if (e.gun != null) out.add(e.gun);
        }
    }
}
