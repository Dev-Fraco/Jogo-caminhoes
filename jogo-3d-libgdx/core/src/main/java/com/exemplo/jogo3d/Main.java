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
    private Riding mountTarget = null;            // montaria ao alcance (mostra o botão MONTAR)
    private HouseDecor doorTarget = null;         // porta ao alcance (mostra o botão da porta)
    private HouseDecor hammockTarget = null;      // rede ao alcance (mostra DEITAR)
    private Cart cartTarget = null;               // carroça solta ao alcance (mostra PRENDER)
    private Riding cartHorseTarget = null;        // cavalo que vai prender essa carroça
    private Riding cartOptionsHorse = null;       // cavalo com carroça presa ao alcance (mostra as duas opções)
    private Cart hitchCart = null;                // carroça sendo presa agora
    private Riding hitchHorse = null;
    private float hitchT = 0f;                    // tempo da animação de prender (s)
    private Weapons.Pickup weaponTarget = null;   // arma no chão ao alcance (mostra PEGAR)
    private Items.Pickup itemTarget = null;       // item no chão ao alcance (mostra PEGAR)
    private Parachute chute;                      // paraquedas (abre a 100 m do chão)
    private boolean parachuting = false;
    // Menu principal: o jogo abre aqui; morrer ou sair da partida volta para cá
    private boolean inMenu = true;
    private final float[][] menuRects = new float[MENU_ITEMS.length][4];
    private static final String[] MENU_ITEMS = {"BATTLE ROYALE", "TREINAMENTO", "CONFIGURAÇÕES"};
    private boolean training = false;   // modo treinamento (galpão com dois bonecos) em vez do battle royale
    private boolean trainPanel = false; // caixa de equipamentos do treino (lista de armas)
    private boolean trainBoxNear = false;   // perto da caixa de equipamentos (mostra o botão de ação)
    private final float[] trainUsar = new float[WeaponConfig.BY_TYPE.length * 4];   // botões USAR de cada arma (x, y, w, h)
    private final float[] trainFechar = new float[4];
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
    private final Camp camp = new Camp();
    private Scope scope;                          // luneta do fuzil de precisão
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
    private HouseDecor lyingIn = null;            // casa onde o personagem está deitado na rede
    private float camDist = CAMERA_DISTANCE;      // distância da câmera, suavizada
    private final Array<Riding> ridings = new Array<>();
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

        environment = new Environment();
        // Luz de sol forte e quente do sertão, com pouca luz de ambiente (sombras escuras)
        environment.set(new ColorAttribute(ColorAttribute.AmbientLight, 0.46f, 0.42f, 0.37f, 1f));
        environment.add(new DirectionalLight().set(1f, 0.93f, 0.78f, -0.4f, -1f, -0.35f));

        camera = new PerspectiveCamera(67f, Gdx.graphics.getWidth(), Gdx.graphics.getHeight());
        camera.near = 0.1f;
        camera.far = 400f;

        hudCamera = new OrthographicCamera(Gdx.graphics.getWidth(), Gdx.graphics.getHeight());
        shapes = new ShapeRenderer();
        batch = new SpriteBatch();
        font = new BitmapFont();
        font.getData().setScale(1.1f);

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

        try {
            for (int i = 0; i < world.mounts.size; i++) ridings.add(new Riding(world, world.mounts.get(i)));
        } catch (Throwable t) {
            errorText = "ERRO NA MONTARIA:\n" + describe(t);
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

    @Override
    public void render() {
        if (errorText != null) {
            showError();
            return;
        }
        try {
            renderGame();
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
        touchFire.update(dt, firePointer >= 0, ui);   // toque só conta depois de 45 ms (sem disparo acidental)
        if (touchFire.pressedThisFrame) firePressed = true;
        boolean fireHeld = !ui && (touchFire.heldNow || Gdx.input.isKeyPressed(Input.Keys.F));
        // Correr: o botão faz correr sozinho; mexer no analógico desliga a corrida e devolve o controle
        if (runToggle && inX * inX + inY * inY > 0.09f) runToggle = false;

        // Durante a abertura da porteira, o jogo controla o personagem
        boolean busy = world.fences.isBusy();
        boolean ridingActive = false;
        for (int i = 0; i < ridings.size; i++) {
            Riding r = ridings.get(i);
            r.update(dt, inX, inY, yaw, runPointer >= 0, jumpPressed, player, character);
            if (r.isMounted() || r.isBusy()) ridingActive = true;
        }
        // Prender a carroça: a animação toca e, no fim, a carroça fica presa ao cavalo
        if (hitchT > 0f) {
            hitchT -= dt;
            busy = true;
            if (hitchT <= 0f) {
                hitchHorse.attachCart(hitchCart);
                hitchHorse = null;
                hitchCart = null;
                character.endOnce();
            }
        }
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
        boolean lying = lyingIn != null;
        if (!busy && !ridingActive && !lying) player.update(dt, inX, inY, yaw, jumpPressed, runToggle, world);
        if (lying) {
            // Deitado: fica na rede, balançando, até levantar
            player.pos.set(lyingIn.lieSpot());
            player.facing = lyingIn.lieFacing();
            player.speed = 0f;
            player.grounded = true;
            character.setSwing(lyingIn.swing);
            if (lyingIn.lie == HouseDecor.Lie.LYING_IN && character.onceFinished()) lyingIn.lie = HouseDecor.Lie.LYING;
            if (lyingIn.lie == HouseDecor.Lie.GETTING_UP && character.onceFinished()) {
                character.endOnce();
                character.setSwing(0f);
                lyingIn.lie = HouseDecor.Lie.FREE;
                lyingIn = null;
            }
        } else {
            character.setSwing(0f);
        }
        // Itens em uso: cura e beber se abaixam e cancelam ao andar
        if (survival != null) {
            boolean moved = player.speed > 0.7f || jumpPressed || !player.grounded || ridingActive || skydiving || parachuting;
            survival.restBonus = camp.warmth(player.pos) + (lyingIn != null && lyingIn.lie == HouseDecor.Lie.LYING ? 3f : 0f);
            int done = survival.update(dt, moved);
            if (done >= 0 && world.items != null) world.items.consume(done);
            player.speedMul = survival.speedMul();
        }
        boolean kneelUse = survival != null && survival.usingStill();
        if (!ridingActive) character.setCrouch((crouchOn && player.speed < 0.25f) || kneelUse ? 1f : 0f);
        character.setReach(world.fences.reach());
        if (!inPlane) character.update(player, dt);
        // ---------- Combate ----------
        boolean dead = survival != null && survival.dead;
        combat = world.weapons != null && world.weapons.armed() && !inPlane && !skydiving && !parachuting && !landing
                && !ridingActive && !lying && !dead && !ui;
        if (!combat) adsOn = false;
        if (combat) {
            player.facing = yaw;   // armado: o corpo acompanha a mira
            if (world.weapons.reloading()) adsOn = false;
        }
        WeaponConfig cfg = world.weapons != null ? world.weapons.config() : null;
        WeaponConfig.Category cat = cfg != null ? cfg.category : WeaponConfig.Category.FUZIL;
        // Câmera pelo toque (com o atrito da assistência do quadro anterior)
        aimCtl.update(dt, Gdx.graphics.getHeight(), adsOn, combat ? cat : null, combat ? assist.friction : 1f);
        yaw += aimCtl.yawDelta;
        pitch += aimCtl.pitchDelta;
        aimDir.set(camera.direction).nor();
        if (combat && enemies != null && cfg != null) {
            float camYaw = MathUtils.atan2(aimDir.x, aimDir.z), camPitch = -(float) Math.asin(MathUtils.clamp(aimDir.y, -1f, 1f));
            targets.update(dt, camera.position, aimDir, enemies, world,
                    AimSettings.fovDeg() * cat.radiusScale, cfg.range);
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
            world.weapons.ads = adsOn;
            world.weapons.scopeAimUpdate(adsOn);
            world.weapons.aimElev = -pitch;
            world.weapons.update(character, player);
        }
        if (!inPlane && world.weapons != null) {
            // Pose do braço: mirar, coice do tiro, recarga (ao peito), sacar (braço baixo) e tronco que recua ao levar tiro
            float reloadPose = world.weapons.reloading() ? (float) Math.sin(Math.PI * world.weapons.reloadProgress()) : 0f;
            float kickPose = shooting != null ? Math.min(1f, world.weapons.kickOffset() / 0.075f) : 0f;
            float aimPose = combat && !parachuting ? (adsOn ? 1f : 0.45f) : 0f;
            float leanPose = survival != null ? Math.min(1f, survival.shake / 0.12f) : 0f;
            // Arma guardada: o braço fica no lugar de descanso (a pose de guardar só vale ao sacar/guardar)
            character.setArmPose(aimPose, kickPose, reloadPose, world.weapons.holstered() ? 0f : world.weapons.drawAmount(), leanPose);
        }
        if (shooting != null) {
            shootIn.fireHeld = fireHeld;
            shootIn.firePressed = firePressed;
            shootIn.ads = adsOn;
            shootIn.crouch = crouchOn;
            shootIn.prone = prone > 0;
            shootIn.grounded = player.grounded;
            shootIn.speed = player.speed;
            shootIn.cam.set(camera.position);
            shootIn.aim.set(aimDir);
            shootIn.playerPos.set(player.pos);
            shooting.update(dt, shootIn, combat && cfg != null);
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
                    if (player.grounded && !ridingActive) player.facing = yaw;
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

        prompt = (busy || ui || ridingActive || lying) ? null : world.fences.nearPrompt(player.pos);
        doorTarget = (busy || ui || ridingActive || lying || prompt != null) ? null : world.nearDoor(player.pos);
        hammockTarget = (busy || ui || ridingActive || lying || prompt != null || doorTarget != null) ? null : world.nearHammockFree(player.pos);
        mountTarget = null;
        if (prompt == null && doorTarget == null && hammockTarget == null && !busy && !ui && !ridingActive && !lying) {
            for (int i = 0; i < ridings.size && mountTarget == null; i++) {
                if (ridings.get(i).canMount(player.pos)) mountTarget = ridings.get(i);
            }
        }

        // Carroça: prender uma carroça solta no cavalo, ou (com carroça presa) tirar ou sentar nela
        cartTarget = null;
        cartHorseTarget = null;
        cartOptionsHorse = null;
        if (prompt == null && doorTarget == null && hammockTarget == null && !busy && !ui && !ridingActive && !lying && hitchT <= 0f) {
            for (int i = 0; i < ridings.size && cartOptionsHorse == null; i++) {
                Riding r = ridings.get(i);
                if (r.hasCart() && r.isNear(player.pos, 3.2f)) cartOptionsHorse = r;
            }
            if (cartOptionsHorse == null) {
                for (int c = 0; c < world.carts.size && cartTarget == null; c++) {
                    Cart ct = world.carts.get(c);
                    if (ct.attached || Math.hypot(ct.pos.x - player.pos.x, ct.pos.z - player.pos.z) > 3.5) continue;
                    for (int i = 0; i < ridings.size && cartTarget == null; i++) {
                        Riding r = ridings.get(i);
                        if (!r.hasCart() && !r.isMounted() && !r.isBusy() && r.distTo(ct.pos) < 6f) {
                            cartTarget = ct;
                            cartHorseTarget = r;
                        }
                    }
                }
            }
            if (cartOptionsHorse != null || cartTarget != null) mountTarget = null;
        }

        // Arma no chão ao alcance
        weaponTarget = null;
        if (world.weapons != null && prompt == null && doorTarget == null && hammockTarget == null && cartTarget == null
                && cartOptionsHorse == null && !busy && !ui && !ridingActive && !lying) {
            weaponTarget = world.weapons.nearest(player.pos);
            if (weaponTarget != null) mountTarget = null;
        }
        itemTarget = null;
        if (world.items != null && weaponTarget == null && prompt == null && doorTarget == null && hammockTarget == null
                && cartTarget == null && cartOptionsHorse == null && !busy && !ui && !ridingActive && !lying) {
            itemTarget = world.items.nearest(player.pos);
            if (itemTarget != null) mountTarget = null;
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
        boolean scoped = combat && adsOn && cfg != null && cfg.scope;
        if (scope != null) scope.update(dt, scoped);
        if (fx != null && scope != null) fx.hideCross = scope.t > 0.5f;
        float fovT = combat && adsOn && !scoped ? (cfg != null && cfg.category == WeaponConfig.Category.PRECISAO ? 30f : 50f) : 67f;
        camera.fieldOfView += (fovT - camera.fieldOfView) * Math.min(1f, dt * 12f);
        Vector3 back = new Vector3(
                -forward.x * MathUtils.cos(pitch),
                MathUtils.sin(pitch),
                -forward.z * MathUtils.cos(pitch));
        // Colisão da câmera: encurta a distância se houver parede, árvore, cerca ou chão no caminho
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

        drawHud();
    }

    // ---------- Toque ----------

    private void updateTouch() {
        int W = Gdx.graphics.getWidth(), H = Gdx.graphics.getHeight();

        for (int i = 0; i < wasDown.length; i++) {
            boolean down = Gdx.input.isTouched(i);
            boolean pressed = down && !wasDown[i];
            wasDown[i] = down;

            if (!down) {
                if (i == joyPointer) { joyPointer = -1; joyX = 0f; joyY = 0f; }
                if (i == lookPointer) lookPointer = -1;
                if (i == runPointer) runPointer = -1;
                if (i == jumpPointer) jumpPointer = -1;
                if (i == firePointer) firePointer = -1;
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
        if (fullMapOpen) {   // o mapa inteiro fecha com qualquer toque
            fullMapOpen = false;
            return;
        }
        if (training && !inMenu && !settingsOpen) {
            if (trainPanel) {
                trainPress(x, yb);
                return;
            }
            float[] b = trainButton(Gdx.graphics.getWidth(), Gdx.graphics.getHeight());
            if (x >= b[0] && x <= b[0] + b[2] && yb >= b[1] && yb <= b[1] + b[3]) {
                exitTraining();   // MENU: volta ao menu principal
                return;
            }
        }
        if (settingsOpen) {
            settingsPress(x, yb);
            return;
        }
        if (inMenu) {
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
                if (training) respawnTraining();   // no treino, morrer só reaparece no galpão
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
                trainPanel = true;
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
                    firePointer = i;
                    fireLastX = x;
                    fireLastY = rawY;
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
                } else if (area == 0 || area == 1) {
                    world.weapons.equipSlot(area, character);
                } else if (area == WeaponPanel.FIST) {
                    world.weapons.toggleHold(character);
                }
                return;
            }
            case "deitar":
                if (prone == 1) standUp();
                else if (prone == 0 && player.grounded && !inPlane && !skydiving && !parachuting && !landing && lyingIn == null) {
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
                    if (!world.weapons.pickUp(weaponTarget, world, character, player)) survival.say("VOCÊ JÁ TEM ESSA ARMA");
                    weaponTarget = null;
                }
                return;
            case "abrir":
                if (trainBoxNear) {   // no treino, perto da caixa: abre a lista de armas
                    trainPanel = true;
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
                } else if (hammockTarget != null) {
                    // Deitar: vai para a rede e a animação de deitar toca uma vez
                    lyingIn = hammockTarget;
                    lyingIn.lie = HouseDecor.Lie.LYING_IN;
                    lyingIn.lieT = 0f;
                    character.playOnce("DeitarRede");
                    hammockTarget = null;
                } else if (lyingIn != null && lyingIn.lie == HouseDecor.Lie.LYING) {
                    // Levantar: animação de levantar e volta ao normal
                    lyingIn.lie = HouseDecor.Lie.GETTING_UP;
                    character.playOnce("GetUp");
                } else if (cartOptionsHorse != null) {
                    // Metade esquerda da caixa: tirar a carroça; metade direita: sentar nela
                    if (x < W / 2f) cartOptionsHorse.detachCart();
                    else cartOptionsHorse.sitCart(player);
                    cartOptionsHorse = null;
                } else if (cartTarget != null) {
                    hitchCart = cartTarget;
                    hitchHorse = cartHorseTarget;
                    hitchT = 2.5f;
                    character.playOnce("IdleKneel");
                    cartTarget = null;
                    cartHorseTarget = null;
                } else if (mountTarget != null) {
                    mountTarget.startMount(player);
                    mountTarget = null;
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
        boolean canGetUp = lyingIn != null && lyingIn.lie == HouseDecor.Lie.LYING;
        boolean dead = survival != null && survival.dead;
        trainBoxNear = training && !inPlane && !dead
                && Math.hypot(player.pos.x - World.TRAIN_BOX_X, player.pos.z - World.TRAIN_BOX_Z) < 2.6;
        hud.show("abrir", !dead && (trainBoxNear || inPlane || prompt != null || mountTarget != null || doorTarget != null
                || hammockTarget != null || canGetUp || cartTarget != null || cartOptionsHorse != null));
        hud.show("coletar", !dead && itemTarget != null);
        hud.show("trocar", !dead && world.weapons != null && world.weapons.hasWeapon());
        hud.show("parede", !dead && !inPlane && !skydiving && !parachuting && !landing);
        hud.swapText = world.weapons != null ? world.weapons.swapLabel() : "TROCAR";
        hud.show("arma", combat);
        hud.show("mira", combat);
        hud.show("atirar", combat);
        hud.adsOn = adsOn;
        hud.fireDown = firePointer >= 0;
        hud.show("pegar_arma", !dead && weaponTarget != null);
        hud.show("usar_kit", !dead && world.items != null && survival != null && survival.health < 75f && survival.using < 0
                && (world.items.bag[Survival.MEDKIT] > 0 || world.items.bag[Survival.BANDAGEM] > 0));
        if (inPlane) hud.promptText = "SALTAR DO AVIÃO";
        else if (trainBoxNear) hud.promptText = "EQUIPAMENTOS";
        else if (prompt != null) hud.promptText = prompt.label();
        else if (cartOptionsHorse != null) hud.promptText = "TIRAR CARROÇA  |  SENTAR NA CARROÇA";
        else if (cartTarget != null) hud.promptText = "PRENDER CARROÇA";
        else if (mountTarget != null) hud.promptText = "MONTAR";
        else if (doorTarget != null) hud.promptText = doorTarget.doorOpen() ? "FECHAR PORTA" : "ABRIR PORTA";
        else if (hammockTarget != null) hud.promptText = "DEITAR NA REDE";
        else if (canGetUp) hud.promptText = "LEVANTAR";
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

    private void menuLayout(int W, int H) {
        float bw = Math.min(W * 0.6f, H * 1.1f), bh = H * 0.1f, gap = H * 0.03f, top = H * 0.42f;
        for (int i = 0; i < MENU_ITEMS.length; i++) {
            menuRects[i][0] = (W - bw) / 2f;
            menuRects[i][1] = top - i * (bh + gap);
            menuRects[i][2] = bw;
            menuRects[i][3] = bh;
        }
    }

    private void drawMenu(int W, int H) {
        menuLayout(W, H);
        hudCamera.setToOrtho(false, W, H);
        hudCamera.update();
        shapes.setProjectionMatrix(hudCamera.combined);
        batch.setProjectionMatrix(hudCamera.combined);
        Gdx.gl.glClearColor(0.72f, 0.82f, 0.92f, 1f);   // céu pálido de seca
        Gdx.gl.glClear(GL20.GL_COLOR_BUFFER_BIT | GL20.GL_DEPTH_BUFFER_BIT);
        Gdx.gl.glEnable(GL20.GL_BLEND);
        Gdx.gl.glBlendFunc(GL20.GL_SRC_ALPHA, GL20.GL_ONE_MINUS_SRC_ALPHA);
        shapes.begin(ShapeRenderer.ShapeType.Filled);
        shapes.setColor(0.86f, 0.74f, 0.50f, 1f);   // chão de terra
        shapes.rect(0, 0, W, H * 0.30f);
        shapes.setColor(0.62f, 0.42f, 0.22f, 1f);
        shapes.rect(0, H * 0.30f, W, H * 0.02f);
        for (float[] r : menuRects) {
            shapes.setColor(0.42f, 0.26f, 0.13f, 0.97f);
            shapes.rect(r[0], r[1], r[2], r[3]);
        }
        shapes.end();
        shapes.begin(ShapeRenderer.ShapeType.Line);
        shapes.setColor(0.95f, 0.8f, 0.45f, 1f);
        for (float[] r : menuRects) shapes.rect(r[0], r[1], r[2], r[3]);
        shapes.end();
        batch.begin();
        font.getData().setScale(Math.max(1.5f, H / 480f));
        font.setColor(0.35f, 0.2f, 0.1f, 1f);
        String title = "NORDESTE";
        layout.setText(font, title);
        font.draw(batch, title, (W - layout.width) / 2f, H * 0.86f);
        title = "SECA BRABA";
        layout.setText(font, title);
        font.draw(batch, title, (W - layout.width) / 2f, H * 0.74f);
        font.getData().setScale(Math.max(1f, H / 900f));
        String sub = "Sertão do Ceará · 1915";
        layout.setText(font, sub);
        font.draw(batch, sub, (W - layout.width) / 2f, H * 0.66f);
        font.getData().setScale(Math.max(1.2f, H / 700f));
        for (int i = 0; i < MENU_ITEMS.length; i++) {
            float[] r = menuRects[i];
            layout.setText(font, MENU_ITEMS[i]);
            font.setColor(1f, 0.95f, 0.8f, 1f);
            font.draw(batch, MENU_ITEMS[i], r[0] + (r[2] - layout.width) / 2f, r[1] + (r[3] + layout.height) / 2f);
        }
        font.getData().setScale(1.1f);
        batch.end();
        if (settingsOpen) drawSettings(W, H);
        Gdx.gl.glDisable(GL20.GL_BLEND);
    }

    private void menuPress(float x, float yb) {
        for (int i = 0; i < MENU_ITEMS.length; i++) {
            float[] r = menuRects[i];
            if (x < r[0] || x > r[0] + r[2] || yb < r[1] || yb > r[1] + r[3]) continue;
            if (i == 0) startMatch();
            else if (i == 1) startTraining();
            else settingsOpen = true;
            return;
        }
    }

    /** Jogar: partida nova (avião e alvo de volta ao começo). */
    /**
     * Carrega um mundo (battle royale ou treinamento) e tudo que depende dele. O mundo anterior sai da
     * memória antes. No treinamento o mundo só tem o galpão, a caixa e os bonecos.
     */
    private void loadWorld(boolean training) {
        if (world != null) {
            if (character != null) world.weapons.unequip(character);
            world.dispose();
        }
        if (mapUi != null) mapUi.dispose();
        world = new World(training);
        try {
            world.create();
        } catch (Throwable t) {
            errorText = "ERRO NO MUNDO:\n" + describe(t);
        }
        inPlane = !training && world.airplane != null;
        if (world.weapons != null) world.weapons.infinite = training;   // treino: munição infinita
        grenades = world.items != null ? new Grenades(world.items) : null;
        mapUi = training ? null : new MapUi(world);
        places = training ? null : new Places(world);
        enemies = character.model() != null
                ? new Enemies(world, character.model(), world.weapons != null ? world.weapons.models() : null, mannequin()) : null;
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
        respawn();
        if (enemies != null) enemies.clear();
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
        shapes.begin(ShapeRenderer.ShapeType.Filled);
        if (!trainPanel) {
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
        float pw = W * 0.56f, ph = H * 0.80f, px = (W - pw) / 2f, py = (H - ph) / 2f;
        shapes.setColor(0f, 0f, 0f, 0.6f);
        shapes.rect(0, 0, W, H);
        shapes.setColor(0.30f, 0.19f, 0.10f, 0.97f);
        shapes.rect(px, py, pw, ph);
        shapes.end();
        float rowH = ph * 0.128f, top = py + ph - ph * 0.12f;
        for (int i = 0; i < WeaponConfig.BY_TYPE.length; i++) {
            float ry = top - (i + 1) * rowH;
            float ub = rowH * 0.5f, ux = px + pw - pw * 0.2f, uy = ry + (rowH - ub) / 2f;
            trainUsar[i * 4] = ux;
            trainUsar[i * 4 + 1] = uy;
            trainUsar[i * 4 + 2] = pw * 0.16f;
            trainUsar[i * 4 + 3] = ub;
        }
        shapes.begin(ShapeRenderer.ShapeType.Filled);
        for (int i = 0; i < WeaponConfig.BY_TYPE.length; i++) {
            shapes.setColor(0.18f, 0.12f, 0.07f, 0.9f);
            shapes.rect(px + pw * 0.03f, top - (i + 1) * rowH + rowH * 0.08f, pw * 0.94f, rowH * 0.84f);
            shapes.setColor(0.85f, 0.55f, 0.2f, 1f);
            float[] u = trainUsar;
            shapes.rect(u[i * 4], u[i * 4 + 1], u[i * 4 + 2], u[i * 4 + 3]);
        }
        trainFechar[0] = px + pw * 0.3f;
        trainFechar[1] = py + ph * 0.025f;
        trainFechar[2] = pw * 0.4f;
        trainFechar[3] = ph * 0.075f;
        shapes.setColor(0.62f, 0.4f, 0.2f, 1f);
        shapes.rect(trainFechar[0], trainFechar[1], trainFechar[2], trainFechar[3]);
        shapes.end();
        batch.begin();
        for (int i = 0; i < WeaponConfig.BY_TYPE.length; i++) {
            float ry = top - (i + 1) * rowH;
            com.badlogic.gdx.graphics.g2d.TextureRegion ic = world.weapons != null ? world.weapons.iconOf(i) : null;
            if (ic != null) {
                float s = rowH * 0.7f;
                batch.draw(ic, px + pw * 0.06f, ry + (rowH - s) / 2f, s * 1.6f, s);
            }
            font.getData().setScale(Math.max(0.9f, rowH / 80f));
            font.setColor(1f, 0.95f, 0.85f, 1f);
            font.draw(batch, Weapons.NAMES[i], px + pw * 0.34f, ry + rowH * 0.64f);
            font.getData().setScale(1.1f);
            float[] u = trainUsar;
            layout.setText(font, "USAR");
            font.setColor(0.1f, 0.06f, 0.03f, 1f);
            font.draw(batch, "USAR", u[i * 4] + (u[i * 4 + 2] - layout.width) / 2f, u[i * 4 + 1] + (u[i * 4 + 3] + layout.height) / 2f);
        }
        layout.setText(font, "FECHAR");
        font.setColor(1f, 0.95f, 0.85f, 1f);
        font.draw(batch, "FECHAR", trainFechar[0] + (trainFechar[2] - layout.width) / 2f,
                trainFechar[1] + (trainFechar[3] + layout.height) / 2f);
        layout.setText(font, "EQUIPAMENTOS");
        font.draw(batch, "EQUIPAMENTOS", px + (pw - layout.width) / 2f, py + ph - ph * 0.04f);
        batch.end();
    }

    /** Toque dentro da caixa de armas: USAR leva a arma para a mão; FECHAR (ou fora) fecha. */
    private void trainPress(float x, float yb) {
        for (int i = 0; i < WeaponConfig.BY_TYPE.length; i++) {
            float[] u = trainUsar;
            if (x >= u[i * 4] && x <= u[i * 4] + u[i * 4 + 2] && yb >= u[i * 4 + 1] && yb <= u[i * 4 + 1] + u[i * 4 + 3]) {
                if (world.weapons != null) world.weapons.giveStart(i, character);
                if (enemies != null) for (int k = 0; k < enemies.list.size; k++) enemies.list.get(k).dummyDamage = 0f;
                survival.say(Weapons.NAMES[i]);
                trainPanel = false;
                return;
            }
        }
        trainPanel = false;   // FECHAR e qualquer toque fora da caixa
    }

    /** Treinamento: mundo próprio (galpão, caixa e bonecos). O jogador nasce dentro, com um AKM. */
    private void startTraining() {
        training = true;
        inMenu = false;
        loadWorld(true);
        respawnTraining();
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
        inMenu = true;
        training = false;
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
        float bw2 = (pw - 2 * pad - 2 * gap) / 3f;
        settingsRect(setN++, px + pad, rowB, bw2, bh, "editHud");
        settingsRect(setN++, px + pad + bw2 + gap, rowB, bw2, bh, "mira");
        settingsRect(setN++, px + pad + 2 * (bw2 + gap), rowB, bw2, bh, "fechar");

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
            else label = Settings.QUALITY_NAMES[Integer.parseInt(id.substring(1))];
            layout.setText(font, label);
            float[] r = setRects[i];
            font.setColor(1f, 0.97f, 0.9f, 1f);
            font.draw(batch, label, r[0] + (r[2] - layout.width) / 2f, r[1] + (r[3] + layout.height) / 2f);
        }
        batch.end();
        if (aimUi.open) aimUi.draw(batch, shapes, font, W, H);
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
        modelBatch.dispose();
        if (scope != null) scope.dispose();
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
