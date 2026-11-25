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
        modelBatch = new ModelBatch(new DefaultShaderProvider(shaderConfig));

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

        world = new World();
        try {
            world.create();
        } catch (Throwable t) {
            errorText = "ERRO NO MUNDO:\n" + describe(t);
        }

        character = new Character();
        try {
            character.create();
        } catch (Throwable t) {
            errorText = "ERRO NO PERSONAGEM:\n" + describe(t);
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

        updateTouch();

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

        // Durante a abertura da porteira, o jogo controla o personagem
        boolean busy = world.fences.isBusy();
        boolean ridingActive = false;
        for (int i = 0; i < ridings.size; i++) {
            Riding r = ridings.get(i);
            r.update(dt, inX, inY, yaw, runToggle, jumpPressed, player, character);
            if (r.isMounted() || r.isBusy()) ridingActive = true;
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
        if (!ridingActive) character.setCrouch(crouchOn && player.speed < 0.25f ? 1f : 0f);
        character.setReach(world.fences.reach());
        character.update(player, dt);
        world.fences.update(dt, player);
        world.update(dt, camera);

        prompt = (busy || ui || ridingActive || lying) ? null : world.fences.nearPrompt(player.pos);
        doorTarget = (busy || ui || ridingActive || lying || prompt != null) ? null : world.nearDoor(player.pos);
        hammockTarget = (busy || ui || ridingActive || lying || prompt != null || doorTarget != null) ? null : world.nearHammockFree(player.pos);
        mountTarget = null;
        if (prompt == null && doorTarget == null && hammockTarget == null && !busy && !ui && !ridingActive && !lying) {
            for (int i = 0; i < ridings.size && mountTarget == null; i++) {
                if (ridings.get(i).canMount(player.pos)) mountTarget = ridings.get(i);
            }
        }

        // Direção da câmera (usada também para a câmera ficar atrás do jogador)
        Vector3 forward = new Vector3(MathUtils.sin(yaw), 0f, MathUtils.cos(yaw));
        // Dentro da casa a câmera chega perto e baixa um pouco, para enxergar o interior
        boolean inside = world.insideHouse(player.pos);
        float targetDist = inside ? CAMERA_DISTANCE_INSIDE : CAMERA_DISTANCE;
        Vector3 pivot = new Vector3(player.pos.x, player.pos.y + (inside ? 1.2f : 1.4f), player.pos.z);
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
        camera.lookAt(pivot);
        camera.up.set(Vector3.Y);
        camera.update();

        // Desenha o mundo 3D
        Gdx.gl.glClearColor(0.72f, 0.82f, 0.92f, 1f); // céu pálido de seca
        Gdx.gl.glClear(GL20.GL_COLOR_BUFFER_BIT | GL20.GL_DEPTH_BUFFER_BIT);
        modelBatch.begin(camera);
        modelBatch.render(visibleWorldInstances(), environment);
        modelBatch.render(character.instances, environment);
        world.fences.render(modelBatch, environment);
        modelBatch.render(world.fireInstance(), environment);
        modelBatch.end();

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
                hud.editRelease(i);
                continue;
            }

            float x = Gdx.input.getX(i);
            float rawY = Gdx.input.getY(i);
            float yb = H - rawY;   // origem embaixo, como o HUD

            if (pressed) onPress(i, x, rawY, yb, W, H);

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
                yaw -= (x - lookLastX) * LOOK_SENSITIVITY;
                pitch = MathUtils.clamp(pitch + (rawY - lookLastY) * LOOK_SENSITIVITY, 0.05f, 1.2f);
                lookLastX = x;
                lookLastY = rawY;
            }
        }
    }

    private void onPress(int i, float x, float rawY, float yb, int W, int H) {
        if (settingsOpen) {
            settingsPress(x, yb);
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
        Hud.El e = hud.hitTest(x, yb);
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
            case "abrir":
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
                    character.playOnce("LieDown");
                    hammockTarget = null;
                } else if (lyingIn != null && lyingIn.lie == HouseDecor.Lie.LYING) {
                    // Levantar: animação de levantar e volta ao normal
                    lyingIn.lie = HouseDecor.Lie.GETTING_UP;
                    character.playOnce("GetUp");
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
        hud.promptVisible = prompt != null || mountTarget != null || doorTarget != null || hammockTarget != null || canGetUp;
        if (prompt != null) hud.promptText = prompt.label();
        else if (mountTarget != null) hud.promptText = "MONTAR";
        else if (doorTarget != null) hud.promptText = doorTarget.doorOpen() ? "FECHAR PORTA" : "ABRIR PORTA";
        else if (hammockTarget != null) hud.promptText = "DEITAR NA REDE";
        else if (canGetUp) hud.promptText = "LEVANTAR";
        hud.draw(batch, shapes, font);

        batch.begin();
        font.setColor(0.35f, 0.2f, 0.1f, 0.9f);
        layout.setText(font, "Sertão do Ceará - 1915: a seca chegou");
        font.draw(batch, "Sertão do Ceará - 1915: a seca chegou", (w - layout.width) / 2f, 22f);
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
        ModelInstance terrain = world.terrainInstance();
        for (int i = 0; i < world.instances.size; i++) {
            ModelInstance mi = world.instances.get(i);
            if (mi == terrain) { drawList.add(mi); continue; }
            mi.transform.getTranslation(tmpT);
            float dx = tmpT.x - cp.x, dz = tmpT.z - cp.z;
            if (dx * dx + dz * dz <= maxD2) drawList.add(mi);
        }
        return drawList;
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
        float bw2 = (pw - 2 * pad - gap) / 2f;
        settingsRect(setN++, px + pad, rowB, bw2, bh, "editHud");
        settingsRect(setN++, px + pad + bw2 + gap, rowB, bw2, bh, "fechar");

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
            else label = Settings.QUALITY_NAMES[Integer.parseInt(id.substring(1))];
            layout.setText(font, label);
            float[] r = setRects[i];
            font.setColor(1f, 0.97f, 0.9f, 1f);
            font.draw(batch, label, r[0] + (r[2] - layout.width) / 2f, r[1] + (r[3] + layout.height) / 2f);
        }
        batch.end();
    }

    private void settingsPress(float x, float yb) {
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
        world.dispose();
        character.dispose();
        hud.dispose();
        shapes.dispose();
        batch.dispose();
        font.dispose();
    }
}
