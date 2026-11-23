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
import android.location.Location;
import android.os.Build;
import android.os.IBinder;
import android.os.Looper;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicLong;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Play-compliant foreground service (foregroundServiceType="location") for SWK OS field-duty GPS tracking.
 *
 * - Runs strictly between an explicit "Start Field Duty" action and "End Field Duty" (or server stop/expiry).
 * - Requests zero ACCESS_BACKGROUND_LOCATION permission.
 * - Batches points with idempotency keys & offline_replay markers to POST /api/field-gps/pings
 *   authenticated with x-swk-client: mobile and x-swk-session headers.
 */
public class SwkFieldLocationService extends Service {
    public static final String CHANNEL_ID = "swk_field_duty";
    public static final int NOTIFICATION_ID = 4401;

    public static final String ACTION_START_DUTY = "ae.swkproperties.os.ACTION_START_DUTY";
    /** Stop sharing locally (web UI has already ended or will end the session). */
    public static final String ACTION_STOP_DUTY = "ae.swkproperties.os.ACTION_STOP_DUTY";
    /** Notification action button: stop sharing and notify POST /api/field-gps/sessions/stop. */
    public static final String ACTION_END_DUTY = "ae.swkproperties.os.ACTION_END_DUTY";
    public static final String ACTION_DUTY_ENDED = "ae.swkproperties.os.ACTION_DUTY_ENDED";

    public static final String EXTRA_SESSION_ID = "sessionId";
    public static final String EXTRA_LOCATION = "assignedLocation";
    public static final String EXTRA_SERVER_URL = "serverUrl";
    public static final String EXTRA_TOKEN = "sessionToken";
    public static final String EXTRA_DEVICE_ID = "deviceId";

    private static final long UPDATE_INTERVAL_MS = 20_000L;
    private static final long FASTEST_INTERVAL_MS = 10_000L;
    private static final long MAX_BATCH_DELAY_MS = 45_000L;
    private static final long REPLAY_AGE_MS = 4 * 60_000L;
    private static final int MAX_BUFFERED_POINTS = 500;
    private static final int BATCH_LIMIT = 50;

    private static final class BufferedPoint {
        final JSONObject payload;
        final long recordedMs;

        BufferedPoint(JSONObject payload, long recordedMs) {
            this.payload = payload;
            this.recordedMs = recordedMs;
        }
    }

    private static volatile boolean dutyActive = false;

    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final List<BufferedPoint> pending = new ArrayList<>();
    private final AtomicLong seq = new AtomicLong(0);

    private FusedLocationProviderClient fused;
    private LocationCallback callback;
    private int sessionId = -1;
    private String assignedLocation = "Dubai Field Duty";
    private String serverUrl = "";
    private String sessionToken = "";
    private String deviceId = "";
    private volatile String lastError = "";

    public static boolean isRunning() {
        return dutyActive;
    }

    public static void ensureChannel(Context context) {
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            context.getString(R.string.duty_channel_name),
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription(context.getString(R.string.duty_channel_description));
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager != null) manager.createNotificationChannel(channel);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        ensureChannel(this);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || intent.getAction() == null) {
            stopSelf();
            return START_NOT_STICKY;
        }
        String action = intent.getAction();
        if (ACTION_STOP_DUTY.equals(action)) {
            finishDuty(false);
            return START_NOT_STICKY;
        }
        if (ACTION_END_DUTY.equals(action)) {
            finishDuty(true);
            return START_NOT_STICKY;
        }

        sessionId = intent.getIntExtra(EXTRA_SESSION_ID, -1);
        String loc = intent.getStringExtra(EXTRA_LOCATION);
        assignedLocation = (loc == null || loc.trim().isEmpty()) ? "Dubai Field Duty" : loc.trim();
        serverUrl = trimTrailingSlash(intent.getStringExtra(EXTRA_SERVER_URL));
        sessionToken = orEmpty(intent.getStringExtra(EXTRA_TOKEN));
        deviceId = orEmpty(intent.getStringExtra(EXTRA_DEVICE_ID));

        if (sessionId <= 0 || sessionToken.isEmpty() || !isAllowedServer(serverUrl) || !hasFineLocation()) {
            stopSelf();
            return START_NOT_STICKY;
        }

        try {
            Notification notification = buildNotification();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
        } catch (RuntimeException e) {
            stopSelf();
            return START_NOT_STICKY;
        }

        dutyActive = true;
        startLocationUpdates();
        return START_NOT_STICKY;
    }

    private boolean hasFineLocation() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    @SuppressWarnings("MissingPermission")
    private void startLocationUpdates() {
        if (callback != null) return;
        fused = LocationServices.getFusedLocationProviderClient(this);
        callback = new LocationCallback() {
            @Override
            public void onLocationResult(LocationResult result) {
                for (Location l : result.getLocations()) {
                    if (l == null) continue;
                    BufferedPoint bp = toPoint(l);
                    synchronized (pending) {
                        pending.add(bp);
                        while (pending.size() > MAX_BUFFERED_POINTS) {
                            pending.remove(0);
                        }
                    }
                }
                io.execute(SwkFieldLocationService.this::flush);
            }
        };
        LocationRequest request = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, UPDATE_INTERVAL_MS)
            .setMinUpdateIntervalMillis(FASTEST_INTERVAL_MS)
            .setMaxUpdateDelayMillis(MAX_BATCH_DELAY_MS)
            .build();
        fused.requestLocationUpdates(request, callback, Looper.getMainLooper());
    }

    private BufferedPoint toPoint(Location l) {
        JSONObject p = new JSONObject();
        long recMs = l.getTime() > 0 ? l.getTime() : System.currentTimeMillis();
        try {
            p.put("lat", l.getLatitude());
            p.put("lng", l.getLongitude());
            p.put("accuracy_m", Math.max(1, Math.round(l.getAccuracy())));
            if (l.hasSpeed() && l.getSpeed() >= 0f) {
                p.put("speed_mps", (double) l.getSpeed());
            }
            if (l.hasBearing() && l.getBearing() >= 0f && l.getBearing() <= 360f) {
                p.put("heading", (double) l.getBearing());
            }
            int battery = DeviceTelemetry.batteryPercent(this);
            if (battery >= 0 && battery <= 100) {
                p.put("battery_pct", battery);
            }
            boolean mock = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? l.isMock() : l.isFromMockProvider();
            p.put("is_mock", mock);
            p.put("recorded_at", iso(recMs));
            p.put("idempotency_key", "fgps-and-" + sessionId + "-" + seq.incrementAndGet() + "-" + recMs);
        } catch (Exception ignored) {
        }
        return new BufferedPoint(p, recMs);
    }

    /** Flushes up to 50 buffered fixes in chronological order to POST /api/field-gps/pings. */
    private void flush() {
        List<BufferedPoint> batch;
        synchronized (pending) {
            if (pending.isEmpty()) return;
            int count = Math.min(BATCH_LIMIT, pending.size());
            batch = new ArrayList<>(pending.subList(0, count));
        }
        if (!isAllowedServer(serverUrl) || sessionToken.isEmpty()) return;

        try {
            long nowMs = System.currentTimeMillis();
            boolean anyReplay = false;
            JSONArray pts = new JSONArray();
            for (BufferedPoint bp : batch) {
                JSONObject copy = new JSONObject(bp.payload.toString());
                if (nowMs - bp.recordedMs > REPLAY_AGE_MS) {
                    copy.put("offline_replay", true);
                    anyReplay = true;
                }
                pts.put(copy);
            }

            JSONObject body = new JSONObject();
            body.put("field_session_id", sessionId);
            if (!deviceId.isEmpty()) {
                body.put("device_id", deviceId);
            }
            body.put("network_type", DeviceTelemetry.networkType(this));
            if (anyReplay) {
                body.put("offline_replay", true);
            }
            body.put("points", pts);

            int status = post("/api/field-gps/pings", body);
            if (status >= 200 && status < 300) {
                synchronized (pending) {
                    pending.removeAll(batch);
                }
                boolean more;
                synchronized (pending) {
                    more = !pending.isEmpty();
                }
                if (more) {
                    flush();
                }
            } else if (status == 401 || status == 403 || status == 404 || status == 422) {
                finishDuty(false);
            } else if (status == 400 && (lastError.contains("no active field duty") || lastError.contains("ended") || lastError.contains("expired"))) {
                finishDuty(false);
            }
        } catch (Exception ignored) {
            // Network unavailable: retain points in pending for the next scheduled batch flush.
        }
    }

    private int post(String path, JSONObject body) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(serverUrl + path).openConnection();
        try {
            c.setRequestMethod("POST");
            c.setConnectTimeout(15_000);
            c.setReadTimeout(15_000);
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json");
            c.setRequestProperty("Accept", "application/json");
            c.setRequestProperty("x-swk-client", "mobile");
            c.setRequestProperty("x-swk-session", sessionToken);
            byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream out = c.getOutputStream()) {
                out.write(bytes);
            }
            int code = c.getResponseCode();
            lastError = "";
            if (code >= 400) {
                try (InputStream es = c.getErrorStream()) {
                    if (es != null) {
                        lastError = new String(es.readAllBytes(), StandardCharsets.UTF_8).toLowerCase(Locale.ROOT);
                    }
                } catch (Exception ignored) {
                }
            }
            return code;
        } finally {
            c.disconnect();
        }
    }

    private void finishDuty(boolean notifyServer) {
        if (!dutyActive && callback == null) {
            stopSelf();
            return;
        }
        dutyActive = false;
        if (fused != null && callback != null) {
            fused.removeLocationUpdates(callback);
            callback = null;
        }
        final int endedSession = sessionId;
        final boolean canNotify = notifyServer && endedSession > 0 && isAllowedServer(serverUrl) && !sessionToken.isEmpty();
        io.execute(() -> {
            if (canNotify) {
                try {
                    flush();
                    post("/api/field-gps/sessions/stop", new JSONObject());
                } catch (Exception ignored) {
                }
            }
            synchronized (pending) {
                pending.clear();
            }
        });
        stopForeground(STOP_FOREGROUND_REMOVE);
        sendBroadcast(new Intent(ACTION_DUTY_ENDED).setPackage(getPackageName()));
        stopSelf();
    }

    private Notification buildNotification() {
        Intent openIntent = new Intent(this, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP)
            .putExtra(MainActivity.EXTRA_LAUNCH_ROUTE, "/field-duty");
        PendingIntent open = PendingIntent.getActivity(
            this,
            0,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        Intent endIntent = new Intent(this, SwkFieldLocationService.class).setAction(ACTION_END_DUTY);
        PendingIntent end = PendingIntent.getService(
            this,
            1,
            endIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.duty_notification_title))
            .setContentText(assignedLocation)
            .setSmallIcon(R.drawable.ic_stat_swk)
            .setColor(ContextCompat.getColor(this, R.color.swk_mint))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .setContentIntent(open)
            .addAction(0, getString(R.string.duty_notification_stop), end)
            .build();
    }

    @Override
    public void onDestroy() {
        dutyActive = false;
        if (fused != null && callback != null) fused.removeLocationUpdates(callback);
        io.shutdown();
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    static boolean isAllowedServer(String url) {
        if (url == null) return false;
        if (url.startsWith("https://")) return true;
        return BuildConfig.DEBUG && (url.startsWith("http://10.0.2.2") || url.startsWith("http://127.0.0.1") || url.startsWith("http://localhost"));
    }

    private static String iso(long millis) {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        f.setTimeZone(TimeZone.getTimeZone("UTC"));
        return f.format(new Date(millis));
    }

    private static String trimTrailingSlash(String s) {
        String v = orEmpty(s).trim();
        while (v.endsWith("/")) v = v.substring(0, v.length() - 1);
        return v;
    }

    private static String orEmpty(String s) {
        return s == null ? "" : s;
    }
}
