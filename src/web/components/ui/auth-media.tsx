import type { AudioHTMLAttributes, ImgHTMLAttributes, VideoHTMLAttributes } from 'react'
import { useAuthObjectUrl } from '../../lib/api'

export function AuthImg({ src, onError, ...props }: ImgHTMLAttributes<HTMLImageElement> & { src?: string }) {
  const resolved = useAuthObjectUrl(src, () => {
    if (onError) onError({} as any)
  })
  if (!resolved) {
    return <div className={props.className} aria-label={props.alt} />
  }
  return <img src={resolved} onError={onError} {...props} />
}

export function AuthAudio({ src, ...props }: AudioHTMLAttributes<HTMLAudioElement> & { src?: string }) {
  const resolved = useAuthObjectUrl(src)
  return <audio src={resolved} {...props} />
}

export function AuthVideo({ src, ...props }: VideoHTMLAttributes<HTMLVideoElement> & { src?: string }) {
  const resolved = useAuthObjectUrl(src)
  return <video src={resolved} {...props} />
}
