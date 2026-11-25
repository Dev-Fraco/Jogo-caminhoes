package com.exemplo.jogo3d;

import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.Net;
import com.badlogic.gdx.utils.JsonReader;
import com.badlogic.gdx.utils.JsonValue;

/**
 * Verifica se existe um build mais novo nas Releases do GitHub.
 * O número do build atual vem de assets/version.txt (gravado pelo workflow).
 * Se houver um mais novo, o jogo mostra um aviso; ao tocar, abre o download do APK.
 * Como todos os builds usam a mesma chave, o Android atualiza por cima (sem desinstalar).
 */
public final class UpdateChecker {

    static final String RELEASES_API = "https://api.github.com/repos/Dev-Fraco/Jogo-caminhoes/releases?per_page=20";
    static final String TAG_PREFIX = "jogo3d-libgdx-";

    private static volatile int latestBuild = 0;
    private static volatile String latestTag = null;
    private static int currentBuild = 0;
    private static boolean started = false;

    private UpdateChecker() {}

    /** Lê o número do build atual e consulta as Releases em segundo plano. */
    public static void start() {
        if (started) return;
        started = true;
        try {
            currentBuild = Integer.parseInt(Gdx.files.internal("version.txt").readString().trim());
        } catch (Exception e) {
            currentBuild = 0;   // rodando no PC ou sem arquivo: não mostra aviso falso
        }
        Net.HttpRequest req = new Net.HttpRequest(Net.HttpMethods.GET);
        req.setUrl(RELEASES_API);
        req.setHeader("Accept", "application/vnd.github+json");
        Gdx.net.sendHttpRequest(req, new Net.HttpResponseListener() {
            @Override
            public void handleHttpResponse(Net.HttpResponse response) {
                try {
                    JsonValue list = new JsonReader().parse(response.getResultAsString());
                    for (JsonValue r = list.child; r != null; r = r.next) {
                        String tag = r.getString("tag_name", "");
                        if (tag.startsWith(TAG_PREFIX)) {        // a lista vem do mais novo para o mais antigo
                            latestTag = tag;
                            latestBuild = Integer.parseInt(tag.substring(TAG_PREFIX.length()));
                            break;
                        }
                    }
                } catch (Exception e) {
                    // sem internet ou formato inesperado: segue sem aviso
                }
            }

            @Override
            public void failed(Throwable t) { }

            @Override
            public void cancelled() { }
        });
    }

    /** true se existe um build mais novo que o que está instalado. */
    public static boolean available() {
        return latestTag != null && currentBuild > 0 && latestBuild > currentBuild;
    }

    public static int latestBuild() { return latestBuild; }

    /** Link direto do APK da versão mais nova. */
    public static String downloadUrl() {
        return "https://github.com/Dev-Fraco/Jogo-caminhoes/releases/download/" + latestTag + "/jogo3d-libgdx.apk";
    }
}
