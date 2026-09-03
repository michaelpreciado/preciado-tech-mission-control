'use client'

import { useEffect } from 'react'
import { buildTokenCss, buildFridayThemeCss } from '@/lib/tokens'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Global app error:', error)
  }, [error])

  // The root layout is NOT mounted when this boundary renders, so its
  // design-tokens <style> is absent here. Emit the same token block from
  // lib/tokens.ts (single writer) plus the boundary's own classes — all
  // values resolve through --pt-* variables, nothing hardcoded.
  const css = `
    .ge-body {
      margin: 0;
      background: var(--pt-bg);
      color: var(--pt-text);
    }
    .ge-screen {
      min-height: 100dvh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--pt-s-8);
    }
    .ge-panel {
      max-width: 28rem;
      width: 100%;
      padding: var(--pt-s-8);
      text-align: center;
      border-radius: var(--pt-r-lg);
      border: 1px solid color-mix(in srgb, var(--pt-error) 30%, transparent);
      background: color-mix(in srgb, var(--pt-error) 8%, var(--pt-surface));
      box-shadow: var(--pt-glow-sm);
    }
    .ge-mark {
      margin-bottom: var(--pt-s-4);
      font-family: var(--pt-font-mono);
      font-size: 3rem;
      line-height: 1;
      color: var(--pt-error);
    }
    .ge-title {
      margin: 0 0 var(--pt-s-2);
      font-family: var(--pt-font-mono);
      font-weight: 700;
      font-size: var(--pt-fs-h3);
      color: var(--pt-error-ink);
    }
    .ge-copy {
      margin: 0 0 var(--pt-s-4);
      font-size: var(--pt-fs-sm);
      line-height: var(--pt-lh-body);
      color: var(--pt-text-dim);
    }
    .ge-ref {
      margin: 0 0 var(--pt-s-4);
      font-family: var(--pt-font-mono);
      font-size: var(--pt-fs-xs);
      color: var(--pt-error);
      opacity: 0.6;
      word-break: break-all;
    }
    .ge-btn {
      cursor: pointer;
      padding: var(--pt-s-3) var(--pt-s-6);
      font-family: var(--pt-font-mono);
      font-size: var(--pt-fs-sm);
      font-weight: 600;
      color: var(--pt-error-ink);
      border-radius: var(--pt-r-md);
      border: 1px solid color-mix(in srgb, var(--pt-error) 40%, transparent);
      background: color-mix(in srgb, var(--pt-error) 20%, transparent);
      transition: background var(--pt-dur-fast) var(--pt-ease);
    }
    .ge-btn:hover {
      background: color-mix(in srgb, var(--pt-error) 32%, transparent);
    }
  `

  return (
    <html lang="en" data-theme="friday">
      <head>
        <style id="design-tokens">{buildTokenCss() + buildFridayThemeCss()}</style>
        <style>{css}</style>
      </head>
      <body className="ge-body">
        <div className="ge-screen">
          <div className="ge-panel">
            <div className="ge-mark" aria-hidden="true">
              &#x25A3;
            </div>
            <h2 className="ge-title">Critical System Failure</h2>
            <p className="ge-copy">
              Mission Control hit a fault boundary. Reboot the interface when ready.
            </p>
            {error.digest && <div className="ge-ref">ref: {error.digest}</div>}
            <button onClick={reset} className="ge-btn">
              Reboot Interface
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}