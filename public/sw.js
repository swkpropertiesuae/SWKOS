/* SWK Properties OS Service Worker
 * Security invariant: NEVER intercept, store, or cache any /api/* request or HTML page.
 * Only immutable hashed /assets/* bundles may be cached; push & notificationclick drive live alerts.
 */
const ASSETS_CACHE = 'swk-assets-v1'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(
      keys
        .filter(k => k !== ASSETS_CACHE)
        .map(k => caches.delete(k)),
    )
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', event => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  // EXPLICITLY NEVER cache or intercept /api/* requests
  if (url.pathname.startsWith('/api/')) return

  // Only cache immutable Vite hashed /assets/* bundles
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const cache = await caches.open(ASSETS_CACHE)
      const hit = await cache.match(req)
      if (hit) return hit
      const res = await fetch(req)
      if (res.ok && res.type === 'basic') {
        void cache.put(req, res.clone())
      }
      return res
    })())
  }
})

self.addEventListener('push', event => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'SWK OS', body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'SWK OS'
  const options = {
    body: data.body || '',
    tag: data.tag || 'swk-os',
    icon: '/favicon/favicon-192.png',
    badge: '/favicon/favicon-96.png',
    renotify: true,
    data: {
      url: data.url || '/home',
      channel: data.channel || 'swk_ops_alerts',
      threadId: data.threadId ?? null,
    },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const rawUrl = (event.notification.data && event.notification.data.url) || '/home'
  const safePath = typeof rawUrl === 'string' && rawUrl.startsWith('/') ? rawUrl : '/home'
  event.waitUntil((async () => {
    const targetUrl = new URL(safePath, self.location.origin).href
    const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windowClients) {
      if (new URL(client.url).origin === self.location.origin) {
        if ('focus' in client) await client.focus()
        if (client.url !== targetUrl && 'navigate' in client) {
          try {
            await client.navigate(targetUrl)
          } catch {
            /* client may have closed before navigate */
          }
        }
        return
      }
    }
    if (self.clients.openWindow) {
      await self.clients.openWindow(targetUrl)
    }
  })())
})
