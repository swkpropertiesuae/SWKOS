/** A per-device EC P-256 signing key kept in native Keystore/Secure Enclave or the browser's IndexedDB key store. The private key is non-extractable. */
const DB = 'swk-device', STORE = 'keys', ID = 'checkin'
const open = () => new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
const tx = <T,>(db: IDBDatabase, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) => new Promise<T>((res, rej) => { const q = fn(db.transaction(STORE, mode).objectStore(STORE)); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error) })
const b64u = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export interface EcP256Jwk {
  kty: 'EC'
  crv: 'P-256'
  x: string
  y: string
}

async function pair(): Promise<CryptoKeyPair> {
  const db = await open()
  const have = await tx<CryptoKeyPair | undefined>(db, 'readonly', s => s.get(ID))
  if (have) return have
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify'])
  await tx(db, 'readwrite', s => s.put(kp, ID))
  return kp
}

export async function deriveDeviceIdFromJwk(pub: EcP256Jwk): Promise<string> {
  if (!crypto?.subtle) throw new Error('WebCrypto unavailable')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${pub.x}.${pub.y}`))
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 40)
}

export async function getDevicePublicKeyJwk(): Promise<EcP256Jwk> {
  const cap = typeof window !== 'undefined' ? (window as any).Capacitor : undefined
  const swkSecure = cap?.isNativePlatform?.() ? cap?.Plugins?.SwkSecure : undefined
  if (swkSecure && typeof swkSecure.getOrCreateDeviceKey === 'function') {
    try {
      const res = await swkSecure.getOrCreateDeviceKey()
      if (res?.kty === 'EC' && res?.crv === 'P-256' && res?.x && res?.y) {
        return { kty: 'EC', crv: 'P-256', x: String(res.x), y: String(res.y) }
      }
    } catch {
      /* fall back to WebCrypto IndexedDB key */
    }
  }
  if (!crypto?.subtle || !window.indexedDB) {
    throw new Error('This browser cannot secure a device key. Use a current Chrome or Safari over https.')
  }
  const kp = await pair()
  const jwk = await crypto.subtle.exportKey('jwk', kp.publicKey)
  return { kty: 'EC', crv: 'P-256', x: String(jwk.x || ''), y: String(jwk.y || '') }
}

export async function signProof(message: string): Promise<{ pub: EcP256Jwk; sig: string }> {
  const cap = typeof window !== 'undefined' ? (window as any).Capacitor : undefined
  const swkSecure = cap?.isNativePlatform?.() ? cap?.Plugins?.SwkSecure : undefined
  if (swkSecure && typeof swkSecure.signDeviceChallenge === 'function') {
    try {
      const res = await swkSecure.signDeviceChallenge({ message })
      if (res?.pub?.kty === 'EC' && res?.pub?.crv === 'P-256' && res?.pub?.x && res?.pub?.y && res?.sig) {
        return {
          pub: { kty: 'EC', crv: 'P-256', x: String(res.pub.x), y: String(res.pub.y) },
          sig: String(res.sig),
        }
      }
    } catch {
      /* fall back to WebCrypto IndexedDB key */
    }
  }
  if (!crypto?.subtle || !window.indexedDB) throw new Error('This browser cannot secure a device key. Use a current Chrome or Safari over https.')
  const kp = await pair()
  const jwk = await crypto.subtle.exportKey('jwk', kp.publicKey)
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, new TextEncoder().encode(message))
  return { pub: { kty: 'EC', crv: 'P-256', x: String(jwk.x || ''), y: String(jwk.y || '') }, sig: b64u(sig) }
}
