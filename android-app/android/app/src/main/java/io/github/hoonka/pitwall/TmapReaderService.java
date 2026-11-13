package io.github.hoonka.pitwall;

import android.accessibilityservice.AccessibilityService;
import android.os.SystemClock;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;
import java.util.ArrayList;
import java.util.List;

/** 시험용: 티맵 화면에 보이는 글자를 읽어 앱(웹 화면)으로 넘긴다. 다른 앱은 읽지 않는다. */
public class TmapReaderService extends AccessibilityService {
    public interface Listener { void onSnapshot(String pkg, String text); }
    public static volatile Listener listener;
    public static volatile boolean running;
    public static final List<String> recent = new ArrayList<>();
    private static String last = "";
    private long lastAt = 0;

    static boolean isTmap(CharSequence p) {
        if (p == null) return false;
        String s = p.toString();
        return s.startsWith("com.skt.tmap") || s.startsWith("com.skt.skaf.l001mtm091");
    }

    @Override protected void onServiceConnected() { running = true; }
    @Override public boolean onUnbind(android.content.Intent i) { running = false; return super.onUnbind(i); }
    @Override public void onInterrupt() {}

    @Override public void onAccessibilityEvent(AccessibilityEvent e) {
        if (!isTmap(e.getPackageName())) return;
        StringBuilder sb = new StringBuilder();
        if (e.getEventType() == AccessibilityEvent.TYPE_NOTIFICATION_STATE_CHANGED) {
            sb.append("[알림] ");
            for (CharSequence t : e.getText()) sb.append(t).append(" / ");
        } else {
            long now = SystemClock.uptimeMillis();
            if (now - lastAt < 1000) return; // 1초에 한 번만
            lastAt = now;
            AccessibilityNodeInfo root = null;
            try {
                for (AccessibilityWindowInfo w : getWindows()) {
                    AccessibilityNodeInfo r = w.getRoot();
                    if (r != null && isTmap(r.getPackageName())) { root = r; break; }
                }
            } catch (Exception ignored) {}
            if (root == null) root = getRootInActiveWindow();
            if (root == null || !isTmap(root.getPackageName())) return;
            walk(root, sb, 0);
        }
        String text = sb.toString().trim();
        if (text.isEmpty() || text.equals(last)) return;
        last = text;
        synchronized (recent) { recent.add(text); while (recent.size() > 40) recent.remove(0); }
        Listener l = listener;
        if (l != null) l.onSnapshot(String.valueOf(e.getPackageName()), text);
    }

    private void walk(AccessibilityNodeInfo n, StringBuilder sb, int depth) {
        if (n == null || depth > 40 || sb.length() > 4000) return;
        if (n.isVisibleToUser()) {
            CharSequence t = n.getText(), d = n.getContentDescription();
            String id = n.getViewIdResourceName();
            if ((t != null && t.length() > 0) || (d != null && d.length() > 0)) {
                if (id != null) sb.append(id.substring(id.indexOf('/') + 1)).append('=');
                if (t != null && t.length() > 0) sb.append(t);
                if (d != null && d.length() > 0 && (t == null || !d.toString().equals(t.toString()))) sb.append(" {").append(d).append('}');
                sb.append('\n');
            }
        }
        for (int i = 0; i < n.getChildCount(); i++) walk(n.getChild(i), sb, depth + 1);
    }
}
