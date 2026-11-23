// SWK OS is no longer an installable app. Devices that installed the old app load this file once:
// it clears the old caches and removes itself, so the browser goes back to the normal website.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) await caches.delete(k)
  await self.registration.unregister()
  for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url)
})()))
