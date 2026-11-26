package com.exemplo.jogo3d;

import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.files.FileHandle;
import com.badlogic.gdx.graphics.Color;
import com.badlogic.gdx.graphics.Texture;
import com.badlogic.gdx.graphics.VertexAttribute;
import com.badlogic.gdx.graphics.g3d.Model;
import com.badlogic.gdx.graphics.g3d.loader.G3dModelLoader;
import com.badlogic.gdx.graphics.g3d.model.data.ModelAnimation;
import com.badlogic.gdx.graphics.g3d.model.data.ModelData;
import com.badlogic.gdx.graphics.g3d.model.data.ModelMaterial;
import com.badlogic.gdx.graphics.g3d.model.data.ModelMesh;
import com.badlogic.gdx.graphics.g3d.model.data.ModelMeshPart;
import com.badlogic.gdx.graphics.g3d.model.data.ModelNode;
import com.badlogic.gdx.graphics.g3d.model.data.ModelNodeAnimation;
import com.badlogic.gdx.graphics.g3d.model.data.ModelNodeKeyframe;
import com.badlogic.gdx.graphics.g3d.model.data.ModelNodePart;
import com.badlogic.gdx.graphics.g3d.model.data.ModelTexture;
import com.badlogic.gdx.graphics.g3d.utils.TextureProvider;
import com.badlogic.gdx.math.Matrix4;
import com.badlogic.gdx.math.Quaternion;
import com.badlogic.gdx.math.Vector2;
import com.badlogic.gdx.math.Vector3;
import com.badlogic.gdx.utils.Array;
import com.badlogic.gdx.utils.ArrayMap;
import com.badlogic.gdx.utils.JsonReader;

import java.io.DataOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;

/**
 * Modelos 3D em binário (.mdl), lidos direto para arrays.
 *
 * O .g3dj (JSON) do personagem tem 17,8 MB: o leitor de JSON cria um objeto por número e precisa de
 * mais de 300 MB só para ler o arquivo, acima do limite do celular (256 MB). O .mdl guarda os mesmos
 * dados (malhas, materiais, nós com ossos e animações) em números binários: a leitura usa poucos MB.
 *
 * load("models/x.g3dj") abre "models/x.mdl" se existir; senão, lê o .g3dj (modelos novos ainda não convertidos).
 * Os caminhos das texturas ficam relativos à pasta do modelo.
 */
final class ModelIO {
    private static final int MAGIC = 0x4D444C31;   // "MDL1"

    private ModelIO() {}

    /** Caminho do binário que corresponde a um .g3dj. */
    static String binPath(String g3dj) {
        return g3dj.endsWith(".g3dj") ? g3dj.substring(0, g3dj.length() - 5) + ".mdl" : g3dj + ".mdl";
    }

    /** Carrega o modelo: o .mdl se existir, senão o .g3dj. */
    static Model load(String g3dj) {
        FileHandle bin = Gdx.files.internal(binPath(g3dj));
        if (bin.exists()) return new Model(read(bin), textures());
        return new G3dModelLoader(new JsonReader()).loadModel(Gdx.files.internal(g3dj));
    }

    /** Mesmas opções de textura do G3dModelLoader (linear, repetindo). */
    private static TextureProvider textures() {
        return new TextureProvider.FileTextureProvider(Texture.TextureFilter.Linear, Texture.TextureFilter.Linear,
                Texture.TextureWrap.Repeat, Texture.TextureWrap.Repeat, false);
    }

    // ---------- Leitura ----------

    static ModelData read(FileHandle file) {
        ByteBuffer b = ByteBuffer.wrap(file.readBytes());
        if (b.getInt() != MAGIC) throw new IllegalStateException("não é um .mdl: " + file.path());
        String dir = file.parent().path();
        String prefix = dir.isEmpty() ? "" : dir + "/";
        ModelData d = new ModelData();
        d.id = str(b);
        d.version[0] = b.getShort();
        d.version[1] = b.getShort();
        int nm = b.getInt();
        for (int i = 0; i < nm; i++) {
            ModelMesh m = new ModelMesh();
            m.id = str(b);
            m.attributes = new VertexAttribute[b.getInt()];
            for (int k = 0; k < m.attributes.length; k++) {
                int usage = b.getInt(), num = b.getInt(), type = b.getInt();
                boolean norm = b.get() != 0;
                String alias = str(b);
                int unit = b.getInt();
                m.attributes[k] = new VertexAttribute(usage, num, type, norm, alias, unit);
            }
            m.vertices = new float[b.getInt()];
            b.asFloatBuffer().get(m.vertices);
            b.position(b.position() + m.vertices.length * 4);
            m.parts = new ModelMeshPart[b.getInt()];
            for (int k = 0; k < m.parts.length; k++) {
                ModelMeshPart p = new ModelMeshPart();
                p.id = str(b);
                p.primitiveType = b.getInt();
                p.indices = new short[b.getInt()];
                b.asShortBuffer().get(p.indices);
                b.position(b.position() + p.indices.length * 2);
                m.parts[k] = p;
            }
            d.meshes.add(m);
        }
        int nmat = b.getInt();
        for (int i = 0; i < nmat; i++) {
            ModelMaterial m = new ModelMaterial();
            m.id = str(b);
            int t = b.getInt();
            m.type = t < 0 ? null : ModelMaterial.MaterialType.values()[t];
            m.ambient = color(b);
            m.diffuse = color(b);
            m.specular = color(b);
            m.emissive = color(b);
            m.reflection = color(b);
            m.shininess = b.getFloat();
            m.opacity = b.getFloat();
            int nt = b.getInt();
            if (nt >= 0) {
                m.textures = new Array<>(nt);
                for (int k = 0; k < nt; k++) {
                    ModelTexture tx = new ModelTexture();
                    tx.id = str(b);
                    String f = str(b);
                    tx.fileName = f == null ? null : prefix + f;
                    tx.uvTranslation = vec2(b);
                    tx.uvScaling = vec2(b);
                    tx.usage = b.getInt();
                    m.textures.add(tx);
                }
            }
            d.materials.add(m);
        }
        int nn = b.getInt();
        for (int i = 0; i < nn; i++) d.nodes.add(node(b));
        int na = b.getInt();
        for (int i = 0; i < na; i++) {
            ModelAnimation a = new ModelAnimation();
            a.id = str(b);
            int nna = b.getInt();
            for (int k = 0; k < nna; k++) {
                ModelNodeAnimation an = new ModelNodeAnimation();
                an.nodeId = str(b);
                an.translation = keysV3(b);
                an.rotation = keysQ(b);
                an.scaling = keysV3(b);
                a.nodeAnimations.add(an);
            }
            d.animations.add(a);
        }
        return d;
    }

    private static ModelNode node(ByteBuffer b) {
        ModelNode n = new ModelNode();
        n.id = str(b);
        n.translation = vec3(b);
        n.rotation = quat(b);
        n.scale = vec3(b);
        n.meshId = str(b);
        int np = b.getInt();
        if (np >= 0) {
            n.parts = new ModelNodePart[np];
            for (int k = 0; k < np; k++) {
                ModelNodePart p = new ModelNodePart();
                p.materialId = str(b);
                p.meshPartId = str(b);
                int nb = b.getInt();
                if (nb >= 0) {
                    p.bones = new ArrayMap<>(true, nb, String.class, Matrix4.class);
                    for (int j = 0; j < nb; j++) {
                        String name = str(b);
                        float[] v = new float[16];
                        for (int q = 0; q < 16; q++) v[q] = b.getFloat();
                        p.bones.put(name, new Matrix4(v));
                    }
                }
                int nu = b.getInt();
                if (nu >= 0) {
                    p.uvMapping = new int[nu][];
                    for (int j = 0; j < nu; j++) {
                        int len = b.getInt();
                        if (len < 0) continue;
                        p.uvMapping[j] = new int[len];
                        for (int q = 0; q < len; q++) p.uvMapping[j][q] = b.getInt();
                    }
                }
                n.parts[k] = p;
            }
        }
        int nc = b.getInt();
        if (nc >= 0) {
            n.children = new ModelNode[nc];
            for (int k = 0; k < nc; k++) n.children[k] = node(b);
        }
        return n;
    }

    private static Array<ModelNodeKeyframe<Vector3>> keysV3(ByteBuffer b) {
        int n = b.getInt();
        if (n < 0) return null;
        Array<ModelNodeKeyframe<Vector3>> a = new Array<>(n);
        for (int i = 0; i < n; i++) {
            ModelNodeKeyframe<Vector3> k = new ModelNodeKeyframe<>();
            k.keytime = b.getFloat();
            k.value = vec3(b);
            a.add(k);
        }
        return a;
    }

    private static Array<ModelNodeKeyframe<Quaternion>> keysQ(ByteBuffer b) {
        int n = b.getInt();
        if (n < 0) return null;
        Array<ModelNodeKeyframe<Quaternion>> a = new Array<>(n);
        for (int i = 0; i < n; i++) {
            ModelNodeKeyframe<Quaternion> k = new ModelNodeKeyframe<>();
            k.keytime = b.getFloat();
            k.value = quat(b);
            a.add(k);
        }
        return a;
    }

    private static String str(ByteBuffer b) {
        int len = b.getInt();
        if (len < 0) return null;
        String s = new String(b.array(), b.position(), len, StandardCharsets.UTF_8);
        b.position(b.position() + len);
        return s;
    }

    private static Color color(ByteBuffer b) {
        return b.get() == 0 ? null : new Color(b.getFloat(), b.getFloat(), b.getFloat(), b.getFloat());
    }

    private static Vector2 vec2(ByteBuffer b) {
        return b.get() == 0 ? null : new Vector2(b.getFloat(), b.getFloat());
    }

    private static Vector3 vec3(ByteBuffer b) {
        return b.get() == 0 ? null : new Vector3(b.getFloat(), b.getFloat(), b.getFloat());
    }

    private static Quaternion quat(ByteBuffer b) {
        return b.get() == 0 ? null : new Quaternion(b.getFloat(), b.getFloat(), b.getFloat(), b.getFloat());
    }

    // ---------- Gravação (usada pela ferramenta de conversão, fora do jogo) ----------

    /** Grava os dados do modelo; 'dir' é a pasta do modelo (os caminhos de textura ficam relativos a ela). */
    static void write(ModelData d, String dir, OutputStream os) throws IOException {
        DataOutputStream o = new DataOutputStream(new java.io.BufferedOutputStream(os, 1 << 16));
        String prefix = dir.isEmpty() ? "" : dir + "/";
        o.writeInt(MAGIC);
        str(o, d.id);
        o.writeShort(d.version[0]);
        o.writeShort(d.version[1]);
        o.writeInt(d.meshes.size);
        for (ModelMesh m : d.meshes) {
            str(o, m.id);
            o.writeInt(m.attributes.length);
            for (VertexAttribute a : m.attributes) {
                o.writeInt(a.usage);
                o.writeInt(a.numComponents);
                o.writeInt(a.type);
                o.writeByte(a.normalized ? 1 : 0);
                str(o, a.alias);
                o.writeInt(a.unit);
            }
            o.writeInt(m.vertices.length);
            for (float v : m.vertices) o.writeFloat(v);
            o.writeInt(m.parts.length);
            for (ModelMeshPart p : m.parts) {
                str(o, p.id);
                o.writeInt(p.primitiveType);
                o.writeInt(p.indices.length);
                for (short s : p.indices) o.writeShort(s);
            }
        }
        o.writeInt(d.materials.size);
        for (ModelMaterial m : d.materials) {
            str(o, m.id);
            o.writeInt(m.type == null ? -1 : m.type.ordinal());
            color(o, m.ambient);
            color(o, m.diffuse);
            color(o, m.specular);
            color(o, m.emissive);
            color(o, m.reflection);
            o.writeFloat(m.shininess);
            o.writeFloat(m.opacity);
            if (m.textures == null) o.writeInt(-1);
            else {
                o.writeInt(m.textures.size);
                for (ModelTexture t : m.textures) {
                    str(o, t.id);
                    String f = t.fileName;
                    if (f != null && f.startsWith(prefix)) f = f.substring(prefix.length());
                    str(o, f);
                    vec2(o, t.uvTranslation);
                    vec2(o, t.uvScaling);
                    o.writeInt(t.usage);
                }
            }
        }
        o.writeInt(d.nodes.size);
        for (ModelNode n : d.nodes) node(o, n);
        o.writeInt(d.animations.size);
        for (ModelAnimation a : d.animations) {
            str(o, a.id);
            o.writeInt(a.nodeAnimations.size);
            for (ModelNodeAnimation an : a.nodeAnimations) {
                str(o, an.nodeId);
                keysV3(o, an.translation);
                keysQ(o, an.rotation);
                keysV3(o, an.scaling);
            }
        }
        o.flush();
    }

    private static void node(DataOutputStream o, ModelNode n) throws IOException {
        str(o, n.id);
        vec3(o, n.translation);
        quat(o, n.rotation);
        vec3(o, n.scale);
        str(o, n.meshId);
        if (n.parts == null) o.writeInt(-1);
        else {
            o.writeInt(n.parts.length);
            for (ModelNodePart p : n.parts) {
                str(o, p.materialId);
                str(o, p.meshPartId);
                if (p.bones == null) o.writeInt(-1);
                else {
                    o.writeInt(p.bones.size);
                    for (int j = 0; j < p.bones.size; j++) {
                        str(o, p.bones.getKeyAt(j));
                        for (float v : p.bones.getValueAt(j).val) o.writeFloat(v);
                    }
                }
                if (p.uvMapping == null) o.writeInt(-1);
                else {
                    o.writeInt(p.uvMapping.length);
                    for (int[] uv : p.uvMapping) {
                        if (uv == null) { o.writeInt(-1); continue; }
                        o.writeInt(uv.length);
                        for (int v : uv) o.writeInt(v);
                    }
                }
            }
        }
        if (n.children == null) o.writeInt(-1);
        else {
            o.writeInt(n.children.length);
            for (ModelNode c : n.children) node(o, c);
        }
    }

    private static void keysV3(DataOutputStream o, Array<ModelNodeKeyframe<Vector3>> a) throws IOException {
        if (a == null) { o.writeInt(-1); return; }
        o.writeInt(a.size);
        for (ModelNodeKeyframe<Vector3> k : a) {
            o.writeFloat(k.keytime);
            vec3(o, k.value);
        }
    }

    private static void keysQ(DataOutputStream o, Array<ModelNodeKeyframe<Quaternion>> a) throws IOException {
        if (a == null) { o.writeInt(-1); return; }
        o.writeInt(a.size);
        for (ModelNodeKeyframe<Quaternion> k : a) {
            o.writeFloat(k.keytime);
            quat(o, k.value);
        }
    }

    private static void str(DataOutputStream o, String s) throws IOException {
        if (s == null) { o.writeInt(-1); return; }
        byte[] u = s.getBytes(StandardCharsets.UTF_8);
        o.writeInt(u.length);
        o.write(u);
    }

    private static void color(DataOutputStream o, Color c) throws IOException {
        o.writeByte(c == null ? 0 : 1);
        if (c != null) { o.writeFloat(c.r); o.writeFloat(c.g); o.writeFloat(c.b); o.writeFloat(c.a); }
    }

    private static void vec2(DataOutputStream o, Vector2 v) throws IOException {
        o.writeByte(v == null ? 0 : 1);
        if (v != null) { o.writeFloat(v.x); o.writeFloat(v.y); }
    }

    private static void vec3(DataOutputStream o, Vector3 v) throws IOException {
        o.writeByte(v == null ? 0 : 1);
        if (v != null) { o.writeFloat(v.x); o.writeFloat(v.y); o.writeFloat(v.z); }
    }

    private static void quat(DataOutputStream o, Quaternion q) throws IOException {
        o.writeByte(q == null ? 0 : 1);
        if (q != null) { o.writeFloat(q.x); o.writeFloat(q.y); o.writeFloat(q.z); o.writeFloat(q.w); }
    }
}
