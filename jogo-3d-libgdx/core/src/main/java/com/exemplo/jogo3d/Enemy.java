package com.exemplo.jogo3d;

import com.badlogic.gdx.graphics.Color;
import com.badlogic.gdx.graphics.g3d.Material;
import com.badlogic.gdx.graphics.g3d.Model;
import com.badlogic.gdx.graphics.g3d.ModelInstance;
import com.badlogic.gdx.graphics.g3d.attributes.ColorAttribute;
import com.badlogic.gdx.graphics.g3d.model.Node;
import com.badlogic.gdx.graphics.g3d.utils.AnimationController;
import com.badlogic.gdx.math.MathUtils;
import com.badlogic.gdx.math.Vector3;

/**
 * Cangaceiro inimigo: mesmo esqueleto do personagem (as hitboxes seguem as animações), roupa de
 * couro e rifle na mão.
 *
 * Comportamento: patrulha em volta de casa; ao ver o jogador (linha de visão livre), entra em
 * combate alternando correr de lado / avançar / recuar e parar para atirar. Tomando tiro, vira para
 * o atirador. Morto, toca a animação de morte e fica no chão.
 */
final class Enemy {
    enum State { RIDE, FALL, CHUTE, PATROL, COMBAT, DEAD }   // RIDE/FALL/CHUTE: no avião, caindo, no paraquedas

    static final float MAX_HEALTH = 100f;
    private static final float WALK = 1.3f, RUN = 4.2f, SIGHT = 60f;
    private static final float RUN_CLIP_SPEED = 5.5f, WALK_CLIP_SPEED = 1.8f;

    private static final Color[] SHIRTS = {new Color(0.42f, 0.27f, 0.14f, 1f), new Color(0.75f, 0.70f, 0.60f, 1f),
            new Color(0.55f, 0.25f, 0.18f, 1f), new Color(0.35f, 0.45f, 0.55f, 1f), new Color(0.45f, 0.50f, 0.32f, 1f),
            new Color(0.25f, 0.22f, 0.20f, 1f), new Color(0.80f, 0.62f, 0.30f, 1f)};
    private static final Color[] PANTS = {new Color(0.55f, 0.48f, 0.33f, 1f), new Color(0.30f, 0.25f, 0.20f, 1f),
            new Color(0.35f, 0.42f, 0.58f, 1f), new Color(0.50f, 0.42f, 0.30f, 1f), new Color(0.22f, 0.22f, 0.24f, 1f)};
    private static final Color[] HAIR = {new Color(0.10f, 0.07f, 0.05f, 1f), new Color(0.30f, 0.20f, 0.12f, 1f),
            new Color(0.55f, 0.40f, 0.22f, 1f), new Color(0.65f, 0.63f, 0.60f, 1f)};

    final ModelInstance inst;
    ModelInstance gun;                       // arma na mão (null = desarmado)
    static final int BOT_MAGAZINE = 15;      // balas no pente do bot
    static final float BOT_RELOAD = 2.5f;    // s para recarregar
    int ammo = BOT_MAGAZINE;
    int reserve = 45;                        // balas de reserva (três pentes)
    float reloadT;
    // Cobertura: ponto atrás do qual quem atira não enxerga o bot
    float coverX, coverZ;
    boolean hasCover;
    private final Vector3 coverEye = new Vector3(), coverP = new Vector3(), coverN = new Vector3();

    // Busca de caminho até a cobertura: grade de 2 m, 20 m em volta do bot (Dijkstra limitado)
    private static final int GN = 21;
    private static final float GC = 2f;
    private final float[] pathX = new float[GN * GN], pathZ = new float[GN * GN];
    private int pathLen, pathI;
    private float pathT;
    private final float[] gDist = new float[GN * GN];
    private final int[] gPar = new int[GN * GN];
    private final boolean[] gDone = new boolean[GN * GN];

    /** Ponto de pé e sem colisão com obstáculos (o colisor não o empurra). */
    private boolean walkable(World w, float x, float z) {
        if (Math.abs(x) > World.HALF - 4f || Math.abs(z) > World.HALF - 4f) return false;
        coverN.set(x, w.groundAt(x, z), z);
        float px = x, pz = z;
        w.resolveCollisions(coverN, 0.35f);
        return Math.abs(coverN.x - px) + Math.abs(coverN.z - pz) < 0.05f;
    }

    /** Planeja o caminho até o ponto mais perto escondido do alvo. Devolve true se achou. */
    private boolean planCover(World w, Vector3 target) {
        final float sx = pos.x, sz = pos.z;
        java.util.Arrays.fill(gDist, Float.MAX_VALUE);
        java.util.Arrays.fill(gDone, false);
        java.util.Arrays.fill(gPar, -1);
        final int start = (GN / 2) * GN + GN / 2;
        gDist[start] = 0f;
        java.util.PriorityQueue<Integer> pq = new java.util.PriorityQueue<>((a, b) -> Float.compare(gDist[a], gDist[b]));
        pq.add(start);
        int goal = -1, popped = 0;
        coverEye.set(target).add(0f, 1.2f, 0f);
        while (!pq.isEmpty() && popped < 260) {
            int c = pq.poll();
            if (gDone[c]) continue;
            gDone[c] = true;
            popped++;
            int ci = c / GN, cj = c % GN;
            float x = sx + (ci - GN / 2) * GC, z = sz + (cj - GN / 2) * GC;
            if (c != start && hidden(w, x, z)) {
                goal = c;
                break;
            }
            for (int di = -1; di <= 1; di++) {
                for (int dj = -1; dj <= 1; dj++) {
                    if (di == 0 && dj == 0) continue;
                    int ni = ci + di, nj = cj + dj;
                    if (ni < 0 || nj < 0 || ni >= GN || nj >= GN) continue;
                    int n = ni * GN + nj;
                    if (gDone[n]) continue;
                    float nx = sx + (ni - GN / 2) * GC, nz = sz + (nj - GN / 2) * GC;
                    if (!walkable(w, nx, nz)) continue;
                    // o meio do passo também precisa estar livre (não atravessa a quina de um obstáculo)
                    if (!walkable(w, (x + nx) * 0.5f, (z + nz) * 0.5f)) continue;
                    float nd = gDist[c] + GC * (di != 0 && dj != 0 ? 1.41f : 1f);
                    if (nd < gDist[n]) {
                        gDist[n] = nd;
                        gPar[n] = c;
                        pq.add(n);
                    }
                }
            }
        }
        if (goal < 0) return false;
        int k = 0;
        for (int c = goal; c != start && c != -1; c = gPar[c]) k++;
        pathLen = k;
        int idx = k - 1;
        for (int c = goal; c != start && c != -1; c = gPar[c]) {
            pathX[idx] = sx + (c / GN - GN / 2) * GC;
            pathZ[idx] = sz + (c % GN - GN / 2) * GC;
            idx--;
        }
        pathI = 0;
        coverX = pathX[pathLen - 1];
        coverZ = pathZ[pathLen - 1];
        return true;
    }

    /** Verdadeiro se (x, z) e os pontos em volta estão fora da linha de visão do alvo. */
    private boolean hidden(World w, float x, float z) {
        for (int k = 0; k < 9; k++) {   // o centro e oito pontos a 1 m (a borda de uma depressão não pode expor o bot)
            float ox = k == 0 ? 0f : MathUtils.cos(k * MathUtils.PI2 / 8f) * 1f, oz = k == 0 ? 0f : MathUtils.sin(k * MathUtils.PI2 / 8f) * 1f;
            coverP.set(x + ox, w.groundAt(x + ox, z + oz) + 1.6f, z + oz);   // mesma altura do olho usada na visão
            if (w.lineOfSight(coverEye, coverP)) return false;
        }
        return true;
    }

    WeaponConfig weapon;                     // arma que o bot pegou no chão (null = sem arma)
    private final AnimationController anim;
    final Hitbox hitbox;
    private final Node hand;
    final Vector3 pos = new Vector3(), home = new Vector3(), vel = new Vector3();
    float facing;
    float health = MAX_HEALTH;
    State state = State.PATROL;
    float deadT;
    private String clip = "";
    private final Vector3 goal = new Vector3(), tmp = new Vector3(), eye = new Vector3();
    private float waitT, phaseT, lookT, lostT, fireT;
    private boolean shooting;
    private float animAcc;
    private int side = 1;
    boolean canSee;
    // Alvo: outro bot ou o jogador. Sem alvo à vista, vai ao último lugar conhecido (não sabe onde o jogador está).
    Enemy targetEnemy;
    boolean targetPlayer;
    final Vector3 lastKnown = new Vector3(), tgt = new Vector3();
    boolean hasLast;
    int botKills;
    float barT;                   // (sem barra de vida na tela: só o tempo da reação)
    float slowT;                  // s de manquejar (perna atingida)
    private float headSnap;       // 1 no headshot, cai com o tempo
    private com.badlogic.gdx.math.Matrix4 savedHead;
    private final com.badlogic.gdx.math.Matrix4 headOv = new com.badlogic.gdx.math.Matrix4();
    private float hitT, hitDur = 0.18f, hitMag;   // reação ao dano (o corpo recua um pouco, o pano pisca)
    final Vector3 muzzle = new Vector3();
    boolean visibleToCam;   // dentro da distância de desenho (para não animar longe)
    boolean dummy;          // boneco de treino: parado, não atira e não morre
    boolean capacete, colete;   // proteção: capacete reduz o dano na cabeça, colete no tronco (armas com armadura)
    float dummyDamage;      // dano total levado (mostrado no treino)

    Enemy(Model body, Model gunModel, float x, float z, float seed) {
        inst = new ModelInstance(body);
        anim = new AnimationController(inst);
        hitbox = new Hitbox(inst);
        hand = inst.getNode("RightHand", true);
        gun = gunModel != null ? new ModelInstance(gunModel) : null;
        pos.set(x, 0f, z);
        home.set(x, 0f, z);
        facing = seed * MathUtils.PI2;
        // Roupa de couro e cáqui, cabelo escuro
        int k = (int) (seed * 997f) % SHIRTS.length;
        tint("mat21", SHIRTS[k]);
        tint("mat17", PANTS[(k + 2) % PANTS.length]);
        tint("mat18", PANTS[(k + 2) % PANTS.length].cpy().mul(0.8f, 0.8f, 0.8f, 1f));
        tint("mat19", HAIR[k % HAIR.length]);
        tint("mat20", HAIR[k % HAIR.length]);
        setClip("Idle", 1f);
        waitT = 1f + seed * 3f;
    }

    private void tint(String id, Color c) {
        Material m = inst.getMaterial(id);
        if (m != null) m.set(ColorAttribute.createDiffuse(c));
    }

    boolean alive() { return state != State.DEAD; }

    /** Verdadeiro depois que o loot do corpo foi para o chão. */
    boolean lootDone;

    /**
     * Um passo do comportamento. Devolve true se disparou neste quadro (o Enemies decide se acertou).
     */
    /** Bot da arena de mira: só anda na faixa e recebe dano; não ataca (sem IA de combate). Null nos demais. */
    BotMira bot;

    /** Nome exibido no feed de abates (ex.: AMIGO002, INIMIGO001). */
    String nome = "";
    /** Equipe na sala personalizada: 0 azul (aliado do jogador), 1 vermelha, -1 sem equipe (battle royale). */
    int equipe = -1;
    /** Nome de quem causou o último dano (creditado no abate); null = granada ou desconhecido. */
    String ultimoAtacante;
    /** Multiplicador de precisão (dificuldade dos bots): 1 é médio. */
    float precisao = 1f;

    /** Dois bots da mesma equipe não se atacam. Sem equipe (-1) não se usa esta regra. */
    static boolean mesmaEquipe(int equipeA, int equipeB) { return equipeA >= 0 && equipeA == equipeB; }

    /** Só a equipe vermelha ataca o jogador; os aliados azuis não atiram nele. Sem equipe, ataca como antes. */
    static boolean podeMirarJogador(int equipe) { return equipe != 0; }

    /** Bot de mira: morto, reaparece no início da faixa depois de RESPAWN_SEG. Vivo, anda e atualiza a hitbox. */
    private boolean botStep(float dt, World w, Enemies all) {
        if (state == State.DEAD) {
            deadT += dt;
            pose(dt);
            if (deadT >= BotMira.RESPAWN_SEG) {
                health = MAX_HEALTH;
                state = State.PATROL;
                deadT = 0f;
                hitT = 0f;
                headSnap = 0f;
                glow(false);
                bot.reinicia();
                pos.set(bot.x(), w.groundAt(bot.x(), bot.z), bot.z);
                clip = null;
            }
            hitbox.update(all.frame());
            return false;
        }
        facing = bot.passo(dt, lootRndBot);
        pos.set(bot.x(), w.groundAt(bot.x(), bot.z), bot.z);
        setClip(bot.clipe(), 1f);
        pose(dt);
        hitbox.update(all.frame());
        return false;
    }

    private static final java.util.Random lootRndBot = new java.util.Random();

    boolean update(float dt, World w, Enemies all, Vector3 player, boolean playerAlive) {
        if (bot != null) return botStep(dt, w, all);
        if (state == State.DEAD) {
            deadT += dt;
            if (visibleToCam) anim.update(dt);
            placeGun();
            return false;
        }
        if (dummy) {   // alvo parado: fica no lugar, sem andar nem atirar
            setClip("Idle", 1f);
            pose(dt);
            return false;
        }
        if (weapon == null && state == State.COMBAT) state = State.PATROL;   // sem arma não entra em combate
        if (targetEnemy != null && !targetEnemy.alive()) { targetEnemy = null; canSee = false; }
        if (targetPlayer && !playerAlive) { targetPlayer = false; canSee = false; }
        boolean haveTarget = targetEnemy != null || targetPlayer;
        if (targetEnemy != null) tgt.set(targetEnemy.pos);
        else if (targetPlayer) tgt.set(player);

        // Visão: algumas vezes por segundo (raio custa). Mantém o alvo atual se ainda o vê; senão procura
        // entre os 3 mais próximos (outros bots e o jogador), na frente ou muito perto.
        lookT -= dt;
        if (lookT <= 0f && weapon != null) {
            lookT = 0.25f + MathUtils.random(0.1f);
            canSee = false;
            eye.set(pos).add(0f, 1.6f, 0f);
            if (haveTarget) canSee = see(w, tgt);
            if (!canSee) {
                float prev = -1f;
                for (int round = 0; round < 3 && !canSee; round++) {
                    float bd = Float.MAX_VALUE;
                    Enemy be = null;
                    boolean bp = false;
                    if (playerAlive && podeMirarJogador(equipe)) {
                        float d = (float) Math.hypot(player.x - pos.x, player.z - pos.z);
                        if (d > prev && d < SIGHT && d < bd) { bd = d; bp = true; }
                    }
                    for (int i = 0; i < all.list.size; i++) {
                        Enemy o = all.list.get(i);
                        if (o == this || !o.alive() || mesmaEquipe(equipe, o.equipe)) continue;
                        float d = (float) Math.hypot(o.pos.x - pos.x, o.pos.z - pos.z);
                        if (d > prev && d < SIGHT && d < bd) { bd = d; be = o; bp = false; }
                    }
                    if (bd == Float.MAX_VALUE) break;
                    prev = bd;
                    Vector3 at = bp ? player : be.pos;
                    float ahead = MathUtils.cos(wrap(MathUtils.atan2(at.x - pos.x, at.z - pos.z) - facing));
                    if ((bd < 14f || ahead > 0.2f || state == State.COMBAT) && see(w, at)) {
                        canSee = true;
                        targetEnemy = bp ? null : be;
                        targetPlayer = bp;
                        tgt.set(at);
                    }
                }
            }
        }
        haveTarget = targetEnemy != null || targetPlayer;
        if (canSee && haveTarget) {
            if (state != State.COMBAT) { phaseT = 0f; shooting = false; fireT = 0.6f + MathUtils.random(0.6f); }
            state = State.COMBAT;
            lostT = 0f;
            lastKnown.set(tgt);
            hasLast = true;
        } else if (state == State.COMBAT) {
            lostT += dt;
            if (lostT > 10f || !hasLast) {
                state = State.PATROL;
                targetEnemy = null;
                targetPlayer = false;
                hasLast = false;
                waitT = 1f;
            }
        }
        Vector3 aim = canSee && haveTarget ? tgt : lastKnown;
        float dx = aim.x - pos.x, dz = aim.z - pos.z;
        float dist = (float) Math.sqrt(dx * dx + dz * dz);
        float toPlayer = MathUtils.atan2(dx, dz);   // (direção do alvo)

        boolean fired = false;
        float speed = 0f;
        float moveDir = facing;
        // Sem arma: vai até a arma mais próxima no chão e pega (um bot não pega a que outro já pegou)
        boolean seeking = false;
        if (state == State.PATROL && weapon == null && w.weapons != null) {
            seekT -= dt;
            if (seekT <= 0f || seekPick == null || !w.weapons.ground.contains(seekPick, true)) {
                seekPick = nearestPickup(w);
                seekT = 0.5f;
            }
            if (seekPick != null) {
                seeking = true;
                float gx = seekPick.pos.x - pos.x, gz = seekPick.pos.z - pos.z, gd = (float) Math.sqrt(gx * gx + gz * gz);
                if (gd < 1.2f) {
                    takeWeapon(w, seekPick);
                    seekPick = null;
                } else {
                    moveDir = MathUtils.atan2(gx, gz);
                    speed = RUN;
                }
            }
        }
        if (seeking) {
            // indo pegar uma arma ou fugindo do gás
        } else if (state == State.PATROL) {
            if (waitT > 0f) {
                waitT -= dt;
                setClip("IdleLook", 1f);
                if (waitT <= 0f) {
                    float a = MathUtils.random(MathUtils.PI2), r = MathUtils.random(5f, 22f);
                    goal.set(home.x + MathUtils.cos(a) * r, 0f, home.z + MathUtils.sin(a) * r);
                }
            } else {
                float gx = goal.x - pos.x, gz = goal.z - pos.z, gd = (float) Math.sqrt(gx * gx + gz * gz);
                if (gd < 0.5f) waitT = MathUtils.random(2f, 5f);
                else { moveDir = MathUtils.atan2(gx, gz); speed = WALK; }
            }
        } else if (!seeking) {
            // Combate: anda (lado, frente, trás) e para para atirar
            phaseT -= dt;
            if (phaseT <= 0f) {
                shooting = !shooting && canSee;
                phaseT = shooting ? MathUtils.random(1.4f, 2.8f) : MathUtils.random(1.0f, 2.2f);
                if (!shooting && MathUtils.randomBoolean(0.6f)) side = -side;
            }
            boolean hurt = weapon != null && health < MAX_HEALTH * 0.3f && (canSee || hasCover);
            if (hurt) {
                // ferido: busca caminho até uma cobertura (de pé, fora da linha de visão); segue os pontos e para lá
                pathT -= dt;
                boolean atCover = hasCover && pathI >= pathLen && !canSee;
                if (pathT <= 0f && !atCover) {
                    pathT = 2f;
                    hasCover = planCover(w, player);
                }
                if (hasCover && pathI < pathLen) {
                    float gx = pathX[pathI] - pos.x, gz = pathZ[pathI] - pos.z, gd = (float) Math.sqrt(gx * gx + gz * gz);
                    if (gd < 0.6f) {
                        pathI++;
                    } else {
                        moveDir = MathUtils.atan2(gx, gz);
                        speed = RUN;
                    }
                } else if (hasCover) {
                    speed = 0f;
                    setClip("IdleKneel", 1f);   // abaixado atrás da cobertura
                } else {
                    // sem cobertura alcançável: recua; se encostar em algo, troca de lado (side)
                    moveDir = toPlayer + MathUtils.PI + side * 0.8f;
                    speed = RUN;
                }
            } else if (shooting) {
                facing += wrap(toPlayer - facing) * Math.min(1f, dt * 8f);
                setClip("Mirar", 1f);
                fireT -= dt;
                if (reloadT > 0f) {
                    // recarregando: não atira até terminar
                    reloadT -= dt;
                    if (reloadT <= 0f) {
                        int take = Math.min(BOT_MAGAZINE, reserve);
                        ammo = take;
                        reserve -= take;
                    }
                } else if (fireT <= 0f && canSee) {
                    if (ammo <= 0) {
                        if (reserve > 0) reloadT = BOT_RELOAD;   // sem reserva, fica só com o clique
                    } else {
                        fireT = WeaponConfig.RIFLE_INIMIGO.fireInterval + MathUtils.random(0.25f, 0.8f);
                        ammo--;
                        fired = true;
                    }
                }
            } else {
                if (!canSee && dist < 2.5f) {                                  // chegou e não achou ninguém: olha em volta
                    setClip("IdleLook", 1f);
                    lostT += dt * 2f;
                    speed = 0f;
                } else if (dist > 28f || !canSee) { moveDir = toPlayer; speed = RUN; }   // avança
                else if (dist < 9f) { moveDir = toPlayer + MathUtils.PI + side * 0.5f; speed = RUN; }   // recua
                else { moveDir = toPlayer + side * MathUtils.HALF_PI; speed = RUN; }                   // corre de lado
            }
        }
        if (slowT > 0f) {
            slowT -= dt;
            speed *= 0.5f;
        }
        if (speed > 0f) {
            facing += wrap(moveDir - facing) * Math.min(1f, dt * 7f);
            float px = pos.x, pz = pos.z;
            pos.x += MathUtils.sin(moveDir) * speed * dt;
            pos.z += MathUtils.cos(moveDir) * speed * dt;
            pos.x = MathUtils.clamp(pos.x, -World.HALF + 3f, World.HALF - 3f);
            pos.z = MathUtils.clamp(pos.z, -World.HALF + 3f, World.HALF - 3f);
            if (!w.podeAndar(px, pz, pos.x, pos.z)) { pos.x = px; pos.z = pz; }   // paredão: o inimigo não sobe
            w.resolveCollisions(pos, 0.35f);
            // preso numa parede: troca de lado / desiste do ponto
            float moved = (float) Math.hypot(pos.x - px, pos.z - pz);
            if (moved < speed * dt * 0.3f) { side = -side; if (state == State.PATROL) waitT = 1f; }
            vel.set((pos.x - px) / dt, 0f, (pos.z - pz) / dt);
            setClip(speed > 2f ? "Run" : "Walk", speed > 2f ? speed / RUN_CLIP_SPEED : speed / WALK_CLIP_SPEED);
        } else {
            vel.setZero();
        }
        pos.y = w.groundAt(pos.x, pos.z);
        inst.transform.setToTranslation(pos).rotate(Vector3.Y, facing * MathUtils.radiansToDegrees);
        if (barT > 0f) barT -= dt;
        if (hitT > 0f) {
            hitT -= dt;
            float k = Math.max(0f, hitT / hitDur);
            // recua para trás a partir do quadril e volta (o osso e as hitboxes acompanham)
            inst.transform.translate(0f, 0.9f, 0f).rotate(Vector3.X, -hitMag * 11f * MathUtils.sin(k * MathUtils.PI)).translate(0f, -0.9f, 0f);
            if (hitT <= 0f) glow(false);
        }
        // longe da câmera: anima em passos maiores (economia); a pose continua válida para as hitboxes
        animAcc += dt;
        if (closeToCam || animAcc > 0.2f) {
            anim.update(animAcc);
            animAcc = 0f;
        }
        placeGun();
        return fired;
    }

    private void placeGun() {
        if (gun == null || hand == null) return;
        tmp.set(0f, 0f, 0f).mul(hand.globalTransform).mul(inst.transform);
        float down = state == State.DEAD ? 70f : (clip.equals("Mirar") ? 4f : 28f);
        gun.transform.setToTranslation(tmp).rotate(Vector3.Y, facing * MathUtils.radiansToDegrees).rotate(Vector3.X, down);
        muzzle.set(tmp).add(MathUtils.sin(facing) * 0.62f, 0.05f, MathUtils.cos(facing) * 0.62f);
    }

    /** Linha de visão até o alvo (peito). */
    private boolean see(World w, Vector3 at) {
        tmp.set(at).add(0f, 1.2f, 0f);
        return w.lineOfSight(eye, tmp);
    }

    /** Ouviu um tiro vindo de "at": vai até lá procurar (não sabe quem é). */
    void hear(Vector3 at) {
        if (state == State.DEAD || weapon == null) return;
        if (state != State.COMBAT) { phaseT = 0f; shooting = false; fireT = 0.8f; }
        state = State.COMBAT;
        lostT = -2f;
        lastKnown.set(at);
        hasLast = true;
    }

    /** Levou tiro de outro bot: passa a reagir contra ele. */
    void retaliate(Enemy shooter) {
        if (state == State.DEAD || weapon == null) return;
        if (!canSee || targetEnemy == null) {
            targetEnemy = shooter;
            targetPlayer = false;
            lastKnown.set(shooter.pos);
            hasLast = true;
            canSee = false;
            lookT = 0f;
        }
        hear(shooter.pos);
    }

    boolean flinching() { return hitT > 0f; }

    // ---------- Queda do avião ----------
    private static final float DROP_OPEN = 100f, CHUTE_FALL = 6f, DRIFT = 2.5f;
    private float jumpT, offAlong, offSide;
    private float seekT;
    float lodT;   // tempo acumulado enquanto está longe (atualização a cada 3 quadros)
    boolean closeToCam;   // perto da câmera (≤ 60 m): o esqueleto é atualizado a cada quadro
    private Weapons.Pickup seekPick;
    final Vector3 fallVel = new Vector3();

    /** Procura a arma no chão mais próxima (até ~260 m). */
    private Weapons.Pickup nearestPickup(World w) {
        Weapons.Pickup best = null;
        float bd = 260f * 260f;
        for (int i = 0; i < w.weapons.ground.size; i++) {
            Weapons.Pickup p = w.weapons.ground.get(i);
            float dx = p.pos.x - pos.x, dz = p.pos.z - pos.z, d = dx * dx + dz * dz;
            if (d < bd) { bd = d; best = p; }
        }
        return best;
    }

    /** Pega a arma do chão: tira do mapa e passa a segurá-la (e a atirar). */
    private void takeWeapon(World w, Weapons.Pickup p) {
        if (!w.weapons.ground.removeValue(p, true)) return;   // outro bot pegou antes
        w.instances.removeValue(p.inst, true);
        weapon = WeaponConfig.BY_TYPE[p.type];
        gun = new ModelInstance(w.weapons.models()[p.type]);
        lookT = 0f;
    }

    /** Reação ao tiro: recuo curto do corpo e brilho vermelho do pano (mais forte na cabeça). */
    void flinch(boolean head, int bone) {
        if (state == State.DEAD) return;
        if (head) headSnap = 1f;   // headshot: a cabeça estala para trás
        hitT = hitDur;
        hitMag = head ? 1.4f : 0.8f;
        if (bone >= 8 && bone <= 11) slowT = 1.2f;   // perna atingida: manca e anda mais devagar por um tempo
        if (!dummy) glow(true);   // boneco de treino: a reação de recuo fica, sem o brilho vermelho
    }

    private void glow(boolean on) {
        for (int i = 0; i < inst.materials.size; i++) {
            Material m = inst.materials.get(i);
            if (on) m.set(ColorAttribute.createEmissive(0.55f, 0.04f, 0.02f, 1f));
            else m.remove(ColorAttribute.Emissive);
        }
    }

    /** Leva dano; devolve true se morreu agora. */
    boolean damage(float amount, Vector3 from) {
        if (dummy) {   // boneco de treino: não cai nem reage, só soma o dano para o treino
            dummyDamage += amount;
            return false;
        }
        if (state == State.DEAD) return false;
        barT = 3f;
        health -= amount;
        // virou alvo: entra em combate (se tiver arma) e encara o atirador
        if (weapon != null) state = State.COMBAT;
        lostT = 0f;
        if (from != null) {
            facing = MathUtils.atan2(from.x - pos.x, from.z - pos.z);
            lastKnown.set(from);
            hasLast = true;
            lookT = 0f;
        }
        if (health <= 0f) {
            health = 0f;
            state = State.DEAD;
            deadT = 0f;
            hitT = 0f;     // a reação de dano para: vale só a animação de morte
            glow(false);
            clip = "Dying";
            anim.animate("Dying", 1, 1f, null, 0.12f);
            return true;
        }
        return false;
    }

    private void setClip(String c, float sp) {
        if (!c.equals(clip)) {
            clip = c;
            anim.animate(c, -1, 1f, null, 0.2f);
        }
        if (anim.current != null) anim.current.speed = sp;
    }

    /** Força uma animação (usado nos testes de hitbox: pular, agachar, deitar). */
    void forceClip(String c) {
        clip = c;
        anim.animate(c, -1, 1f, null, 0f);
    }

    /** Toca uma animação uma vez e para na última pose (testes: deitar, morrer). */
    void forceOnce(String c) {
        clip = c;
        anim.animate(c, 1, 1f, null, 0f);
    }

    void pose(float dt) {
        inst.transform.setToTranslation(pos).rotate(Vector3.Y, facing * MathUtils.radiansToDegrees);
        anim.update(dt);
    }

    private static float wrap(float a) {
        while (a > MathUtils.PI) a -= MathUtils.PI2;
        while (a < -MathUtils.PI) a += MathUtils.PI2;
        return a;
    }
}
