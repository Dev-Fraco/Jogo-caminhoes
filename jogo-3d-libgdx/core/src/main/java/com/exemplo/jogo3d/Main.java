package com.exemplo.jogo3d;

import com.badlogic.gdx.ApplicationAdapter;
import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.Input;
import com.badlogic.gdx.graphics.Color;
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

/**
 * Sertão do Ceará, 1915. Relevo com subidas e descidas, árvores mortas, casas redondas.
 * Celular: joystick na esquerda, arrastar na direita para girar, botão PULAR.
 * PC: WASD/setas, espaço, arrastar com o mouse para girar.
 */
public class Main extends ApplicationAdapter {

    // ---------- Ajustes ----------
    static final float SPEED = 5.5f;
    static final float JUMP_VELOCITY = 6.5f;
    static final float GRAVITY = 18f;
    static final float PLAYER_RADIUS = 0.35f;
    static final float CAMERA_DISTANCE = 4.5f;
    static final float LOOK_SENSITIVITY = 0.006f;
    static final float JOY_RADIUS = 110f;
    static final float JUMP_BUTTON_RADIUS = 70f;

    // ---------- 3D ----------
    private ModelBatch modelBatch;
    private Environment environment;
    private PerspectiveCamera camera;
    private World world;
    private Character character;

    // ---------- Jogador ----------
    private final Player player = new Player();
    private boolean jumpRequested = false;   // pulo vindo do botão na tela
    private float yaw = 0f;      // direção da câmera (e do personagem)
    private float pitch = 0.45f; // inclinação da câmera (positivo = de cima)

    // ---------- Toque / HUD ----------
    private int joyPointer = -1, lookPointer = -1, jumpPointer = -1, runPointer = -1;
    static final float RUN_BUTTON_RADIUS = 62f;
    private boolean runToggle = false;   // toque no botão liga/desliga a corrida
    private float joyOriginX, joyOriginY, joyX, joyY;
    private float lookLastX, lookLastY;
    private OrthographicCamera hudCamera;
    private ShapeRenderer shapes;
    private SpriteBatch batch;
    private BitmapFont font;
    private final GlyphLayout layout = new GlyphLayout();

    @Override
    public void create() {
        Gdx.gl.glEnable(GL20.GL_DEPTH_TEST);

        // O personagem do Mixamo tem 65 ossos; o padrão do libGDX aceita só 12
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

        // Entradas: teclado (PC) somado ao joystick (celular)
        float kx = 0f, ky = 0f;
        if (Gdx.input.isKeyPressed(Input.Keys.W) || Gdx.input.isKeyPressed(Input.Keys.UP)) ky += 1f;
        if (Gdx.input.isKeyPressed(Input.Keys.S) || Gdx.input.isKeyPressed(Input.Keys.DOWN)) ky -= 1f;
        if (Gdx.input.isKeyPressed(Input.Keys.A) || Gdx.input.isKeyPressed(Input.Keys.LEFT)) kx -= 1f;
        if (Gdx.input.isKeyPressed(Input.Keys.D) || Gdx.input.isKeyPressed(Input.Keys.RIGHT)) kx += 1f;
        float inX = MathUtils.clamp(kx + joyX, -1f, 1f);
        float inY = MathUtils.clamp(ky + joyY, -1f, 1f);

        boolean jumpPressed = jumpRequested || Gdx.input.isKeyJustPressed(Input.Keys.SPACE);
        jumpRequested = false;

        // Física (andar, correr, pular) e animação, ambas com o mesmo dt
        if (Gdx.input.isKeyJustPressed(Input.Keys.SHIFT_LEFT)) runToggle = !runToggle;
        boolean runHeld = runToggle;
        player.update(dt, inX, inY, yaw, jumpPressed, runHeld, world);
        character.update(player, dt);

        // Direção da câmera (usada também para a câmera ficar atrás do jogador)
        Vector3 forward = new Vector3(MathUtils.sin(yaw), 0f, MathUtils.cos(yaw));

        // Câmera atrás do jogador, sempre acima do chão
        Vector3 pivot = new Vector3(player.pos.x, player.pos.y + 1.4f, player.pos.z);
        Vector3 back = new Vector3(
                -forward.x * MathUtils.cos(pitch),
                MathUtils.sin(pitch),
                -forward.z * MathUtils.cos(pitch));
        camera.position.set(pivot).mulAdd(back, CAMERA_DISTANCE);
        float camGround = world.heightAt(camera.position.x, camera.position.z) + 0.5f;
        if (camera.position.y < camGround) camera.position.y = camGround;
        camera.lookAt(pivot);
        camera.up.set(Vector3.Y);
        camera.update();

        // Desenha o mundo 3D
        Gdx.gl.glClearColor(0.72f, 0.82f, 0.92f, 1f); // céu pálido de seca
        Gdx.gl.glClear(GL20.GL_COLOR_BUFFER_BIT | GL20.GL_DEPTH_BUFFER_BIT);
        modelBatch.begin(camera);
        modelBatch.render(world.instances, environment);
        modelBatch.render(character.instances, environment);
        modelBatch.end();

        // Toque no aviso de atualização (topo da tela) abre o download
        if (UpdateChecker.available() && Gdx.input.justTouched() && Gdx.input.getY() < 80) {
            Gdx.net.openURI(UpdateChecker.downloadUrl());
        }
        drawHud();
    }

    // ---------- Toque ----------
    private boolean isOnRunButton(float x, float y) {
        float cx = Gdx.graphics.getWidth() - 240f;
        float cy = Gdx.graphics.getHeight() - 110f;
        return Vector3.dst2(x, y, 0f, cx, cy, 0f) <= RUN_BUTTON_RADIUS * RUN_BUTTON_RADIUS * 1.6f;
    }

    private boolean isOnJumpButton(float x, float y) {
        float cx = Gdx.graphics.getWidth() - 110f;
        float cy = Gdx.graphics.getHeight() - 110f;
        return Vector3.dst2(x, y, 0f, cx, cy, 0f) <= JUMP_BUTTON_RADIUS * JUMP_BUTTON_RADIUS * 1.6f;
    }

    private void updateTouch() {
        int w = Gdx.graphics.getWidth();

        // Solta os dedos que saíram da tela
        if (joyPointer >= 0 && !Gdx.input.isTouched(joyPointer)) {
            joyPointer = -1;
            joyX = 0f;
            joyY = 0f;
        }
        if (lookPointer >= 0 && !Gdx.input.isTouched(lookPointer)) lookPointer = -1;
        if (jumpPointer >= 0 && !Gdx.input.isTouched(jumpPointer)) jumpPointer = -1;
        if (runPointer >= 0 && !Gdx.input.isTouched(runPointer)) runPointer = -1;

        // Atribui novos dedos
        for (int i = 0; i < 5; i++) {
            if (!Gdx.input.isTouched(i)) continue;
            if (i == joyPointer || i == lookPointer || i == jumpPointer || i == runPointer) continue;
            float x = Gdx.input.getX(i), y = Gdx.input.getY(i);
            if (runPointer < 0 && isOnRunButton(x, y)) {
                runPointer = i;
                runToggle = !runToggle;   // toque: começa ou para de correr
            } else if (jumpPointer < 0 && isOnJumpButton(x, y)) {
                jumpPointer = i;
                jumpRequested = true;
            } else if (joyPointer < 0 && x < w / 2f) {
                joyPointer = i;
                joyOriginX = x;
                joyOriginY = y;
            } else if (lookPointer < 0 && x >= w / 2f) {
                lookPointer = i;
                lookLastX = x;
                lookLastY = y;
            }
        }

        if (joyPointer >= 0) {
            float dx = Gdx.input.getX(joyPointer) - joyOriginX;
            float dy = Gdx.input.getY(joyPointer) - joyOriginY;
            joyX = MathUtils.clamp(dx / JOY_RADIUS, -1f, 1f);
            joyY = MathUtils.clamp(-dy / JOY_RADIUS, -1f, 1f); // a tela cresce para baixo
        }

        if (lookPointer >= 0) {
            float x = Gdx.input.getX(lookPointer), y = Gdx.input.getY(lookPointer);
            yaw -= (x - lookLastX) * LOOK_SENSITIVITY;
            pitch = MathUtils.clamp(pitch + (y - lookLastY) * LOOK_SENSITIVITY, 0.05f, 1.2f);
            lookLastX = x;
            lookLastY = y;
        }
    }

    // ---------- HUD (joystick, botão de pular, texto) ----------
    private void drawHud() {
        int w = Gdx.graphics.getWidth(), h = Gdx.graphics.getHeight();
        hudCamera.setToOrtho(false, w, h);
        hudCamera.update();

        Gdx.gl.glEnable(GL20.GL_BLEND);
        Gdx.gl.glBlendFunc(GL20.GL_SRC_ALPHA, GL20.GL_ONE_MINUS_SRC_ALPHA);

        shapes.setProjectionMatrix(hudCamera.combined);
        shapes.begin(ShapeRenderer.ShapeType.Filled);
        if (joyPointer >= 0) {
            float ox = joyOriginX, oy = h - joyOriginY;
            shapes.setColor(1f, 1f, 1f, 0.12f);
            shapes.circle(ox, oy, JOY_RADIUS);
            shapes.setColor(1f, 1f, 1f, 0.45f);
            shapes.circle(ox + joyX * JOY_RADIUS, oy + joyY * JOY_RADIUS, 44f);
        }
        float jcx = w - 110f, jcy = 110f;
        float rcx = w - 240f, rcy = 110f;
        shapes.setColor(1f, 0.85f, 0.5f, runToggle ? 0.6f : 0.28f);
        shapes.circle(rcx, rcy, RUN_BUTTON_RADIUS);
        shapes.setColor(1f, 1f, 1f, jumpPointer >= 0 ? 0.5f : 0.25f);
        shapes.circle(jcx, jcy, JUMP_BUTTON_RADIUS);
        shapes.end();

        shapes.begin(ShapeRenderer.ShapeType.Line);
        shapes.setColor(1f, 1f, 1f, 0.6f);
        shapes.circle(jcx, jcy, JUMP_BUTTON_RADIUS);
        shapes.end();

        batch.setProjectionMatrix(hudCamera.combined);
        batch.begin();
        layout.setText(font, "PULAR");
        font.setColor(1f, 1f, 1f, 0.9f);
        font.draw(batch, "PULAR", jcx - layout.width / 2f, jcy + layout.height / 2f);
        layout.setText(font, "CORRER");
        font.setColor(1f, 1f, 1f, 0.9f);
        font.draw(batch, "CORRER", (w - 240f) - layout.width / 2f, rcy + layout.height / 2f);
        font.setColor(0.35f, 0.2f, 0.1f, 0.9f);
        font.draw(batch, "Sertão do Ceará - 1915: a seca chegou", 16f, h - 16f);
        if (UpdateChecker.available()) {
            font.setColor(0.6f, 0.1f, 0.05f, 1f);
            font.draw(batch, "Nova versão " + UpdateChecker.latestBuild() + " disponível: toque aqui para baixar", 16f, h - 44f);
        }
        batch.end();

        Gdx.gl.glDisable(GL20.GL_BLEND);
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
        shapes.dispose();
        batch.dispose();
        font.dispose();
    }
}
