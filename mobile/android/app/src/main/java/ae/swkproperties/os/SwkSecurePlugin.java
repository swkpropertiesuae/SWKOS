package ae.swkproperties.os;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import android.provider.Settings;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;
import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;
import com.google.android.gms.tasks.CancellationTokenSource;
import java.io.File;
import java.lang.ref.WeakReference;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.Signature;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.Executor;

/**
 * Unified native security, hardware EC P-256 device binding, biometric unlock,
 * verified GPS fix, Field Duty foreground service & incoming SIP call wake plugin.
 */
@CapacitorPlugin(name = "SwkSecure")
public class SwkSecurePlugin extends Plugin {
    private static final int AUTH =
        BiometricManager.Authenticators.BIOMETRIC_STRONG | BiometricManager.Authenticators.DEVICE_CREDENTIAL;
    private static final String ANDROID_KEYSTORE = "AndroidKeyStore";
    private static final String DEVICE_EC_ALIAS = "swk_device_ec_p256_v1";

    private static volatile String pendingLaunchRoute = null;
    private static volatile WeakReference<SwkSecurePlugin> activePluginRef = new WeakReference<>(null);

    private SharedPreferences prefs;
    private boolean dutyReceiverRegistered = false;
    private final BroadcastReceiver dutyEndedReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (intent != null && SwkFieldLocationService.ACTION_DUTY_ENDED.equals(intent.getAction())) {
                JSObject payload = new JSObject();
                payload.put("ended", true);
                emitBridgeEvent("swkDutyEnded", payload);
            }
        }
    };

    @Override
    public void load() {
        activePluginRef = new WeakReference<>(this);
        if (!dutyReceiverRegistered) {
            try {
                ContextCompat.registerReceiver(
                    getContext(),
                    dutyEndedReceiver,
                    new IntentFilter(SwkFieldLocationService.ACTION_DUTY_ENDED),
                    ContextCompat.RECEIVER_NOT_EXPORTED
                );
                dutyReceiverRegistered = true;
            } catch (Exception ignored) {
            }
        }
    }

    @Override
    protected void handleOnDestroy() {
        if (dutyReceiverRegistered) {
            dutyReceiverRegistered = false;
            try {
                getContext().unregisterReceiver(dutyEndedReceiver);
            } catch (Exception ignored) {
            }
        }
        SwkSecurePlugin current = activePluginRef.get();
        if (current == this) {
            activePluginRef = new WeakReference<>(null);
        }
        super.handleOnDestroy();
    }

    static void emitIncomingCallDeclined(String callId) {
        SwkSecurePlugin plugin = activePluginRef.get();
        if (plugin != null) {
            JSObject payload = new JSObject();
            payload.put("callId", callId == null ? "" : callId);
            payload.put("ended", true);
            plugin.emitBridgeEvent("swkCallEnded", payload);
        }
    }

    static void setPendingLaunchRoute(String route) {
        pendingLaunchRoute = route;
    }

    void emitBridgeEvent(String eventName, JSObject data) {
        notifyListeners(eventName, data, true);
    }

    private synchronized SharedPreferences store() throws Exception {
        if (prefs == null) {
            MasterKey key = new MasterKey.Builder(getContext())
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build();
            prefs = EncryptedSharedPreferences.create(
                getContext(),
                "swk_secure",
                key,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            );
        }
        return prefs;
    }

    @PluginMethod
    public void secureSet(PluginCall call) {
        String k = call.getString("key");
        String v = call.getString("value");
        if (k == null || v == null) {
            call.reject("key and value required");
            return;
        }
        try {
            store().edit().putString(k, v).apply();
            call.resolve();
        } catch (Exception e) {
            call.reject("secure_store_failed");
        }
    }

    @PluginMethod
    public void secureGet(PluginCall call) {
        try {
            JSObject r = new JSObject();
            r.put("value", store().getString(call.getString("key", ""), null));
            call.resolve(r);
        } catch (Exception e) {
            call.reject("secure_store_failed");
        }
    }

    @PluginMethod
    public void secureRemove(PluginCall call) {
        try {
            store().edit().remove(call.getString("key", "")).apply();
            call.resolve();
        } catch (Exception e) {
            call.reject("secure_store_failed");
        }
    }

    private synchronized KeyPair ensureDeviceEcKeyPair() throws Exception {
        KeyStore ks = KeyStore.getInstance(ANDROID_KEYSTORE);
        ks.load(null);
        if (ks.containsAlias(DEVICE_EC_ALIAS)) {
            KeyStore.Entry entry = ks.getEntry(DEVICE_EC_ALIAS, null);
            if (entry instanceof KeyStore.PrivateKeyEntry) {
                KeyStore.PrivateKeyEntry pke = (KeyStore.PrivateKeyEntry) entry;
                if (pke.getCertificate().getPublicKey() instanceof ECPublicKey) {
                    return new KeyPair(pke.getCertificate().getPublicKey(), pke.getPrivateKey());
                }
            }
        }
        KeyPairGenerator kpg = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, ANDROID_KEYSTORE);
        KeyGenParameterSpec spec = new KeyGenParameterSpec.Builder(
            DEVICE_EC_ALIAS,
            KeyProperties.PURPOSE_SIGN | KeyProperties.PURPOSE_VERIFY
        )
            .setAlgorithmParameterSpec(new ECGenParameterSpec("secp256r1"))
            .setDigests(KeyProperties.DIGEST_SHA256)
            .build();
        kpg.initialize(spec);
        return kpg.generateKeyPair();
    }

    private static byte[] bigIntToUnsigned32(BigInteger bi) {
        byte[] raw = bi.toByteArray();
        if (raw.length == 32) return raw;
        byte[] out = new byte[32];
        if (raw.length > 32) {
            System.arraycopy(raw, raw.length - 32, out, 0, 32);
        } else {
            System.arraycopy(raw, 0, out, 32 - raw.length, raw.length);
        }
        return out;
    }

    private static String b64Url(byte[] bytes) {
        return Base64.encodeToString(bytes, Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP);
    }

    private static JSObject exportJwk(ECPublicKey pub) {
        JSObject jwk = new JSObject();
        jwk.put("kty", "EC");
        jwk.put("crv", "P-256");
        jwk.put("x", b64Url(bigIntToUnsigned32(pub.getW().getAffineX())));
        jwk.put("y", b64Url(bigIntToUnsigned32(pub.getW().getAffineY())));
        return jwk;
    }

    /** Converts an ASN.1 DER ECDSA P-256 signature to exact 64-byte IEEE P1363 (r || s). */
    private static byte[] derToP1363(byte[] der) throws Exception {
        if (der == null || der.length < 8 || der[0] != 0x30) {
            throw new IllegalArgumentException("Invalid ECDSA DER signature");
        }
        int idx = 1;
        int seqLen = der[idx++] & 0xff;
        if ((seqLen & 0x80) != 0) {
            int lenBytes = seqLen & 0x7f;
            idx += lenBytes;
        }
        if (idx >= der.length || der[idx++] != 0x02) throw new IllegalArgumentException("Missing DER r tag");
        int rLen = der[idx++] & 0xff;
        int rOff = idx;
        idx += rLen;

        if (idx >= der.length || der[idx++] != 0x02) throw new IllegalArgumentException("Missing DER s tag");
        int sLen = der[idx++] & 0xff;
        int sOff = idx;

        byte[] out = new byte[64];
        copyUnsignedCoordinate(der, rOff, rLen, out, 0);
        copyUnsignedCoordinate(der, sOff, sLen, out, 32);
        return out;
    }

    private static void copyUnsignedCoordinate(byte[] src, int srcOff, int srcLen, byte[] dst, int dstStart) {
        if (srcLen > 32) {
            int trim = srcLen - 32;
            System.arraycopy(src, srcOff + trim, dst, dstStart, 32);
        } else {
            System.arraycopy(src, srcOff, dst, dstStart + (32 - srcLen), srcLen);
        }
    }

    @PluginMethod
    public void getOrCreateDeviceKey(PluginCall call) {
        try {
            KeyPair kp = ensureDeviceEcKeyPair();
            call.resolve(exportJwk((ECPublicKey) kp.getPublic()));
        } catch (Exception e) {
            call.reject("device_key_unavailable");
        }
    }

    @PluginMethod
    public void signDeviceChallenge(PluginCall call) {
        String message = call.getString("message");
        if (message == null || message.isEmpty()) {
            call.reject("message required");
            return;
        }
        try {
            KeyPair kp = ensureDeviceEcKeyPair();
            PrivateKey priv = kp.getPrivate();
            Signature signer = Signature.getInstance("SHA256withECDSA");
            signer.initSign(priv);
            signer.update(message.getBytes(StandardCharsets.UTF_8));
            byte[] p1363 = derToP1363(signer.sign());

            JSObject res = new JSObject();
            res.put("pub", exportJwk((ECPublicKey) kp.getPublic()));
            res.put("sig", b64Url(p1363));
            call.resolve(res);
        } catch (Exception e) {
            call.reject("device_sign_failed");
        }
    }

    @SuppressLint("HardwareIds")
    @PluginMethod
    public void deviceInfo(PluginCall call) {
        String id = Settings.Secure.getString(getContext().getContentResolver(), Settings.Secure.ANDROID_ID);
        JSObject r = new JSObject();
        r.put("device_id", "SWK-AND-" + (id == null || id.isEmpty() ? "UNKNOWN" : id.toUpperCase(Locale.ROOT)));
        r.put("device_name", Build.MANUFACTURER + " " + Build.MODEL);
        r.put("os_version", "Android " + Build.VERSION.RELEASE + " (API " + Build.VERSION.SDK_INT + ")");
        r.put("app_version", BuildConfig.VERSION_NAME);
        call.resolve(r);
    }

    /** Best-effort tamper signals for security monitoring. */
    @PluginMethod
    public void integrity(PluginCall call) {
        boolean debuggable = (getContext().getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        boolean rooted = Build.TAGS != null && Build.TAGS.contains("test-keys");
        for (String p : new String[]{
            "/system/bin/su", "/system/xbin/su", "/sbin/su",
            "/system/app/Superuser.apk", "/data/local/bin/su", "/data/local/xbin/su", "/su/bin/su"
        }) {
            if (new File(p).exists()) rooted = true;
        }
        for (String pkg : new String[]{"com.topjohnwu.magisk", "eu.chainfire.supersu", "com.koushikdutta.superuser"}) {
            try {
                getContext().getPackageManager().getPackageInfo(pkg, 0);
                rooted = true;
            } catch (PackageManager.NameNotFoundException ignored) {
            }
        }
        boolean emulator = Build.FINGERPRINT.startsWith("generic")
            || Build.MODEL.contains("Emulator")
            || Build.HARDWARE.contains("goldfish")
            || Build.HARDWARE.contains("ranchu");
        JSObject r = new JSObject();
        r.put("debuggable", debuggable);
        r.put("rooted", rooted);
        r.put("emulator", emulator);
        call.resolve(r);
    }

    @PluginMethod
    public void biometricAvailable(PluginCall call) {
        JSObject r = new JSObject();
        r.put("available", BiometricManager.from(getContext()).canAuthenticate(AUTH) == BiometricManager.BIOMETRIC_SUCCESS);
        call.resolve(r);
    }

    @PluginMethod
    public void biometricAuth(PluginCall call) {
        if (BiometricManager.from(getContext()).canAuthenticate(AUTH) != BiometricManager.BIOMETRIC_SUCCESS) {
            call.reject("biometric_unavailable");
            return;
        }
        FragmentActivity a = getActivity();
        Executor ex = ContextCompat.getMainExecutor(getContext());
        a.runOnUiThread(() -> {
            BiometricPrompt bp = new BiometricPrompt(a, ex, new BiometricPrompt.AuthenticationCallback() {
                @Override
                public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult res) {
                    JSObject r = new JSObject();
                    r.put("verified", true);
                    call.resolve(r);
                }

                @Override
                public void onAuthenticationError(int code, CharSequence msg) {
                    call.reject("auth_error:" + code);
                }
            });
            bp.authenticate(
                new BiometricPrompt.PromptInfo.Builder()
                    .setTitle(getContext().getString(R.string.biometric_title))
                    .setSubtitle(call.getString("reason", "Unlock SWK Properties OS"))
                    .setAllowedAuthenticators(AUTH)
                    .build()
            );
        });
    }

    @PluginMethod
    public void startDuty(PluginCall call) {
        int sessionId = call.getInt("sessionId", -1);
        String serverUrl = call.getString("serverUrl", "");
        String token = call.getString("sessionToken", "");
        JSObject r = new JSObject();
        if (sessionId <= 0) {
            r.put("started", false);
            r.put("reason", "invalid_session");
            call.resolve(r);
            return;
        }
        if (token.isEmpty()) {
            r.put("started", false);
            r.put("reason", "not_signed_in");
            call.resolve(r);
            return;
        }
        if (!SwkFieldLocationService.isAllowedServer(serverUrl)) {
            r.put("started", false);
            r.put("reason", "insecure_server");
            call.resolve(r);
            return;
        }
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            String[] perms = Build.VERSION.SDK_INT >= 33
                ? new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.POST_NOTIFICATIONS}
                : new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION};
            getActivity().runOnUiThread(() -> ActivityCompat.requestPermissions(getActivity(), perms, 7301));
            r.put("started", false);
            r.put("reason", "location_permission_required");
            call.resolve(r);
            return;
        }
        Intent i = new Intent(getContext(), SwkFieldLocationService.class)
            .setAction(SwkFieldLocationService.ACTION_START_DUTY)
            .putExtra(SwkFieldLocationService.EXTRA_SESSION_ID, sessionId)
            .putExtra(SwkFieldLocationService.EXTRA_LOCATION, call.getString("assignedLocation", ""))
            .putExtra(SwkFieldLocationService.EXTRA_SERVER_URL, serverUrl)
            .putExtra(SwkFieldLocationService.EXTRA_TOKEN, token)
            .putExtra(SwkFieldLocationService.EXTRA_DEVICE_ID, call.getString("deviceId", ""));
        ContextCompat.startForegroundService(getContext(), i);
        r.put("started", true);
        call.resolve(r);
    }

    @PluginMethod
    public void stopDuty(PluginCall call) {
        Context ctx = getContext();
        if (SwkFieldLocationService.isRunning()) {
            ctx.startService(
                new Intent(ctx, SwkFieldLocationService.class)
                    .setAction(SwkFieldLocationService.ACTION_STOP_DUTY)
            );
        } else {
            ctx.stopService(new Intent(ctx, SwkFieldLocationService.class));
        }
        call.resolve();
    }

    @PluginMethod
    public void telemetry(PluginCall call) {
        JSObject r = new JSObject();
        r.put("battery_pct", DeviceTelemetry.batteryPercent(getContext()));
        r.put("is_charging", DeviceTelemetry.isCharging(getContext()));
        r.put("network_type", DeviceTelemetry.networkType(getContext()));
        r.put("duty_service_running", SwkFieldLocationService.isRunning());
        call.resolve(r);
    }

    /** Captures one fresh high-accuracy GPS fix including Android mock-location detection. */
    @PluginMethod
    public void getFix(PluginCall call) {
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            String[] perms = Build.VERSION.SDK_INT >= 33
                ? new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.POST_NOTIFICATIONS}
                : new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION};
            getActivity().runOnUiThread(() -> ActivityCompat.requestPermissions(getActivity(), perms, 7301));
            call.reject("location_permission_required");
            return;
        }
        try {
            LocationServices.getFusedLocationProviderClient(getContext())
                .getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, new CancellationTokenSource().getToken())
                .addOnSuccessListener(l -> {
                    if (l == null) {
                        call.reject("no_fix");
                        return;
                    }
                    SimpleDateFormat fmt = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
                    fmt.setTimeZone(TimeZone.getTimeZone("UTC"));
                    JSObject r = new JSObject();
                    r.put("lat", l.getLatitude());
                    r.put("lng", l.getLongitude());
                    r.put("accuracy", l.getAccuracy());
                    if (l.hasSpeed() && l.getSpeed() >= 0f) r.put("speed_mps", (double) l.getSpeed());
                    if (l.hasBearing() && l.getBearing() >= 0f) r.put("heading", (double) l.getBearing());
                    r.put("capturedAt", fmt.format(new Date(l.getTime())));
                    r.put("mock", Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? l.isMock() : l.isFromMockProvider());
                    call.resolve(r);
                })
                .addOnFailureListener(e -> call.reject("no_fix"));
        } catch (SecurityException e) {
            call.reject("location_permission_required");
        }
    }

    @PluginMethod
    public void ensureNotificationChannels(PluginCall call) {
        MainActivity.ensureAllNotificationChannels(getContext());
        call.resolve();
    }

    @PluginMethod
    public void consumeLaunchRoute(PluginCall call) {
        String route = pendingLaunchRoute;
        pendingLaunchRoute = null;
        JSObject r = new JSObject();
        r.put("route", route);
        call.resolve(r);
    }

    @PluginMethod
    public void showIncomingCall(PluginCall call) {
        String callId = call.getString("callId", "");
        String callerName = call.getString("callerName", "");
        String ext = call.getString("extensionNo", "");
        boolean isMasked = Boolean.TRUE.equals(call.getBoolean("isMaskedVault", false));
        SwkIncomingCallService.showIncomingCallWake(getContext(), callId, callerName, ext, isMasked);
        call.resolve();
    }

    @PluginMethod
    public void endIncomingCall(PluginCall call) {
        SwkIncomingCallService.dismissIncomingCallWake(getContext());
        call.resolve();
    }

    @PluginMethod
    public void startCallAudioService(PluginCall call) {
        String label = call.getString("label", "Active SWK SIP Call");
        Intent i = new Intent(getContext(), SwkCallForegroundService.class)
            .setAction(SwkCallForegroundService.ACTION_START_CALL)
            .putExtra(SwkCallForegroundService.EXTRA_LABEL, label);
        ContextCompat.startForegroundService(getContext(), i);
        call.resolve();
    }

    @PluginMethod
    public void stopCallAudioService(PluginCall call) {
        getContext().stopService(new Intent(getContext(), SwkCallForegroundService.class));
        call.resolve();
    }
}
