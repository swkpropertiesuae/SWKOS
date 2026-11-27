import { useEffect, useMemo, useRef, useState } from 'react'
import { Film, Pause, Play, RotateCcw, SkipForward, Volume2, VolumeX } from 'lucide-react'
import { MediaVideoPlayer } from '../AuthMedia'

interface PropertyVideoTourProps {
  title: string
  purpose: string
  location?: string
  developer?: string
  priceLabel: string
  price?: number
  beds?: number | null
  baths?: number | null
  area?: number | null
  paymentPlan?: string
  features: string[]
  images: string[]
  videoUrl?: string
  advisorName?: string
}

interface Chapter {
  eyebrow: string
  headline: string
  narration: string
  image: string
  motion: 'zoom-in' | 'pan-right' | 'zoom-out' | 'pan-left'
}

export function PropertyVideoTour({
  title,
  purpose,
  location,
  developer,
  priceLabel,
  price,
  beds,
  baths,
  area,
  paymentPlan,
  features,
  images,
  videoUrl,
  advisorName,
}: PropertyVideoTourProps) {
  const [sourceMode, setSourceMode] = useState<'narrated' | 'video'>(videoUrl ? 'video' : 'narrated')
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [chapterIdx, setChapterIdx] = useState(0)
  const [progress, setProgress] = useState(0)
  const timerRef = useRef<number | null>(null)

  const chapters = useMemo<Chapter[]>(() => {
    const pick = (i: number) => images[i % Math.max(1, images.length)] || ''
    const bedDesc = beds ? `${beds}-bedroom` : 'signature studio'
    const areaDesc = area ? `${Number(area).toLocaleString('en-US')} square feet` : 'generously proportioned interiors'
    const emirateName = /abu\s*dhabi/i.test(String(location || '')) ? 'Abu Dhabi' : 'Dubai'
    const goldenVisa = price && price >= 2_000_000
      ? 'This residence also qualifies for the UAE 10-year Golden Visa.'
      : `Positioned in a prime high-demand ${emirateName} investment corridor.`
    const featTxt = features.length
      ? `Key highlights include ${features.slice(0, 4).join(', ')}.`
      : 'Crafted with floor-to-ceiling glazing, bespoke joinery, and private resort-grade amenities.'

    return [
      {
        eyebrow: 'CHAPTER 01 · ARCHITECTURAL ARRIVAL',
        headline: title,
        narration: `Welcome to ${title}, privately curated by SWK Properties UAE. Located in ${location || `one of ${emirateName}’s most sought-after addresses`}${developer ? `, developed by ${developer}` : ''}.`,
        image: pick(0),
        motion: 'zoom-in',
      },
      {
        eyebrow: 'CHAPTER 02 · PROJECT SPECIFICATIONS',
        headline: `${bedDesc.toUpperCase()} · ${area ? `${Number(area).toLocaleString('en-US')} SQ FT` : 'UAE EDITION'}`,
        narration: `Offered ${purpose.toLowerCase()} at ${priceLabel || 'price upon private request'}, spanning ${areaDesc}${baths ? ` with ${baths} designer bathrooms` : ''}.`,
        image: pick(1),
        motion: 'pan-right',
      },
      {
        eyebrow: 'CHAPTER 03 · LIFESTYLE & AMENITIES',
        headline: `Bespoke ${emirateName} Living`,
        narration: featTxt,
        image: pick(2),
        motion: 'zoom-out',
      },
      {
        eyebrow: 'CHAPTER 04 · INVESTMENT & PRIVATE VIEWING',
        headline: price && price >= 2_000_000 ? 'UAE 10-Year Golden Visa Eligible' : 'SWK Private Office Concierge',
        narration: `${paymentPlan ? `Available with ${paymentPlan} payment structure. ` : ''}${goldenVisa} Contact ${advisorName || 'your SWK Private Client Advisor'} to arrange a confidential viewing.`,
        image: pick(3),
        motion: 'pan-left',
      },
    ]
  }, [title, purpose, location, developer, priceLabel, price, beds, baths, area, paymentPlan, features, images, advisorName])

  const speakChapter = (idx: number, isMuted: boolean) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    try {
      window.speechSynthesis.cancel()
      if (isMuted) return
      const u = new SpeechSynthesisUtterance(chapters[idx]!.narration)
      u.lang = 'en-GB'
      u.rate = 0.96
      u.pitch = 1.0
      const voices = window.speechSynthesis.getVoices()
      const preferred =
        voices.find(v => /en-(gb|ae|us)/i.test(v.lang) && /natural|google|samantha|daniel|serena/i.test(v.name)) ||
        voices.find(v => /^en/i.test(v.lang))
      if (preferred) u.voice = preferred
      window.speechSynthesis.speak(u)
    } catch { /* speech synthesis unavailable */ }
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current)
      try { window.speechSynthesis?.cancel() } catch { /* ignore */ }
    }
  }, [])

  useEffect(() => {
    if (!playing || sourceMode !== 'narrated') {
      if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null }
      try { window.speechSynthesis?.cancel() } catch { /* ignore */ }
      return
    }
    speakChapter(chapterIdx, muted)
    const durationMs = 7500
    const start = Date.now()
    setProgress(0)
    timerRef.current = window.setInterval(() => {
      const pct = Math.min(100, ((Date.now() - start) / durationMs) * 100)
      setProgress(pct)
      if (pct >= 100) {
        if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null }
        if (chapterIdx < chapters.length - 1) {
          setChapterIdx(c => c + 1)
        } else {
          setPlaying(false)
          setProgress(100)
        }
      }
    }, 60)
    return () => {
      if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, chapterIdx, muted, sourceMode])

  const ch = chapters[chapterIdx] || chapters[0]!

  const motionClass =
    ch.motion === 'zoom-in' ? 'scale-110 translate-x-0'
    : ch.motion === 'pan-right' ? 'scale-110 translate-x-3'
    : ch.motion === 'zoom-out' ? 'scale-100 translate-x-0'
    : 'scale-110 -translate-x-3'

  return (
    <div className="rounded-3xl overflow-hidden border border-[#d4a752]/30 bg-[#0b1824] shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5 py-3.5 border-b border-white/10 bg-[#0d1d2b] text-white">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-rose-500/20 text-rose-300 border border-rose-400/35">
            <Film size={16} />
          </span>
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#f3d27a]">GUIDED CINEMA VIDEO &amp; VOICE NARRATION</div>
            <div className="text-[13.5px] font-semibold truncate">{ch.eyebrow}</div>
          </div>
        </div>
        {videoUrl && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => { setSourceMode('narrated'); setPlaying(false) }}
              className={`rounded-full px-3 py-1 text-xs font-bold border-0 cursor-pointer ${sourceMode === 'narrated' ? 'bg-[#d4a752] text-[#0b1824]' : 'bg-white/10 text-white'}`}
            >
              Narrated Tour
            </button>
            <button
              type="button"
              onClick={() => { setSourceMode('video'); setPlaying(false) }}
              className={`rounded-full px-3 py-1 text-xs font-bold border-0 cursor-pointer ${sourceMode === 'video' ? 'bg-[#d4a752] text-[#0b1824]' : 'bg-white/10 text-white'}`}
            >
              Property Film
            </button>
          </div>
        )}
      </div>

      {sourceMode === 'video' && videoUrl ? (
        <div className="p-2 bg-black">
          <MediaVideoPlayer url={videoUrl} title={title} className="!rounded-xl" />
        </div>
      ) : (
        <div className="relative aspect-[16/9] min-h-[300px] overflow-hidden bg-[#08121c]">
          {ch.image && (
            <img
              key={chapterIdx}
              src={ch.image}
              alt={ch.headline}
              className={`h-full w-full object-cover transition-transform duration-[7500ms] ease-linear ${playing ? motionClass : 'scale-105'}`}
            />
          )}
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(180deg, rgba(8,18,28,0.45) 0%, rgba(8,18,28,0.12) 40%, rgba(8,18,28,0.88) 100%)',
            }}
          />

          {/* Center Play Overlay when paused */}
          {!playing && (
            <button
              type="button"
              onClick={() => { if (chapterIdx === chapters.length - 1 && progress >= 99) setChapterIdx(0); setPlaying(true) }}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-3 rounded-full bg-[#d4a752] px-6 py-3.5 text-sm font-extrabold text-[#0b1824] border-0 shadow-[0_16px_40px_rgba(0,0,0,0.55)] cursor-pointer hover:bg-[#e7c06e] transition-transform hover:scale-105"
            >
              <Play size={18} fill="currentColor" /> Play Narrated Video Tour
            </button>
          )}

          {/* Live Luxury Lower-Third Subtitle Bar */}
          <div className="absolute bottom-0 inset-x-0 p-4 sm:p-6 text-white">
            <div className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-[#f3d27a]">{ch.eyebrow}</div>
            <div className="mt-1 text-lg sm:text-xl font-bold tracking-tight">{ch.headline}</div>
            <p className="mt-1.5 mb-3 max-w-3xl text-[13px] sm:text-[14px] leading-relaxed text-white/90">
              “{ch.narration}”
            </p>

            {/* Chapter Progress Bars */}
            <div className="grid grid-cols-4 gap-1.5 mb-3">
              {chapters.map((c, idx) => (
                <button
                  key={c.eyebrow}
                  type="button"
                  aria-label={`Jump to chapter ${idx + 1}`}
                  onClick={() => { setChapterIdx(idx); setProgress(0); setPlaying(true) }}
                  className="h-1.5 rounded-full bg-white/25 overflow-hidden border-0 p-0 cursor-pointer"
                >
                  <div
                    className="h-full bg-[#f3d27a] transition-all duration-100"
                    style={{ width: idx < chapterIdx ? '100%' : idx === chapterIdx ? `${progress}%` : '0%' }}
                  />
                </button>
              ))}
            </div>

            {/* Playback Controls */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPlaying(p => !p)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-1.5 text-xs font-bold text-white border border-white/20 cursor-pointer hover:bg-white/25"
                >
                  {playing ? <><Pause size={13} /> Pause</> : <><Play size={13} /> Play</>}
                </button>
                <button
                  type="button"
                  onClick={() => { setChapterIdx(c => (c + 1) % chapters.length); setProgress(0) }}
                  className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white border border-white/15 cursor-pointer hover:bg-white/20"
                >
                  <SkipForward size={13} /> Next Scene
                </button>
                <button
                  type="button"
                  onClick={() => { setChapterIdx(0); setProgress(0); setPlaying(true) }}
                  className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white border border-white/15 cursor-pointer hover:bg-white/20"
                >
                  <RotateCcw size={13} /> Restart
                </button>
              </div>
              <button
                type="button"
                onClick={() => setMuted(m => !m)}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white border border-white/15 cursor-pointer hover:bg-white/20"
              >
                {muted ? <><VolumeX size={13} /> Voice Muted</> : <><Volume2 size={13} /> Voice Narration On</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
