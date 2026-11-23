import { useEffect, useRef, useState } from 'react'
import { getApiBaseUrl, getMobileSessionToken, isNativeMobile, resolveApiUrl } from './mobileBridge'

export class ApiError extends Error {
  status: number; details?: any
  constructor(status: number, message: string, details?: any) { super(message); this.status = status; this.details = details }
}

export { getApiBaseUrl, resolveApiUrl }

export function getFetchCredentials(): RequestCredentials {
  return getApiBaseUrl() ? 'omit' : 'same-origin'
}

export function buildClientHeaders(extra?: Record<string, string>): Record<string, string> {
  const mobileTok = getMobileSessionToken()
  const useMobile = isNativeMobile() || Boolean(mobileTok)
  const headers: Record<string, string> = {
    'x-swk-client': useMobile ? 'mobile' : 'web',
  }
  if (mobileTok) {
    headers['x-swk-session'] = mobileTok
  }
  if (extra) {
    Object.assign(headers, extra)
  }
  return headers
}

async function rawApi<T = any>(method: string, path: string, body?: unknown, signal?: AbortSignal, extraHeaders?: Record<string, string>): Promise<T> {
  const res = await fetch(resolveApiUrl(path), {
    method,
    signal,
    credentials: getFetchCredentials(),
    headers: buildClientHeaders({ 'content-type': 'application/json', ...(extraHeaders || {}) }),
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let data: any = null
  if (text) { try { data = JSON.parse(text) } catch { data = text } }
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/api/auth/login')) window.dispatchEvent(new Event('swk:unauthorized'))
    throw new ApiError(res.status, (data && data.error) || res.statusText || 'Request failed', data?.details)
  }
  return data as T
}
export const get = <T = any>(p: string, params?: Record<string, any>, signal?: AbortSignal) => {
  if (params) {
    const u = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') u.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v))
    const s = u.toString(); if (s) p += (p.includes('?') ? '&' : '?') + s
  }
  return rawApi<T>('GET', p, undefined, signal)
}
export const post = <T = any>(p: string, b?: unknown, extraHeaders?: Record<string, string>) => rawApi<T>('POST', p, b ?? {}, undefined, extraHeaders)
export const put = <T = any>(p: string, b?: unknown, extraHeaders?: Record<string, string>) => rawApi<T>('PUT', p, b ?? {}, undefined, extraHeaders)
export const del = <T = any>(p: string, extraHeaders?: Record<string, string>) => rawApi<T>('DELETE', p, undefined, undefined, extraHeaders)

export const api = Object.assign(rawApi, { get, post, put, del })

export async function upload(files: File[], fields: Record<string, string | number | undefined>, path = '/api/files') {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== '') fd.append(k, String(v))
  for (const f of files) fd.append('file', f)
  const res = await fetch(resolveApiUrl(path), {
    method: 'POST',
    body: fd,
    headers: buildClientHeaders(),
    credentials: getFetchCredentials(),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, data.error || 'Upload failed')
  return data
}
export function buildApiPath(path: string, params?: Record<string, any>): string {
  if (!params) return path
  const u = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') {
      u.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v))
    }
  }
  const s = u.toString()
  return s ? `${path}${path.includes('?') ? '&' : '?'}${s}` : path
}

export function downloadUrl(path: string, params?: Record<string, any>) {
  return resolveApiUrl(buildApiPath(path, params))
}

export function needsAuthMediaFetch(): boolean {
  return Boolean(getApiBaseUrl() || getMobileSessionToken() || isNativeMobile())
}

function filenameFromDisposition(res: Response, fallback?: string): string {
  const cd = res.headers.get('content-disposition') || ''
  const utf8 = cd.match(/filename\*\s*=\s*UTF-8''([^;]+)/i)?.[1]
  if (utf8) {
    try {
      return decodeURIComponent(utf8)
    } catch {
      return utf8
    }
  }
  const plain = cd.match(/filename="?([^";]+)"?/i)?.[1]
  return plain || fallback || 'download'
}

export async function fetchAuthBlob(
  path: string,
  signal?: AbortSignal,
): Promise<{ blob: Blob; filename: string; contentType: string }> {
  const res = await fetch(resolveApiUrl(path), {
    signal,
    credentials: getFetchCredentials(),
    headers: buildClientHeaders(),
  })
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/api/auth/login')) {
      window.dispatchEvent(new Event('swk:unauthorized'))
    }
    const text = await res.text().catch(() => '')
    let msg = res.statusText || 'Request failed'
    if (text) {
      try {
        msg = JSON.parse(text)?.error || msg
      } catch {
        msg = text
      }
    }
    throw new ApiError(res.status, msg)
  }
  const blob = await res.blob()
  return {
    blob,
    filename: filenameFromDisposition(res),
    contentType: res.headers.get('content-type') || blob.type || 'application/octet-stream',
  }
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export async function downloadAuthFile(path: string, fallbackFilename?: string): Promise<void> {
  const { blob, filename } = await fetchAuthBlob(path)
  triggerBlobDownload(blob, filename || fallbackFilename || 'download')
}

export async function openAuthFile(path: string, fallbackFilename?: string): Promise<void> {
  if (!needsAuthMediaFetch()) {
    window.open(resolveApiUrl(path), '_blank', 'noopener,noreferrer')
    return
  }
  const { blob, filename } = await fetchAuthBlob(path)
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank', 'noopener,noreferrer')
  if (!win) {
    triggerBlobDownload(blob, filename || fallbackFilename || 'document')
  } else {
    window.setTimeout(() => URL.revokeObjectURL(url), 120_000)
  }
}

export function useAuthObjectUrl(path: string | null | undefined, onError?: () => void): string | undefined {
  const remoteApiMedia = Boolean(path && path.startsWith('/api/') && needsAuthMediaFetch())
  const [objectUrl, setObjectUrl] = useState<string | undefined>(undefined)
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  useEffect(() => {
    if (!path || !remoteApiMedia) {
      setObjectUrl(undefined)
      return
    }
    const ac = new AbortController()
    let created: string | null = null
    setObjectUrl(undefined)
    void fetchAuthBlob(path, ac.signal)
      .then(({ blob }) => {
        if (ac.signal.aborted) return
        created = URL.createObjectURL(blob)
        setObjectUrl(created)
      })
      .catch(() => {
        if (!ac.signal.aborted) onErrorRef.current?.()
      })
    return () => {
      ac.abort()
      if (created) URL.revokeObjectURL(created)
    }
  }, [path, remoteApiMedia])

  if (!path) return undefined
  return remoteApiMedia ? objectUrl : path
}
