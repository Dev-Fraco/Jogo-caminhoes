package com.exemplo.jogo3d;

import com.badlogic.gdx.graphics.Color;
import com.badlogic.gdx.graphics.GL20;
import com.badlogic.gdx.graphics.VertexAttributes.Usage;
import com.badlogic.gdx.graphics.g3d.Material;
import com.badlogic.gdx.graphics.g3d.Model;
import com.badlogic.gdx.graphics.g3d.ModelInstance;
import com.badlogic.gdx.graphics.g3d.attributes.ColorAttribute;
import com.badlogic.gdx.graphics.g3d.utils.MeshPartBuilder;
import com.badlogic.gdx.graphics.g3d.utils.MeshPartBuilder.VertexInfo;
import com.badlogic.gdx.graphics.g3d.utils.ModelBuilder;
import com.badlogic.gdx.graphics.g3d.utils.shapebuilders.BoxShapeBuilder;
import com.badlogic.gdx.math.MathUtils;
import com.badlogic.gdx.math.Matrix4;
import com.badlogic.gdx.math.Vector3;
import com.badlogic.gdx.utils.Array;

import java.util.Random;

/**
 * Cidadezinha do sertão, à beira da estrada: casas de bairro (paredes coloridas, telhado de telha ou
 * platibanda) e casas de taipa, uma pracinha com poço, bancos, árvores e capela, um roçado atrás das
 * casas e moradores fazendo as coisas do dia: andando, a cavalo, buscando água, conversando e trabalhando.
 */
final class Town {
    static final float X = World.TOWN_X;

    private final World w;
    private final Model casa, bench, tree, poco, horseModel;
    private final Array<Model> built = new Array<>();
    private final Array<Npc> npcs = new Array<>();
    private final Random rnd = new Random(1915L);
    private float ht;            // altura do chão da cidade (plano)
    private float sqZ;           // centro da pracinha (z); x = X

    // Cores
    private static final Color[] WALLS = {
            new Color(0.93f, 0.91f, 0.86f, 1f), new Color(0.93f, 0.80f, 0.45f, 1f), new Color(0.55f, 0.70f, 0.85f, 1f),
            new Color(0.90f, 0.65f, 0.62f, 1f), new Color(0.62f, 0.78f, 0.58f, 1f), new Color(0.85f, 0.62f, 0.38f, 1f)};
    private static final Color[] SHUTTERS = {
            new Color(0.20f, 0.35f, 0.55f, 1f), new Color(0.25f, 0.45f, 0.30f, 1f), new Color(0.40f, 0.24f, 0.12f, 1f),
            new Color(0.55f, 0.18f, 0.15f, 1f)};
    private static final Color ROOF = new Color(0.62f, 0.30f, 0.18f, 1f);
    private static final Color DOOR = new Color(0.36f, 0.21f, 0.10f, 1f);
    private static final Color STONE = new Color(0.74f, 0.71f, 0.66f, 1f);
    private static final Color SOIL = new Color(0.33f, 0.22f, 0.13f, 1f);
    private static final Color PLANT = new Color(0.55f, 0.55f, 0.25f, 1f);

    Town(World w, Model casa, Model bench, Model tree, Model poco, Model horseModel) {
        this.w = w;
        this.casa = casa;
        this.bench = bench;
        this.tree = tree;
        this.poco = poco;
        this.horseModel = horseModel;
    }

    private static float rz(float x) { return World.roadZ(x); }

    // ------------------------------------------------------------------ construção

    void build() {
        ht = w.heightAt(X, rz(X));
        sqZ = rz(X) + 23f;
        // Fileira sul (de frente para a estrada) e fileira norte (com a abertura da praça)
        float[] south = {72f, 80f, 88f, 96f, 104f, 112f, 120f, 128f};
        for (int i = 0; i < south.length; i++) {
            float x = south[i];
            boolean taipa = i == 1 || i == 5;
            placeHouse(x, rz(x) - 10.5f, 0f, taipa);
        }
        float[] north = {72f, 80f, 120f, 128f};
        for (int i = 0; i < north.length; i++) {
            float x = north[i];
            placeHouse(x, rz(x) + 10.5f, 180f, i == 3);
        }
        // Lados da praça: casas viradas para ela
        placeHouse(X - 19f, sqZ - 3f, 90f, false);
        placeHouse(X - 19f, sqZ + 5f, 90f, true);
        placeHouse(X + 19f, sqZ - 3f, -90f, false);
        placeHouse(X + 19f, sqZ + 5f, -90f, false);
        placeHouse(X - 12f, sqZ + 16f, 180f, false);
        placeHouse(X + 12f, sqZ + 16f, 180f, false);
        // Capela no alto da praça, de frente para ela
        placeChapel(X, sqZ + 18.5f);
        buildSquare();
        buildGarden();
    }

    /** Casa de bairro (feita em código) ou casa de taipa (modelo), com colisão. */
    private void placeHouse(float x, float z, float yaw, boolean taipa) {
        Matrix4 t = new Matrix4().setToTranslation(x, ht, z).rotate(Vector3.Y, yaw);
        if (taipa) {
            Matrix4 ts = new Matrix4(t).scale(0.8f, 0.8f, 0.8f);
            ModelInstance mi = new ModelInstance(casa);
            mi.transform.set(ts);
            w.instances.add(mi);
            w.houses.add(new World.House(ts));   // paredes do modelo (entra pela porta)
            return;
        }
        float width = 6.4f + rnd.nextFloat() * 1.2f, depth = 7f, height = 3.1f + rnd.nextFloat() * 0.4f;
        Color wall = WALLS[rnd.nextInt(WALLS.length)];
        Color shutter = SHUTTERS[rnd.nextInt(SHUTTERS.length)];
        boolean parapet = rnd.nextFloat() < 0.4f;   // platibanda na frente (comum no Ceará)
        Model m = buildHouse(width, depth, height, wall, shutter, parapet, false);
        built.add(m);
        ModelInstance mi = new ModelInstance(m);
        mi.transform.set(t);
        w.instances.add(mi);
        w.boxes.add(new World.Box(t, width / 2f + 0.05f, depth / 2f + 0.05f, height + 1.8f));
    }

    private void placeChapel(float x, float z) {
        Matrix4 t = new Matrix4().setToTranslation(x, ht, z).rotate(Vector3.Y, 180f);
        Model m = buildHouse(8f, 12f, 5.5f, WALLS[0], SHUTTERS[0], false, true);
        built.add(m);
        ModelInstance mi = new ModelInstance(m);
        mi.transform.set(t);
        w.instances.add(mi);
        w.boxes.add(new World.Box(t, 4.05f, 6.05f, 9f));
        // Torre do sino ao lado
        Matrix4 tt = new Matrix4(t).translate(-5.4f, 0f, 4.6f);   // mesmas coordenadas da torre no modelo
        w.boxes.add(new World.Box(tt, 1.35f, 1.35f, 10f));
    }

    /**
     * Casa em código, frente em +z, origem no chão no centro. Telhado de duas águas (cumeeira ao longo de x;
     * na capela, ao longo de z, com a fachada em empena), porta, janelas, calçada e, se pedido, platibanda.
     */
    private Model buildHouse(float wd, float dp, float h, Color wall, Color shutter, boolean parapet, boolean chapel) {
        ModelBuilder mb = new ModelBuilder();
        mb.begin();
        long attr = Usage.Position | Usage.Normal;
        MeshPartBuilder walls = mb.part("paredes", GL20.GL_TRIANGLES, attr, new Material(ColorAttribute.createDiffuse(wall)));
        BoxShapeBuilder.build(walls, 0f, h / 2f, 0f, wd, h, dp);
        MeshPartBuilder roof = mb.part("telhado", GL20.GL_TRIANGLES, attr, new Material(ColorAttribute.createDiffuse(ROOF)));
        float rise = chapel ? 2.4f : 1.5f, ov = 0.35f;
        if (!chapel) {
            // Cumeeira ao longo de x: águas para a frente e para trás; empenas nas laterais
            float hx = wd / 2f + 0.2f, hz = dp / 2f + ov, eave = h - ov * rise / (dp / 2f);
            quad(roof, -hx, eave, hz, hx, eave, hz, hx, h + rise, 0f, -hx, h + rise, 0f);
            quad(roof, hx, eave, -hz, -hx, eave, -hz, -hx, h + rise, 0f, hx, h + rise, 0f);
            tri(walls, -wd / 2f, h, dp / 2f, -wd / 2f, h + rise, 0f, -wd / 2f, h, -dp / 2f);
            tri(walls, wd / 2f, h, -dp / 2f, wd / 2f, h + rise, 0f, wd / 2f, h, dp / 2f);
        } else {
            // Capela: cumeeira ao longo de z, fachada em empena na frente
            float hx = wd / 2f + ov, hz = dp / 2f + 0.2f, eave = h - ov * rise / (wd / 2f);
            quad(roof, hx, eave, hz, hx, eave, -hz, 0f, h + rise, -hz, 0f, h + rise, hz);
            quad(roof, -hx, eave, -hz, -hx, eave, hz, 0f, h + rise, hz, 0f, h + rise, -hz);
            tri(walls, -wd / 2f, h, dp / 2f, wd / 2f, h, dp / 2f, 0f, h + rise, dp / 2f);
            tri(walls, wd / 2f, h, -dp / 2f, -wd / 2f, h, -dp / 2f, 0f, h + rise, -dp / 2f);
        }
        // Porta e janelas na frente
        MeshPartBuilder door = mb.part("porta", GL20.GL_TRIANGLES, attr, new Material(ColorAttribute.createDiffuse(DOOR)));
        MeshPartBuilder win = mb.part("janelas", GL20.GL_TRIANGLES, attr, new Material(ColorAttribute.createDiffuse(shutter)));
        float fz = dp / 2f + 0.04f;
        if (chapel) {
            BoxShapeBuilder.build(door, 0f, 1.5f, fz, 1.6f, 3.0f, 0.1f);
            BoxShapeBuilder.build(win, -2.4f, 2.6f, fz, 0.8f, 1.4f, 0.1f);
            BoxShapeBuilder.build(win, 2.4f, 2.6f, fz, 0.8f, 1.4f, 0.1f);
            for (float zz = -3f; zz <= 3.01f; zz += 3f) {
                BoxShapeBuilder.build(win, wd / 2f + 0.04f, 2.8f, zz, 0.1f, 1.6f, 0.8f);
                BoxShapeBuilder.build(win, -wd / 2f - 0.04f, 2.8f, zz, 0.1f, 1.6f, 0.8f);
            }
            // Torre do sino (ao lado da fachada), com telhado em pirâmide e a cruz na fachada
            BoxShapeBuilder.build(walls, -5.4f, 4.25f, 4.6f, 2.6f, 8.5f, 2.6f);
            BoxShapeBuilder.build(win, -5.4f, 7.2f, 4.6f + 1.34f, 0.9f, 1.2f, 0.06f);
            pyramid(roof, -5.4f, 8.5f, 4.6f, 1.55f, 1.8f);
            BoxShapeBuilder.build(door, 0f, h + rise + 0.75f, dp / 2f, 0.14f, 1.5f, 0.14f);
            BoxShapeBuilder.build(door, 0f, h + rise + 1.05f, dp / 2f, 0.8f, 0.14f, 0.14f);
        } else {
            float doorX = -wd * 0.22f;
            BoxShapeBuilder.build(door, doorX, 1.05f, fz, 1.0f, 2.1f, 0.08f);
            BoxShapeBuilder.build(win, wd * 0.22f, 1.6f, fz, 1.1f, 1.1f, 0.08f);
            BoxShapeBuilder.build(win, wd / 2f + 0.04f, 1.6f, 0f, 0.08f, 1.0f, 1.0f);
            BoxShapeBuilder.build(win, -wd / 2f - 0.04f, 1.6f, 0f, 0.08f, 1.0f, 1.0f);
            if (parapet) {
                // Platibanda: mureta na frente que esconde o telhado, com uma faixa em cima
                BoxShapeBuilder.build(walls, 0f, h + 0.6f, dp / 2f + 0.02f, wd + 0.1f, 1.2f, 0.18f);
                BoxShapeBuilder.build(win, 0f, h + 1.25f, dp / 2f + 0.02f, wd + 0.2f, 0.12f, 0.24f);
            }
        }
        // Calçada na frente
        MeshPartBuilder walk = mb.part("calcada", GL20.GL_TRIANGLES, attr, new Material(ColorAttribute.createDiffuse(STONE)));
        BoxShapeBuilder.build(walk, 0f, 0.07f, dp / 2f + 0.9f, wd + 0.6f, 0.14f, 1.6f);
        return mb.end();
    }

    private static void quad(MeshPartBuilder b, float ax, float ay, float az, float bx, float by, float bz,
                             float cx, float cy, float cz, float dx, float dy, float dz) {
        Vector3 n = new Vector3(bx - ax, by - ay, bz - az).crs(dx - ax, dy - ay, dz - az).nor();
        VertexInfo a = new VertexInfo().setPos(ax, ay, az).setNor(n), bb = new VertexInfo().setPos(bx, by, bz).setNor(n);
        VertexInfo c = new VertexInfo().setPos(cx, cy, cz).setNor(n), d = new VertexInfo().setPos(dx, dy, dz).setNor(n);
        b.triangle(a, bb, c);
        b.triangle(a, c, d);
    }

    private static void tri(MeshPartBuilder b, float ax, float ay, float az, float bx, float by, float bz,
                            float cx, float cy, float cz) {
        Vector3 n = new Vector3(bx - ax, by - ay, bz - az).crs(cx - ax, cy - ay, cz - az).nor();
        b.triangle(new VertexInfo().setPos(ax, ay, az).setNor(n), new VertexInfo().setPos(bx, by, bz).setNor(n),
                new VertexInfo().setPos(cx, cy, cz).setNor(n));
    }

    private static void pyramid(MeshPartBuilder b, float x, float y, float z, float half, float tall) {
        float top = y + tall;
        tri(b, x - half, y, z + half, x + half, y, z + half, x, top, z);
        tri(b, x + half, y, z + half, x + half, y, z - half, x, top, z);
        tri(b, x + half, y, z - half, x - half, y, z - half, x, top, z);
        tri(b, x - half, y, z - half, x - half, y, z + half, x, top, z);
    }

    /** Pracinha: piso de pedra, meio-fio, poço no centro, bancos e árvores. */
    private void buildSquare() {
        ModelBuilder mb = new ModelBuilder();
        mb.begin();
        long attr = Usage.Position | Usage.Normal;
        MeshPartBuilder floor = mb.part("praca", GL20.GL_TRIANGLES, attr, new Material(ColorAttribute.createDiffuse(STONE)));
        BoxShapeBuilder.build(floor, 0f, 0.06f, 0f, 24f, 0.12f, 22f);
        MeshPartBuilder curb = mb.part("meiofio", GL20.GL_TRIANGLES, attr,
                new Material(ColorAttribute.createDiffuse(0.60f, 0.57f, 0.52f, 1f)));
        BoxShapeBuilder.build(curb, 0f, 0.12f, 11f, 24.4f, 0.24f, 0.3f);
        BoxShapeBuilder.build(curb, 0f, 0.12f, -11f, 24.4f, 0.24f, 0.3f);
        BoxShapeBuilder.build(curb, 12f, 0.12f, 0f, 0.3f, 0.24f, 22f);
        BoxShapeBuilder.build(curb, -12f, 0.12f, 0f, 0.3f, 0.24f, 22f);
        Model sq = mb.end();
        built.add(sq);
        ModelInstance mi = new ModelInstance(sq);
        mi.transform.setToTranslation(X, ht, sqZ);
        w.instances.add(mi);

        // Poço no centro da praça
        ModelInstance well = new ModelInstance(poco);
        well.transform.setToTranslation(X, ht + 0.12f, sqZ);
        w.instances.add(well);
        w.obstacles.add(new World.Obstacle(X, sqZ, 1.1f, ht, 3f));
        // Bancos virados para o poço
        for (int i = 0; i < 4; i++) {
            float a = i * 90f + 45f;
            float bx = X + 6.5f * MathUtils.sinDeg(a), bz = sqZ + 6.5f * MathUtils.cosDeg(a);
            ModelInstance b = new ModelInstance(bench);
            b.transform.setToTranslation(bx, ht + 0.12f, bz).rotate(Vector3.Y, a + 180f)
                    .scale(HouseDecor.BENCH_SCALE, HouseDecor.BENCH_SCALE, HouseDecor.BENCH_SCALE);
            w.instances.add(b);
            w.obstacles.add(new World.Obstacle(bx, bz, 0.6f, ht, 0.8f));
        }
        // Árvores nos cantos
        float[][] trees = {{-9.5f, -8.5f}, {9.5f, -8.5f}, {-9.5f, 8.5f}, {9.5f, 8.5f}};
        for (float[] t : trees) {
            ModelInstance tr = new ModelInstance(tree);
            tr.transform.setToTranslation(X + t[0], ht + 0.12f, sqZ + t[1]).rotate(Vector3.Y, rnd.nextFloat() * 360f);
            w.instances.add(tr);
            w.obstacles.add(new World.Obstacle(X + t[0], sqZ + t[1], 0.45f, ht, 6f));
        }
    }

    /** Roçado atrás das casas do lado sul: leiras de terra com pés de milho seco. */
    private void buildGarden() {
        ModelBuilder mb = new ModelBuilder();
        mb.begin();
        long attr = Usage.Position | Usage.Normal;
        MeshPartBuilder soil = mb.part("leiras", GL20.GL_TRIANGLES, attr, new Material(ColorAttribute.createDiffuse(SOIL)));
        MeshPartBuilder plants = mb.part("plantas", GL20.GL_TRIANGLES, attr, new Material(ColorAttribute.createDiffuse(PLANT)));
        for (int r = 0; r < 4; r++) {
            float z = -r * 2.5f;
            BoxShapeBuilder.build(soil, 0f, 0.1f, z, 22f, 0.2f, 0.8f);
            for (float x = -10.5f; x <= 10.5f; x += 1.2f) {
                float hgt = 0.6f + rnd.nextFloat() * 0.5f;
                BoxShapeBuilder.build(plants, x, 0.2f + hgt / 2f, z, 0.12f, hgt, 0.12f);
            }
        }
        Model g = mb.end();
        built.add(g);
        ModelInstance mi = new ModelInstance(g);
        mi.transform.setToTranslation(X, ht, gardenZ(X));
        w.instances.add(mi);
    }

    private float gardenZ(float x) { return rz(X) - 25f; }

    /** Piso da praça (um pouco acima do chão): quem anda nela pisa em cima da pedra. */
    float floorAt(float x, float z) {
        return (Math.abs(x - X) < 12f && Math.abs(z - sqZ) < 11f) ? ht + 0.12f : -1e9f;
    }

    // ------------------------------------------------------------------ moradores

    /** Cria os moradores (precisa do modelo do personagem, carregado depois do mundo). */
    void createNpcs(Model person) {
        Color white = new Color(0.92f, 0.90f, 0.85f, 1f), beige = new Color(0.80f, 0.70f, 0.52f, 1f);
        Color blue = new Color(0.45f, 0.55f, 0.75f, 1f), red = new Color(0.65f, 0.30f, 0.22f, 1f);
        Color green = new Color(0.50f, 0.60f, 0.40f, 1f);
        Color brown = new Color(0.45f, 0.33f, 0.22f, 1f), grey = new Color(0.40f, 0.40f, 0.42f, 1f);
        Color denim = new Color(0.35f, 0.42f, 0.58f, 1f);
        Color black = new Color(0.12f, 0.10f, 0.09f, 1f), darkBrown = new Color(0.30f, 0.20f, 0.12f, 1f);
        Color greyHair = new Color(0.65f, 0.63f, 0.60f, 1f);

        // 1) Dois andando pelas calçadas, parando de vez em quando
        add(new Npc(person, 70f, rz(70f) - 5.2f, white, brown, black).script(sidewalk(-5.2f, true)));
        add(new Npc(person, 130f, rz(130f) + 5.2f, beige, grey, darkBrown).script(sidewalk(5.2f, false)));

        // 2) Um a cavalo, indo e voltando pela estrada da cidade
        Npc rider = new Npc(person, 62f, rz(62f) - 1.6f, red, denim, black).ride(horseModel);
        rider.script(roadLoop());
        add(rider);

        // 3) Dois buscando água no poço da praça (vão, ajoelham para puxar o balde e voltam para casa)
        float hx1 = X - 15f, hz1 = sqZ - 3f;   // porta da casa a oeste da praça
        add(new Npc(person, hx1, hz1, blue, brown, darkBrown).script(
                Npc.Step.go(X - 6f, sqZ - 1f), Npc.Step.go(X - 1.9f, sqZ), Npc.Step.face(X, sqZ),
                Npc.Step.act("IdleKneel", 5f), Npc.Step.go(X - 6f, sqZ - 1f), Npc.Step.go(hx1, hz1),
                Npc.Step.face(hx1 - 4f, hz1), Npc.Step.act("Idle", 6f)));
        float hx2 = 72f, hz2 = rz(72f) + 6.2f;  // porta da casa da fileira norte
        add(new Npc(person, hx2, hz2, green, grey, greyHair).script(
                Npc.Step.act("Idle", 4f), Npc.Step.go(86f, rz(86f) + 6f), Npc.Step.go(X - 6f, sqZ - 6f),
                Npc.Step.go(X + 1.9f, sqZ), Npc.Step.face(X, sqZ), Npc.Step.act("IdleKneel", 5f),
                Npc.Step.go(X - 6f, sqZ - 6f), Npc.Step.go(86f, rz(86f) + 6f), Npc.Step.go(hx2, hz2),
                Npc.Step.face(hx2, hz2 + 4f)));

        // 4) Dois conversando na praça, gesticulando um de cada vez
        float cx = X - 4.5f, cz = sqZ + 7.5f;
        add(new Npc(person, cx, cz, white, denim, black).script(
                Npc.Step.face(cx + 1.4f, cz), Npc.Step.act("Idle", 4f), Npc.Step.act("IdleLook", 3.5f),
                Npc.Step.act("Idle", 6f), Npc.Step.act("IdleLook", 3f)));
        add(new Npc(person, cx + 1.4f, cz, beige, brown, greyHair).script(
                Npc.Step.face(cx, cz), Npc.Step.act("IdleLook", 3f), Npc.Step.act("Idle", 5f),
                Npc.Step.act("IdleLook", 4f), Npc.Step.act("Idle", 4.5f)));

        // 5) Dois trabalhando no roçado: ajoelham na leira, avançam e ajoelham de novo
        float gz = gardenZ(X);
        add(new Npc(person, X - 9f, gz + 0.6f, white, brown, black).script(
                Npc.Step.go(X - 9f, gz + 0.6f), Npc.Step.act("IdleKneel", 6f), Npc.Step.go(X - 4f, gz + 0.6f),
                Npc.Step.act("IdleKneel", 6f), Npc.Step.go(X + 1f, gz + 0.6f), Npc.Step.act("IdleKneel", 6f),
                Npc.Step.go(X + 6f, gz + 0.6f), Npc.Step.act("IdleKneel", 6f)));
        add(new Npc(person, X + 8f, gz - 4.4f, beige, grey, darkBrown).script(
                Npc.Step.go(X + 8f, gz - 4.4f), Npc.Step.act("IdleKneel", 7f), Npc.Step.go(X + 3f, gz - 4.4f),
                Npc.Step.act("IdleKneel", 7f), Npc.Step.go(X - 2f, gz - 4.4f), Npc.Step.act("IdleKneel", 7f),
                Npc.Step.go(X - 7f, gz - 4.4f), Npc.Step.act("IdleKneel", 7f)));
    }

    private void add(Npc n) {
        npcs.add(n);
        w.instances.add(n.inst);
        if (n.horseInstance() != null) w.instances.add(n.horseInstance());
    }

    /** Calçada ao longo da rua (segue a curva da estrada), ida e volta, parando nas pontas. */
    private Npc.Step[] sidewalk(float off, boolean eastFirst) {
        Array<Npc.Step> s = new Array<>();
        float a = eastFirst ? 70f : 130f, b = eastFirst ? 130f : 70f, dir = Math.signum(b - a);
        for (float x = a; dir > 0 ? x <= b : x >= b; x += dir * 10f) s.add(Npc.Step.go(x, rz(x) + off));
        s.add(Npc.Step.act("Idle", 5f));
        for (float x = b; dir > 0 ? x >= a : x <= a; x -= dir * 10f) s.add(Npc.Step.go(x, rz(x) + off));
        s.add(Npc.Step.act("IdleLook", 3.5f));
        return s.toArray(Npc.Step.class);
    }

    /** Estrada da cidade a cavalo: vai por uma faixa e volta pela outra. */
    private Npc.Step[] roadLoop() {
        Array<Npc.Step> s = new Array<>();
        for (float x = 62f; x <= 138f; x += 8f) s.add(Npc.Step.go(x, rz(x) - 1.6f));
        s.add(Npc.Step.act("Idle", 3f));
        for (float x = 138f; x >= 62f; x -= 8f) s.add(Npc.Step.go(x, rz(x) + 1.6f));
        s.add(Npc.Step.act("Idle", 3f));
        return s.toArray(Npc.Step.class);
    }

    void update(float dt) {
        for (int i = 0; i < npcs.size; i++) npcs.get(i).update(dt, w);
    }

    void dispose() {
        for (Model m : built) m.dispose();
    }
}
