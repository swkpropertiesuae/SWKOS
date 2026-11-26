import type { ImgHTMLAttributes } from 'react'
import { Box, ExternalLink, Film } from 'lucide-react'
import { classifyEmbedUrl } from '@shared/media'
import { openAuthFile, resolveApiUrl, useAuthObjectUrl } from '../lib/api'

/** Renders an image seamlessly across Web, Public Share links, and Android Capacitor APK (including authenticated /api/files/ uploads). */
export function AuthImg({
  src,
  fallback,
  alt = '',
  ...rest
}: Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src?: string | null
  fallback?: string
}) {
  const raw = src || fallback || ''
  const isAuthApi = raw.startsWith('/api/files/')
  const objUrl = useAuthObjectUrl(isAuthApi ? raw : null)
  const resolved = isAuthApi ? objUrl : raw ? resolveApiUrl(raw) : undefined
  if (!resolved) {
    return (
      <div
        className={`grid place-items-center bg-[#eaf2f8] text-[11px] text-[#5b6778] ${rest.className || ''}`}
        style={rest.style}
        aria-label={alt}
      >
        Loading…
      </div>
    )
  }
  return <img src={resolved} alt={alt} {...rest} />
}

/** Plays uploaded MP4/WebM videos (with auth support) OR embeds YouTube/Vimeo cleanly. */
export function MediaVideoPlayer({
  url,
  mime,
  title = 'Project Video',
  className = '',
}: {
  url: string
  mime?: string
  title?: string
  className?: string
}) {
  const isAuthApi = url.startsWith('/api/files/')
  const objUrl = useAuthObjectUrl(isAuthApi ? url : null)
  const classified = classifyEmbedUrl(url, mime)

  if (classified?.mode === 'youtube' || classified?.mode === 'vimeo') {
    return (
      <div className={`relative aspect-video w-full overflow-hidden rounded-2xl bg-black ${className}`}>
        <iframe
          src={classified.embedUrl}
          title={title}
          className="h-full w-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          loading="lazy"
        />
      </div>
    )
  }

  const videoSrc = isAuthApi ? objUrl : resolveApiUrl(url)
  if (!videoSrc) {
    return (
      <div className={`grid aspect-video w-full place-items-center rounded-2xl bg-[#0b1824] text-xs text-white/75 ${className}`}>
        Loading video stream…
      </div>
    )
  }

  if (classified?.mode === 'external') {
    return (
      <div className={`flex flex-col items-center justify-center gap-3 rounded-2xl border border-line bg-[#0b1824] p-6 text-center text-white ${className}`}>
        <Film size={28} className="text-[#f3d27a]" />
        <div className="text-sm font-semibold">{title}</div>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full bg-[#d4a752] px-4 py-2 text-xs font-bold text-[#0b1824] no-underline"
        >
          <ExternalLink size={13} /> Watch on {classified.provider}
        </a>
      </div>
    )
  }

  return (
    <div className={`relative aspect-video w-full overflow-hidden rounded-2xl bg-black ${className}`}>
      <video src={videoSrc} controls playsInline preload="metadata" className="h-full w-full object-contain" />
    </div>
  )
}

/** Renders an interactive Matterport / Kuula / Sketchfab 3D tour iframe, or a launch/download card for .glb / external 3D tours. */
export function MediaTour3DEmbed({
  url,
  mime,
  title = '3D / 360° Virtual Tour',
  className = '',
}: {
  url: string
  mime?: string
  title?: string
  className?: string
}) {
  const classified = classifyEmbedUrl(url, mime)
  const isAuthApi = url.startsWith('/api/files/')

  if (classified?.mode === 'iframe') {
    return (
      <div className={`relative aspect-[16/10] min-h-[320px] w-full overflow-hidden rounded-2xl bg-[#0b1824] ${className}`}>
        <iframe
          src={classified.embedUrl}
          title={title}
          className="h-full w-full border-0"
          allow="xr-spatial-tracking; gyroscope; accelerometer; fullscreen; vr"
          allowFullScreen
          loading="lazy"
        />
        <a
          href={classified.originalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-[#0b1824]/85 px-3 py-1.5 text-[11px] font-bold text-[#f3d27a] no-underline backdrop-blur-md hover:bg-[#0b1824]"
        >
          <ExternalLink size={12} /> Fullscreen ({classified.provider})
        </a>
      </div>
    )
  }

  return (
    <div className={`flex flex-col items-center justify-center gap-3 rounded-2xl border border-[#d4a752]/35 bg-[#0b1824] p-7 text-center text-white ${className}`}>
      <span className="grid size-12 place-items-center rounded-2xl bg-[#d4a752]/20 text-[#f3d27a] border border-[#d4a752]/40">
        <Box size={22} />
      </span>
      <div>
        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#f3d27a]">
          {classified?.mode === 'model3d' ? '3D ARCHITECTURAL MODEL FILE' : 'INTERACTIVE 360° / 3D TOUR'}
        </div>
        <div className="mt-1 text-base font-bold">{title}</div>
      </div>
      {isAuthApi ? (
        <button
          type="button"
          onClick={() => void openAuthFile(url, `${title}.glb`)}
          className="inline-flex items-center gap-1.5 rounded-full bg-[#d4a752] px-4 py-2 text-xs font-extrabold text-[#0b1824] border-0 cursor-pointer"
        >
          <ExternalLink size={13} /> Open / Download 3D Asset
        </button>
      ) : (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full bg-[#d4a752] px-4 py-2 text-xs font-extrabold text-[#0b1824] no-underline"
        >
          <ExternalLink size={13} /> Launch 3D Experience ({classified?.provider || 'External'})
        </a>
      )}
    </div>
  )
}
