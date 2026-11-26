-keep class ae.swkproperties.os.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keepclassmembers class * { @com.getcapacitor.PluginMethod <methods>; }
-dontwarn com.google.errorprone.annotations.**

# Strip verbose/debug log calls in release builds for performance and zero info leakage
-assumenosideeffects class android.util.Log {
    public static int v(...);
    public static int d(...);
    public static int i(...);
}
