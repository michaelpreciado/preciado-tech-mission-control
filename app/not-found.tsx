import Link from 'next/link'

// Rendered inside the root layout, so design tokens + globals.css are mounted.
// All styling flows through the token-backed pt-fault-* classes.
export default function NotFound() {
  return (
    <div className="pt-fault-screen">
      <div className="pt-fault-panel">
        <div className="pt-404-mark mb-4" aria-hidden="true">
          404
        </div>
        <h2 className="pt-fault-title">Signal Lost</h2>
        <p className="pt-fault-copy">
          The page you requested is off the grid. It may have moved, or it never existed.
        </p>
        <p className="pt-micro pt-sub mb-4">route not found / no transmission</p>
        <Link href="/" className="pt-fault-btn">
          Return to Mission Control
        </Link>
      </div>
    </div>
  )
}