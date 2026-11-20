package com.exemplo.brasileiraomanager;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PlayBillingPlugin.class); // cobrança do Premium (Play Billing)
        super.onCreate(savedInstanceState);
    }
}
