import { ApiError } from './api'

/** Extract filename from Content-Disposition header when present. */
export function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback
  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(header)
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1].trim().replace(/^["']|["']$/g, ''))
    } catch {
      /* ignore */
    }
  }
  const plainMatch = /filename="?([^";\r\n]+)"?/i.exec(header)
  if (plainMatch?.[1]) return plainMatch[1].trim()
  return fallback
}

/** Trigger a browser download from an in-memory Blob or byte array. */
export function saveClientBlob(data: BlobPart, filename: string, mimeType: string): void {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2500)
}

/** Decode a base64 string into a Blob and trigger download. */
export function downloadBase64File(base64: string, filename: string, mimeType: string): void {
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  saveClientBlob(bytes, filename, mimeType)
}

/** POST JSON or FormData to a binary utility endpoint and download the returned file. */
export async function postForDownload(
  path: string,
  body: Record<string, unknown> | FormData,
  fallbackFilename: string,
): Promise<{ filename: string; headers: Headers }> {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData
  const headers: Record<string, string> = { 'x-swk-client': 'web' }
  if (!isForm) headers['content-type'] = 'application/json'

  const res = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers,
    body: isForm ? body : JSON.stringify(body),
  })

  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new Event('swk:unauthorized'))
    const text = await res.text().catch(() => '')
    let msg = res.statusText || 'Download failed'
    if (text) {
      try {
        const parsed = JSON.parse(text)
        if (parsed?.error) msg = String(parsed.error)
      } catch {
        msg = text.slice(0, 200)
      }
    }
    throw new ApiError(res.status, msg)
  }

  const blob = await res.blob()
  const filename = filenameFromDisposition(res.headers.get('content-disposition'), fallbackFilename)
  saveClientBlob(blob, filename, blob.type || 'application/octet-stream')
  return { filename, headers: res.headers }
}
