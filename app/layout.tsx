import type { Metadata, Viewport } from 'next'
import { JetBrains_Mono, Noto_Sans_JP } from 'next/font/google'
import Script from 'next/script'
import './globals.css'
import './vf/v4-lane.css'
import './vf/cyberpunk.css'
import { Shell } from '@/components/Shell'
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister'
import { getConfig } from '@/lib/config'
import { buildAccentCss } from '@/lib/theme'
import { buildTokenCss, buildFridayThemeCss, buildDensityCss } from '@/lib/tokens'

const config = getConfig()

// Force dynamic rendering so /setup changes (motion/density/tab-visibility/
// 3D toggles) apply on the next page load without a full rebuild — most of
// this app's data is fetched client-side regardless of route classification.
export const dynamic = 'force-dynamic'

const mono = JetBrains_Mono({
  variable: '--pt-font-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  preload: true,
  fallback: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
})

/* Keep the UI font variable wired through Next/font, but resolve it to the
   same mono face as the terminal role per the Blue Matrix Glass theme spec. */
const inter = JetBrains_Mono({
  variable: '--pt-font-ui',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  preload: true,
  fallback: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
})

/* Japanese accent font (DESIGN-SPEC §4) — cyberpunk flavor only: brand
   kicker, section eyebrows, hero accent lines. Never body prose. */
const notoSansJp = Noto_Sans_JP({
  variable: '--mc-font-jp',
  subsets: ['latin'],
  weight: ['400', '700'],
  display: 'swap',
  preload: false,
  fallback: ['sans-serif'],
})

export const metadata: Metadata = {
  title: `${config.appName} · Mission Control`,
  description: config.appTagline,
  metadataBase: new URL('http://localhost:4176'),
  icons: {
    icon: [{ url: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: config.appName,
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  // Android Chrome URL-bar show/hide resizes the visual viewport only
  // (100dvh chrome stays put) instead of reflowing the whole layout —
  // the single biggest Android scroll-jank fix for a 100dvh app shell.
  interactiveWidget: 'resizes-content',
  themeColor: '#07080b',
  colorScheme: 'dark',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Read fresh per-request (not the module-level `config` above, which is
  // only resolved once at process start) so /setup saves apply on next
  // load without a server restart — same pattern buildAccentCss already uses.
  const appearance = getConfig().appearance
  const accentCss = buildAccentCss(appearance.accentColor)
  return (
    <html lang="en" data-theme="friday" data-density={appearance.density} data-motion={appearance.motion}>
      <head>
        <link rel="manifest" href="/manifest.json" />
        {/* Runtime API base for portable/cloud mode (MC_API_BASE env): lets one
            build run local (same-origin) or cloud (relayed) without rebuilding.
            NEXT_PUBLIC_API_BASE in lib/api-base is the build-time fallback. */}
        <script
          dangerouslySetInnerHTML={{ __html: `window.__MC_API_BASE__=${JSON.stringify(process.env.MC_API_BASE ?? '')};` }}
        />
        {/* Base design tokens first, then the runtime accent override LAST so it wins. */}
        <style id="design-tokens">{buildTokenCss() + buildFridayThemeCss() + buildDensityCss()}</style>
        {accentCss && <style id="friday-accent">{accentCss}</style>}
      </head>
      <body className={`${mono.variable} ${inter.variable} ${notoSansJp.variable}`}>
        <Shell
          appName={config.appName}
          appTagline={config.appTagline}
          ui={{ motion: appearance.motion, density: appearance.density, hiddenTabs: appearance.hiddenTabs, tabOrder: appearance.tabOrder, elements3d: appearance.elements3d }}
        >
          <span className="v4-scanline" aria-hidden="true" />
          {children}
        </Shell>
        <Script src="/v4-scroll.js" strategy="afterInteractive" />
        <Script src="/rain.js" strategy="lazyOnload" />
        <ServiceWorkerRegister />
      </body>
    </html>
  )
}
