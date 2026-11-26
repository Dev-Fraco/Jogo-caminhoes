package com.exemplo.jogo3d;

import com.badlogic.gdx.ApplicationAdapter;
import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.backends.headless.HeadlessApplication;
import com.badlogic.gdx.backends.headless.HeadlessApplicationConfiguration;
import com.badlogic.gdx.files.FileHandle;
import com.badlogic.gdx.graphics.g3d.loader.G3dModelLoader;
import com.badlogic.gdx.graphics.g3d.model.data.ModelData;
import com.badlogic.gdx.utils.JsonReader;

import java.io.FileOutputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * Converte os modelos .g3dj (JSON) em .mdl (binário, ModelIO). Os .g3dj ficam fora do APK, em
 * modelos_fonte/g3dj (mesmos caminhos de assets); o .mdl vai para assets no mesmo caminho.
 * Rodar da pasta assets, com memória de sobra (o JSON grande precisa de centenas de MB no PC):
 *   java -Xmx3g ... com.exemplo.jogo3d.ModelPack            (todos os .g3dj)
 *   java -Xmx3g ... com.exemplo.jogo3d.ModelPack models/x.g3dj
 */
public class ModelPack extends ApplicationAdapter {
    static String[] args;
    static final String SRC = "../modelos_fonte/g3dj";

    @Override
    public void create() {
        List<String> files = new ArrayList<>();
        if (args.length > 0) for (String a : args) files.add(a);
        else collect(Gdx.files.local(SRC + "/models"), files);
        long in = 0, out = 0;
        try {
            for (String f : files) {
                FileHandle src = Gdx.files.local(SRC + "/" + f);
                ModelData d = new G3dModelLoader(new JsonReader()).loadModelData(src);
                String bin = ModelIO.binPath(f);
                try (FileOutputStream os = new FileOutputStream(Gdx.files.local(bin).file())) {
                    ModelIO.write(d, src.parent().path(), os);
                }
                long a = src.length(), b = Gdx.files.local(bin).length();
                in += a;
                out += b;
                System.out.printf("  %-40s %8d KB -> %7d KB%n", f, a >> 10, b >> 10);
            }
        } catch (Exception e) {
            e.printStackTrace();
            System.exit(1);
        }
        System.out.printf("%d modelos: %d KB de JSON -> %d KB de binário%n", files.size(), in >> 10, out >> 10);
        System.exit(0);
    }

    static void collect(FileHandle dir, List<String> out) {
        for (FileHandle f : dir.list()) {
            if (f.isDirectory()) collect(f, out);
            else if (f.extension().equals("g3dj")) out.add(f.path().substring(SRC.length() + 1));
        }
    }

    public static void main(String[] a) {
        args = a;
        new HeadlessApplication(new ModelPack(), new HeadlessApplicationConfiguration());
    }
}
