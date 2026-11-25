package com.exemplo.jogo3d;

import android.os.Bundle;

import com.badlogic.gdx.backends.android.AndroidApplication;
import com.badlogic.gdx.backends.android.AndroidApplicationConfiguration;

public class AndroidLauncher extends AndroidApplication {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        AndroidApplicationConfiguration config = new AndroidApplicationConfiguration();
        config.useImmersiveMode = true;
        config.useAccelerometer = false;
        config.useCompass = false;
        // Suavização de serrilhado (MSAA) sempre ligada; o limite de quadros é o da configuração do jogo
        config.numSamples = 4;
        config.useVsync(false);
        initialize(new Main(), config);
    }
}
