package ae.swkproperties.os;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Background-safe BroadcastReceiver for incoming SIP call notification actions.
 * Avoids calling startService() from background on Android 8+ (API 26+).
 */
public class SwkCallActionReceiver extends BroadcastReceiver {
    public static final String ACTION_DECLINE_INCOMING_CALL = "ae.swkproperties.os.ACTION_DECLINE_INCOMING_CALL";
    public static final String EXTRA_CALL_ID = "swk_call_id";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        if (ACTION_DECLINE_INCOMING_CALL.equals(intent.getAction())) {
            SwkIncomingCallService.dismissIncomingCallWake(context);
            context.stopService(new Intent(context, SwkCallForegroundService.class));
            String callId = intent.getStringExtra(EXTRA_CALL_ID);
            SwkSecurePlugin.emitIncomingCallDeclined(callId);
        }
    }
}
