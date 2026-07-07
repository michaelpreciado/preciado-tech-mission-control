export default function Loading() {
  return (
    <div className="mission-loading flex min-h-[60vh] items-center justify-center">
      <div className="loading-console text-center" role="status" aria-live="polite">
        <div className="loading-core mb-5" aria-hidden="true">
          <span />
          <i />
          <b />
        </div>
        <p className="micro text-cyan-200">Indexing Systems</p>
        <p className="mono mt-2 text-[10px] uppercase tracking-[.22em] text-slate-500">signal handshake / standby</p>
      </div>
    </div>
  )
}
