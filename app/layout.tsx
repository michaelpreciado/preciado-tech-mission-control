import type { Metadata, Viewport } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import Script from 'next/script'
import './globals.css'
import { Shell } from '@/components/Shell'
import { getConfig } from '@/lib/config'
import { buildAccentCss } from '@/lib/theme'
import { buildTokenCss, buildFridayThemeCss, buildDensityCss } from '@/lib/tokens'

const config = getConfig()

const mono = JetBrains_Mono({
  variable: '--pt-font-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  preload: true,
  fallback: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
})

/* UI sans for all prose/body content (Phase 1 type role). */
const inter = Inter({
  variable: '--pt-font-ui',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  preload: true,
  fallback: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
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
  themeColor: '#000000',
  colorScheme: 'dark',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Read fresh per-request (not the module-level `config` above, which is
  // only resolved once at process start) so /setup saves apply on next
  // load without a server restart — same pattern buildAccentCss already uses.
  const appearance = getConfig().appearance
  const accentCss = buildAccentCss(appearance.accentColor)
  return (
    <html lang="en" data-theme="friday" data-density={appearance.density}>
      <head>
        <link rel="manifest" href="/manifest.json" />
        {/* Base design tokens first, then the runtime accent override LAST so it wins. */}
        <style id="design-tokens">{buildTokenCss()}{buildFridayThemeCss()}{buildDensityCss()}</style>
        {accentCss && <style id="friday-accent">{accentCss}</style>}
      </head>
      <body className={`${mono.variable} ${inter.variable}`}>
        <Shell
          appName={config.appName}
          appTagline={config.appTagline}
          ui={{ motion: appearance.motion, density: appearance.density, hiddenTabs: appearance.hiddenTabs, tabOrder: appearance.tabOrder, elements3d: appearance.elements3d }}
        >{children}</Shell>
        <Script src="/rain.js" strategy="lazyOnload" />
      </body>
    </html>
  )
}
