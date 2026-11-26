try {
  document.documentElement.dataset.theme = 'light'
  localStorage.removeItem('swk-theme')
  const isNative = Boolean((window as any).Capacitor?.isNativePlatform?.() || (window as any).__SWK_CONFIG__?.MOBILE_SHELL)
  const isSmallTouch = typeof window !== 'undefined' && (window.innerWidth < 1024 || window.matchMedia?.('(pointer: coarse)').matches)
  if (isNative) document.documentElement.classList.add('swk-native-app')
  if (isNative || isSmallTouch) document.documentElement.classList.add('swk-mobile-perf')
} catch { /* ignore */ }
import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import App from './App';
import { MetaProvider } from './lib/meta';
import { ToastProvider } from './lib/toast';
import { DialogProvider } from './ui/kit';
import { applyLangToDocument,startDomTranslator } from './lib/i18n';
import { startOfflineSync } from './lib/offlineQueue';

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[SWK OS] Unhandled UI error:', error, info?.componentStack)
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div style={{ minHeight: '100svh', display: 'grid', placeItems: 'center', padding: 24, background: '#0f2a33', color: '#f8f5ef', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ maxWidth: 420, width: '100%', background: '#163742', border: '1px solid rgba(212,167,82,0.35)', borderRadius: 18, padding: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#d4a752', marginBottom: 8 }}>SWK Properties OS</div>
          <h2 style={{ margin: '0 0 8px', fontSize: 19 }}>App hit an unexpected screen error</h2>
          <p style={{ margin: '0 0 14px', fontSize: 13, color: 'rgba(248,245,239,0.78)', lineHeight: 1.5 }}>
            Your session is safe. Tap Reload below to recover cleanly.
          </p>
          <pre style={{ margin: '0 0 16px', padding: 10, borderRadius: 10, background: 'rgba(0,0,0,0.35)', fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#fca5a5' }}>
            {this.state.error.message || 'Unknown error'}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ width: '100%', height: 42, borderRadius: 10, border: 0, background: '#d4a752', color: '#0a1624', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
          >
            Reload SWK OS
          </button>
        </div>
      </div>
    )
  }
}

applyLangToDocument()
startOfflineSync()
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && !(window as any).Capacitor?.isNativePlatform?.()) {
  void navigator.serviceWorker.register('/sw.js').catch(() => {})
}

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: false, retry: 1 } } })
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <QueryClientProvider client={qc}>
        <BrowserRouter>
          <ToastProvider><DialogProvider><MetaProvider><App /></MetaProvider></DialogProvider></ToastProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </AppErrorBoundary>
  </StrictMode>,
)
startDomTranslator()

