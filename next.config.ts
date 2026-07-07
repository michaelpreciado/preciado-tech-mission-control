import type { NextConfig } from 'next'

const IS_DEV = process.env.NODE_ENV !== 'production'

// 'unsafe-eval' is required by Next.js HMR in development but must be excluded in production
const scriptSrc = IS_DEV
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
  : "script-src 'self' 'unsafe-inline'"

// Extra origins allowed to hit the dev server (e.g. a LAN/VPN IP),
// comma-separated: FRIDAY_DEV_ORIGINS=192.168.1.20,my-host.local
const devOrigins = (process.env.FRIDAY_DEV_ORIGINS ?? '')
  .split(',').map(s => s.trim()).filter(Boolean)

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(devOrigins.length ? { allowedDevOrigins: devOrigins } : {}),
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
  experimental: {
    optimizeCss: true,
  },
  headers: async () => [
    {
      source: '/:path*',
      headers: [
        { key: 'X-DNS-Prefetch-Control', value: 'on' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-XSS-Protection', value: '0' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        {
          key: 'Content-Security-Policy',
          value: [
            "default-src 'self'",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            scriptSrc,
            "font-src 'self' data: https://fonts.gstatic.com",
            "img-src 'self' data: blob:",
            "media-src 'self'",
            "connect-src 'self' https://wttr.in",
            "frame-src 'none'",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
          ].join('; '),
        },
      ],
    },
  ],
}

export default nextConfig
