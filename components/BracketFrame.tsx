export function BracketFrame({ className }: { className?: string }) {
  return (
    <div className={['mc-brk', className].filter(Boolean).join(' ')} aria-hidden="true">
      <i className="tl" /><i className="tr" /><i className="bl" /><i className="br" />
    </div>
  )
}
