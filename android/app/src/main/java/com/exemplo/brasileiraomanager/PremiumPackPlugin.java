package com.exemplo.brasileiraomanager;

import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;

import com.getcapacitor.BridgeWebViewClient;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.core.assetpacks.AssetPackLocation;
import com.google.android.play.core.assetpacks.AssetPackManager;
import com.google.android.play.core.assetpacks.AssetPackManagerFactory;
import com.google.android.play.core.assetpacks.AssetPackState;
import com.google.android.play.core.assetpacks.AssetPackStateUpdateListener;
import com.google.android.play.core.assetpacks.AssetPackStatus;

import java.io.File;
import java.io.FileInputStream;
import java.util.Collections;
import java.util.regex.Pattern;

/**
 * Pacote Premium (Play Asset Delivery). O build da loja tira do app os arquivos "prem-*.js/css" (a parte Premium do jogo) e os
 * põe no pacote "premium" da Play, que só é baixado depois da compra. O WebView continua pedindo os arquivos pelo mesmo endereço
 * (https://localhost/assets/prem-xxxx.js); este plugin os serve a partir da pasta do pacote. Sem o pacote, o pedido falha e o recurso Premium não abre.
 */
@CapacitorPlugin(name = "PremiumPack")
public class PremiumPackPlugin extends Plugin {
    private static final String PACK = "premium";
    private static final Pattern FILE = Pattern.compile("^/assets/(prem-[A-Za-z0-9_-]+\\.(js|css))$");

    private AssetPackManager manager;
    private AssetPackStateUpdateListener listener;
    private PluginCall waiting;

    @Override
    public void load() {
        manager = AssetPackManagerFactory.getInstance(getContext());
        bridge.setWebViewClient(new BridgeWebViewClient(bridge) {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                WebResourceResponse r = fromPack(request.getUrl());
                return r != null ? r : super.shouldInterceptRequest(view, request);
            }
        });
    }

    /** Pasta com os arquivos do pacote, ou null se ainda não foi baixado. */
    private File dir() {
        AssetPackLocation loc = manager.getPackLocation(PACK);
        if (loc == null || loc.assetsPath() == null) return null;
        File d = new File(loc.assetsPath(), "prem");
        return d.isDirectory() ? d : null;
    }

    private WebResourceResponse fromPack(Uri uri) {
        try {
            java.util.regex.Matcher m = FILE.matcher(uri.getPath() == null ? "" : uri.getPath());
            if (!m.matches()) return null;
            File d = dir();
            if (d == null) return null;
            File f = new File(d, m.group(1));
            if (!f.isFile() || !f.getCanonicalPath().startsWith(d.getCanonicalPath() + File.separator)) return null;
            String type = "js".equals(m.group(2)) ? "text/javascript" : "text/css";
            WebResourceResponse resp = new WebResourceResponse(type, "utf-8", new FileInputStream(f));
            resp.setResponseHeaders(Collections.singletonMap("Access-Control-Allow-Origin", "*"));
            return resp;
        } catch (Exception e) {
            return null;
        }
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject o = new JSObject();
        o.put("ready", dir() != null);
        call.resolve(o);
    }

    /** Baixa o pacote (se ainda não estiver no aparelho) e responde quando terminar. Avisa o progresso pelo evento "progress". */
    @PluginMethod
    public void ensure(PluginCall call) {
        if (dir() != null) { JSObject o = new JSObject(); o.put("ready", true); call.resolve(o); return; }
        if (waiting != null) { call.reject("busy"); return; }
        waiting = call;
        listener = new AssetPackStateUpdateListener() {
            @Override
            public void onStateUpdate(AssetPackState s) {
                if (!PACK.equals(s.name())) return;
                switch (s.status()) {
                    case AssetPackStatus.COMPLETED: finish(null); break;
                    case AssetPackStatus.FAILED: finish("download-failed:" + s.errorCode()); break;
                    case AssetPackStatus.CANCELED: finish("cancelled"); break;
                    case AssetPackStatus.NOT_INSTALLED: finish("unavailable"); break;
                    case AssetPackStatus.REQUIRES_USER_CONFIRMATION:
                        manager.showConfirmationDialog(getActivity()); break;
                    case AssetPackStatus.WAITING_FOR_WIFI:
                        manager.showCellularDataConfirmation(getActivity()); break;
                    default: {
                        JSObject p = new JSObject();
                        p.put("done", s.bytesDownloaded());
                        p.put("total", s.totalBytesToDownload());
                        notifyListeners("progress", p);
                    }
                }
            }
        };
        manager.registerListener(listener);
        manager.fetch(Collections.singletonList(PACK)).addOnFailureListener(e -> finish("unavailable"));
    }

    private void finish(String error) {
        if (listener != null) { manager.unregisterListener(listener); listener = null; }
        PluginCall c = waiting; waiting = null;
        if (c == null) return;
        if (error == null && dir() != null) { JSObject o = new JSObject(); o.put("ready", true); c.resolve(o); }
        else c.reject(error == null ? "unavailable" : error);
    }
}
