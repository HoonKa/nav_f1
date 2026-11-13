package io.github.hoonka.pitwall;

import android.content.Intent;
import android.provider.Settings;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "TmapReader")
public class TmapReaderPlugin extends Plugin {
    @Override public void load() {
        TmapReaderService.listener = (pkg, text) -> {
            JSObject o = new JSObject(); o.put("pkg", pkg); o.put("text", text);
            notifyListeners("snapshot", o);
        };
    }

    @PluginMethod public void status(PluginCall call) {
        String on = Settings.Secure.getString(getContext().getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        JSObject o = new JSObject();
        o.put("enabled", on != null && on.contains(getContext().getPackageName() + "/"));
        o.put("running", TmapReaderService.running);
        call.resolve(o);
    }

    @PluginMethod public void openSettings(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }

    @PluginMethod public void openAppInfo(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, android.net.Uri.parse("package:" + getContext().getPackageName()));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }

    @PluginMethod public void getLog(PluginCall call) {
        JSArray a = new JSArray();
        synchronized (TmapReaderService.recent) { for (String s : TmapReaderService.recent) a.put(s); }
        JSObject o = new JSObject(); o.put("items", a);
        call.resolve(o);
    }
}
