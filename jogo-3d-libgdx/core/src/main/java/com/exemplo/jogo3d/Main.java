package com.exemplo.jogo3d;

import com.badlogic.gdx.ApplicationAdapter;
import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.Input;
import com.badlogic.gdx.graphics.Color;
import com.badlogic.gdx.graphics.GL20;
import com.badlogic.gdx.graphics.OrthographicCamera;
import com.badlogic.gdx.graphics.PerspectiveCamera;
import com.badlogic.gdx.graphics.VertexAttributes.Usage;
import com.badlogic.gdx.graphics.g2d.BitmapFont;
import com.badlogic.gdx.graphics.g2d.GlyphLayout;
import com.badlogic.gdx.graphics.g2d.SpriteBatch;
import com.badlogic.gdx.graphics.g3d.Environment;
import com.badlogic.gdx.graphics.g3d.Material;
import com.badlogic.gdx.graphics.g3d.Model;
import com.badlogic.gdx.graphics.g3d.ModelBatch;
import com.badlogic.gdx.graphics.g3d.ModelInstance;
import com.badlogic.gdx.graphics.g3d.attributes.ColorAttribute;
import com.badlogic.gdx.graphics.g3d.environment.DirectionalLight;
import com.badlogic.gdx.graphics.g3d.utils.ModelBuilder;
import com.badlogic.gdx.graphics.glutils.ShapeRenderer;
import com.badlogic.gdx.math.MathUtils;
import com.badlogic.gdx.math.Vector3;
import com.badlogic.gdx.utils.Array;

/**
 * Protótipo: sertão seco, casas de taipa, cacto, jogador em terceira pessoa.
 * Celular: joystick na esquerda, arrastar na direita para girar, botão PULAR.
 * PC: WASD/setas, espaço, arrastar com o mouse para girar.
 */
public class Main extends ApplicationAdapter {

    // ---------- Ajustes ----------
    static final float SPEED = 7f;
    static final float JUMP_VELOCITY = 7f;
    static final float GRAVITY = 20f;
    static final float PLAYER_RADIUS = 0.45f;
    static final float CAMERA_DISTANCE = 5f;
    static final float LOOK_SENSITIVITY = 0.006f;
    static final float JOY_RADIUS = 110f;
    static final float JUMP_BUTTON_RADIUS = 70f;
    static final int OBSTACLE_COUNT = 45;
    static final float WORLD_HALF = 70f;

    // ---------- 3D ----------
    private ModelBatch modelBatch;
    private Environment environment;
    private PerspectiveCamera camera;
    private Model unitBox;
    private final Array<ModelInstance> scenery = new Array<>();
    private final Array<Obstacle> obstacles = new Array<>();
    private ModelInstance playerInstance;

    // ---------- Jogador ----------
    private final Vector3 playerPos = new Vector3(0f, 0f, 0f);
    private float velY = 0f;
    private float yaw = 0f;     // rotação horizontal da câmera (e do jogador)
    private float pitch = 0.45f; // inclinação da câmera (positivo = olhando de cima)

    // ---------- Toque / HUD ----------
    private int joyPointer = -1, lookPointer = -1, jumpPointer = -1;
    private float joyOriginX, joyOriginY, joyX, joyY;
    private float lookLastX, lookLastY;
    private boolean jumpRequested;
    private OrthographicCamera hudCamera;
    private ShapeRenderer shapes;
    private SpriteBatch batch;
    private BitmapFont font;
    private final GlyphLayout layout = new GlyphLayout();

    private static class Obstacle {
        final Vector3 pos;
        final Vector3 half;
        Obstacle(Vector3 pos, Vector3 half) {
            this.pos = pos;
            this.half = half;
        }
    }

    @Override
    public void create() {
        Gdx.gl.glEnable(GL20.GL_DEPTH_TEST);

        modelBatch = new ModelBatch();
        ModelBuilder builder = new ModelBuilder();
        unitBox = builder.createBox(1f, 1f, 1f,
                new Material(ColorAttribute.createDiffuse(Color.WHITE)),
                Usage.Position | Usage.Normal);

        environment = new Environment();
        // Luz do sol forte do sertão: quente e direta, com pouca luz de ambiente
        environment.set(new ColorAttribute(ColorAttribute.AmbientLight, 0.42f, 0.38f, 0.34f, 1f));
        environment.add(new DirectionalLight().set(1f, 0.93f, 0.78f, -0.4f, -1f, -0.35f));

        camera = new PerspectiveCamera(67f, Gdx.graphics.getWidth(), Gdx.graphics.getHeight());
        camera.near = 0.1f;
        camera.far = 400f;

        hudCamera = new OrthographicCamera(Gdx.graphics.getWidth(), Gdx.graphics.getHeight());
        shapes = new ShapeRenderer();
        batch = new SpriteBatch();
        font = new BitmapFont();

        buildWorld();

        playerInstance = makeBox(0.8f, 1.8f, 0.8f, new Color(0.85f, 0.35f, 0.12f, 1f));
    }

    private void buildWorld() {
        // Chão de terra seca
        scenery.add(makeBox(800f, 1f, 800f, new Color(0.76f, 0.63f, 0.40f, 1f), 0f, -0.5f, 0f));

        java.util.Random rnd = new java.util.Random(42L);
        for (int i = 0; i < OBSTACLE_COUNT; i++) {
            float x = (rnd.nextFloat() * 2f - 1f) * WORLD_HALF;
            float z = (rnd.nextFloat() * 2f - 1f) * WORLD_HALF;
            if (Math.abs(x) < 8f && Math.abs(z) < 8f) continue; // espaço livre no spawn

            if (rnd.nextBoolean()) {
                // Casa de taipa: corpo de barro + telhado de telha
                float w = 4f + rnd.nextFloat() * 3f;
                float h = 2.5f + rnd.nextFloat() * 1.5f;
                float d = 4f + rnd.nextFloat() * 3f;
                Vector3 pos = new Vector3(x, h / 2f, z);
                Vector3 half = new Vector3(w / 2f, h / 2f, d / 2f);
                obstacles.add(new Obstacle(pos, half));
                scenery.add(makeBox(w, h, d, new Color(0.84f, 0.72f, 0.55f, 1f), x, h / 2f, z));
                scenery.add(makeBox(w + 0.6f, 0.5f, d + 0.6f, new Color(0.55f, 0.28f, 0.18f, 1f),
                        x, h + 0.25f, z));
            } else {
                // Cacto: pilar verde
                float h = 2.5f + rnd.nextFloat() * 2f;
                Vector3 pos = new Vector3(x, h / 2f, z);
                Vector3 half = new Vector3(0.45f, h / 2f, 0.45f);
                obstacles.add(new Obstacle(pos, half));
                scenery.add(makeBox(0.9f, h, 0.9f, new Color(0.30f, 0.50f, 0.28f, 1f), x, h / 2f, z));
            }
        }
    }

    private ModelInstance makeBox(float w, float h, float d, Color color) {
        return makeBox(w, h, d, color, 0f, 0f, 0f);
    }

    private ModelInstance makeBox(float w, float h, float d, Color color, float x, float y, float z) {
        ModelInstance inst = new ModelInstance(unitBox);
        inst.materials.get(0).set(ColorAttribute.createDiffuse(color));
        inst.transform.setToTranslationAndScaling(x, y, z, w, h, d);
        return inst;
    }

    @Override
    public void render() {
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

        // Direções a partir da câmera (estilo GTA: andar é relativo à câmera)
        Vector3 forward = new Vector3(MathUtils.sin(yaw), 0f, MathUtils.cos(yaw));
        Vector3 right = new Vector3(forward).crs(Vector3.Y);

        Vector3 move = new Vector3(forward).scl(iy).add(new Vector3(right).scl(ix));
        if (move.len2() > 1f) move.nor();
        playerPos.x += move.x * SPEED * dt;
        playerPos.z += move.z * SPEED * dt;
        resolveCollisions(playerPos);

        // Gravidade e pulo
        velY -= GRAVITY * dt;
        playerPos.y += velY * dt;
        if (playerPos.y <= 0f) {
            playerPos.y = 0f;
            velY = 0f;
            if (jumpRequested) velY = JUMP_VELOCITY;
        }
        jumpRequested = false;

        // Limita o mundo
        playerPos.x = MathUtils.clamp(playerPos.x, -WORLD_HALF, WORLD_HALF);
        playerPos.z = MathUtils.clamp(playerPos.z, -WORLD_HALF, WORLD_HALF);

        playerInstance.transform.setToTranslation(playerPos.x, playerPos.y + 0.9f, playerPos.z)
                .rotate(Vector3.Y, yaw * MathUtils.radiansToDegrees);

        // Câmera atrás do jogador
        Vector3 pivot = new Vector3(playerPos.x, playerPos.y + 1.5f, playerPos.z);
        Vector3 back = new Vector3(
                -forward.x * MathUtils.cos(pitch),
                MathUtils.sin(pitch),
                -forward.z * MathUtils.cos(pitch));
        camera.position.set(pivot).mulAdd(back, CAMERA_DISTANCE);
        camera.lookAt(pivot);
        camera.up.set(Vector3.Y);
        camera.update();

        // Desenha o mundo 3D
        Gdx.gl.glClearColor(0.72f, 0.82f, 0.92f, 1f); // céu pálido de seca
        Gdx.gl.glClear(GL20.GL_COLOR_BUFFER_BIT | GL20.GL_DEPTH_BUFFER_BIT);
        modelBatch.begin(camera);
        modelBatch.render(scenery, environment);
        modelBatch.render(playerInstance, environment);
        modelBatch.end();

        drawHud();
    }

    private void resolveCollisions(Vector3 p) {
        for (Obstacle o : obstacles) {
            float minX = o.pos.x - o.half.x - PLAYER_RADIUS;
            float maxX = o.pos.x + o.half.x + PLAYER_RADIUS;
            float minZ = o.pos.z - o.half.z - PLAYER_RADIUS;
            float maxZ = o.pos.z + o.half.z + PLAYER_RADIUS;
            if (p.x > minX && p.x < maxX && p.z > minZ && p.z < maxZ && p.y < o.pos.y + o.half.y) {
                // Empurra para fora pelo lado mais próximo
                float left = p.x - minX, right = maxX - p.x;
                float bottom = p.z - minZ, top = maxZ - p.z;
                float m = Math.min(Math.min(left, right), Math.min(bottom, top));
                if (m == left) p.x = minX;
                else if (m == right) p.x = maxX;
                else if (m == bottom) p.z = minZ;
                else p.z = maxZ;
            }
        }
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
            joyY = MathUtils.clamp(-dy / JOY_RADIUS, -1f, 1f); // tela cresce para baixo
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
        unitBox.dispose();
        shapes.dispose();
        batch.dispose();
        font.dispose();
    }
}
