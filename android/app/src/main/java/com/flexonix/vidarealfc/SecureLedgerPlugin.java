package com.flexonix.vidarealfc;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.blockstore.Blockstore;
import com.google.android.gms.auth.blockstore.BlockstoreClient;
import com.google.android.gms.auth.blockstore.RetrieveBytesRequest;
import com.google.android.gms.auth.blockstore.RetrieveBytesResponse;
import com.google.android.gms.auth.blockstore.StoreBytesData;
import com.google.android.gms.tasks.Tasks;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.util.Collections;
import java.util.concurrent.TimeUnit;

import javax.crypto.KeyGenerator;
import javax.crypto.Mac;
import javax.crypto.SecretKey;

/**
 * Livro da temporada grátis (veja src/premium/ledger.ts). Guarda um texto pequeno em dois lugares:
 * 1) arquivo privado do app com selo HMAC-SHA256 de uma chave do Android Keystore (não exportável): detecta edição do arquivo;
 * 2) Block Store do Google Play Services: costuma sobreviver a limpar dados e reinstalar o app no mesmo aparelho.
 * Na leitura vale o arquivo (se o selo conferir); senão vale o Block Store. Sem nenhum dos dois, o livro está vazio.
 */
@CapacitorPlugin(name = "SecureLedger")
public class SecureLedgerPlugin extends Plugin {
    private static final String ALIAS = "vr_ledger_hmac";
    private static final String BS_KEY = "vr-ledger";
    private static final String FILE = "ledger.bin";

    private SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (!ks.containsAlias(ALIAS)) {
            KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_HMAC_SHA256, "AndroidKeyStore");
            kg.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_SIGN).build());
            return kg.generateKey();
        }
        return (SecretKey) ks.getKey(ALIAS, null);
    }

    private String seal(byte[] data) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(key());
        return Base64.encodeToString(mac.doFinal(data), Base64.NO_WRAP);
    }

    private String readLocal() {
        try {
            File f = new File(getContext().getFilesDir(), FILE);
            if (!f.isFile()) return null;
            String all = new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8);
            int nl = all.lastIndexOf('\n');
            if (nl < 0) return null;
            String data = all.substring(0, nl), sig = all.substring(nl + 1).trim();
            String want = seal(data.getBytes(StandardCharsets.UTF_8));
            return MessageDigest.isEqual(want.getBytes(StandardCharsets.UTF_8), sig.getBytes(StandardCharsets.UTF_8)) ? data : null;
        } catch (Exception e) {
            return null;
        }
    }

    private void writeLocal(String data) {
        try {
            String out = data + "\n" + seal(data.getBytes(StandardCharsets.UTF_8));
            Files.write(new File(getContext().getFilesDir(), FILE).toPath(), out.getBytes(StandardCharsets.UTF_8));
        } catch (Exception ignored) { }
    }

    private String readBlockStore() {
        try {
            BlockstoreClient c = Blockstore.getClient(getContext());
            RetrieveBytesResponse r = Tasks.await(c.retrieveBytes(new RetrieveBytesRequest.Builder().setKeys(Collections.singletonList(BS_KEY)).build()), 5, TimeUnit.SECONDS);
            RetrieveBytesResponse.BlockstoreData d = r.getBlockstoreDataMap().get(BS_KEY);
            return d == null ? null : new String(d.getBytes(), StandardCharsets.UTF_8);
        } catch (Exception e) {
            return null;
        }
    }

    private void writeBlockStore(String data) {
        try {
            BlockstoreClient c = Blockstore.getClient(getContext());
            Tasks.await(c.storeBytes(new StoreBytesData.Builder().setKey(BS_KEY).setBytes(data.getBytes(StandardCharsets.UTF_8)).build()), 5, TimeUnit.SECONDS);
        } catch (Exception ignored) { }
    }

    @PluginMethod
    public void load(PluginCall call) {
        new Thread(() -> {
            String data = readLocal();
            String bs = readBlockStore();
            if (data == null) data = bs;                  // arquivo ausente ou adulterado: vale o Block Store
            else if (bs != null && bs.length() > data.length()) data = bs; // (o livro só cresce: vale o mais completo)
            if (data != null) writeLocal(data);
            JSObject o = new JSObject();
            o.put("data", data);
            call.resolve(o);
        }).start();
    }

    @PluginMethod
    public void save(PluginCall call) {
        final String data = call.getString("data");
        if (data == null) { call.reject("sem dados"); return; }
        new Thread(() -> {
            writeLocal(data);
            writeBlockStore(data);
            call.resolve();
        }).start();
    }
}
