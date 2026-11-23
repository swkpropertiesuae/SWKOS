package ae.swkproperties.os;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;
import android.telecom.Connection;
import android.telecom.ConnectionRequest;
import android.telecom.ConnectionService;
import android.telecom.DisconnectCause;
import android.telecom.PhoneAccountHandle;
import androidx.core.app.NotificationCompat;
import androidx.core.app.Person;
import androidx.core.content.ContextCompat;

/**
 * Android ConnectionService + Full-Screen Incoming SIP Call Wake bridge.
 *
 * Keeps locked Android devices ringing via high-priority swk_calls_sos full-screen intent
 * launching MainActivity directly to /phone?incoming=1, while never exposing raw CRM Vault numbers.
 */
public class SwkIncomingCallService extends ConnectionService {
    public static final String CHANNEL_ID = "swk_calls_sos";
    public static final int INCOMING_NOTIFICATION_ID = 4403;

    public static void ensureChannel(Context context) {
        if (context == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (nm == null) return;
        try {
            NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID,
                context.getString(R.string.call_channel_name),
                NotificationManager.IMPORTANCE_HIGH
            );
            ch.setDescription(context.getString(R.string.call_channel_description));
            ch.enableVibration(true);
            ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            android.net.Uri ringtone = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            if (ringtone != null) {
                AudioAttributes attrs = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build();
                ch.setSound(ringtone, attrs);
            }
            nm.createNotificationChannel(ch);
        } catch (Throwable ignored) {
        }
    }

    public static void showIncomingCallWake(
        Context context,
        String callId,
        String callerName,
        String extensionNo,
        boolean isMaskedVault
    ) {
        ensureChannel(context);
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (nm == null) return;

        String safeCaller = isMaskedVault
            ? "SWK Vault Client (Masked)"
            : (callerName != null && !callerName.trim().isEmpty() ? callerName.trim() : "SWK SIP Call");
        String subtitle = extensionNo != null && !extensionNo.trim().isEmpty()
            ? "Incoming SWK SIP Call · Ext " + extensionNo.trim()
            : "Incoming SWK SIP Call";

        Intent fullScreenIntent = new Intent(context, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP)
            .putExtra(MainActivity.EXTRA_INCOMING_CALL, true)
            .putExtra(MainActivity.EXTRA_CALL_ID, callId == null ? "" : callId)
            .putExtra(MainActivity.EXTRA_LAUNCH_ROUTE, "/phone?incoming=1");

        PendingIntent fullScreenPi = PendingIntent.getActivity(
            context,
            4403,
            fullScreenIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent declineIntent = new Intent(context, SwkCallActionReceiver.class)
            .setAction(SwkCallActionReceiver.ACTION_DECLINE_INCOMING_CALL)
            .putExtra(SwkCallActionReceiver.EXTRA_CALL_ID, callId == null ? "" : callId);
        PendingIntent declinePi = PendingIntent.getBroadcast(
            context,
            4404,
            declineIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Person callerPerson = new Person.Builder().setName(safeCaller).setImportant(true).build();
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_swk)
            .setColor(ContextCompat.getColor(context, R.color.swk_mint))
            .setContentTitle(safeCaller)
            .setContentText(subtitle)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(true)
            .setFullScreenIntent(fullScreenPi, true)
            .setContentIntent(fullScreenPi)
            .setStyle(NotificationCompat.CallStyle.forIncomingCall(callerPerson, declinePi, fullScreenPi));

        nm.notify(INCOMING_NOTIFICATION_ID, builder.build());
    }

    public static void dismissIncomingCallWake(Context context) {
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (nm != null) {
            nm.cancel(INCOMING_NOTIFICATION_ID);
        }
    }

    @Override
    public Connection onCreateIncomingConnection(PhoneAccountHandle connectionManagerPhoneAccount, ConnectionRequest request) {
        SwkCallConnection conn = new SwkCallConnection();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            conn.setConnectionProperties(Connection.PROPERTY_SELF_MANAGED);
        }
        conn.setRinging();
        return conn;
    }

    @Override
    public Connection onCreateOutgoingConnection(PhoneAccountHandle connectionManagerPhoneAccount, ConnectionRequest request) {
        SwkCallConnection conn = new SwkCallConnection();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            conn.setConnectionProperties(Connection.PROPERTY_SELF_MANAGED);
        }
        conn.setDialing();
        return conn;
    }

    private static final class SwkCallConnection extends Connection {
        @Override
        public void onAnswer() {
            setActive();
        }

        @Override
        public void onReject() {
            setDisconnected(new DisconnectCause(DisconnectCause.REJECTED));
            destroy();
        }

        @Override
        public void onDisconnect() {
            setDisconnected(new DisconnectCause(DisconnectCause.LOCAL));
            destroy();
        }

        @Override
        public void onAbort() {
            setDisconnected(new DisconnectCause(DisconnectCause.CANCELED));
            destroy();
        }
    }
}
