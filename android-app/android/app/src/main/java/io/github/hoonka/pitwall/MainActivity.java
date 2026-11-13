package io.github.hoonka.pitwall;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(TmapReaderPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
