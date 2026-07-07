import type { Metadata, Viewport } from 'next'
import { JetBrains_Mono } from 'next/font/google'
import Script from 'next/script'
import './globals.css'
import { Shell } from '@/components/Shell'
import { getConfig } from '@/lib/config'

const config = getConfig()

const mono = JetBrains_Mono({
  variable: '--pt-font-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  preload: true,
  fallback: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
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
  return (
    <html lang="en" data-theme="friday">
      <head>
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body className={mono.variable}>
        <Shell appName={config.appName} appTagline={config.appTagline}>{children}</Shell>
        <Script src="/rain.js" strategy="lazyOnload" />
      </body>
    </html>
  )
}
