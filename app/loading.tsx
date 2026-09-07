import { AsciiConsole } from './vf/Ascii'

export default function Loading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center" role="status" aria-live="polite">
        <AsciiConsole state="SCANNING" />
        <div className="v4-legacy-mark pt-loading-core mb-5" aria-hidden="true">
          <span />
          <i />
          <b />
        </div>
        <p className="pt-micro pt-info">Indexing Systems</p>
        <p className="pt-micro pt-sub mt-2">signal handshake / standby</p>
      </div>
    </div>
  )
}