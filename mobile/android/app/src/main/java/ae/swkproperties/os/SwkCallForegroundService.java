package ae.swkproperties.os;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

/**
 * Play-compliant foreground service (phoneCall | microphone) keeping active WebRTC SIP
 * calls alive when navigating across SWK OS screens or while locked behind BiometricLockOverlay.
 */
public class SwkCallForegroundService extends Service {
    public static final String CHANNEL_ID = "swk_call_audio";
    public static final int NOTIFICATION_ID = 4402;
    public static final String ACTION_START_CALL = "ae.swkproperties.os.ACTION_START_CALL";
    public static final String ACTION_STOP_CALL = "ae.swkproperties.os.ACTION_STOP_CALL";
    public static final String EXTRA_LABEL = "callLabel";

    public static void ensureChannel(Context context) {
        if (context == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel ch = new NotificationChannel(
            CHANNEL_ID,
            context.getString(R.string.call_audio_channel_name),
            NotificationManager.IMPORTANCE_LOW
        );
        ch.setDescription(context.getString(R.string.call_audio_channel_description));
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (nm != null) nm.createNotificationChannel(ch);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        ensureChannel(this);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || ACTION_STOP_CALL.equals(intent.getAction())) {
            stopForeground(STOP_FOREGROUND_REMOVE);
            stopSelf();
            return START_NOT_STICKY;
        }
        String label = intent.getStringExtra(EXTRA_LABEL);
        if (label == null || label.trim().isEmpty()) {
            label = "Active SWK SIP Call";
        }

        Intent openIntent = new Intent(this, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP)
            .putExtra(MainActivity.EXTRA_LAUNCH_ROUTE, "/phone");
        PendingIntent openPi = PendingIntent.getActivity(
            this,
            0,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.call_audio_channel_name))
            .setContentText(label)
            .setSmallIcon(R.drawable.ic_stat_swk)
            .setColor(ContextCompat.getColor(this, R.color.swk_mint))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .setContentIntent(openPi)
            .build();

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                boolean hasMic = ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
                if (!hasMic) {
                    stopSelf();
                    return START_NOT_STICKY;
                }
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
        } catch (RuntimeException e) {
            stopSelf();
        }
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        stopForeground(STOP_FOREGROUND_REMOVE);
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
