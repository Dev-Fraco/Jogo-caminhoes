package com.flexonix.vidarealfc;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PlayBillingPlugin.class); // cobrança do Premium (Play Billing)
        registerPlugin(SecureLedgerPlugin.class); // livro da temporada grátis (Keystore + Block Store)
        registerPlugin(AdsPlugin.class); // anúncios da versão grátis (AdMob)
        registerPlugin(PremiumPackPlugin.class); // download do pacote Premium (Play Asset Delivery)
        super.onCreate(savedInstanceState);

        // Android 15+ (targetSdk 35/36) desenha o app por baixo das barras do sistema (borda a borda). O jogo não foi feito para isso:
        // damos à tela as margens das barras (status, navegação, recorte da câmera) e do teclado, para nada ficar escondido.
        final View root = findViewById(android.R.id.content);
        root.setBackgroundColor(Color.parseColor("#050505"));
        ViewCompat.setOnApplyWindowInsetsListener(root, (v, windowInsets) -> {
            Insets bars = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout() | WindowInsetsCompat.Type.ime());
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return WindowInsetsCompat.CONSUMED;
        });
    }
}
