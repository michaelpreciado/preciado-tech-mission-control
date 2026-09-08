import Link from 'next/link'
import { FaultConsole } from '@/components/boot/FaultConsole'

export default function NotFound() {
  return (
    <FaultConsole kind="404">
      <p>This sector is off the grid. Check the route or return to base.</p>
      <Link href="/" className="boot-action">[ RETURN TO MISSION CONTROL → ]</Link>
    </FaultConsole>
  )
}
