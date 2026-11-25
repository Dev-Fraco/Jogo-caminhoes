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
    private final Vector3 playerPos = new Vector3();
    private float velY = 0f;
    private boolean grounded = false;
    private boolean jumpRequested = false;
    private float yaw = 0f;      // direção da câmera (e do personagem)
    private float pitch = 0.45f; // inclinação da câmera (positivo = de cima)

    // ---------- Toque / HUD ----------
    private int joyPointer = -1, lookPointer = -1, jumpPointer = -1;
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

        modelBatch = new ModelBatch();

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

        playerPos.set(0f, world.heightAt(0f, 0f), 0f);
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

        // Teclado (PC) soma com o joystick (celular)
        float ix = 0f, iy = 0f;
        if (Gdx.input.isKeyPressed(Input.Keys.W) || Gdx.input.isKeyPressed(Input.Keys.UP)) iy += 1f;
        if (Gdx.input.isKeyPressed(Input.Keys.S) || Gdx.input.isKeyPressed(Input.Keys.DOWN)) iy -= 1f;
        if (Gdx.input.isKeyPressed(Input.Keys.A) || Gdx.input.isKeyPressed(Input.Keys.LEFT)) ix -= 1f;
        if (Gdx.input.isKeyPressed(Input.Keys.D) || Gdx.input.isKeyPressed(Input.Keys.RIGHT)) ix += 1f;
        if (Gdx.input.isKeyJustPressed(Input.Keys.SPACE)) jumpRequested = true;
        ix += joyX;
        iy += joyY;

        // Direções a partir da câmera (andar é relativo à câmera)
        Vector3 forward = new Vector3(MathUtils.sin(yaw), 0f, MathUtils.cos(yaw));
        Vector3 right = new Vector3(forward).crs(Vector3.Y);

        Vector3 move = new Vector3(forward).scl(iy).add(new Vector3(right).scl(ix));
        float moveLen = Math.min(move.len(), 1f);
        if (move.len() > 1f) move.nor();

        playerPos.x += move.x * SPEED * dt;
        playerPos.z += move.z * SPEED * dt;
        world.resolveCollisions(playerPos, PLAYER_RADIUS);

        // Gravidade acompanha o relevo: o jogador sobe e desce com o chão
        float groundY = world.heightAt(playerPos.x, playerPos.z);
        velY -= GRAVITY * dt;
        playerPos.y += velY * dt;
        grounded = false;
        if (playerPos.y <= groundY) {
            playerPos.y = groundY;
            velY = 0f;
            grounded = true;
            if (jumpRequested) velY = JUMP_VELOCITY;
        }
        jumpRequested = false;

        // Limita ao terreno
        float half = World.HALF - 2f;
        playerPos.x = MathUtils.clamp(playerPos.x, -half, half);
        playerPos.z = MathUtils.clamp(playerPos.z, -half, half);

        character.update(playerPos.x, playerPos.y, playerPos.z, yaw, grounded ? moveLen : 0f, grounded, dt);

        // Câmera atrás do jogador, sempre acima do chão
        Vector3 pivot = new Vector3(playerPos.x, playerPos.y + 1.4f, playerPos.z);
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

        drawHud();
    }

    // ---------- Toque ----------
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

        // Atribui novos dedos
        for (int i = 0; i < 5; i++) {
            if (!Gdx.input.isTouched(i)) continue;
            if (i == joyPointer || i == lookPointer || i == jumpPointer) continue;
            float x = Gdx.input.getX(i), y = Gdx.input.getY(i);
            if (jumpPointer < 0 && isOnJumpButton(x, y)) {
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
        font.setColor(0.35f, 0.2f, 0.1f, 0.9f);
        font.draw(batch, "Sertão do Ceará - 1915: a seca chegou", 16f, h - 16f);
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
