import { useState } from 'react'
import {
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Fingerprint,
  Image as ImageIcon,
  MapPin,
  PhoneCall,
  QrCode,
  ShieldCheck,
  Smartphone,
  Sparkles,
} from 'lucide-react'
import { useToast } from '../../lib/toast'
import { getApiBaseUrl, resolveApiUrl } from '../../lib/api'
import { SwissHeroHeader } from '../../components/ui/SwissPrimitives'
import { GlossyBlackCard, ShineButton } from '../../components/ui/PremiumPrimitives'
import { SWK_COMPANY_NAME, SWK_RERA_ORN } from '@shared/corporate-footer'

export default function MobileAppsPage() {
  const toast = useToast()
  const [copied, setCopied] = useState(false)
  const appUrl = getApiBaseUrl() || (typeof window !== 'undefined' && !/^https?:\/\/localhost/i.test(window.location.origin) && !window.location.origin.startsWith('capacitor://') ? window.location.origin : 'https://os.swk.properties')

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(appUrl)
      setCopied(true)
      toast.ok('App link copied — open on Android or iPhone')
      setTimeout(() => setCopied(false), 2500)
    } catch {
      toast.error('Could not copy link')
    }
  }

  return (
    <div className="mx-auto max-w-[1340px] space-y-6 pb-12">
      <SwissHeroHeader
        eyebrow="Native Android · Native iOS · Instant Mobile Web App"
        badge={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#0a0b0e] border border-[#d4a955]/45 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#ebc97c]">
            <Smartphone size={12} /> Capacitor Native Ready
          </span>
        }
        title="SWK OS Mobile Apps"
        subtitle="Use SWK Properties OS on Android phones, iPhones, and iPads with full native GPS field visits, Office QR check-in, SIP Softphone calling, push notifications, biometric screen lock, and the new 8K SWK Properties icon."
        actions={
          <ShineButton variant="gold" size="sm" onClick={() => void copyLink()}>
            <Copy size={14} /> {copied ? 'Link Copied!' : 'Copy Mobile App Link'}
          </ShineButton>
        }
      />

      {/* Android & iOS Glossy Floating Cards */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Android App Card */}
        <GlossyBlackCard accent="emerald" className="p-6 flex flex-col justify-between gap-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <img
                  src="/brand/web/swk-icon-192.webp?v=swk-8k-v1"
                  alt="SWK OS Android App Icon"
                  className="size-14 rounded-2xl border border-[#d4a955]/50 bg-[#0a0b0e] p-1.5 object-contain shadow-[0_10px_24px_rgba(0,0,0,0.5)]"
                />
                <div>
                  <div className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-[#34d399]">Android App (APK &amp; Play Store AAB)</div>
                  <h2 className="m-0 font-display text-xl font-bold text-white">SWK OS for Android</h2>
                </div>
              </div>
              <span className="rounded-full bg-[#1e6b43] px-3 py-1 text-[10.5px] font-bold text-white">Native v3</span>
            </div>

            <p className="m-0 text-xs text-white/75 leading-relaxed">
              Built natively via Capacitor (`mobile/android`) with automatic CI release builds (`.apk` for direct team install + `.aab` for Google Play), updated with the new 8K-derived SWK Properties launcher icon &amp; pure white splash screen.
            </p>

            <div className="grid grid-cols-2 gap-2.5 text-xs text-white/85">
              {[
                [QrCode, 'Camera QR Attendance'],
                [MapPin, 'Live Field Duty GPS'],
                [PhoneCall, 'WebRTC SIP Dialer'],
                [Fingerprint, 'Biometric & PIN Lock'],
              ].map(([Icon, txt]: any) => (
                <div key={txt} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2">
                  <Icon size={14} className="text-[#ebc97c] shrink-0" />
                  <span>{txt}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2.5 border-t border-white/12 pt-4">
            <div className="text-[11px] font-semibold text-white/75">Quick Install Options:</div>
            <div className="flex flex-wrap gap-2">
              <a
                href="https://github.com/swkpropertiesuae/SWKOS/actions/workflows/mobile-builds.yml"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-[#1e6b43] px-4 py-2 text-xs font-bold text-white no-underline hover:bg-[#15803d]"
              >
                <Download size={14} /> Get Latest Android APK Build <ExternalLink size={12} />
              </a>
              <button
                type="button"
                onClick={() => void copyLink()}
                className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-bold text-white cursor-pointer hover:border-[#ebc97c]"
              >
                <Sparkles size={13} className="text-[#ebc97c]" /> Chrome “Install App”
              </button>
            </div>
          </div>
        </GlossyBlackCard>

        {/* iOS App Card */}
        <GlossyBlackCard accent="gold" className="p-6 flex flex-col justify-between gap-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <img
                  src="/apple-touch-icon.png?v=swk-8k-v1"
                  alt="SWK OS iOS App Icon"
                  className="size-14 rounded-2xl border border-[#d4a955]/55 object-cover shadow-[0_10px_24px_rgba(0,0,0,0.5)]"
                />
                <div>
                  <div className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-[#ebc97c]">iOS App (iPhone &amp; iPad)</div>
                  <h2 className="m-0 font-display text-xl font-bold text-white">SWK OS for iOS</h2>
                </div>
              </div>
              <span className="rounded-full bg-[#d4a955] px-3 py-1 text-[10.5px] font-bold text-[#0a0b0e]">App Store / PWA</span>
            </div>

            <p className="m-0 text-xs text-white/75 leading-relaxed">
              Full native Xcode Capacitor project (`mobile/ios`) with the opaque glossy obsidian 1024×1024 `AppIcon-512@2x.png`, safe-area floating black dock, Face ID lock, and zero-delay Safari Home Screen app mode.
            </p>

            <div className="rounded-2xl border border-white/12 bg-white/[0.06] p-4 space-y-2 text-xs text-white/85">
              <div className="font-bold text-[#ebc97c]">Instant iPhone Install (10 Seconds, No App Store Wait):</div>
              <ol className="m-0 pl-4 space-y-1 text-white/80">
                <li>Open <code className="text-[#ebc97c]">{appUrl}</code> in <b>Safari</b> on iPhone or iPad.</li>
                <li>Tap the <b>Share</b> icon (square with arrow) at the bottom of Safari.</li>
                <li>Tap <b>Add to Home Screen</b> → <b>Add</b>. The glossy SWK icon appears immediately.</li>
              </ol>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-white/12 pt-4">
            <a
              href="https://github.com/swkpropertiesuae/SWKOS/actions/workflows/mobile-builds.yml"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-[#d4a955] px-4 py-2 text-xs font-bold text-[#0a0b0e] no-underline hover:bg-[#ebc97c]"
            >
              <Download size={14} /> Get iOS Xcode Archive CI <ExternalLink size={12} />
            </a>
            <button
              type="button"
              onClick={() => void copyLink()}
              className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-bold text-white cursor-pointer hover:border-[#ebc97c]"
            >
              <Copy size={13} /> Copy Safari URL
            </button>
          </div>
        </GlossyBlackCard>
      </div>

      {/* 8K Transparent Brand, Watermark & 100%-Visible Favicon Asset Kit */}
      <section className="card p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.18em] text-[#9e7427]">
              <ImageIcon size={13} /> Official SWK Brand Assets
            </div>
            <h3 className="m-0 mt-1 font-display text-xl font-bold text-[#0a0b0e]">
              8K Transparent Icon, 100%-Visible Favicon &amp; Watermark Kit
            </h3>
            <p className="m-0 mt-1 text-xs text-muted">
              {SWK_COMPANY_NAME} (RERA ORN {SWK_RERA_ORN}) — crisp zero-halo transparent emblem verified on both Pure White and Glossy Black.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={resolveApiUrl('/brand/swk-emblem-8k-transparent.png')} download="SWK-Emblem-8K-Transparent.png" target="_blank" rel="noopener noreferrer" className="btn green sm no-underline">
              <Download size={13} /> 8K Transparent PNG (7680×7680)
            </a>
            <a href="/favicon/favicon.svg?v=swk-8k-v1" download="swk-favicon.svg" className="btn outline sm no-underline">
              <Download size={13} /> Favicon SVG
            </a>
            <a href="/brand/swk-watermark.png?v=swk-8k-v1" download="swk-watermark.png" className="btn outline sm no-underline">
              <Download size={13} /> Watermark PNG
            </a>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-black/[0.08] bg-white p-6 flex flex-col items-center justify-center gap-3">
            <img src="/brand/web/swk-icon.png?v=swk-8k-v1" alt="SWK Emblem on Pure White" className="size-28 object-contain" />
            <div className="text-xs font-bold text-[#0a0b0e]">Pure White Background</div>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#1e6b43]"><CheckCircle2 size={12} /> Zero Halo Transparent</span>
          </div>

          <GlossyBlackCard accent="tricolor" className="p-6 flex flex-col items-center justify-center gap-3">
            <img src="/brand/web/swk-icon.png?v=swk-8k-v1" alt="SWK Emblem on Glossy Black" className="size-28 object-contain" />
            <div className="text-xs font-bold text-white">Glossy Obsidian Background</div>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#ebc97c]"><ShieldCheck size={12} /> Official Gold · Emerald · Crimson</span>
          </GlossyBlackCard>

          <div className="rounded-2xl border border-black/[0.08] bg-[#faf8f4] p-6 flex flex-col items-center justify-center gap-4">
            <div className="flex items-end gap-4">
              <img src="/favicon/favicon-16.png?v=swk-8k-v1" alt="16px" className="size-4" />
              <img src="/favicon/favicon-32.png?v=swk-8k-v1" alt="32px" className="size-8" />
              <img src="/favicon/favicon-64.png?v=swk-8k-v1" alt="64px" className="size-12" />
              <img src="/favicon/favicon-192.png?v=swk-8k-v1" alt="192px" className="size-16" />
            </div>
            <div className="text-xs font-bold text-[#0a0b0e]">Full-Bleed 100%-Visible Favicons</div>
            <span className="text-[11px] text-muted">16px · 32px · 64px · 192px · 512px · ICO · SVG</span>
          </div>
        </div>
      </section>
    </div>
  )
}
