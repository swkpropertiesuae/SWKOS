package ae.swkproperties.os;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginHandle;

/**
 * Hardened Capacitor 7 BridgeActivity:
 * - FLAG_SECURE blocks screenshots, screen recording and Android Recents previews.
 * - Creates notification channels (swk_messages, swk_ops_alerts, swk_calls_sos, swk_field_duty, swk_call_audio).
 * - Preserves incoming call wake & deep-link navigation routes safely without exposing raw tokens.
 */
public class MainActivity extends BridgeActivity {
    public static final String EXTRA_LAUNCH_ROUTE = "swk_route";
    public static final String EXTRA_INCOMING_CALL = "swk_incoming_call";
    public static final String EXTRA_CALL_ID = "swk_call_id";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SwkSecurePlugin.class);
        super.onCreate(savedInstanceState);
        // Prevent screenshots, screen capture & OS Recents thumbnail leaks of CRM/PII data.
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
        try {
            ensureAllNotificationChannels(this);
        } catch (Throwable ignored) {
        }
        try {
            handleLaunchIntent(getIntent(), false);
        } catch (Throwable ignored) {
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleLaunchIntent(intent, true);
    }

    private void handleLaunchIntent(Intent intent, boolean notifyActivePlugin) {
        if (intent == null) return;
        boolean isIncomingCall = intent.getBooleanExtra(EXTRA_INCOMING_CALL, false);
        if (isIncomingCall && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        }

        String route = intent.getStringExtra(EXTRA_LAUNCH_ROUTE);
        if (route == null || route.trim().isEmpty()) {
            route = intent.getStringExtra("url");
        }
        if (route != null) {
            String clean = route.trim();
            if (clean.startsWith("/") && !clean.startsWith("//")) {
                SwkSecurePlugin.setPendingLaunchRoute(clean);
                if (notifyActivePlugin && getBridge() != null) {
                    PluginHandle handle = getBridge().getPlugin("SwkSecure");
                    Plugin instance = handle != null ? handle.getInstance() : null;
                    if (instance instanceof SwkSecurePlugin) {
                        JSObject payload = new JSObject();
                        payload.put("route", clean);
                        ((SwkSecurePlugin) instance).emitBridgeEvent(
                            isIncomingCall ? "swkIncomingCall" : "swkNavigate",
                            payload
                        );
                    }
                }
            }
        }
    }

    static void ensureAllNotificationChannels(android.content.Context context) {
        if (context == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        try {
            SwkFieldLocationService.ensureChannel(context);
        } catch (Throwable ignored) {
        }
        try {
            SwkCallForegroundService.ensureChannel(context);
        } catch (Throwable ignored) {
        }
        try {
            SwkIncomingCallService.ensureChannel(context);
        } catch (Throwable ignored) {
        }

        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (nm == null) return;

        try {
            NotificationChannel messages = new NotificationChannel(
                "swk_messages",
                context.getString(R.string.messages_channel_name),
                NotificationManager.IMPORTANCE_HIGH
            );
            messages.setDescription(context.getString(R.string.messages_channel_description));
            messages.enableVibration(true);
            nm.createNotificationChannel(messages);

            NotificationChannel ops = new NotificationChannel(
                "swk_ops_alerts",
                context.getString(R.string.ops_channel_name),
                NotificationManager.IMPORTANCE_DEFAULT
            );
            ops.setDescription(context.getString(R.string.ops_channel_description));
            nm.createNotificationChannel(ops);
        } catch (Throwable ignored) {
        }
    }
}
