package com.exemplo.brasileiraomanager;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PlayBillingPlugin.class); // cobrança do Premium (Play Billing)
        registerPlugin(SecureLedgerPlugin.class); // livro da temporada grátis (Keystore + Block Store)
        registerPlugin(AdsPlugin.class); // anúncios da versão grátis (AdMob)
        registerPlugin(PremiumPackPlugin.class); // download do pacote Premium (Play Asset Delivery)
        super.onCreate(savedInstanceState);
    }
}
