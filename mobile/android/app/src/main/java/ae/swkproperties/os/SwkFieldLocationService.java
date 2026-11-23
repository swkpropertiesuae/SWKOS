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
import android.os.Handler;
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
import java.util.Iterator;
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
 * - Filters coarse fixes (> 150m), quarantines non-retryable 400 validation errors so valid fixes
 *   continue flushing, and snapshots immutable per-generation session credentials so rapid stop/restart
 *   never interferes with a newly started session.
 * - Uses in-process requestStop() and a non-exported BroadcastReceiver (SwkFieldActionReceiver) so
 *   stopping duty from JS or the notification never calls startService()/getForegroundService() in background.
 */
public class SwkFieldLocationService extends Service {
    public static final String CHANNEL_ID = "swk_field_duty";
    public static final int NOTIFICATION_ID = 4401;

    public static final String ACTION_START_DUTY = "ae.swkproperties.os.ACTION_START_DUTY";
    /** Stop sharing locally (web UI already ended or will end the session). */
    public static final String ACTION_STOP_DUTY = "ae.swkproperties.os.ACTION_STOP_DUTY";
    /** Notification action button: flush buffered points, POST /api/field-gps/sessions/stop, then tear down. */
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
    private static final float MAX_CLIENT_ACCURACY_M = 150.0f;
    private static final int MAX_BUFFERED_POINTS = 500;
    private static final int BATCH_LIMIT = 50;

    private static final class SessionSnapshot {
        final long generation;
        final int sessionId;
        final String assignedLocation;
        final String serverUrl;
        final String sessionToken;
        final String deviceId;

        SessionSnapshot(
            long generation,
            int sessionId,
            String assignedLocation,
            String serverUrl,
            String sessionToken,
            String deviceId
        ) {
            this.generation = generation;
            this.sessionId = sessionId;
            this.assignedLocation = assignedLocation;
            this.serverUrl = serverUrl;
            this.sessionToken = sessionToken;
            this.deviceId = deviceId;
        }
    }

    private static final class BufferedPoint {
        final long generation;
        final JSONObject payload;
        final long recordedMs;

        BufferedPoint(long generation, JSONObject payload, long recordedMs) {
            this.generation = generation;
            this.payload = payload;
            this.recordedMs = recordedMs;
        }
    }

    private static final class PostResult {
        final int status;
        final String errorBody;

        PostResult(int status, String errorBody) {
            this.status = status;
            this.errorBody = errorBody;
        }
    }

    private static volatile boolean dutyActive = false;
    private static volatile SwkFieldLocationService activeInstance = null;

    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final List<BufferedPoint> pending = new ArrayList<>();
    private final AtomicLong seq = new AtomicLong(0);
    private final AtomicLong dutyGeneration = new AtomicLong(0);

    private FusedLocationProviderClient fused;
    private LocationCallback callback;
    private volatile boolean stopping = false;
    private volatile SessionSnapshot currentSession = null;
    private volatile long endedBroadcastGeneration = -1L;

    public static boolean isRunning() {
        return dutyActive;
    }

    /**
     * Background-safe stop helper for Android 8–15+:
     * signals the live in-process service instance directly without calling Context.startService(),
     * or cleans up any stale notification/service cleanly if the service is already down.
     */
    public static void requestStop(Context context, boolean notifyServer) {
        if (context == null) return;
        Context appCtx = context.getApplicationContext();
        SwkFieldLocationService inst = activeInstance;
        if (inst != null) {
            inst.mainHandler.post(() -> inst.finishDuty(notifyServer));
            return;
        }
        dutyActive = false;
        NotificationManager nm = appCtx.getSystemService(NotificationManager.class);
        if (nm != null) {
            nm.cancel(NOTIFICATION_ID);
        }
        appCtx.sendBroadcast(new Intent(ACTION_DUTY_ENDED).setPackage(appCtx.getPackageName()));
        try {
            appCtx.stopService(new Intent(appCtx, SwkFieldLocationService.class));
        } catch (RuntimeException ignored) {
        }
    }

    public static void ensureChannel(Context context) {
        if (context == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
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
        activeInstance = this;
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

        int sid = intent.getIntExtra(EXTRA_SESSION_ID, -1);
        String locRaw = intent.getStringExtra(EXTRA_LOCATION);
        String loc = (locRaw == null || locRaw.trim().isEmpty()) ? "Dubai Field Duty" : locRaw.trim();
        String url = trimTrailingSlash(intent.getStringExtra(EXTRA_SERVER_URL));
        String token = orEmpty(intent.getStringExtra(EXTRA_TOKEN));
        String devId = orEmpty(intent.getStringExtra(EXTRA_DEVICE_ID));

        if (sid <= 0 || token.isEmpty() || !isAllowedServer(url) || !hasFineLocation()) {
            stopSelf();
            return START_NOT_STICKY;
        }

        long gen = dutyGeneration.incrementAndGet();
        SessionSnapshot snap = new SessionSnapshot(gen, sid, loc, url, token, devId);
        currentSession = snap;
        stopping = false;

        try {
            Notification notification = buildNotification(snap.assignedLocation);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
        } catch (RuntimeException e) {
            currentSession = null;
            stopSelf();
            return START_NOT_STICKY;
        }

        synchronized (pending) {
            Iterator<BufferedPoint> it = pending.iterator();
            while (it.hasNext()) {
                if (it.next().generation != gen) {
                    it.remove();
                }
            }
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
                SessionSnapshot snap = currentSession;
                if (stopping || snap == null || dutyGeneration.get() != snap.generation) return;
                boolean added = false;
                for (Location l : result.getLocations()) {
                    if (l == null || !Double.isFinite(l.getLatitude()) || !Double.isFinite(l.getLongitude())) continue;
                    // Drop overly coarse points client-side (> 150m) so they never get rejected or stall the queue.
                    if (!l.hasAccuracy() || l.getAccuracy() < 0f || l.getAccuracy() > MAX_CLIENT_ACCURACY_M) continue;
                    BufferedPoint bp = toPoint(l, snap);
                    synchronized (pending) {
                        pending.add(bp);
                        while (pending.size() > MAX_BUFFERED_POINTS) {
                            pending.remove(0);
                        }
                    }
                    added = true;
                }
                if (added && !io.isShutdown()) {
                    io.execute(() -> flushLive(snap));
                }
            }
        };
        LocationRequest request = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, UPDATE_INTERVAL_MS)
            .setMinUpdateIntervalMillis(FASTEST_INTERVAL_MS)
            .setMaxUpdateDelayMillis(MAX_BATCH_DELAY_MS)
            .build();
        fused.requestLocationUpdates(request, callback, Looper.getMainLooper());
    }

    private BufferedPoint toPoint(Location l, SessionSnapshot snap) {
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
            p.put("idempotency_key", "fgps-and-" + snap.sessionId + "-" + seq.incrementAndGet() + "-" + recMs);
        } catch (Exception ignored) {
        }
        return new BufferedPoint(snap.generation, p, recMs);
    }

    /** Flushes up to 50 buffered fixes for the active generation in chronological order. */
    private void flushLive(SessionSnapshot snap) {
        if (snap == null || dutyGeneration.get() != snap.generation) return;
        if (!isAllowedServer(snap.serverUrl) || snap.sessionToken.isEmpty()) return;

        while (dutyGeneration.get() == snap.generation) {
            List<BufferedPoint> batch = new ArrayList<>();
            synchronized (pending) {
                for (BufferedPoint bp : pending) {
                    if (bp.generation == snap.generation) {
                        batch.add(bp);
                        if (batch.size() >= BATCH_LIMIT) break;
                    }
                }
            }
            if (batch.isEmpty()) return;

            PostResult res = sendBatch(snap, batch);
            if (res == null) {
                // Network unavailable: retain points for next retry.
                return;
            }
            if (res.status >= 200 && res.status < 300) {
                synchronized (pending) {
                    pending.removeAll(batch);
                }
            } else if (res.status == 401 || res.status == 403 || res.status == 404 || res.status == 422) {
                mainHandler.post(() -> {
                    if (dutyGeneration.get() == snap.generation) {
                        finishDuty(false);
                    }
                });
                return;
            } else if (res.status == 400) {
                if (res.errorBody.contains("no active field duty") || res.errorBody.contains("ended") || res.errorBody.contains("expired")) {
                    mainHandler.post(() -> {
                        if (dutyGeneration.get() == snap.generation) {
                            finishDuty(false);
                        }
                    });
                    return;
                }
                // Non-retryable payload error (e.g. coarse accuracy / skew): drop rejected slice so valid fixes flush.
                synchronized (pending) {
                    pending.removeAll(batch);
                }
            } else {
                return;
            }
        }
    }

    /** Flushes an already-drained local snapshot of buffered points during shutdown without touching new generations. */
    private void flushDrained(SessionSnapshot snap, List<BufferedPoint> drained) {
        if (snap == null || drained == null || drained.isEmpty()) return;
        if (!isAllowedServer(snap.serverUrl) || snap.sessionToken.isEmpty()) return;

        int idx = 0;
        while (idx < drained.size()) {
            int end = Math.min(idx + BATCH_LIMIT, drained.size());
            List<BufferedPoint> slice = drained.subList(idx, end);
            PostResult res = sendBatch(snap, slice);
            if (res == null) return;
            if (res.status == 401 || res.status == 403 || res.status == 404 || res.status == 422) return;
            if (res.status == 400 && (res.errorBody.contains("no active field duty") || res.errorBody.contains("ended") || res.errorBody.contains("expired"))) {
                return;
            }
            if ((res.status >= 200 && res.status < 300) || res.status == 400) {
                idx = end;
            } else {
                return;
            }
        }
    }

    @Nullable
    private PostResult sendBatch(SessionSnapshot snap, List<BufferedPoint> batch) {
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
            body.put("field_session_id", snap.sessionId);
            if (!snap.deviceId.isEmpty()) {
                body.put("device_id", snap.deviceId);
            }
            body.put("network_type", DeviceTelemetry.networkType(this));
            if (anyReplay) {
                body.put("offline_replay", true);
            }
            body.put("points", pts);

            return post(snap, "/api/field-gps/pings", body);
        } catch (Exception ignored) {
            return null;
        }
    }

    private PostResult post(SessionSnapshot snap, String path, JSONObject body) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(snap.serverUrl + path).openConnection();
        try {
            c.setRequestMethod("POST");
            c.setConnectTimeout(15_000);
            c.setReadTimeout(15_000);
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json");
            c.setRequestProperty("Accept", "application/json");
            c.setRequestProperty("x-swk-client", "mobile");
            c.setRequestProperty("x-swk-session", snap.sessionToken);
            byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream out = c.getOutputStream()) {
                out.write(bytes);
            }
            int code = c.getResponseCode();
            String errBody = "";
            if (code >= 400) {
                try (InputStream es = c.getErrorStream()) {
                    if (es != null) {
                        errBody = new String(es.readAllBytes(), StandardCharsets.UTF_8).toLowerCase(Locale.ROOT);
                    }
                } catch (Exception ignored) {
                }
            }
            return new PostResult(code, errBody);
        } finally {
            c.disconnect();
        }
    }

    private void emitDutyEndedOnce(long gen) {
        if (endedBroadcastGeneration == gen) return;
        endedBroadcastGeneration = gen;
        sendBroadcast(new Intent(ACTION_DUTY_ENDED).setPackage(getPackageName()));
    }

    private void finishDuty(boolean notifyServer) {
        if (Looper.myLooper() != Looper.getMainLooper()) {
            mainHandler.post(() -> finishDuty(notifyServer));
            return;
        }
        final SessionSnapshot snap = currentSession;
        final long gen = snap != null ? snap.generation : dutyGeneration.get();

        if (!dutyActive && stopping) {
            emitDutyEndedOnce(gen);
            stopForeground(STOP_FOREGROUND_REMOVE);
            stopSelf();
            return;
        }

        stopping = true;
        dutyActive = false;

        if (fused != null && callback != null) {
            fused.removeLocationUpdates(callback);
            callback = null;
        }

        final List<BufferedPoint> drained = new ArrayList<>();
        synchronized (pending) {
            Iterator<BufferedPoint> it = pending.iterator();
            while (it.hasNext()) {
                BufferedPoint bp = it.next();
                if (snap == null || bp.generation == snap.generation) {
                    drained.add(bp);
                    it.remove();
                }
            }
        }

        final boolean canFlush = snap != null && snap.sessionId > 0 && isAllowedServer(snap.serverUrl) && !snap.sessionToken.isEmpty();
        final boolean canNotify = notifyServer && canFlush;

        if (io.isShutdown() || !canFlush) {
            emitDutyEndedOnce(gen);
            stopForeground(STOP_FOREGROUND_REMOVE);
            stopSelf();
            return;
        }

        io.execute(() -> {
            try {
                try {
                    flushDrained(snap, drained);
                } catch (Exception ignored) {
                }
                // Only tell server to end the session if no newer duty session restarted in the meantime.
                if (canNotify && dutyGeneration.get() == snap.generation) {
                    try {
                        post(snap, "/api/field-gps/sessions/stop", new JSONObject());
                    } catch (Exception ignored) {
                    }
                }
            } finally {
                mainHandler.post(() -> {
                    if (dutyGeneration.get() != snap.generation) return;
                    emitDutyEndedOnce(snap.generation);
                    stopForeground(STOP_FOREGROUND_REMOVE);
                    stopSelf();
                });
            }
        });
    }

    private Notification buildNotification(String locationLabel) {
        Intent openIntent = new Intent(this, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP)
            .putExtra(MainActivity.EXTRA_LAUNCH_ROUTE, "/field-duty");
        PendingIntent open = PendingIntent.getActivity(
            this,
            0,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        Intent endIntent = new Intent(this, SwkFieldActionReceiver.class).setAction(ACTION_END_DUTY);
        PendingIntent end = PendingIntent.getBroadcast(
            this,
            1,
            endIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.duty_notification_title))
            .setContentText(locationLabel)
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
        if (activeInstance == this) {
            activeInstance = null;
        }
        dutyActive = false;
        if (fused != null && callback != null) {
            fused.removeLocationUpdates(callback);
            callback = null;
        }
        synchronized (pending) {
            pending.clear();
        }
        stopForeground(STOP_FOREGROUND_REMOVE);
        emitDutyEndedOnce(dutyGeneration.get());
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
