import type { Metadata, Viewport } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import Script from 'next/script'
import './globals.css'
import { Shell } from '@/components/Shell'
import { getConfig } from '@/lib/config'
import { buildAccentCss } from '@/lib/theme'
import { buildTokenCss, buildFridayThemeCss } from '@/lib/tokens'

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
  // Custom accent (from /setup) recolors the whole token system at runtime.
  const accentCss = buildAccentCss(getConfig().appearance.accentColor)
  return (
    <html lang="en" data-theme="friday">
      <head>
        <link rel="manifest" href="/manifest.json" />
        {/* Base design tokens first, then the runtime accent override LAST so it wins. */}
        <style id="design-tokens">{buildTokenCss()}{buildFridayThemeCss()}</style>
        {accentCss && <style id="friday-accent">{accentCss}</style>}
      </head>
      <body className={`${mono.variable} ${inter.variable}`}>
        <Shell appName={config.appName} appTagline={config.appTagline}>{children}</Shell>
        <Script src="/rain.js" strategy="lazyOnload" />
      </body>
    </html>
  )
}
