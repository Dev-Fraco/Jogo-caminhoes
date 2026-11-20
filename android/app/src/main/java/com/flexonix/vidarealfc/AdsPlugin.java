package com.flexonix.vidarealfc;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.ads.AdError;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.interstitial.InterstitialAd;
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback;
import com.google.android.ump.ConsentInformation;
import com.google.android.ump.ConsentRequestParameters;
import com.google.android.ump.UserMessagingPlatform;

import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Anúncios da versão grátis (AdMob). O JS (src/premium/ads.ts) só chama este plugin no build da loja, no grátis, fora das partidas.
 * Antes do primeiro anúncio o plugin pede o consentimento de privacidade pelo Google UMP (LGPD/GDPR).
 */
@CapacitorPlugin(name = "Ads")
public class AdsPlugin extends Plugin {
    private final AtomicBoolean started = new AtomicBoolean(false);
    private InterstitialAd ad;
    private boolean loading;

    @PluginMethod
    public void init(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            ConsentInformation info = UserMessagingPlatform.getConsentInformation(getContext());
            info.requestConsentInfoUpdate(getActivity(), new ConsentRequestParameters.Builder().build(),
                () -> UserMessagingPlatform.loadAndShowConsentFormIfRequired(getActivity(), err -> {
                    boolean ok = info.canRequestAds();
                    if (ok) startSdk();
                    JSObject o = new JSObject();
                    o.put("canRequestAds", ok);
                    call.resolve(o);
                }),
                err -> {
                    boolean ok = info.canRequestAds(); // (consentimento anterior ainda vale)
                    if (ok) startSdk();
                    JSObject o = new JSObject();
                    o.put("canRequestAds", ok);
                    call.resolve(o);
                });
        });
    }

    private void startSdk() {
        if (started.compareAndSet(false, true)) {
            MobileAds.initialize(getContext(), status -> load());
        }
    }

    private void load() {
        if (loading || ad != null) return;
        loading = true;
        InterstitialAd.load(getContext(), getContext().getString(R.string.admob_interstitial_id), new AdRequest.Builder().build(),
            new InterstitialAdLoadCallback() {
                @Override public void onAdLoaded(InterstitialAd a) { ad = a; loading = false; }
                @Override public void onAdFailedToLoad(LoadAdError e) { ad = null; loading = false; }
            });
    }

    @PluginMethod
    public void showInterstitial(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            InterstitialAd a = ad;
            JSObject o = new JSObject();
            if (a == null) { load(); o.put("shown", false); call.resolve(o); return; }
            ad = null;
            a.setFullScreenContentCallback(new FullScreenContentCallback() {
                @Override public void onAdDismissedFullScreenContent() { load(); }
                @Override public void onAdFailedToShowFullScreenContent(AdError e) { load(); }
            });
            a.show(getActivity());
            o.put("shown", true);
            call.resolve(o);
        });
    }
}
