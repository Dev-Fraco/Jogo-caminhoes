package com.exemplo.jogo3d;

import com.badlogic.gdx.ApplicationAdapter;
import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.Input;
import com.badlogic.gdx.graphics.GL20;
import com.badlogic.gdx.graphics.OrthographicCamera;
import com.badlogic.gdx.graphics.PerspectiveCamera;
import com.badlogic.gdx.graphics.g2d.BitmapFont;
import com.badlogic.gdx.graphics.g2d.GlyphLayout;
import com.badlogic.gdx.graphics.g2d.SpriteBatch;
import com.badlogic.gdx.graphics.g3d.Environment;
import com.badlogic.gdx.graphics.g3d.Model;
import com.badlogic.gdx.graphics.g3d.ModelBatch;
import com.badlogic.gdx.graphics.g3d.shaders.DefaultShader;
import com.badlogic.gdx.graphics.g3d.utils.DefaultShaderProvider;
import com.badlogic.gdx.graphics.g3d.attributes.ColorAttribute;
import com.badlogic.gdx.graphics.g3d.environment.DirectionalLight;
import com.badlogic.gdx.graphics.glutils.ShapeRenderer;
import com.badlogic.gdx.math.MathUtils;
import com.badlogic.gdx.math.Vector3;
import com.badlogic.gdx.graphics.g3d.ModelInstance;
import com.badlogic.gdx.utils.Array;
import com.badlogic.gdx.utils.Array;

/**
 * Sertão do Ceará, 1915. Relevo com subidas e descidas, casas cercadas com porteira.
 * Celular: joystick embaixo à esquerda, arrastar na metade direita para girar, botões de correr e pular.
 * Engrenagem no canto superior esquerdo: edita a posição e o tamanho de cada botão.
 * PC: WASD/setas, espaço, arrastar com o mouse para girar.
 */
public class Main extends ApplicationAdapter {

    // ---------- Ajustes ----------
    static final float CAMERA_DISTANCE = 4.5f;
    static final float CAMERA_DISTANCE_INSIDE = 1.7f;   // dentro da casa a câmera chega perto do personagem
    static final float LOOK_SENSITIVITY = 0.006f;

    // ---------- 3D ----------
    private ModelBatch modelBatch;
    private Environment environment;
    private PerspectiveCamera camera;
    private World world;
    private Character character;

    // ---------- Jogador ----------
    private final Player player = new Player();
    private boolean jumpRequested = false;
    private float yaw = 0f;      // direção da câmera (e do personagem)
    private float pitch = 0.45f; // inclinação da câmera (positivo = de cima)

    // ---------- Toque / HUD ----------
    private final boolean[] wasDown = new boolean[5];
    private int joyPointer = -1, lookPointer = -1, jumpPointer = -1, runPointer = -1;
    private boolean runToggle = false;   // botão CORRER liga/desliga a corrida
    private float joyX, joyY;            // -1..1
    private float joyRadius = 100f;
    private float lookLastX, lookLastY;  // coordenadas da tela (origem em cima)
    private FenceSystem.Prompt prompt = null;     // folha da porteira ao alcance (mostra o botão)
    private boolean crouchOn = false;
    // Configurações (engrenagem): taxa de quadros e qualidade gráfica
    private boolean settingsOpen = false;
    private final Array<ModelInstance> drawList = new Array<>();
    private final Vector3 tmpT = new Vector3();
    private final String[] setIds = new String[12];
    private final float[][] setRects = new float[12][4];
    private int setN = 0;             // botão AGACHAR (agachado enquanto parado)
    private HouseDecor doorTarget = null;         // porta ao alcance (mostra o botão da porta)
    private Weapons.Pickup weaponTarget = null;   // arma no chão ao alcance (mostra PEGAR)
    private Items.Pickup itemTarget = null;       // item no chão ao alcance (mostra PEGAR)
    private Parachute chute;                      // paraquedas (abre a 100 m do chão)
    private boolean parachuting = false;
    // Menu principal: o jogo abre aqui; morrer ou sair da partida volta para cá
    private boolean inMenu = true;
    private Intro intro;                          // abertura (só ao iniciar o jogo)
    private final Lobby lobby = new Lobby();      // lobby (menu principal)

    private boolean training = false;   // modo treinamento (galpão com dois bonecos) em vez do battle royale
    private boolean arena = false;      // sala personalizada: ARENA LIVRE (plana, com muro, sem teto)
    // Partida da sala personalizada (arena): rounds, economia, loja e espectador
    private Rodadas rodadas;
    private Economia economia;
    private ArenaUi arenaUi;
    private Sala arenaSala;
    private final java.util.Map<String, Integer> arenaEquipes = new java.util.HashMap<>();
    private boolean lojaFechada, espectando, finalAberto, arenaFimRegistrado;
    private int alvoEsp = 0;
    /** Feed de abates da arena: linhas recentes e tempo que cada uma fica na tela. */
    private final java.util.ArrayList<String> feed = new java.util.ArrayList<>();
    private final java.util.ArrayList<Float> feedT = new java.util.ArrayList<>();
    private final AbateEmblema emblema = new AbateEmblema();
    private final FimRoundUi fimUi = new FimRoundUi();
    private Sons sons;
    /** Abates de cada jogador no round atual (inclui bots), para a tabela do fim de round. */
    private final java.util.LinkedHashMap<String, Integer> abatesRound = new java.util.LinkedHashMap<>();
    private String bannerFim = null;
    // Arena de mira (portal do treinamento): o treinamento fica guardado enquanto o jogador treina na arena
    private boolean mira = false, portalPerto = false;
    private World treinoWorld;
    private Enemies treinoEnemies;
    private ShootingSystem treinoShooting;
    private Grenades treinoGrenades;
    private boolean trainPanel = false; // caixa de equipamentos do treino (lista de armas)
    private boolean trainBoxNear = false;   // perto da caixa de equipamentos (mostra o botão de ação)
    private final Arsenal arsenal = new Arsenal();   // arsenal de treino (abas, grade, EQUIPAR)
    private int arsenalPointer = -1;                  // dedo que está rolando a grade do arsenal
    // Itens: vida/energia/água, granadas, HUD dos itens e mapa
    private Survival survival;
    private Grenades grenades;
    private final ItemUi itemUi = new ItemUi();
    private MapUi mapUi;
    private Places places;
    private boolean fullMapOpen = false;   // mapa inteiro (toque no minimapa; toque na tela fecha)
    private boolean iconsDirty = true;
    private boolean aiming = false;               // segurando o espaço da granada: mostra o arco
    private int aimType = -1, grenPointer = -1;
    private final Vector3 gFrom = new Vector3(), gVel = new Vector3();
    private boolean dyingShown = false;
    private com.badlogic.gdx.audio.Sound planeSound;     // motor do avião (loop)
    private long planeSoundId = -1;
    private com.badlogic.gdx.audio.Sound windSound;      // vento da queda (loop), com e sem paraquedas
    private long windSoundId = -1;
    private float windVol = 0f;
    private int prone = 0;                        // deitado no chão: 0 não, 1 deitando/deitado, 2 levantando
    // Combate: inimigos, mira, assistência, tiro e dano
    private Enemies enemies;
    private final TargetDetection targets = new TargetDetection();
    private final AimAssist assist = new AimAssist();
    private final AimController aimCtl = new AimController();
    private ShootingSystem shooting;               // disparo: modos, dispersão, efeitos e dano
    private final Vector3 whizP = new Vector3();
    private float gustT = 3f;
    private final Vector3 gustP = new Vector3();
    private final ShootingSystem.Input shootIn = new ShootingSystem.Input();
    private final Hitbox.Hit overHit = new Hitbox.Hit();
    private DamageSystem damage;
    private CombatFx fx;
    private final AimSettingsUi aimUi = new AimSettingsUi();
    private int aimPointer = -1;   // dedo que está arrastando uma barra da tela de mira
    private final ColetaUi coletaUi = new ColetaUi();   // "TROCAR QUAL ARMA?" ao pegar fuzil com os dois slots cheios
    private int firePointer = -1;
    // Muro (botão PAREDE): toque põe na frente; segurar mostra a sombra, e soltar põe onde ela está
    private static final float WALL_HOLD = 0.25f;   // segundos segurando para virar sombra
    private int wallPointer = -1;
    private float wallHoldT = 0f, wallDist = 3f, wallLastY;
    private boolean wallGhostOn = false;
    private com.badlogic.gdx.graphics.g3d.ModelInstance wallGhost;
    private final World.WallSpot wallSpotNow = new World.WallSpot();
    private float fireLastX, fireLastY;
    private boolean firePressed = false;          // acabou de apertar (armas sem automático)
    private final TouchFire touchFire = new TouchFire();
    private int fire2Pointer = -1;               // botão de atirar fixo (não mexe na câmera)
    private final Camp camp = new Camp();
    private Scope scope;                          // luneta do fuzil de precisão
    private Scope sight;                          // mira red dot: a moldura da luneta, sem zoom (todas as armas, ao mirar)
    private Model mannequin;                      // boneco de treino (carregado só quando precisa)

    private Model mannequin() {
        if (mannequin == null) mannequin = ModelIO.load("models/mannequin.g3dj");
        return mannequin;
    }
    private boolean adsOn = false;                // mirando (botão de mira)
    private boolean combat = false;               // armado e no chão: câmera por cima do ombro
    private boolean overEnemy = false;
    private final Vector3 aimDir = new Vector3(), shotDir = new Vector3(), side1 = new Vector3(), side2 = new Vector3(), tmpA = new Vector3();
    private final Array<ModelInstance> enemyDraw = new Array<>();
    // Battle royale: começa dentro do avião, salta, cai de barriga para baixo e pousa
    private boolean inPlane = false, skydiving = false, landing = false;
    private final Vector3 fallVel = new Vector3();
    private static final float TERMINAL = 22f;    // velocidade máxima de queda (m/s)
    private float camDist = CAMERA_DISTANCE;      // distância da câmera, suavizada
    private final Hud hud = new Hud();
    private OrthographicCamera hudCamera;
    private ShapeRenderer shapes;
    private SpriteBatch batch;
    private BitmapFont font;
    private final GlyphLayout layout = new GlyphLayout();

    @Override
    public void create() {
        Gdx.gl.glEnable(GL20.GL_DEPTH_TEST);

        DefaultShader.Config shaderConfig = new DefaultShader.Config();
        shaderConfig.numBones = 80;
        // Sem descarte de faces: o shader padrão desligava o lado de dentro das paredes, do poço e do muro
        shaderConfig.defaultCullFace = 0;
        modelBatch = new ModelBatch(new DefaultShaderProvider(shaderConfig));
        scope = new Scope();
        scope.rate = 40f;   // AWM: luneta abre e fecha quase na hora
        sight = new Scope();

        environment = new Environment();
        // Luz de sol forte e quente do sertão, com pouca luz de ambiente (sombras escuras)
        environment.set(new ColorAttribute(ColorAttribute.AmbientLight, 0.46f, 0.42f, 0.37f, 1f));
        environment.add(new DirectionalLight().set(1f, 0.93f, 0.78f, -0.4f, -1f, -0.35f));

        camera = new PerspectiveCamera(67f, Gdx.graphics.getWidth(), Gdx.graphics.getHeight());
        camera.near = 0.1f;
        camera.far = 400f;

        hudCamera = new OrthographicCamera(Gdx.graphics.getWidth(), Gdx.graphics.getHeight());
        intro = new Intro();
        shapes = new ShapeRenderer();
        batch = new SpriteBatch();
        font = new BitmapFont();
        font.getData().setScale(1.1f);
    }

    private boolean carregado = false;   // o jogo carrega depois que a primeira imagem da abertura aparece
    private int quadrosAbertura = 0;

    /** Carrega o jogo (mapa, personagem, HUD...). Roda depois do primeiro quadro da abertura. */
    private void carregarJogo() {
        Settings.load();
        Settings.apply();
        try {
            hud.create();
        } catch (Throwable t) {
            errorText = "ERRO NO HUD:\n" + describe(t);
        }

        character = new Character();
        try {
            character.create();
        } catch (Throwable t) {
            errorText = "ERRO NO PERSONAGEM:\n" + describe(t);
        }
        // Moradores da cidade (usam o modelo do personagem, com roupas de outras cores)
        try {
            chute = new Parachute();
            survival = new Survival();
            try {
                planeSound = Gdx.audio.newSound(Gdx.files.internal("audio/aviao.mp3"));
                planeSoundId = planeSound.loop(0f);
            } catch (Throwable t) {
                planeSound = null;   // sem o arquivo: o jogo segue sem o som
            }
            try {
                windSound = Gdx.audio.newSound(Gdx.files.internal("audio/vento_queda.mp3"));
                windSoundId = windSound.loop(0f);
            } catch (Throwable t) {
                windSound = null;
            }
            AimSettings.load();
            fx = new CombatFx();
            damage = new DamageSystem(fx);
            loadWorld(false);   // battle royale: o avião, o mapa e o jogo começam aqui
        } catch (Throwable t) {
            errorText = "ERRO NOS MORADORES:\n" + describe(t);
        }

        player.spawn(0f, 0f, world.heightAt(0f, 0f));
        UpdateChecker.start();   // verifica nova versão em segundo plano
    }

    // Texto de erro que aparece na tela (para diagnóstico sem computador)
    private String errorText = null;

    private static String describe(Throwable t) {
        StringBuilder sb = new StringBuilder();
        sb.append(t.toString()).append('\n');
        StackTraceElement[] st = t.getStackTrace();
        for (int i = 0; i < Math.min(st.length, 6); i++) {
            sb.append("  at ").append(st[i].toString()).append('\n');
        }
        return sb.toString();
    }

    private void showError() {
        Gdx.gl.glDisable(GL20.GL_DEPTH_TEST);
        Gdx.gl.glClearColor(0.25f, 0f, 0f, 1f);
        Gdx.gl.glClear(GL20.GL_COLOR_BUFFER_BIT | GL20.GL_DEPTH_BUFFER_BIT);
        int h = Gdx.graphics.getHeight();
        hudCamera.setToOrtho(false, Gdx.graphics.getWidth(), h);
        hudCamera.update();
        batch.setProjectionMatrix(hudCamera.combined);
        batch.begin();
        font.setColor(1f, 1f, 1f, 1f);
        float y = h - 20f;
        for (String line : errorText.split("\n")) {
            font.draw(batch, line, 12f, y);
            y -= 22f;
        }
        batch.end();
    }

    /**
     * Desenha um quadro da abertura. Limpa a tela e desliga o teste de profundidade: com ele ligado e sem
     * limpar, a arte era descartada e a tela ficava preta. Religa o teste para o jogo em 3D.
     */
    private void desenharAbertura() {
        int W = Gdx.graphics.getWidth(), H = Gdx.graphics.getHeight();
        Gdx.gl.glDisable(GL20.GL_DEPTH_TEST);
        Gdx.gl.glClearColor(0f, 0f, 0f, 1f);
        Gdx.gl.glClear(GL20.GL_COLOR_BUFFER_BIT | GL20.GL_DEPTH_BUFFER_BIT);
        // A câmera de HUD só recebe a tela inteira depois; sem isto a arte sai deslocada e some metade
        hudCamera.setToOrtho(false, W, H);
        intro.draw(batch, hudCamera.combined, W, H);
        Gdx.gl.glEnable(GL20.GL_DEPTH_TEST);
    }

    @Override
    public void render() {
        if (errorText != null) {
            showError();
            return;
        }
        try {
            if (!carregado) {
                // Primeiro quadro: a abertura aparece já e a música começa; o jogo carrega no quadro seguinte
                Musica.tocar();
                desenharAbertura();
                if (++quadrosAbertura >= 2) {
                    carregarJogo();
                    carregado = true;
                }
                return;
            }
            if (intro != null && intro.running()) {   // abertura: toque pula a animação; na cena final, toque segue para o lobby
                if (Gdx.input.justTouched()) intro.toque();
                intro.update(Math.min(Gdx.graphics.getDeltaTime(), 0.25f));   // tempo real: 5 s também em celular lento
                if (intro.running()) desenharAbertura();
                return;
            }
            renderGame();
            if (intro != null) intro.drawFadeIn(batch, hudCamera.combined, Gdx.graphics.getWidth(), Gdx.graphics.getHeight());
            // HUD da partida da arena por último: fica por cima do HUD de armas e da loja
            if (arena && !inMenu && rodadas != null && arenaUi != null) drawArena(Gdx.graphics.getWidth(), Gdx.graphics.getHeight());
            if (mira || (training && portalPerto) || (training && world != null)) drawMiraHud(Gdx.graphics.getWidth(), Gdx.graphics.getHeight());
        } catch (Throwable t) {
            errorText = "ERRO AO RODAR:\n" + describe(t);
            showError();
        }
    }

    private void renderGame() {
        float dt = Math.min(Gdx.graphics.getDeltaTime(), 0.05f);
        if (iconsDirty && world.items != null) {
            world.items.renderIcons(modelBatch, environment);   // ícones 3D dos itens
            if (world.weapons != null) world.weapons.renderIcons(modelBatch, environment);
            iconsDirty = false;
        }

        updateTouch();
        if (inMenu && !hud.editing) {   // menu principal (o editor do HUD, se aberto, usa a tela do jogo)
            drawMenu(Gdx.graphics.getWidth(), Gdx.graphics.getHeight());
            return;
        }

        // Com o editor do HUD aberto, o personagem fica parado
        boolean ui = hud.editing || settingsOpen;
        float kx = 0f, ky = 0f;
        if (!ui) {
            if (Gdx.input.isKeyPressed(Input.Keys.W) || Gdx.input.isKeyPressed(Input.Keys.UP)) ky += 1f;
            if (Gdx.input.isKeyPressed(Input.Keys.S) || Gdx.input.isKeyPressed(Input.Keys.DOWN)) ky -= 1f;
            if (Gdx.input.isKeyPressed(Input.Keys.A) || Gdx.input.isKeyPressed(Input.Keys.LEFT)) kx -= 1f;
            if (Gdx.input.isKeyPressed(Input.Keys.D) || Gdx.input.isKeyPressed(Input.Keys.RIGHT)) kx += 1f;
        }
        float inX = ui ? 0f : MathUtils.clamp(kx + joyX, -1f, 1f);
        float inY = ui ? 0f : MathUtils.clamp(ky + joyY, -1f, 1f);

        boolean jumpPressed = !ui && (jumpRequested || Gdx.input.isKeyJustPressed(Input.Keys.SPACE));
        jumpRequested = false;
        if (!ui && Gdx.input.isKeyJustPressed(Input.Keys.SHIFT_LEFT)) runToggle = !runToggle;
        if (!ui && Gdx.input.isKeyJustPressed(Input.Keys.NUM_1)) useSlot(0);
        if (!ui && Gdx.input.isKeyJustPressed(Input.Keys.NUM_2)) useSlot(1);
        if (!ui && Gdx.input.isKeyJustPressed(Input.Keys.NUM_3)) startAim(-1, itemUi.current(2, world.items));
        if (aiming && grenPointer < 0 && !Gdx.input.isKeyPressed(Input.Keys.NUM_3)) throwGrenade();
        if (!ui && Gdx.input.isKeyJustPressed(Input.Keys.TAB)) itemUi.panelOpen = !itemUi.panelOpen;
        if (!ui && Gdx.input.isKeyJustPressed(Input.Keys.Q)) adsOn = !adsOn;
        if (!ui && Gdx.input.isKeyJustPressed(Input.Keys.R) && world.weapons != null) world.weapons.startReload();
        if (!ui && Gdx.input.isKeyJustPressed(Input.Keys.F)) firePressed = true;
        touchFire.update(dt, firePointer >= 0 || fire2Pointer >= 0, ui);   // toque só conta depois de 45 ms (sem disparo acidental)
        if (touchFire.pressedThisFrame) firePressed = true;
        boolean fireHeld = !ui && (touchFire.heldNow || Gdx.input.isKeyPressed(Input.Keys.F));
        // Correr: o botão faz correr sozinho; mexer no analógico desliga a corrida e devolve o controle
        if (runToggle && inX * inX + inY * inY > 0.09f) runToggle = false;

        // Durante a abertura da porteira, o jogo controla o personagem
        boolean busy = world.fences.isBusy();
        // Morto: fica caído até tocar na tela
        if (survival != null && survival.dead) {
            busy = true;
            player.speed = 0f;
            if (!dyingShown) {
                dyingShown = true;
                aiming = false;
                if (grenades != null) grenades.clearAim();
                character.setTilt(0f, 0f, 0f);
                character.playOnce("Dying");
            }
        }
        // Deitado no chão (botão deitar): levanta ao mexer, pular ou apertar de novo
        if (prone > 0) {
            busy = true;
            player.speed = 0f;
            if (prone == 1 && (inX * inX + inY * inY > 0.09f || jumpPressed || runToggle)) standUp();
            if (prone == 2 && character.onceFinished()) {
                prone = 0;
                character.endOnce();
            }
        }
        // Battle royale: dentro do avião, em queda livre ou pousando
        if (inPlane) {
            player.pos.set(world.airplane.pos).add(0f, -3f, 0f);
            player.speed = 0f;
            player.grounded = false;
            busy = true;
        } else if (skydiving) {
            updateSkydive(dt, inX, inY);
            busy = true;
        } else if (parachuting) {
            // Paraquedas: analógico vira e acelera; o botão de correr leva para a frente da câmera
            Vector3 f = chute.feet();
            boolean landed = chute.fly(dt, inX, inY, yaw, runToggle, world.groundAt(f.x, f.z));
            player.pos.set(chute.feet());
            player.facing = chute.heading;
            player.speed = 0f;
            player.grounded = false;
            character.setTilt(chute.pitchDeg(), chute.rollDeg(), Parachute.HARNESS_Y + Parachute.PIVOT);
            busy = true;
            if (landed) {
                parachuting = false;
                landing = true;
                player.grounded = true;
                character.setTilt(0f, 0f, 0f);
                character.playOnce("HardLanding");
            }
        } else if (landing) {
            player.speed = 0f;
            busy = true;
            if (character.onceFinished()) {
                landing = false;
                character.endOnce();
            }
        }
        if (chute != null) {
            if (chute.phase == Parachute.Phase.COLLAPSING) chute.updateCollapse(dt);
            if (chute.active()) chute.place();
        }
        if (!busy) player.update(dt, inX, inY, yaw, jumpPressed, runToggle, world);
        // Itens em uso: cura e beber se abaixam e cancelam ao andar
        if (survival != null) {
            boolean moved = player.speed > 0.7f || jumpPressed || !player.grounded || skydiving || parachuting;
            survival.restBonus = camp.warmth(player.pos);
            int done = survival.update(dt, moved);
            if (done >= 0 && world.items != null) world.items.consume(done);
            player.speedMul = survival.speedMul();
        }
        boolean kneelUse = survival != null && survival.usingStill();
        character.setCrouch(kneelUse ? 1f : 0f);
        character.setAgachado(crouchOn && player.speed < 0.25f && !kneelUse);   // agachar: clipe do modelo
        character.setReach(world.fences.reach());
        if (!inPlane) character.update(player, dt);
        // ---------- Combate ----------
        boolean dead = survival != null && survival.dead;
        combat = world.weapons != null && world.weapons.armed() && !inPlane && !skydiving && !parachuting && !landing
                && !dead && !ui;
        if (!combat) adsOn = false;
        if (combat) {
            // armado: o corpo só acompanha a mira ao mirar ou atirar; parado e sem mirar, fica como está
            if (adsOn || fireHeld) player.facing = yaw;
            if (world.weapons.reloading()) adsOn = false;
        }
        WeaponConfig cfg = world.weapons != null ? world.weapons.config() : null;
        WeaponConfig.Category cat = cfg != null ? cfg.category : WeaponConfig.Category.FUZIL;
        // AWM: segurar o tiro abre a luneta sem disparar (só a AWM; os outros fuzis seguem como estavam)
        boolean awmAim = combat && cfg != null && cfg.scope && fireHeld;
        // Câmera pelo toque (com o atrito da assistência do quadro anterior)
        aimCtl.update(dt, Gdx.graphics.getHeight(), adsOn || awmAim, combat ? cat : null, combat ? assist.friction : 1f, fireHeld);
        yaw += aimCtl.yawDelta;
        pitch += aimCtl.pitchDelta;
        aimDir.set(camera.direction).nor();
        if (combat && enemies != null && cfg != null) {
            float camYaw = MathUtils.atan2(aimDir.x, aimDir.z), camPitch = -(float) Math.asin(MathUtils.clamp(aimDir.y, -1f, 1f));
            targets.update(dt, camera.position, aimDir, enemies, world,
                    AimSettings.fovDeg() * cat.radiusScale, cfg.range, fireHeld);
            // Fuzil de precisão (luneta): nenhuma assistência; a mira é só do dedo
            if (cfg.scope) assist.update(dt, camera.position, aimDir, camYaw, camPitch, null, cat, false, false, false);
            else assist.update(dt, camera.position, aimDir, camYaw, camPitch, targets.target, cat, fireHeld, firePressed, adsOn);
            yaw += assist.dYaw;
            pitch += assist.dPitch;
        } else {
            targets.drop();
            assist.update(dt, camera.position, aimDir, yaw, pitch, null, cat, false, false, false);
        }
        // Arma na mão (o cano acompanha a mira) e o sistema de disparo: modos, cadência, recuo, dispersão,
        // clarão, som, impacto e dano. O coice e a volta da mira vêm dele.
        if (world.weapons != null) {
            world.weapons.ads = adsOn || awmAim;
            world.weapons.scopeAimUpdate(adsOn || awmAim);
            world.weapons.aimElev = -pitch;
            world.weapons.update(character, player);
        }
        if (!inPlane && world.weapons != null) {
            // Pose do braço: mirar, coice do tiro, recarga (ao peito), sacar (braço baixo) e tronco que recua ao levar tiro
            float reloadPose = world.weapons.reloading() ? (float) Math.sin(Math.PI * world.weapons.reloadProgress()) : 0f;
            float kickPose = shooting != null ? Math.min(1f, world.weapons.kickOffset() / 0.075f) : 0f;
            float aimPose = combat && !parachuting ? ((adsOn || awmAim) ? 1f : 0.45f) : 0f;
            float leanPose = survival != null ? Math.min(1f, survival.shake / 0.12f) : 0f;
            // Arma guardada: o braço fica no lugar de descanso (a pose de guardar só vale ao sacar/guardar)
            character.setArmPose(aimPose, kickPose, reloadPose, world.weapons.holstered() ? 0f : world.weapons.drawAmount(), leanPose);
        }
        if (shooting != null) {
            shootIn.fireHeld = fireHeld;
            shootIn.firePressed = firePressed;
            shootIn.ads = adsOn || awmAim;
            shootIn.crouch = crouchOn;
            shootIn.prone = prone > 0;
            shootIn.grounded = player.grounded;
            shootIn.speed = player.speed;
            shootIn.cam.set(camera.position);
            shootIn.aim.set(aimDir);
            shootIn.playerPos.set(player.pos);
            shooting.update(dt, shootIn, combat && cfg != null && (!arena || (rodadas != null && rodadas.combate())));   // sem tiro fora do combate
            // Mira dinâmica: corre abre, parar fecha, cada tiro dá um coice (com a abertura da arma)
            if (fx != null) fx.crossUpdate(dt, Math.min(1f, player.speed / Player.RUN_SPEED),
                    shooting.firedThisFrame, AimSettings.openPct(world.weapons != null ? world.weapons.heldType() : -1));
            if (shooting.firedThisFrame && enemies != null) enemies.alert(player.pos, 45f);   // o estampido chama o bando
        }
        pitch = combat ? MathUtils.clamp(pitch, -0.75f, 1.1f) : MathUtils.clamp(pitch, Math.min(pitch, 0.05f), 1.2f);
        if (!combat && pitch < 0.05f) pitch += (0.05f - pitch) * Math.min(1f, dt * 5f);
        if (combat && cfg != null) {
            // A mira está em cima de alguém? (um raio só, para a cor da mira)
            overEnemy = enemies != null && enemies.raycast(camera.position, aimDir, cfg.range, false, overHit) != null
                    && world.raycast(camera.position, aimDir, overHit.t) >= overHit.t - 0.05f;
        } else {
            overEnemy = false;
        }
        firePressed = false;
        if (arena) arenaQuadro(dt);
        portalPerto = training && !mira && world != null
                && Math.hypot(player.pos.x - World.PORTAL_X, player.pos.z - World.PORTAL_Z) < 3.5;
        // Inimigos
        if (enemies != null) {
            int stance = prone > 0 ? 2 : (crouchOn ? 1 : 0);
            enemies.update(dt, world, player.pos, survival, player.speed, stance, camera, Settings.drawDistance());
            for (int k = 0; k < enemies.shots.size; k++) {
                Vector3[] sg = enemies.shots.get(k);
                fx.enemyShot(sg[0], sg[1], player.pos);
                whizP.set(player.pos).add(0f, 1f, 0f);   // bala que passou perto do jogador: assobio
                float sd = ShootingSystem.segDist(sg[0], sg[1], whizP);
                if (shooting != null && sd > 0.4f && sd < 1.8f) shooting.audio.whiz(sd);
            }
        }
        if (fx != null) fx.update(dt);
        world.fences.update(dt, player);
        world.update(dt, camera);
        // Granada: mira (arco) e as que estão voando/explodindo
        if (grenades != null) {
            if (aiming) {
                if (inPlane || skydiving || survival.dead || world.items.bag[aimType] <= 0) {
                    aiming = false;
                    grenades.clearAim();
                } else {
                    if (player.grounded) player.facing = yaw;
                    gFrom.set(player.pos).add(MathUtils.sin(player.facing) * 0.35f, 1.75f, MathUtils.cos(player.facing) * 0.35f);
                    Grenades.throwVelocity(camera, gVel);
                    grenades.aim(world, gFrom, gVel);
                }
            }
            grenades.update(dt, world, camera, survival, player.pos);
        }
        if (mapUi != null) mapUi.update(dt, player.pos);
        if (survival != null) survival.shake = Math.max(0f, survival.shake - dt * 2.5f);
        // Vento de fundo: de vez em quando levanta poeira perto do jogador
        if (shooting != null && !inPlane && !skydiving && !parachuting) {
            gustT -= dt;
            if (gustT <= 0f) {
                gustT = MathUtils.random(2.5f, 6f);
                float a = MathUtils.random(MathUtils.PI2), d = MathUtils.random(6f, 14f);
                gustP.set(player.pos.x + MathUtils.cos(a) * d, 0f, player.pos.z + MathUtils.sin(a) * d);
                gustP.y = world.groundAt(gustP.x, gustP.z) + 0.05f;
                shooting.impacts.hit(Surface.TERRA, gustP, Vector3.Y);
            }
        }
        // Motor do avião: alto dentro dele, e vai sumindo com a distância (ao saltar e no solo quase não se ouve)
        if (planeSound != null && world.airplane != null) {
            float d = camera.position.dst(world.airplane.pos);
            float vol = inPlane ? 0.85f : MathUtils.clamp(1f - d / 260f, 0f, 1f) * 0.7f;
            planeSound.setVolume(planeSoundId, vol);
        }
        // Vento: queda livre = forte (cresce com a velocidade da queda); paraquedas = mais suave; some ao pousar
        if (windSound != null) {
            float target = 0f;
            if (skydiving) target = 0.35f + 0.65f * MathUtils.clamp(-fallVel.y / TERMINAL, 0f, 1f);
            else if (parachuting) target = 0.30f + 0.10f * MathUtils.clamp(-chute.vy / 8f, 0f, 1f);
            else if (!inPlane) target = 0.12f;   // vento de fundo no chão
            windVol += (target - windVol) * Math.min(1f, dt * (target > windVol ? 2.5f : 1.2f));   // entra e sai suave
            windSound.setVolume(windSoundId, windVol);
            windSound.setPitch(windSoundId, 0.9f + 0.3f * windVol);
        }

        prompt = (busy || ui) ? null : world.fences.nearPrompt(player.pos);
        doorTarget = (busy || ui || prompt != null) ? null : world.nearDoor(player.pos);

        // Arma e item no chão ao alcance
        weaponTarget = null;
        if (world.weapons != null && prompt == null && doorTarget == null && !busy && !ui) {
            weaponTarget = world.weapons.nearest(player.pos);
        }
        itemTarget = null;
        if (world.items != null && weaponTarget == null && prompt == null && doorTarget == null && !busy && !ui) {
            itemTarget = world.items.nearest(player.pos);
        }

        // Direção da câmera (usada também para a câmera ficar atrás do jogador)
        Vector3 forward = new Vector3(MathUtils.sin(yaw), 0f, MathUtils.cos(yaw));
        // Dentro da casa a câmera chega perto e baixa um pouco, para enxergar o interior
        boolean inside = !inPlane && world.insideHouse(player.pos);
        float targetDist = inPlane ? 48f : parachuting ? 12f : combat ? (adsOn ? 1.9f : 3.0f)
                : inside ? CAMERA_DISTANCE_INSIDE : CAMERA_DISTANCE;
        Vector3 pivot = inPlane ? new Vector3(world.airplane.pos).add(0f, 3f, 0f)   // no avião: câmera segue o avião
                : new Vector3(player.pos.x, player.pos.y + (parachuting ? 2.5f : inside ? 1.2f : 1.4f), player.pos.z);
        if (combat) {
            // Por cima do ombro direito: a mira (centro da tela) fica livre do personagem
            float sh = adsOn ? 0.45f : 0.62f;
            float hy = prone > 0 ? 0.55f : crouchOn ? 1.15f : 1.55f;
            pivot.set(player.pos.x - MathUtils.cos(yaw) * sh, player.pos.y + hy, player.pos.z + MathUtils.sin(yaw) * sh);
        }
        // Luneta: a câmera principal fica normal (o zoom é só dentro da lente); a transição é suave
        boolean scoped = combat && (adsOn || awmAim) && cfg != null && cfg.scope;
        if (scope != null) scope.update(dt, scoped);
        // Mira red dot: todas as armas, ao mirar (menos o AWM, que tem a luneta); some o retículo normal
        if (sight != null) sight.update(dt, combat && adsOn && cfg != null && !cfg.scope);
        if (fx != null) fx.hideCross = (scope != null && scope.t > 0.5f) || (sight != null && sight.t > 0.5f);
        float fovT = combat && adsOn && !scoped ? (cfg != null && cfg.category == WeaponConfig.Category.PRECISAO ? 30f : 50f) : 67f;
        camera.fieldOfView += (fovT - camera.fieldOfView) * Math.min(1f, dt * 12f);
        Vector3 back = new Vector3(
                -forward.x * MathUtils.cos(pitch),
                MathUtils.sin(pitch),
                -forward.z * MathUtils.cos(pitch));
        // Colisão da câmera: encurta a distância se houver parede, árvore, cerca ou chão no caminho
        if (arena && espectando && enemies != null) {   // espectador: a câmera segue o aliado escolhido
            Enemy alvo = enemies.aliado(alvoEsp);
            if (alvo != null) {
                pivot.set(alvo.pos.x, alvo.pos.y + 1.6f, alvo.pos.z);
                back.set(-MathUtils.sin(alvo.facing), 0.25f, -MathUtils.cos(alvo.facing)).nor();
            }
        }
        float clipped = world.cameraDistance(pivot, back, targetDist);
        camDist += (clipped - camDist) * Math.min(1f, dt * (clipped < camDist ? 14f : 4f));
        camera.position.set(pivot).mulAdd(back, camDist);
        float camGround = world.heightAt(camera.position.x, camera.position.z) + 0.5f;
        if (camera.position.y < camGround) camera.position.y = camGround;
        if (survival != null && survival.shake > 0f) {   // tremor ao levar tiro
            float s = survival.shake;
            camera.position.add(MathUtils.random(-s, s), MathUtils.random(-s, s) * 0.6f, MathUtils.random(-s, s));
        }
        if (grenades != null && grenades.shake > 0f) {
            float s = grenades.shake * 0.22f;
            camera.position.add(MathUtils.random(-s, s), MathUtils.random(-s, s), MathUtils.random(-s, s));
        }
        camera.lookAt(pivot);
        camera.up.set(Vector3.Y);
        camera.update();

        // Desenha o mundo 3D. Com a luneta aberta há uma segunda passada: o mesmo mundo, com zoom, vai para
        // o FBO da lente; a tela normal continua por fora do círculo.
        boolean lensPass = scope != null && scope.visible();
        float normalFov = camera.fieldOfView;
        for (int pass = 0; pass < (lensPass ? 2 : 1); pass++) {
        boolean lens = pass == 1;
        if (lens) {
            camera.fieldOfView = scope.lensFov();
            camera.update();
            scope.beginLens(Gdx.graphics.getWidth(), Gdx.graphics.getHeight());
        }
        Gdx.gl.glClearColor(0.72f, 0.82f, 0.92f, 1f); // céu pálido de seca
        Gdx.gl.glClear(GL20.GL_COLOR_BUFFER_BIT | GL20.GL_DEPTH_BUFFER_BIT);
        // Faces dos dois lados (paredes, telhado e poço visíveis de dentro e de fora)
        Gdx.gl.glDisable(GL20.GL_CULL_FACE);
        modelBatch.begin(camera);
        updateWallGhost();
        modelBatch.render(visibleWorldInstances(), environment);
        if (wallGhostOn && wallGhost != null) modelBatch.render(wallGhost, environment);   // sombra do muro
        if (!inPlane) modelBatch.render(character.instances, environment);
        world.fences.render(modelBatch, environment);
        modelBatch.render(world.fireInstance(), environment);
        if (chute != null && chute.active()) modelBatch.render(chute.inst, environment);   // paraquedas
        if (world.airplane != null) modelBatch.render(world.airplane.effects(), environment);   // rastros de vento
        if (enemies != null) {
            enemyDraw.clear();
            enemies.collect(enemyDraw);
            modelBatch.render(enemyDraw, environment);                                           // cangaceiros
        }
        if (grenades != null) modelBatch.render(grenades.instances(), environment);           // granadas e explosões
        if (fx != null) modelBatch.render(fx.instances(), environment);                       // rastros da bala
        if (shooting != null) {
            modelBatch.render(shooting.impacts.instances(), environment);                     // poeira, lascas e marcas
            modelBatch.render(shooting.flash.instances(), environment);                       // clarão, faíscas e fumaça do cano
        }
        modelBatch.end();
        if (lens) {
            scope.endLens();
            camera.fieldOfView = normalFov;
            camera.update();
        }
        }
        if (lensPass) scope.draw(batch, hudCamera.combined, Gdx.graphics.getWidth(), Gdx.graphics.getHeight());
        if (sight != null && sight.visible()) sight.drawSight(batch, hudCamera.combined, Gdx.graphics.getWidth(), Gdx.graphics.getHeight());

        drawHud();
    }

    // ---------- Toque ----------

    private void updateTouch() {
        int W = Gdx.graphics.getWidth(), H = Gdx.graphics.getHeight();

        for (int i = 0; i < wasDown.length; i++) {
            boolean down = Gdx.input.isTouched(i);
            boolean pressed = down && !wasDown[i];
            wasDown[i] = down;
            if (aimUi.open && i == aimPointer) {
                // tela de mira: o dedo que começou numa barra arrasta o valor até soltar
                if (down) aimUi.drag(Gdx.input.getX(i), H - Gdx.input.getY(i));
                else {
                    aimUi.release();
                    aimPointer = -1;
                }
                continue;
            }

            if (!down) {
                if (i == joyPointer) { joyPointer = -1; joyX = 0f; joyY = 0f; }
                if (i == lookPointer) lookPointer = -1;
                if (i == runPointer) runPointer = -1;
                if (i == jumpPointer) jumpPointer = -1;
                if (i == firePointer) firePointer = -1;
                if (i == arsenalPointer) { arsenal.release(); lobby.release(); arsenalPointer = -1; }
                if (i == fire2Pointer) fire2Pointer = -1;
                if (i == wallPointer) releaseWall();
                if (i == grenPointer) {
                    grenPointer = -1;
                    if (aiming) throwGrenade();
                }
                hud.editRelease(i);
                continue;
            }

            float x = Gdx.input.getX(i);
            float rawY = Gdx.input.getY(i);
            float yb = H - rawY;   // origem embaixo, como o HUD

            if (pressed) onPress(i, x, rawY, yb, W, H);
            if (i == wallPointer) {
                if (!wallGhostOn && (wallHoldT += Gdx.graphics.getDeltaTime()) > WALL_HOLD) wallGhostOn = true;
                // arrastar para cima aumenta a distância da sombra (para baixo, diminui)
                if (wallGhostOn) wallDist = MathUtils.clamp(wallDist - (rawY - wallLastY) * 0.02f, 0.5f, 10f);
                wallLastY = rawY;
            }

            if (hud.editing) {
                hud.editDrag(i, x, yb);
                continue;
            }
            if (trainPanel && i == arsenalPointer) arsenal.drag(yb);
            if (inMenu && i == arsenalPointer) lobby.drag(yb);
            if (i == joyPointer) {
                float[] r = hud.rect(hud.get("joystick"));
                float cx = r[0] + r[2] / 2f, cy = r[1] + r[3] / 2f;
                joyRadius = Math.max(40f, r[2] * 0.42f);
                joyX = MathUtils.clamp((x - cx) / joyRadius, -1f, 1f);
                joyY = MathUtils.clamp((yb - cy) / joyRadius, -1f, 1f);
            }
            if (i == lookPointer) {
                // Área da direita: câmera e mira (sensibilidade e suavização no AimController)
                aimCtl.addDrag(x - lookLastX, rawY - lookLastY);
                lookLastX = x;
                lookLastY = rawY;
            }
            if (i == firePointer) {
                // Arrastar o dedo no botão de atirar também mira (atirar e mirar ao mesmo tempo)
                aimCtl.addDrag(x - fireLastX, rawY - fireLastY);
                fireLastX = x;
                fireLastY = rawY;
            }
        }
    }

    /** Soltou o botão PAREDE: toque põe na frente do jogador; sombra põe onde ela está. */
    private void releaseWall() {
        boolean ghost = wallGhostOn;
        wallPointer = -1;
        wallGhostOn = false;
        if (survival == null || survival.dead) return;
        String aviso;
        if (ghost) {
            aviso = world.wallSpot(player.pos.x, player.pos.z, yaw, wallDist, wallSpotNow);
            if (aviso == null) world.placeWallSpot(wallSpotNow);
        } else {
            aviso = world.placeWall(player.pos.x, player.pos.z, yaw);
        }
        survival.say(aviso != null ? aviso : "MURO LEVANTADO");
    }

    /** Posiciona a sombra do muro na distância escolhida; verde se cabe, vermelho se não. */
    private void updateWallGhost() {
        if (!wallGhostOn || survival == null || survival.dead) return;
        if (wallGhost == null) wallGhost = world.wallGhost();
        if (wallGhost == null) return;
        String aviso = world.wallSpot(player.pos.x, player.pos.z, yaw, wallDist, wallSpotNow);
        StoneWall.transform(wallSpotNow.x, wallSpotNow.groundY, wallSpotNow.z, wallSpotNow.yawDeg, wallGhost.transform);
        world.tintWallGhost(wallGhost, aviso == null);
    }

    private void onPress(int i, float x, float rawY, float yb, int W, int H) {
        if (arena && onPressArena(x, yb, W, H)) return;
        if (mira && dentroBotao(x, yb, miraSairRect(W, H))) { sairMira(); return; }
        if (portalPerto && !mira && dentroBotao(x, yb, portalEntrarRect(W, H))) { entrarMira(); return; }
        if (fullMapOpen) {   // o mapa inteiro fecha com qualquer toque
            fullMapOpen = false;
            return;
        }
        if (training && !inMenu && !settingsOpen) {
            if (trainPanel) {
                arsenalPointer = i;
                Arsenal.Act act = arsenal.press(x, yb);
                if (act == Arsenal.Act.CLOSE) trainPanel = false;
                else if (act == Arsenal.Act.EQUIP) equipArsenal();
                return;
            }
            float[] b = trainButton(Gdx.graphics.getWidth(), Gdx.graphics.getHeight());
            if (x >= b[0] && x <= b[0] + b[2] && yb >= b[1] && yb <= b[1] + b[3]) {
                exitTraining();   // MENU: volta ao menu principal
                return;
            }
        }
        if (coletaUi.open) {
            // janela "TROCAR QUAL ARMA?": só ela recebe toques enquanto estiver aberta
            int act = coletaUi.press(x, yb);
            if (act == 1 || act == 2) world.weapons.substituirPendente(act - 1, world, character, player);
            else if (act == 3) world.weapons.cancelarPendente();
            return;
        }
        if (settingsOpen) {
            if (aimUi.open) {
                aimUi.press(x, yb);
                aimPointer = i;   // o dedo que tocou a tela de mira segue arrastando a barra
            } else {
                settingsPress(x, yb);
            }
            return;
        }
        if (inMenu) {
            arsenalPointer = i;   // o dedo que abre o arsenal do lobby pode rolar a grade
            menuPress(x, yb);
            return;
        }
        if (hud.editing) {
            hud.editPress(i, x, yb);
            return;
        }
        // Aviso de nova versão (topo, no meio): toque abre o download
        if (UpdateChecker.available() && yb > H - 60f && Math.abs(x - W / 2f) < W * 0.3f) {
            Gdx.net.openURI(UpdateChecker.downloadUrl());
            return;
        }
        if (survival != null && survival.dead) {
            if (survival.deadT > 3f) {
                if (mira) respawnMira();           // na arena de mira, morrer só reaparece na arena
                else if (training) respawnTraining();   // no treino, morrer só reaparece no galpão
                else if (arena) { }                // na arena, morrer não reaparece: o espectador acompanha ou o round acaba
                else goMenu();
            }
            return;
        }
        if (itemUi.panelOpen) {
            int k = itemUi.panelHit(x, yb);
            if (k == -2) itemUi.panelOpen = false;
            else if (k >= 0 && k != Items.BACKPACK) {
                int slot = ItemUi.slotOf(k);
                if (slot >= 0) itemUi.selected[slot] = k;   // a fruta e a lenha não têm espaço na barra
                if (slot != 2 && world.items.bag[k] > 0) {
                    tryUse(k);
                    itemUi.panelOpen = false;
                } else if (slot == 2) {
                    itemUi.panelOpen = false;
                }
            }
            return;
        }
        Hud.El e = hud.hitTest(x, yb);
        // Tocar na caixa de equipamentos (no treino, perto dela): abre a lista de armas
        if (e == null && training && trainBoxNear && !trainPanel) {
            Vector3 bp = new Vector3(World.TRAIN_BOX_X, 0.5f, World.TRAIN_BOX_Z);
            camera.project(bp);
            if (Math.hypot(bp.x - x, bp.y - yb) < H * 0.12f) {
                openArsenal();
                return;
            }
        }
        String id = e == null ? "" : e.id;
        switch (id) {
            case "config":
                settingsOpen = true;
                joyPointer = -1;
                return;
            case "correr":
                if (runPointer < 0) { runPointer = i; runToggle = !runToggle; }
                return;
            case "pular":
                if (jumpPointer < 0) { jumpPointer = i; jumpRequested = true; }
                return;
            case "joystick":
                if (joyPointer < 0) joyPointer = i;
                return;
            case "agachar":
                crouchOn = !crouchOn;
                return;
            case "trocar":
                if (world.weapons != null) world.weapons.swap(character);
                return;
            case "troca_rapida":
                if (world.weapons != null) world.weapons.trocaRapida(character);   // alterna com a última arma usada
                return;
            case "minimapa":
                if (mapUi != null && places != null) fullMapOpen = true;
                return;
            case "parede":
                if (wallPointer < 0) {
                    wallPointer = i;
                    wallHoldT = 0f;
                    wallGhostOn = false;
                    wallDist = 3f;
                    wallLastY = rawY;
                }
                return;
            case "atirar":
                if (firePointer < 0) {
                    // o dedo aqui também gira a câmera: não desliga a corrida (o corpo segue a câmera correndo)
                    firePointer = i;
                    fireLastX = x;
                    fireLastY = rawY;
                }
                return;
            case "atirar2":   // só atira: o dedo aqui não gira a câmera nem a mira
                if (fire2Pointer < 0) {
                    fire2Pointer = i;
                    runToggle = false;
                }
                return;
            case "mira":
                adsOn = !adsOn && combat;
                return;
            case "arma": {
                if (world.weapons == null) return;
                float[] ar = hud.rect(e);
                int area = WeaponPanel.hitArea((x - ar[0]) / ar[2], (yb - ar[1]) / ar[3]);
                if (area == WeaponPanel.TOP) {
                    if (world.weapons.startReload()) adsOn = false;
                } else if (area >= 0 && area < WeaponPanel.TILE_X.length) {
                    world.weapons.tocarBaixo(area, character);   // a caixa sobe para a mão; a da mão desce para ela
                }
                return;
            }
            case "deitar":
                if (prone == 1) standUp();
                else if (prone == 0 && player.grounded && !inPlane && !skydiving && !parachuting && !landing) {
                    prone = 1;
                    crouchOn = false;
                    runToggle = false;
                    character.playOnce("LieDown");
                }
                return;
            case "mochila":
                itemUi.panelOpen = true;
                return;
            case "slot_cura":
                useSlot(0);
                return;
            case "slot_energia":
                useSlot(1);
                return;
            case "slot_granada":
                startAim(i, itemUi.current(2, world.items));
                return;
            case "usar_kit":
                useSlot(0);
                return;
            case "coletar":
                if (itemTarget != null) {
                    if (!world.items.pickUp(itemTarget, world)) {
                        survival.say(itemTarget.type == Items.BACKPACK ? "JÁ TEM MOCHILA" : "MOCHILA CHEIA");
                    }
                    itemTarget = null;
                }
                return;
            case "pegar_arma":
                if (weaponTarget != null) {
                    int coleta = world.weapons.coletar(weaponTarget, world, character, player);
                    if (coleta == Weapons.COLETA_NAO) survival.say("VOCÊ JÁ TEM ESSA ARMA");
                    // COLETA_ESCOLHA: a janela "TROCAR QUAL ARMA?" aparece (arma pendente até escolher)
                    weaponTarget = null;
                }
                return;
            case "abrir":
                if (trainBoxNear) {   // no treino, perto da caixa: abre a lista de armas
                    openArsenal();
                    return;
                }
                if (inPlane) {
                    startSkydive();
                    return;
                }
                if (prompt != null) {
                    world.fences.startOperation(prompt, player);
                    prompt = null;
                } else if (doorTarget != null) {
                    doorTarget.toggleDoor();
                }
                return;
            case "":
                if (x >= W / 2f) {
                    if (lookPointer < 0) { lookPointer = i; lookLastX = x; lookLastY = rawY; }
                } else if (joyPointer < 0) {
                    joyPointer = i;   // metade esquerda da tela sem botão: também controla o joystick
                }
                return;
            default:
                // mochila, agachar, status e itens ainda não têm ação
                return;
        }
    }

    // ---------- HUD ----------
    private void drawHud() {
        int w = Gdx.graphics.getWidth(), h = Gdx.graphics.getHeight();
        hudCamera.setToOrtho(false, w, h);
        hudCamera.update();

        Gdx.gl.glEnable(GL20.GL_BLEND);
        Gdx.gl.glBlendFunc(GL20.GL_SRC_ALPHA, GL20.GL_ONE_MINUS_SRC_ALPHA);

        shapes.setProjectionMatrix(hudCamera.combined);
        batch.setProjectionMatrix(hudCamera.combined);

        hud.runOn = runToggle;
        hud.crouchOn = crouchOn;
        hud.jumpDown = jumpPointer >= 0;
        hud.joyX = joyX;
        hud.joyY = joyY;
        boolean dead = survival != null && survival.dead;
        trainBoxNear = training && !inPlane && !dead
                && Math.hypot(player.pos.x - World.TRAIN_BOX_X, player.pos.z - World.TRAIN_BOX_Z) < 2.6;
        hud.show("abrir", !dead && (trainBoxNear || inPlane || prompt != null || doorTarget != null));
        hud.show("coletar", !dead && itemTarget != null);
        hud.show("trocar", !dead && world.weapons != null && world.weapons.hasOtherWeapon());
        hud.show("troca_rapida", !dead && world.weapons != null && world.weapons.hasWeapon());
        hud.show("parede", !dead && !inPlane && !skydiving && !parachuting && !landing);
        hud.swapText = world.weapons != null ? world.weapons.swapLabel() : "TROCAR";
        hud.show("arma", true);   // painel de armas sempre visível
        hud.show("mira", combat);
        hud.show("atirar", combat);
        hud.adsOn = adsOn;
        hud.fireDown = firePointer >= 0 || fire2Pointer >= 0;
        hud.show("atirar2", combat);
        hud.show("pegar_arma", !dead && weaponTarget != null);
        hud.show("usar_kit", !dead && world.items != null && survival != null && survival.health < 0.75f * Survival.VIDA_MAX && survival.using < 0
                && (world.items.bag[Survival.MEDKIT] > 0 || world.items.bag[Survival.BANDAGEM] > 0));
        if (inPlane) hud.promptText = "SALTAR DO AVIÃO";
        else if (trainBoxNear) hud.promptText = "EQUIPAMENTOS";
        else if (prompt != null) hud.promptText = prompt.label();
        else if (doorTarget != null) hud.promptText = doorTarget.doorOpen() ? "FECHAR PORTA" : "ABRIR PORTA";
        if (mapUi != null) mapUi.drawMap(batch, shapes, hud, player.facing);   // mapa por baixo da moldura
        hud.draw(batch, shapes, font);
        if (mapUi != null) mapUi.drawCompass(batch, shapes, font, hud, yaw);
        if (training && !inMenu) drawTraining(Gdx.graphics.getWidth(), Gdx.graphics.getHeight());
        if (fullMapOpen && mapUi != null && places != null)
            mapUi.drawFull(batch, shapes, font, Gdx.graphics.getWidth(), Gdx.graphics.getHeight(), player.pos, player.facing, places);
        if (fx != null && !hud.editing) {
            float spreadDeg = 0f;
            WeaponConfig c = world.weapons != null ? world.weapons.config() : null;
            if (c != null && shooting != null) spreadDeg = shooting.spreadDeg(c, shootIn);
            float spreadPx = (float) (Math.tan(Math.toRadians(spreadDeg)) / Math.tan(Math.toRadians(camera.fieldOfView / 2f)) * h / 2f);
            int alive = (enemies != null ? enemies.alive() : 0) + (dead ? 0 : 1);
            int kills = (damage != null ? damage.kills : 0) + (grenades != null ? grenades.kills : 0);
            fx.drawHud(batch, shapes, font, camera, hud, world.weapons, assist, spreadPx, overEnemy, alive, kills,
                    world.weapons != null ? world.weapons.icon() : null, combat, enemies);
        }
        if (world.items != null && survival != null && !hud.editing)
            itemUi.draw(batch, shapes, font, hud, world.items, survival, aiming, Math.min(1f, survival.stun));

        batch.begin();
        if (UpdateChecker.available()) {
            font.setColor(0.6f, 0.1f, 0.05f, 1f);
            String msg = "Nova versão " + UpdateChecker.latestBuild() + " disponível: toque aqui para baixar";
            layout.setText(font, msg);
            font.draw(batch, msg, (w - layout.width) / 2f, h - 14f);
        }
        batch.end();

        if (settingsOpen) drawSettings(w, h);
        Gdx.gl.glDisable(GL20.GL_BLEND);
    }

    /** Objetos do mundo dentro da distância da qualidade escolhida (o terreno sempre). */
    private Array<ModelInstance> visibleWorldInstances() {
        drawList.clear();
        float maxD2 = Settings.drawDistance() * Settings.drawDistance();
        Vector3 cp = camera.position;
        for (int i = 0; i < world.instances.size; i++) {
            ModelInstance mi = world.instances.get(i);
            if (world.isTerrainPart(mi)) { if (world.terrainVisible(mi, camera)) drawList.add(mi); continue; }
            mi.transform.getTranslation(tmpT);
            float dx = tmpT.x - cp.x, dz = tmpT.z - cp.z;
            if (dx * dx + dz * dz <= maxD2) drawList.add(mi);
        }
        return drawList;
    }

    // ---------- Menu principal ----------

    /** Menu principal: o lobby (fundo preto, ícones e painéis). */
    private void drawMenu(int W, int H) {
        float dt = Math.min(Gdx.graphics.getDeltaTime(), 0.05f);
        hudCamera.setToOrtho(false, W, H);
        hudCamera.update();
        // 1) cenário (2D, sem profundidade)
        Gdx.gl.glClearColor(0f, 0f, 0f, 1f);
        Gdx.gl.glClear(GL20.GL_COLOR_BUFFER_BIT | GL20.GL_DEPTH_BUFFER_BIT);
        Gdx.gl.glDisable(GL20.GL_DEPTH_TEST);
        batch.setProjectionMatrix(hudCamera.combined);
        batch.begin();
        lobby.drawCenario(batch, W, H);
        batch.end();
        // 2) personagem 3D em pé no centro, em primeiro plano
        Gdx.gl.glEnable(GL20.GL_DEPTH_TEST);
        Gdx.gl.glClear(GL20.GL_DEPTH_BUFFER_BIT);
        drawLobbyCharacter(W, H, dt);
        Gdx.gl.glDisable(GL20.GL_DEPTH_TEST);
        // 3) menus, botões e ícones (por cima)
        batch.setProjectionMatrix(hudCamera.combined);
        lobby.draw(batch, shapes, font, world != null ? world.weapons : null, hudCamera.combined, W, H, dt);
        batch.setProjectionMatrix(hudCamera.combined);
        emotes.draw(batch, W, H);                 // roda de emotes por cima do lobby
        if (salaUi.aberta()) salaUi.draw(batch, shapes, font, hudCamera.combined, W, H);   // sala personalizada
        if (settingsOpen) drawSettings(W, H);
    }

    private PerspectiveCamera lobbyCam;
    private final Emotes emotes = new Emotes();   // roda de emotes (só no lobby)
    private final SalaUi salaUi = new SalaUi(new java.util.Random());   // sala personalizada (4x4 com amigos)
    private final Player lobbyPlayer = new Player();

    /**
     * Personagem do jogador, em pé e parado no centro do lobby, com a animação de espera (idle). Usa o mesmo modelo do
     * jogo: se o jogador trocar de personagem, muda aqui também.
     */
    private void drawLobbyCharacter(int W, int H, float dt) {
        if (character == null || character.instance() == null) return;
        if (lobbyCam == null) {
            lobbyCam = new PerspectiveCamera(30f, W, H);
            lobbyCam.near = 0.1f;
            lobbyCam.far = 50f;
            lobbyPlayer.spawn(0f, 0f, 0f);
        }
        lobbyCam.viewportWidth = W;
        lobbyCam.viewportHeight = H;
        lobbyCam.position.set(0f, 1.05f, 4.4f);
        lobbyCam.lookAt(0f, 0.92f, 0f);
        lobbyCam.update();
        character.trocarModelo();                 // o personagem escolhido no lobby
        character.setCrouch(0f);                  // em pé (sem o agachar de uma partida anterior)
        character.setAgachado(false);
        emotes.update(character, dt);             // emote em execução (2 vezes) ou volta ao Idle
        lobbyPlayer.facing = 0f;                  // de frente para a câmera (o modelo olha para +z)
        lobbyPlayer.speed = 0f;
        character.update(lobbyPlayer, dt);        // parado: toca a animação de espera
        modelBatch.begin(lobbyCam);
        modelBatch.render(character.instance(), environment);
        modelBatch.end();
    }

    private void menuPress(float x, float yb) {
        int W = Gdx.graphics.getWidth(), H = Gdx.graphics.getHeight();
        if (salaUi.aberta()) {                    // sala personalizada por cima do lobby
            SalaUi.Acao acao = salaUi.toque(x, yb, W, H);
            if (acao == SalaUi.Acao.VOLTAR) salaUi.fechar();
            else if (acao == SalaUi.Acao.INICIAR) {
                Sala sala = salaUi.sala();
                salaUi.fechar();
                salaUi.partidaComecou();
                startArena(sala);
            }
            return;
        }
        if (emotes.aberta()) {                    // roda aberta: espaço executa o emote; fora ou centro fecha
            int espaco = emotes.espacoEm(x, yb, W, H);
            emotes.fechar();
            if (espaco >= 0) emotes.executar(espaco, character);
            return;
        }
        if (!lobby.arsenalOpen() && tocouPersonagem(x, yb, W, H)) {
            emotes.abrir();                       // toque no personagem abre a roda
            return;
        }
        Lobby.Act act = lobby.press(x, yb, Gdx.graphics.getWidth(), Gdx.graphics.getHeight());
        if (act == Lobby.Act.BATTLE) startMatch();
        else if (act == Lobby.Act.TRAINING) startTraining();
        else if (act == Lobby.Act.SETTINGS) settingsOpen = true;
        else if (act == Lobby.Act.SALA) salaUi.abrir();
    }

    /** O toque caiu sobre o personagem do lobby? (área aproximada do corpo, na tela) */
    private boolean tocouPersonagem(float x, float yb, int W, int H) {
        if (lobbyCam == null) return false;
        Vector3 p = lobbyCam.project(new Vector3(0f, 0.9f, 0f));
        return Math.abs(x - p.x) < W * 0.12f && Math.abs(yb - p.y) < H * 0.42f;
    }

    /** Jogar: partida nova (avião e alvo de volta ao começo). */
    /**
     * Carrega um mundo (battle royale ou treinamento) e tudo que depende dele. O mundo anterior sai da
     * memória antes. No treinamento o mundo só tem o galpão, a caixa e os bonecos.
     */
    private void loadWorld(boolean training) { loadWorld(training, false); }

    private void loadWorld(boolean training, boolean arena) {
        if (world != null) {
            if (character != null) world.weapons.unequip(character);
            world.dispose();
        }
        if (mapUi != null) mapUi.dispose();
        if (character != null) character.trocarModelo();   // a personagem principal escolhida no lobby
        world = new World(training, arena);
        try {
            world.create();
        } catch (Throwable t) {
            errorText = "ERRO NO MUNDO:\n" + describe(t);
        }
        inPlane = !training && !arena && world.airplane != null;
        if (world.weapons != null) world.weapons.infinite = training;   // treino: munição infinita
        grenades = world.items != null ? new Grenades(world.items) : null;
        mapUi = training || arena ? null : new MapUi(world);
        places = training || arena ? null : new Places(world);
        enemies = character.model() != null
                ? new Enemies(world, Character.modelo("models/jake/jake.g3dj"), world.weapons != null ? world.weapons.models() : null, mannequin()) : null;
        if (grenades != null) grenades.enemies = enemies;
        if (world.weapons != null) {
            if (shooting != null) shooting.dispose();   // sons do sistema de tiro anterior
            shooting = new ShootingSystem(world, world.weapons, enemies, damage, fx, environment);
            fx.setAudio(shooting.audio);
        }
    }

    private void startMatch() {
        training = false;
        inMenu = false;
        Musica.parar();
        respawn();
        if (enemies != null) enemies.clear();
        if (world.items != null) {   // o que foi comprado na loja entra na mochila desta partida
            int[] compras = Progresso.retiraEstoque();
            for (int i = 0; i < compras.length && i < world.items.bag.length; i++) world.items.bag[i] += compras[i];
        }
        int choice = lobby.weaponChoice();
        if (choice >= 0 && world.weapons != null) world.weapons.giveStart(choice, character);   // arma escolhida no arsenal
    }

    // ---------- Treinamento: caixa de armas ----------

    /** Botão ARMAS, em cima e ao centro (abaixo da bússola). */
    private float[] trainButton(int W, int H) {
        float bw = W * 0.16f, bh = H * 0.075f;
        return new float[]{W / 2f - bw / 2f, H * 0.84f, bw, bh};
    }

    /** Caixa com as seis armas: desenho, nome e USAR (leva a arma para a mão, com carregador cheio). */
    private void drawTraining(int W, int H) {
        float[] b = trainButton(W, H);
        if (!trainPanel) {
            shapes.begin(ShapeRenderer.ShapeType.Filled);
            shapes.setColor(0.42f, 0.26f, 0.13f, 0.92f);
            shapes.rect(b[0], b[1], b[2], b[3]);
            shapes.end();
            shapes.begin(ShapeRenderer.ShapeType.Line);
            shapes.setColor(0.95f, 0.8f, 0.45f, 1f);
            shapes.rect(b[0], b[1], b[2], b[3]);
            shapes.end();
            batch.begin();
            font.setColor(0.98f, 0.9f, 0.7f, 1f);
            layout.setText(font, "MENU");
            font.draw(batch, "MENU", b[0] + (b[2] - layout.width) / 2f, b[1] + (b[3] + layout.height) / 2f);
            int dano = 0;
            if (enemies != null) for (int i = 0; i < enemies.list.size; i++) dano += Math.round(enemies.list.get(i).dummyDamage);
            String txt = "DANO NOS BONECOS: " + dano;
            layout.setText(font, txt);
            font.draw(batch, txt, (W - layout.width) / 2f, b[1] - H * 0.02f);
            batch.end();
            return;
        }
        arsenal.draw(batch, shapes, font, world.weapons, W, H);
    }

    /** Abre o arsenal de treino com a arma da mão em destaque. */
    private void openArsenal() {
        trainPanel = true;
        arsenal.open(world.weapons != null ? world.weapons.heldType() : -1);
    }

    /** EQUIPAR: a arma escolhida vai para a mão, com o carregador cheio. */
    private void equipArsenal() {
        int t = arsenal.sel;
        if (world.weapons != null) world.weapons.equipDoArsenal(t, world, character, player);   // não apaga as outras armas
        if (enemies != null) for (int k = 0; k < enemies.list.size; k++) enemies.list.get(k).dummyDamage = 0f;
        survival.say(Weapons.NAMES[t]);
        trainPanel = false;
    }

    /** Treinamento: mundo próprio (galpão, caixa e bonecos). O jogador nasce dentro, com um AKM. */
    private void startTraining() {
        training = true;
        inMenu = false;
        Musica.parar();
        loadWorld(true);
        respawnTraining();
    }

    /** Sala personalizada: a partida começa na ARENA LIVRE, com as equipes da sala (15 rounds). */
    void startArena(Sala sala) {
        arena = true;
        training = false;
        inMenu = false;
        Musica.parar();
        loadWorld(false, true);
        arenaSala = sala;
        arenaEquipes.clear();
        economia = new Economia();
        rodadas = new Rodadas();
        for (int e = Sala.A; e <= Sala.B; e++) for (String nome : sala.nomes[e]) {
            if (nome == null) continue;
            economia.entrar(nome);
            arenaEquipes.put(nome, e);
        }
        arenaUi = new ArenaUi(economia, rodadas, world.weapons, SalaUi.EU);
        if (world.weapons != null) world.weapons.municaoInfinita = true;   // reserva infinita, pente de 30
        world.paredesInfinitas = true;                                     // paredes sem limite para o jogador
        if (sons != null) sons.dispose();
        sons = Sons.carregar();
        emblema.carregar();
        abatesRound.clear();
        if (world.weapons != null) world.weapons.renderIcons(modelBatch, environment);   // silhuetas das armas para a loja
        lojaFechada = false;
        finalAberto = false;
        arenaFimRegistrado = false;
        bannerFim = null;
        alvoEsp = 0;
        respawnArena();
    }

    /** Começa um round: jogador de volta ao nascimento, arma comprada, colete e capacete, bonecos de cada lado. */
    private void respawnArena() {
        survival.reset();
        if (grenades != null) grenades.clearAll();
        int tipo = economia != null ? economia.armaEquipada(SalaUi.EU) : -1;
        if (world.weapons != null) {
            world.weapons.unequip(character);
            world.weapons.giveStart(tipo >= 0 ? tipo : 0, character);   // a comprada, senão o AKM
        }
        survival.armadura = economia != null
                ? (economia.temColete(SalaUi.EU) ? 0.25f : 0f) + (economia.temCapacete(SalaUi.EU) ? 0.10f : 0f) : 0f;
        adsOn = false;
        dyingShown = false;
        aiming = false;
        prone = 0;
        character.endOnce();
        character.setTilt(0f, 0f, 0f);
        skydiving = false;
        parachuting = false;
        landing = false;
        inPlane = false;
        yaw = 0f;
        float[][] pAzul = null, pVerm = null;
        if (arenaSala != null) {
            // Cada time nasce numa linha, um do lado do outro com 1 m de espaço; o jogador é o primeiro do azul
            float[][] azul = linhaDoTime(Math.max(1, arenaSala.ocupados(Sala.A)), -1);
            float[][] verm = linhaDoTime(Math.max(1, arenaSala.ocupados(Sala.B)), 1);
            player.spawn(azul[0][0], azul[0][1], world.heightAt(azul[0][0], azul[0][1]));
            player.facing = azul[0][2];
            pAzul = java.util.Arrays.copyOfRange(azul, 1, azul.length);
            pVerm = verm;
        } else {
            player.spawn(0f, 0f, world.heightAt(0f, 0f));
            player.facing = 0f;
        }
        if (enemies != null && arenaSala != null) {
            enemies.spawnArenaTimes(world, nomesAliados(), nomesInimigos(), 1f, pAzul, pVerm);
        }
        if (damage != null) damage.atirador = SalaUi.EU;   // o que o jogador acertar é creditado a ele
        espectando = false;
        alvoEsp = 0;
    }

    /** Entra na ARENA DE MIRA pelo portal: guarda o treinamento (mesmas armas e personagem) e carrega a arena. */
    private void entrarMira() {
        treinoWorld = world;
        treinoEnemies = enemies;
        treinoShooting = shooting;
        treinoGrenades = grenades;
        World m = World.arenaMira();
        try {
            m.create();
        } catch (Throwable t) {
            errorText = "ERRO NA ARENA DE MIRA:\n" + describe(t);
            return;
        }
        m.weapons = treinoWorld.weapons;            // mesmas armas e munição do treinamento
        world = m;
        mira = true;
        training = false;
        enemies = new Enemies(world, Character.modelo("models/jake/jake.g3dj"), world.weapons.models(), mannequin());
        enemies.progresso = false;                 // não conta nas estatísticas oficiais
        enemies.spawnMira(world);
        grenades = null;
        shooting = new ShootingSystem(world, world.weapons, enemies, damage, fx, environment);
        fx.setAudio(shooting.audio);
        mapUi = null;
        places = null;
        inPlane = false;
        respawnMira();
        Musica.parar();
    }

    /** Volta ao treinamento (galpão) exatamente como estava: armas, munição e bonecos. */
    private void sairMira() {
        World m = world;
        world = treinoWorld;
        enemies = treinoEnemies;
        shooting = treinoShooting;
        grenades = treinoGrenades;
        treinoWorld = null;
        treinoEnemies = null;
        treinoShooting = null;
        treinoGrenades = null;
        mira = false;
        training = true;
        m.weapons = null;                           // as armas são do treinamento: não descarte aqui
        m.dispose();
        survival.reset();
        player.spawn(World.TRAIN_PLAYER_X, World.TRAIN_PLAYER_Z, world.heightAt(World.TRAIN_PLAYER_X, World.TRAIN_PLAYER_Z));
        player.facing = 0f;
    }

    /** Morreu na arena de mira: volta ao nascimento da arena (armas e bonecos seguem). */
    private void respawnMira() {
        survival.reset();
        adsOn = false;
        dyingShown = false;
        aiming = false;
        prone = 0;
        character.endOnce();
        character.setTilt(0f, 0f, 0f);
        yaw = 0f;
        player.spawn(0f, -6f, world.heightAt(0f, -6f));
        player.facing = 0f;
    }

    /** Quadro da partida da arena: avança o round, decide o fim, reconhece abates e o espectador. */
    private void arenaQuadro(float dt) {
        if (rodadas == null || enemies == null) return;
        emblema.update(dt);
        fimUi.update(dt);
        Rodadas.Fase antes = rodadas.fase;
        rodadas.tick(dt);
        if (rodadas.fase == Rodadas.Fase.PREPARO && antes != Rodadas.Fase.PREPARO) {
            lojaFechada = false;
            bannerFim = null;
            abatesRound.clear();
            economia.novoRound();
            respawnArena();
        }
        enemies.ativo = rodadas.combate();
        for (int i = feedT.size() - 1; i >= 0; i--) {   // o feed some sozinho
            float t = feedT.get(i) - dt;
            if (t <= 0f) { feed.remove(i); feedT.remove(i); } else feedT.set(i, t);
        }
        if (rodadas.combate()) {
            // Cada inimigo abatido entra uma vez, creditado a quem causou o último dano (ver Enemy.ultimoAtacante)
            for (int i = 0; i < enemies.list.size; i++) {
                Enemy e = enemies.list.get(i);
                if (e.equipe >= 0 && !e.alive()) {
                    enemies.abates.registra(e, e.ultimoAtacante != null ? e.ultimoAtacante : "GRANADA", e.nome);
                }
            }
            for (Abates.Abate a : enemies.abates.drenar()) {
                if (a.atacante.equals(SalaUi.EU)) economia.registraEliminacao(SalaUi.EU);
                feed.add(0, a.atacante + "  ELIMINOU  " + a.vitima);
                feedT.add(0, 4f);
                abatesRound.merge(a.atacante, 1, Integer::sum);
                emblema.dispara(a.atacante, a.vitima);     // emblema e som começam no mesmo quadro
                if (sons != null) sons.abate.play(0.9f);
            }
            while (feed.size() > 4) { feed.remove(4); feedT.remove(4); }
            int vivos = enemies.vivosInimigos();
            boolean timeVivo = !survival.dead || enemies.aliadosVivos() > 0;
            if (vivos == 0) rodadas.encerraRound(0);
            else if (!timeVivo) rodadas.encerraRound(1);
        }
        if (antes != Rodadas.Fase.FIM_ROUND && antes != Rodadas.Fase.FIM_PARTIDA
                && (rodadas.fase == Rodadas.Fase.FIM_ROUND || rodadas.fase == Rodadas.Fase.FIM_PARTIDA)) {
            arenaFimDoRound();
        }
        espectando = rodadas.combate() && survival.dead && enemies.aliadosVivos() > 0;
        if (espectando) alvoEsp = Math.min(alvoEsp, Math.max(0, enemies.aliadosVivos() - 1));
    }

    /** Fim do round: paga as recompensas, mostra o resultado e, se acabou, abre o placar final. */
    private void arenaFimDoRound() {
        int vencedor = rodadas.ultimoVencedorRound;
        economia.recompensarRound(vencedor, arenaEquipes);
        if (sons != null) {   // time azul é o do jogador: vitória do azul toca a vitória, do vermelho a derrota
            if (vencedor == 0) sons.vitoria.play(0.8f);
            else if (vencedor == 1) sons.derrota.play(0.8f);
        }
        fimUi.abre(vencedor, vencedor == 0, rodadas.round, rodadas.pontos[0], rodadas.pontos[1]);
        String quem = vencedor == 0 ? "EQUIPE AZUL VENCE O ROUND" : vencedor == 1 ? "EQUIPE VERMELHA VENCE O ROUND" : "ROUND SEM VENCEDOR";
        bannerFim = quem;
        if (rodadas.partidaAcabou()) finalAberto = true;
        arenaFimRegistrado = true;
    }

    /** Toques da partida da arena (loja, espectador, resultado). Devolve true se consumiu o toque. */
    private boolean onPressArena(float x, float yb, int W, int H) {
        if (rodadas == null || arenaUi == null) return false;
        boolean loja = rodadas.compraLiberada() && !lojaFechada && !finalAberto;
        int[] r = arenaUi.toque(x, yb, W, H, loja, espectando, finalAberto);
        ArenaUi.Acao a = ArenaUi.Acao.values()[r[0]];
        int i = r[1];
        switch (a) {
            case COMPRAR: {
                Economia.Erro e = economia.comprar(SalaUi.EU, i, rodadas);
                Economia.Item it = Economia.CATALOGO[i];
                if (e == Economia.Erro.NENHUM) {
                    arenaUi.mensagem = "Comprado: " + it.nome;
                    if (it.tipoArma >= 0) {
                        economia.equipar(SalaUi.EU, it.tipoArma);
                        if (world.weapons != null) world.weapons.comprar(it.tipoArma, world, character, player);   // na mão agora
                    }
                    if (it.nome.equals("MUNIÇÃO") && world.weapons != null) world.weapons.addReserve(world.weapons.heldType(), 30);
                } else {
                    arenaUi.mensagem = e == Economia.Erro.SEM_CREDITO ? "Créditos insuficientes" : "Compra indisponível agora";
                }
                return true;
            }
            case EQUIPAR: {
                Economia.Erro e = economia.equipar(SalaUi.EU, Economia.CATALOGO[i].tipoArma);
                if (e == Economia.Erro.NENHUM && world.weapons != null) world.weapons.comprar(Economia.CATALOGO[i].tipoArma, world, character, player);
                arenaUi.mensagem = e == Economia.Erro.NENHUM ? "Equipada: " + Economia.CATALOGO[i].nome : "Compre a arma antes de equipar";
                return true;
            }
            case SELECIONAR:
                return true;
            case PRONTO:
                lojaFechada = true;
                return true;
            case ESPECTADOR_ANTERIOR:
            case ESPECTADOR_PROXIMO: {
                int n = enemies.aliadosVivos();
                boolean[] vivos = new boolean[n];
                java.util.Arrays.fill(vivos, true);
                int passo = a == ArenaUi.Acao.ESPECTADOR_PROXIMO ? 1 : -1;
                int nxt = Espectador.proximo(vivos, alvoEsp, passo);
                if (nxt >= 0) alvoEsp = nxt;
                return true;
            }
            case VOLTAR_LOBBY:
                goMenu();
                return true;
            default:
                return loja || espectando || finalAberto;   // a loja aberta ou o resultado seguram os toques
        }
    }

    /** Desenha a HUD da arena (placar, round, tempo, loja, espectador) e o resultado final. */
    private void drawArena(int W, int H) {
        hudCamera.setToOrtho(false, W, H);
        hudCamera.update();
        batch.setProjectionMatrix(hudCamera.combined);
        boolean loja = rodadas.compraLiberada() && !lojaFechada && !finalAberto;
        String nomeAlvo = "";
        if (espectando && enemies != null) {
            int n = enemies.aliadosVivos();
            String[] nomes = nomesAliados();
            if (n > 0 && alvoEsp < nomes.length) nomeAlvo = nomes[alvoEsp];
        }
        String estado = rodadas.combate() ? String.format("%d:%02d", (int) rodadas.tempo / 60, (int) rodadas.tempo % 60)
                : rodadas.compraLiberada() ? "compra: " + (int) Math.ceil(rodadas.tempo) + "s" : "";
        arenaUi.draw(batch, shapes, font, hudCamera.combined, W, H, rodadas.pontos[0], rodadas.pontos[1], loja, espectando,
                nomeAlvo, estado, rodadas.fase == Rodadas.Fase.FIM_ROUND ? bannerFim : null);
        if (!feed.isEmpty()) {   // feed de abates, canto superior direito
            batch.begin();
            font.getData().setScale(1f);
            for (int i = 0; i < feed.size(); i++) {
                String linha = feed.get(i);
                font.setColor(1f, 1f, 1f, Math.min(1f, feedT.get(i)));
                layout.setText(font, linha);
                font.draw(batch, linha, W - 20f - layout.width, H - 250f - i * 34f);
            }
            font.setColor(1f, 1f, 1f, 1f);
            batch.end();
        }
        if (rodadas.fase == Rodadas.Fase.FIM_ROUND || rodadas.fase == Rodadas.Fase.FIM_PARTIDA) {
            fimUi.draw(batch, shapes, font, hudCamera.combined, W, H, linhasRound(), rodadas.tempo,
                    rodadas.fase == Rodadas.Fase.FIM_PARTIDA);
        } else {
            hudCamera.setToOrtho(false, W, H);
            hudCamera.update();
            batch.setProjectionMatrix(hudCamera.combined);
            emblema.draw(batch, font, W, H);
        }
        if (finalAberto) arenaUi.desenhaFinal(batch, shapes, font, hudCamera.combined, W, H,
                rodadas.pontos[0], rodadas.pontos[1], rodadas.vencedorPartida);
    }

    /** Retângulos (pixels, origem embaixo): botão ENTRAR no portal (perto dele) e VOLTAR na arena de mira. */
    private float[] portalEntrarRect(int W, int H) { return new float[]{W / 2f - 230f, 110f, 460f, 70f}; }

    private float[] miraSairRect(int W, int H) { return new float[]{W / 2f - 150f, H - 120f, 300f, 60f}; }

    private static boolean dentroBotao(float x, float yb, float[] r) {
        return x >= r[0] && x <= r[0] + r[2] && yb >= r[1] && yb <= r[1] + r[3];
    }

    /** Botão do portal (perto dele), botão de voltar e legenda da arena de mira, e o nome do portal no treino. */
    private void drawMiraHud(int W, int H) {
        hudCamera.setToOrtho(false, W, H);
        hudCamera.update();
        shapes.setProjectionMatrix(hudCamera.combined);
        batch.setProjectionMatrix(hudCamera.combined);
        boolean mostraEntrar = training && !mira && portalPerto;
        if (mostraEntrar || mira) {
            float[] r = mira ? miraSairRect(W, H) : portalEntrarRect(W, H);
            shapes.begin(ShapeRenderer.ShapeType.Filled);
            shapes.setColor(0.08f, 0.06f, 0.05f, 0.92f);
            shapes.rect(r[0], r[1], r[2], r[3]);
            shapes.end();
            shapes.begin(ShapeRenderer.ShapeType.Line);
            shapes.setColor(0.98f, 0.78f, 0.25f, 1f);
            shapes.rect(r[0], r[1], r[2], r[3]);
            shapes.end();
        }
        batch.begin();
        font.getData().setScale(1.2f);
        font.setColor(0.98f, 0.78f, 0.25f, 1f);
        if (mostraEntrar) {
            layout.setText(font, "ENTRAR NA ARENA DE MIRA");
            float[] r = portalEntrarRect(W, H);
            font.draw(batch, "ENTRAR NA ARENA DE MIRA", r[0] + (r[2] - layout.width) / 2f, r[1] + r[3] / 2f + layout.height / 2f);
        }
        if (mira) {
            float[] r = miraSairRect(W, H);
            layout.setText(font, "VOLTAR AO TREINAMENTO");
            font.draw(batch, "VOLTAR AO TREINAMENTO", r[0] + (r[2] - layout.width) / 2f, r[1] + r[3] / 2f + layout.height / 2f);
            layout.setText(font, "ARENA DE MIRA");
            font.draw(batch, "ARENA DE MIRA", (W - layout.width) / 2f, H - 130f);
            font.getData().setScale(0.95f);
            font.setColor(0.92f, 0.9f, 0.84f, 1f);
            String legenda = "Perto: parado   ·   Médio: andando   ·   Longe: correndo";
            layout.setText(font, legenda);
            font.draw(batch, legenda, (W - layout.width) / 2f, H - 170f);
        }
        if (training && !mira && world != null) {
            Vector3 p = camera.project(new Vector3(World.PORTAL_X, 4.3f, World.PORTAL_Z));
            if (p.z > 0f && p.z < 1f) {
                font.getData().setScale(1.1f);
                font.setColor(0.98f, 0.78f, 0.25f, 1f);
                layout.setText(font, "ARENA DE MIRA");
                font.draw(batch, "ARENA DE MIRA", p.x - layout.width / 2f, p.y);
            }
        }
        font.getData().setScale(1.1f);
        font.setColor(1f, 1f, 1f, 1f);
        batch.end();
    }

    /** Nomes dos aliados (equipe azul da sala, sem o jogador). */
    private String[] nomesAliados() {
        java.util.List<String> lista = new java.util.ArrayList<>();
        if (arenaSala != null) for (String nome : arenaSala.nomes[Sala.A]) if (nome != null && !nome.equals(SalaUi.EU)) lista.add(nome);
        return lista.toArray(new String[0]);
    }

    /** Posições de um time numa linha, 1 m entre um e outro, cada um de frente para o outro time: {x, z, facing}. */
    private float[][] linhaDoTime(int n, int lado) {
        float[][] p = new float[n][3];
        float x0 = lado * (world.halfX - 5f);
        float facing = lado < 0 ? MathUtils.PI / 2f : -MathUtils.PI / 2f;   // azul olha para +x, vermelho para -x
        for (int i = 0; i < n; i++) {
            float z = (i - (n - 1) / 2f);
            float x = x0;
            for (int t = 0; t < 6 && world.arenaOcupado(x, z, 1.2f); t++) x -= lado;
            p[i][0] = x;
            p[i][1] = z;
            p[i][2] = facing;
        }
        return p;
    }

    /** Abates de cada jogador no round, do maior para o menor (aliados azuis e inimigos vermelhos da sala). */
    private java.util.List<FimRoundUi.Linha> linhasRound() {
        java.util.List<FimRoundUi.Linha> l = new java.util.ArrayList<>();
        if (arenaSala != null) for (int idx : new int[]{Sala.A, Sala.B}) {
            int eq = idx == Sala.A ? 0 : 1;
            for (String n : arenaSala.nomes[idx]) if (n != null) l.add(new FimRoundUi.Linha(n, abatesRound.getOrDefault(n, 0), eq));
        }
        l.sort((x, y) -> y.abates - x.abates);
        return l;
    }

    /** Nomes dos inimigos (equipe vermelha da sala). */
    private String[] nomesInimigos() {
        java.util.List<String> lista = new java.util.ArrayList<>();
        if (arenaSala != null) for (String nome : arenaSala.nomes[Sala.B]) if (nome != null) lista.add(nome);
        return lista.toArray(new String[0]);
    }

    /** Volta do treinamento ao menu principal, com o battle royale carregado de novo. */
    private void exitTraining() {
        trainPanel = false;
        training = false;
        loadWorld(false);
        goMenu();
    }

    private void respawnTraining() {
        survival.reset();
        if (world.items != null) world.items.clearBag();
        if (grenades != null) grenades.clearAll();
        if (world.weapons != null) {
            world.weapons.unequip(character);
            world.weapons.giveStart(0, character);   // AKM
        }
        adsOn = false;
        dyingShown = false;
        aiming = false;
        prone = 0;
        character.endOnce();
        character.setTilt(0f, 0f, 0f);
        skydiving = false;
        parachuting = false;
        landing = false;
        inPlane = false;
        yaw = 0f;
        player.spawn(World.TRAIN_PLAYER_X, World.TRAIN_PLAYER_Z, world.heightAt(World.TRAIN_PLAYER_X, World.TRAIN_PLAYER_Z));
        player.facing = 0f;
        if (enemies != null) enemies.spawnDummies(world);
    }

    /** Morreu (ou quer sair): volta ao menu principal. */
    private void goMenu() {
        if (arena) {   // sai da arena: volta a carregar o battle royale
            arena = false;
            rodadas = null;
            economia = null;
            arenaUi = null;
            arenaSala = null;
            if (sons != null) { sons.dispose(); sons = null; }
            emblema.dispose();
            abatesRound.clear();
            if (damage != null) damage.atirador = null;
            feed.clear();
            feedT.clear();
            finalAberto = false;
            espectando = false;
            loadWorld(false, false);
        }
        inMenu = true;
        training = false;
        Musica.tocar();   // o lobby volta a tocar a música
        trainPanel = false;
        settingsOpen = false;
        adsOn = false;
        aiming = false;
        firePointer = -1;
        if (grenades != null) grenades.clearAim();
    }

    // ---------- Itens ----------

    /** Usa o item do espaço (0 = cura, 1 = energia). Tocar de novo durante o uso cancela. */
    private void useSlot(int slot) {
        if (world.items == null || survival == null) return;
        int t = itemUi.current(slot, world.items);
        if (survival.using == t) { survival.cancel(); return; }
        if (inPlane || skydiving || survival.dead) { survival.say("NÃO DÁ PARA USAR AGORA"); return; }
        tryUse(t);
    }

    private void tryUse(int t) {
        if (world.items.bag[t] <= 0) { survival.say("SEM " + Items.NAMES[t]); return; }
        if (t == Items.LENHA) {   // acender uma fogueira aqui
            if (camp.light(player.pos, world)) world.items.consume(t);
            else survival.say("JÁ TEM 3 FOGUEIRAS");
            return;
        }
        if (survival.canUse(t)) {
            if (Survival.isHeal(t)) runToggle = false;
            survival.start(t);
        }
    }

    /** Segura o espaço da granada: tira o pino e mostra o arco; solta para jogar. */
    private void startAim(int pointer, int type) {
        if (grenades == null || aiming) return;
        if (world.items.bag[type] <= 0) { survival.say("SEM " + Items.NAMES[type]); return; }
        if (inPlane || skydiving || survival.dead || prone > 0) { survival.say("NÃO DÁ PARA JOGAR AGORA"); return; }
        aiming = true;
        aimType = type;
        grenPointer = pointer;
        grenades.pullPin();
    }

    private void throwGrenade() {
        aiming = false;
        grenades.clearAim();
        if (aimType < 0 || world.items.bag[aimType] <= 0) return;
        world.items.consume(aimType);
        grenades.throwIt(aimType, gFrom, gVel);
    }

    private void standUp() {
        prone = 2;
        character.playOnce("GetUp");
    }

    /** Depois de morrer: tudo cheio de novo e volta para o avião (a mochila fica vazia). */
    private void respawn() {
        survival.reset();
        if (world.items != null) world.items.clearBag();
        if (grenades != null) grenades.clearAll();
        if (world.weapons != null) world.weapons.unequip(character);
        adsOn = false;
        dyingShown = false;
        aiming = false;
        prone = 0;
        character.endOnce();
        character.setTilt(0f, 0f, 0f);
        skydiving = false;
        parachuting = false;
        landing = false;
        inPlane = world.airplane != null;
        if (!inPlane) player.spawn(0f, 0f, world.heightAt(0f, 0f));
    }

    @Override
    public void resume() {
        iconsDirty = true;   // o Android apaga as texturas ao sair do app
    }

    // ---------- Battle royale: salto do avião ----------

    /** Salta do avião: sai por baixo dele, com o embalo do avião, e começa a queda livre de barriga para baixo. */
    private void startSkydive() {
        Airplane ap = world.airplane;
        inPlane = false;
        skydiving = true;
        player.pos.set(ap.pos).add(0f, -4f, 0f);
        fallVel.set(MathUtils.sin(ap.heading()) * Airplane.SPEED, ap.verticalSpeed(), MathUtils.cos(ap.heading()) * Airplane.SPEED);
        player.facing = ap.heading();
        yaw = ap.heading();
        character.playLoop("Falling");
    }

    /**
     * Queda livre: gravidade com resistência do ar (chega na velocidade máxima de queda), o embalo do avião
     * vai sumindo pelo arrasto e o analógico faz planar na direção da câmera. No chão, toca o pouso.
     */
    private void updateSkydive(float dt, float inX, float inY) {
        fallVel.y += (-9.8f - 9.8f / TERMINAL * fallVel.y) * dt;
        float fx = MathUtils.sin(yaw), fz = MathUtils.cos(yaw), rx = -fz, rz = fx;
        float wx = (inX * rx + inY * fx) * 9f, wz = (inX * rz + inY * fz) * 9f;
        float k = Math.min(1f, dt * 0.8f);
        fallVel.x += (wx - fallVel.x) * k;
        fallVel.z += (wz - fallVel.z) * k;
        player.pos.mulAdd(fallVel, dt);
        player.pos.x = MathUtils.clamp(player.pos.x, -World.HALF + 2f, World.HALF - 2f);
        player.pos.z = MathUtils.clamp(player.pos.z, -World.HALF + 2f, World.HALF - 2f);
        float hs = (float) Math.sqrt(fallVel.x * fallVel.x + fallVel.z * fallVel.z);
        if (hs > 0.5f) player.facing = MathUtils.atan2(fallVel.x, fallVel.z);
        player.speed = 0f;
        player.grounded = false;
        float ground = world.groundAt(player.pos.x, player.pos.z);
        if (chute != null && player.pos.y - ground <= Parachute.DEPLOY_HEIGHT) {
            // 100 m do chão: abre o paraquedas e passa a segurar os comandos
            skydiving = false;
            parachuting = true;
            chute.deploy(player.pos, fallVel.x, fallVel.y, fallVel.z, player.facing);
            character.playLoop("SentadoArreios");
            return;
        }
        if (player.pos.y <= ground) {
            player.pos.y = ground;
            player.grounded = true;
            skydiving = false;
            if (survival != null) survival.damage(-fallVel.y > 15f ? 200f : -fallVel.y * 6f, true);   // sem paraquedas
            landing = true;
            fallVel.setZero();
            character.playOnce("HardLanding");
        }
    }

    // ---------- Configurações ----------

    private void settingsRect(int i, float x, float y, float w, float h, String id) {
        setIds[i] = id;
        setRects[i][0] = x; setRects[i][1] = y; setRects[i][2] = w; setRects[i][3] = h;
    }

    /** Monta os botões do painel e os desenha. */
    private void drawSettings(int W, int H) {
        setN = 0;
        float pw = W * 0.6f, ph = H * 0.7f, px = (W - pw) / 2f, py = (H - ph) / 2f;
        float pad = 0.03f * H, gap = 0.015f * H, bh = 0.085f * H;

        shapes.begin(ShapeRenderer.ShapeType.Filled);
        shapes.setColor(0f, 0f, 0f, 0.55f);
        shapes.rect(0, 0, W, H);
        shapes.setColor(0.30f, 0.19f, 0.10f, 0.97f);
        shapes.rect(px, py, pw, ph);
        shapes.end();

        // Linha de FPS (4 botões)
        float rowFps = py + ph - pad - 0.22f * H;
        float bw4 = (pw - 2 * pad - 3 * gap) / 4f;
        for (int k = 0; k < 4; k++) {
            int f = Settings.FPS_OPTIONS[k];
            settingsRect(setN++, px + pad + k * (bw4 + gap), rowFps, bw4, bh, "fps" + f);
        }
        // Linha de qualidade (3 botões)
        float rowQ = rowFps - 0.22f * H;
        float bw3 = (pw - 2 * pad - 2 * gap) / 3f;
        for (int k = 0; k < 3; k++) {
            settingsRect(setN++, px + pad + k * (bw3 + gap), rowQ, bw3, bh, "q" + k);
        }
        // Botões de baixo
        float rowB = py + pad;
        // Dentro da partida (treino ou battle royale) há um botão a mais: voltar ao lobby
        int nb = inMenu ? 3 : 4;
        float bw2 = (pw - 2 * pad - (nb - 1) * gap) / nb;
        int bi = 0;
        settingsRect(setN++, px + pad + bi++ * (bw2 + gap), rowB, bw2, bh, "editHud");
        settingsRect(setN++, px + pad + bi++ * (bw2 + gap), rowB, bw2, bh, "mira");
        if (!inMenu) settingsRect(setN++, px + pad + bi++ * (bw2 + gap), rowB, bw2, bh, "lobby");
        settingsRect(setN++, px + pad + bi * (bw2 + gap), rowB, bw2, bh, "fechar");

        // Botões (selecionado em dourado)
        shapes.begin(ShapeRenderer.ShapeType.Filled);
        for (int i = 0; i < setN; i++) {
            String id = setIds[i];
            boolean sel = (id.startsWith("fps") && Integer.parseInt(id.substring(3)) == Settings.fps)
                    || (id.startsWith("q") && id.length() == 2 && Integer.parseInt(id.substring(1)) == Settings.quality);
            if (sel) shapes.setColor(0.85f, 0.62f, 0.15f, 1f);
            else shapes.setColor(0.45f, 0.29f, 0.15f, 1f);
            float[] r = setRects[i];
            shapes.rect(r[0], r[1], r[2], r[3]);
        }
        shapes.end();

        batch.begin();
        // Título e rótulos
        font.setColor(1f, 0.92f, 0.7f, 1f);
        layout.setText(font, "CONFIGURAÇÕES");
        font.draw(batch, "CONFIGURAÇÕES", px + (pw - layout.width) / 2f, py + ph - pad);
        font.draw(batch, "Taxa de quadros (FPS)", px + pad, rowFps + bh + 0.02f * H + 0);
        font.draw(batch, "Gráficos", px + pad, rowQ + bh + 0.02f * H + 0);
        font.draw(batch, "Suavização de serrilhado: sempre ligada", px + pad, rowB + bh * 1.6f + 0.02f * H);
        for (int i = 0; i < setN; i++) {
            String id = setIds[i];
            String label;
            if (id.startsWith("fps")) label = id.substring(3) + " FPS";
            else if (id.equals("editHud")) label = "Editar HUD";
            else if (id.equals("fechar")) label = "Fechar";
            else if (id.equals("mira")) label = "Mira e sensibilidade";
            else if (id.equals("lobby")) label = "Voltar ao lobby";
            else label = Settings.QUALITY_NAMES[Integer.parseInt(id.substring(1))];
            layout.setText(font, label);
            float[] r = setRects[i];
            font.setColor(1f, 0.97f, 0.9f, 1f);
            font.draw(batch, label, r[0] + (r[2] - layout.width) / 2f, r[1] + (r[3] + layout.height) / 2f);
        }
        batch.end();
        if (aimUi.open) aimUi.draw(batch, shapes, font, W, H);
        coletaUi.open = world != null && world.weapons != null && world.weapons.pendente() != null;
        if (coletaUi.open) coletaUi.draw(batch, shapes, W, H, world.weapons, world.weapons.pendente());
    }

    private void settingsPress(float x, float yb) {
        if (aimUi.open) {
            aimUi.press(x, yb);
            return;
        }
        for (int i = 0; i < setN; i++) {
            float[] r = setRects[i];
            if (x < r[0] || x > r[0] + r[2] || yb < r[1] || yb > r[1] + r[3]) continue;
            String id = setIds[i];
            if (id.startsWith("fps")) {
                Settings.fps = Integer.parseInt(id.substring(3));
                Settings.apply();
                Settings.save();
            } else if (id.startsWith("q")) {
                Settings.quality = Integer.parseInt(id.substring(1));
                Settings.apply();
                Settings.save();
            } else if (id.equals("editHud")) {
                settingsOpen = false;
                hud.editing = true;
            } else if (id.equals("fechar")) {
                settingsOpen = false;
            } else if (id.equals("mira")) {
                aimUi.open = true;
            } else if (id.equals("lobby")) {
                goMenu();   // abandona a partida (ou o treino) e volta ao lobby
            }
            return;
        }
    }

    @Override
    public void resize(int width, int height) {
        camera.viewportWidth = width;
        camera.viewportHeight = height;
        camera.update();
    }

    @Override
    public void dispose() {
        if (intro != null) intro.dispose();
        emotes.dispose();
        salaUi.dispose();
        if (arenaUi != null) arenaUi.dispose();
        Musica.descartar();
        lobby.dispose();
        modelBatch.dispose();
        if (scope != null) scope.dispose();
        if (sight != null) sight.dispose();
        if (mannequin != null) mannequin.dispose();
        world.dispose();
        if (chute != null) chute.dispose();
        if (grenades != null) grenades.dispose();
        if (survival != null) survival.dispose();
        if (mapUi != null) mapUi.dispose();
        if (fx != null) fx.dispose();
        if (shooting != null) shooting.dispose();
        if (planeSound != null) planeSound.dispose();
        if (windSound != null) windSound.dispose();
        character.dispose();
        hud.dispose();
        shapes.dispose();
        batch.dispose();
        font.dispose();
    }
}
