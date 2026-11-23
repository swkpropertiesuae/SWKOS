package ae.swkproperties.os;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Non-exported BroadcastReceiver for Field Duty notification actions (Android 8–15 background-safe).
 * Avoids PendingIntent.getForegroundService / Context.startService crashes when the service is
 * already stopped or permission was revoked.
 */
public class SwkFieldActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (SwkFieldLocationService.ACTION_END_DUTY.equals(action)) {
            SwkFieldLocationService.requestStop(context.getApplicationContext(), true);
        } else if (SwkFieldLocationService.ACTION_STOP_DUTY.equals(action)) {
            SwkFieldLocationService.requestStop(context.getApplicationContext(), false);
        }
    }
}
