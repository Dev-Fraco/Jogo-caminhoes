package com.exemplo.jogo3d;

import com.badlogic.gdx.ApplicationAdapter;
import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.backends.headless.HeadlessApplication;
import com.badlogic.gdx.backends.headless.HeadlessApplicationConfiguration;
import com.badlogic.gdx.files.FileHandle;
import com.badlogic.gdx.graphics.GL20;
import com.badlogic.gdx.graphics.g3d.Model;
import com.badlogic.gdx.graphics.g3d.loader.G3dModelLoader;
import com.badlogic.gdx.graphics.g3d.model.data.*;
import com.badlogic.gdx.utils.Array;
import com.badlogic.gdx.utils.JsonReader;

import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Objects;

/**
 * Modelos em binário (.mdl): cada .g3dj tem o seu .mdl, com os mesmos dados (malhas, materiais, ossos,
 * animações), e o personagem carrega com pouca memória.
 */
public class ModelIOTests extends ApplicationAdapter {
    static int pass = 0, fail = 0;

    static void check(String name, boolean ok, String info) {
        System.out.println((ok ? "  OK   " : "  FALHA") + "  " + name + (info.isEmpty() ? "" : "  [" + info + "]"));
        if (ok) pass++; else fail++;
    }

    @Override
    public void create() {
        Gdx.gl = Gdx.gl20 = (GL20) Proxy.newProxyInstance(GL20.class.getClassLoader(), new Class[]{GL20.class}, (p, m, a) -> {
            Class<?> t = m.getReturnType();
            if (t == int.class) return 1;
            if (t == boolean.class) return true;
            if (t == float.class) return 0f;
            if (t == String.class) return "";
            return null;
        });
        try {
            run();
        } catch (Throwable t) {
            t.printStackTrace();
            fail++;
        }
        System.out.println("\nRESULTADO: " + pass + " ok, " + fail + " falhas");
        System.exit(fail == 0 ? 0 : 1);
    }

    static String diff;
    static final String SRC = "../modelos_fonte/g3dj";
    static String dirA = "", dirB = "";

    static String rel(String f, String dir) {
        return f != null && f.startsWith(dir + "/") ? f.substring(dir.length() + 1) : f;
    }

    static boolean same(ModelData a, ModelData b) {
        diff = "";
        if (!Objects.equals(a.id, b.id)) return no("id");
        if (a.meshes.size != b.meshes.size) return no("malhas");
        for (int i = 0; i < a.meshes.size; i++) {
            ModelMesh x = a.meshes.get(i), y = b.meshes.get(i);
            if (!Arrays.equals(x.attributes, y.attributes)) return no("atributos " + x.id);
            if (!Arrays.equals(x.vertices, y.vertices)) return no("vértices " + x.id);
            if (x.parts.length != y.parts.length) return no("partes " + x.id);
            for (int k = 0; k < x.parts.length; k++)
                if (!Objects.equals(x.parts[k].id, y.parts[k].id) || x.parts[k].primitiveType != y.parts[k].primitiveType
                        || !Arrays.equals(x.parts[k].indices, y.parts[k].indices)) return no("índices " + x.parts[k].id);
        }
        if (a.materials.size != b.materials.size) return no("materiais");
        for (int i = 0; i < a.materials.size; i++) {
            ModelMaterial x = a.materials.get(i), y = b.materials.get(i);
            if (!Objects.equals(x.id, y.id) || x.type != y.type || !Objects.equals(x.diffuse, y.diffuse) || !Objects.equals(x.ambient, y.ambient)
                    || !Objects.equals(x.specular, y.specular) || !Objects.equals(x.emissive, y.emissive) || !Objects.equals(x.reflection, y.reflection)
                    || x.shininess != y.shininess || x.opacity != y.opacity) return no("material " + x.id);
            int nx = x.textures == null ? -1 : x.textures.size, ny = y.textures == null ? -1 : y.textures.size;
            if (nx != ny) return no("texturas " + x.id);
            for (int k = 0; k < Math.max(nx, 0); k++) {
                ModelTexture p = x.textures.get(k), q = y.textures.get(k);
                if (!Objects.equals(p.id, q.id) || !Objects.equals(rel(p.fileName, dirA), rel(q.fileName, dirB)) || p.usage != q.usage
                        || !Objects.equals(p.uvTranslation, q.uvTranslation) || !Objects.equals(p.uvScaling, q.uvScaling))
                    return no("textura " + p.fileName + " / " + q.fileName);
            }
        }
        if (a.nodes.size != b.nodes.size) return no("nós");
        for (int i = 0; i < a.nodes.size; i++) if (!sameNode(a.nodes.get(i), b.nodes.get(i))) return false;
        if (a.animations.size != b.animations.size) return no("animações");
        for (int i = 0; i < a.animations.size; i++) {
            ModelAnimation x = a.animations.get(i), y = b.animations.get(i);
            if (!Objects.equals(x.id, y.id) || x.nodeAnimations.size != y.nodeAnimations.size) return no("animação " + x.id);
            for (int k = 0; k < x.nodeAnimations.size; k++) {
                ModelNodeAnimation p = x.nodeAnimations.get(k), q = y.nodeAnimations.get(k);
                if (!Objects.equals(p.nodeId, q.nodeId) || !sameKeys(p.translation, q.translation) || !sameKeys(p.rotation, q.rotation)
                        || !sameKeys(p.scaling, q.scaling)) return no("chaves " + x.id + "/" + p.nodeId);
            }
        }
        return true;
    }

    static <T> boolean sameKeys(Array<ModelNodeKeyframe<T>> a, Array<ModelNodeKeyframe<T>> b) {
        if (a == null || b == null) return a == b;
        if (a.size != b.size) return false;
        for (int i = 0; i < a.size; i++)
            if (a.get(i).keytime != b.get(i).keytime || !Objects.equals(a.get(i).value, b.get(i).value)) return false;
        return true;
    }

    static boolean sameNode(ModelNode a, ModelNode b) {
        if (!Objects.equals(a.id, b.id) || !Objects.equals(a.translation, b.translation) || !Objects.equals(a.rotation, b.rotation)
                || !Objects.equals(a.scale, b.scale) || !Objects.equals(a.meshId, b.meshId)) return no("nó " + a.id);
        int pa = a.parts == null ? -1 : a.parts.length, pb = b.parts == null ? -1 : b.parts.length;
        if (pa != pb) return no("partes do nó " + a.id);
        for (int i = 0; i < Math.max(pa, 0); i++) {
            ModelNodePart x = a.parts[i], y = b.parts[i];
            if (!Objects.equals(x.materialId, y.materialId) || !Objects.equals(x.meshPartId, y.meshPartId)) return no("parte " + a.id);
            int bx = x.bones == null ? -1 : x.bones.size, by = y.bones == null ? -1 : y.bones.size;
            if (bx != by) return no("ossos " + a.id);
            for (int k = 0; k < Math.max(bx, 0); k++)
                if (!x.bones.getKeyAt(k).equals(y.bones.getKeyAt(k)) || !Arrays.equals(x.bones.getValueAt(k).val, y.bones.getValueAt(k).val))
                    return no("osso " + x.bones.getKeyAt(k));
            if (!Arrays.deepEquals(x.uvMapping, y.uvMapping)) return no("uv " + a.id);
        }
        int ca = a.children == null ? -1 : a.children.length, cb = b.children == null ? -1 : b.children.length;
        if (ca != cb) return no("filhos " + a.id);
        for (int i = 0; i < Math.max(ca, 0); i++) if (!sameNode(a.children[i], b.children[i])) return false;
        return true;
    }

    static boolean no(String what) { diff = what; return false; }

    static void collectAny(FileHandle dir, List<String> out) {
        for (FileHandle f : dir.list()) {
            if (f.isDirectory()) collectAny(f, out);
            else out.add(f.path());
        }
    }

    static void collect(FileHandle dir, List<String> out) {
        for (FileHandle f : dir.list()) {
            if (f.isDirectory()) collect(f, out);
            else if (f.extension().equals("g3dj")) out.add(f.path().substring(SRC.length() + 1));
        }
    }

    void run() {
        // 1. Todo .g3dj que o jogo usa tem o .mdl, com os mesmos dados
        List<String> files = new ArrayList<>();
        collect(Gdx.files.local(SRC + "/models"), files);
        int missing = 0, bad = 0;
        String firstBad = "";
        for (String f : files) {
            FileHandle bin = Gdx.files.internal(ModelIO.binPath(f));
            if (!bin.exists()) { missing++; if (firstBad.isEmpty()) firstBad = "sem .mdl: " + f; continue; }
            FileHandle src = Gdx.files.local(SRC + "/" + f);
            ModelData a = new G3dModelLoader(new JsonReader()).loadModelData(src);
            ModelData b = ModelIO.read(bin);
            dirA = src.parent().path();
            dirB = bin.parent().path();
            if (!same(a, b)) { bad++; if (firstBad.isEmpty()) firstBad = f + ": " + diff; }
        }
        check("cada .g3dj tem o seu .mdl", missing == 0 && files.size() > 30, missing + " sem binário de " + files.size());
        int stray = 0;
        List<String> inAssets = new ArrayList<>();
        collectAny(Gdx.files.internal("models"), inAssets);
        for (String f : inAssets) if (f.endsWith(".g3dj")) stray++;
        check("nenhum .g3dj dentro de assets (não vai no APK)", stray == 0, stray + " arquivos");
        check("o .mdl tem os mesmos dados do .g3dj (malhas, materiais, ossos, animações)", bad == 0 && missing == 0,
                firstBad.isEmpty() ? files.size() + " modelos" : firstBad);

        // 2. O personagem pelo binário: mesmas animações e duração
        FileHandle jsrc = Gdx.files.local(SRC + "/models/jake/jake.g3dj");
        ModelData jd = new G3dModelLoader(new JsonReader()).loadModelData(jsrc);
        for (ModelMaterial m : jd.materials)   // texturas: as de assets (a pasta de fontes só tem o .g3dj)
            if (m.textures != null) for (ModelTexture t : m.textures) t.fileName = "models/jake/" + rel(t.fileName, jsrc.parent().path());
        Model mj = new Model(jd, new com.badlogic.gdx.graphics.g3d.utils.TextureProvider.FileTextureProvider());
        Model mb = ModelIO.load("models/jake/jake.g3dj");
        boolean anims = mj.animations.size == mb.animations.size;
        for (int i = 0; anims && i < mj.animations.size; i++)
            anims = mj.animations.get(i).id.equals(mb.animations.get(i).id) && mj.animations.get(i).duration == mb.animations.get(i).duration;
        check("personagem: animações iguais (nomes e duração)", anims, mb.animations.size + " animações");
        check("personagem: mesmos nós e malhas", mj.nodes.size == mb.nodes.size && mj.meshes.size == mb.meshes.size
                && mj.materials.size == mb.materials.size, mb.meshes.size + " malhas, " + mb.materials.size + " materiais");
        mj.dispose();
        mb.dispose();

        // 3. Memória: ler o binário do personagem cabe com folga (o JSON precisava de mais de 320 MB no PC)
        for (int i = 0; i < 3; i++) System.gc();
        Runtime r = Runtime.getRuntime();
        long before = r.totalMemory() - r.freeMemory();
        long t0 = System.nanoTime();
        ModelData d = ModelIO.read(Gdx.files.internal("models/jake/jake.mdl"));
        long ms = (System.nanoTime() - t0) / 1000000;
        long after = r.totalMemory() - r.freeMemory();
        check("personagem: ler o binário usa pouca memória", (after - before) >> 20 < 60,
                String.format("%d MB, %d ms", (after - before) >> 20, ms));
        if (d.meshes.size == 0) fail++;
    }

    public static void main(String[] args) {
        new HeadlessApplication(new ModelIOTests(), new HeadlessApplicationConfiguration());
    }
}
