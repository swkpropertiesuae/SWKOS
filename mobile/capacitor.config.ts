import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'ae.swkproperties.os',
  appName: 'SWK OS',
  webDir: 'www',
  server: {
    androidScheme: 'https',
    iosScheme: 'capacitor',
    allowNavigation: [
      'os.swk.properties',
      '*.swk.properties',
      'swkpropertiesuae.com',
      '*.swkpropertiesuae.com',
    ],
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  ios: {
    contentInset: 'automatic',
    allowsLinkPreview: false,
  },
  plugins: {
    // Keep CapacitorHttp disabled so WebView fetch() + ReadableStream SSE streaming
    // works intact for Omni-AI (/api/omni-ai/chat/stream) and live streams.
    CapacitorHttp: {
      enabled: false,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: true,
      backgroundColor: '#0b141e',
      showSpinner: false,
    },
  },
}

export default config
