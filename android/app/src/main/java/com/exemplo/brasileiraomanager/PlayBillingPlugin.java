package com.exemplo.brasileiraomanager;

import android.content.pm.ApplicationInfo;
import android.util.Base64;

import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.util.Collections;
import java.util.List;

/**
 * Cobrança do Premium pela Google Play (Play Billing).
 * Produtos (criar no Play Console): assinatura semanal "vidareal_weekly", assinatura mensal "vidareal_monthly" e produto único "vidareal_lifetime".
 * A assinatura (RSA) de cada compra é conferida aqui com a chave pública do Play Console (res/values/billing.xml); sem a chave, só builds de depuração aceitam compras.
 */
@CapacitorPlugin(name = "PlayBilling")
public class PlayBillingPlugin extends Plugin implements PurchasesUpdatedListener {
    private static final String WEEKLY = "vidareal_weekly";
    private static final String MONTHLY = "vidareal_monthly";
    private static final String LIFETIME = "vidareal_lifetime";

    private BillingClient client;
    private PluginCall pendingPurchase;

    @Override
    public void load() {
        client = BillingClient.newBuilder(getContext()).setListener(this).enablePendingPurchases().build();
    }

    private void connect(final Runnable ready, final PluginCall call) {
        if (client.isReady()) {
            ready.run();
            return;
        }
        client.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(BillingResult result) {
                if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) ready.run();
                else call.reject("billing-unavailable:" + result.getResponseCode());
            }

            @Override
            public void onBillingServiceDisconnected() {
                // a próxima chamada reconecta
            }
        });
    }

    private boolean debuggable() {
        return (getContext().getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
    }

    /** Confere a assinatura da compra com a chave pública do Play Console. Sem chave configurada, só vale em build de depuração. */
    private boolean verifySignature(String json, String signature) {
        String key = getContext().getString(R.string.play_public_key);
        if (key == null || key.trim().isEmpty()) return debuggable();
        try {
            PublicKey publicKey = KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(Base64.decode(key.trim(), Base64.DEFAULT)));
            Signature sig = Signature.getInstance("SHA1withRSA");
            sig.initVerify(publicKey);
            sig.update(json.getBytes(StandardCharsets.UTF_8));
            return sig.verify(Base64.decode(signature, Base64.DEFAULT));
        } catch (Exception e) {
            return false;
        }
    }

    private void acknowledgeIfNeeded(Purchase p) {
        if (p.getPurchaseState() == Purchase.PurchaseState.PURCHASED && !p.isAcknowledged()) {
            client.acknowledgePurchase(AcknowledgePurchaseParams.newBuilder().setPurchaseToken(p.getPurchaseToken()).build(), new com.android.billingclient.api.AcknowledgePurchaseResponseListener() {
                @Override
                public void onAcknowledgePurchaseResponse(BillingResult result) {
                    // sem ação: a próxima consulta mostra se confirmou
                }
            });
        }
    }

    private JSObject describe(Purchase p) {
        JSObject o = new JSObject();
        o.put("productId", p.getProducts().isEmpty() ? "" : p.getProducts().get(0));
        o.put("state", p.getPurchaseState());
        o.put("json", p.getOriginalJson());
        o.put("signature", p.getSignature());
        o.put("autoRenewing", p.isAutoRenewing());
        o.put("verified", verifySignature(p.getOriginalJson(), p.getSignature()));
        return o;
    }

    private void addAll(JSArray out, List<Purchase> list) {
        if (list == null) return;
        for (Purchase p : list) {
            acknowledgeIfNeeded(p);
            out.put(describe(p));
        }
    }

    /** Compras atuais da conta (assinaturas e produto único). */
    @PluginMethod
    public void queryEntitlement(final PluginCall call) {
        connect(new Runnable() {
            @Override
            public void run() {
                final JSArray out = new JSArray();
                client.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build(), (subsResult, subs) -> {
                    if (subsResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                        call.reject("query-failed:" + subsResult.getResponseCode());
                        return;
                    }
                    addAll(out, subs);
                    client.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build(), (inappResult, inapp) -> {
                        if (inappResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                            call.reject("query-failed:" + inappResult.getResponseCode());
                            return;
                        }
                        addAll(out, inapp);
                        JSObject res = new JSObject();
                        res.put("purchases", out);
                        call.resolve(res);
                    });
                });
            }
        }, call);
    }

    /** Abre a tela de compra do plano ("weekly", "monthly" ou "lifetime"). */
    @PluginMethod
    public void purchase(final PluginCall call) {
        String plan = call.getString("plan", "");
        final String productId;
        final String type;
        if ("weekly".equals(plan)) {
            productId = WEEKLY;
            type = BillingClient.ProductType.SUBS;
        } else if ("monthly".equals(plan)) {
            productId = MONTHLY;
            type = BillingClient.ProductType.SUBS;
        } else if ("lifetime".equals(plan)) {
            productId = LIFETIME;
            type = BillingClient.ProductType.INAPP;
        } else {
            call.reject("unknown-plan");
            return;
        }
        connect(new Runnable() {
            @Override
            public void run() {
                QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
                        .setProductList(Collections.singletonList(QueryProductDetailsParams.Product.newBuilder().setProductId(productId).setProductType(type).build()))
                        .build();
                client.queryProductDetailsAsync(params, (result, details) -> {
                    if (result.getResponseCode() != BillingClient.BillingResponseCode.OK || details == null || details.isEmpty()) {
                        call.reject("product-unavailable");
                        return;
                    }
                    ProductDetails pd = details.get(0);
                    BillingFlowParams.ProductDetailsParams.Builder pb = BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(pd);
                    if (BillingClient.ProductType.SUBS.equals(type)) {
                        List<ProductDetails.SubscriptionOfferDetails> offers = pd.getSubscriptionOfferDetails();
                        if (offers == null || offers.isEmpty()) {
                            call.reject("product-unavailable");
                            return;
                        }
                        pb.setOfferToken(offers.get(0).getOfferToken());
                    }
                    pendingPurchase = call;
                    BillingResult launch = client.launchBillingFlow(getActivity(), BillingFlowParams.newBuilder().setProductDetailsParamsList(Collections.singletonList(pb.build())).build());
                    if (launch.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                        pendingPurchase = null;
                        call.reject("launch-failed:" + launch.getResponseCode());
                    }
                });
            }
        }, call);
    }

    @Override
    public void onPurchasesUpdated(BillingResult result, List<Purchase> purchases) {
        PluginCall call = pendingPurchase;
        pendingPurchase = null;
        if (call == null) return;
        int code = result.getResponseCode();
        if (code == BillingClient.BillingResponseCode.OK && purchases != null) {
            JSArray out = new JSArray();
            addAll(out, purchases);
            JSObject res = new JSObject();
            res.put("purchases", out);
            call.resolve(res);
        } else if (code == BillingClient.BillingResponseCode.USER_CANCELED) {
            call.reject("cancelled");
        } else {
            call.reject("error:" + code);
        }
    }

    /** Reconfere uma compra guardada (funciona sem internet): usada na volta offline. */
    @PluginMethod
    public void verify(PluginCall call) {
        String json = call.getString("json", "");
        String signature = call.getString("signature", "");
        JSObject res = new JSObject();
        res.put("verified", verifySignature(json, signature));
        call.resolve(res);
    }
}
