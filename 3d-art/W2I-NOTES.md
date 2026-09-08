# W2-I — boot sequence + fault console

Periwinkle `#9db4ec` on `#07080b`, using the existing JetBrains Mono font and W2-G `AsciiTerminalArt` export. No dependencies added.

## Sequence copy and timing

- PRECIAO TECH BIOS v7.2 ... OK
- CREW LINK ............ 4 ONLINE
- HERDR SOCKETS ........ LIVE
- KANBAN QUEUE ......... SYNCED
- ORBITAL RENDER ....... OK
- MISSION CONTROL READY

Lines start every 180ms, type (including dot leaders) over 170ms, and land from 16% to 78% opacity. The final line lands at 1,070ms. Block cursors blink twice per line; all animations terminate. These are theatrical POST labels, not live system telemetry. Route loading yields to Next.js content as soon as it is ready; it does not impose a minimum wait or falsely dismiss pending content.

The root overlay checks `sessionStorage["mc:boot:w2i"]` before mounting any overlay UI. Server output and initial hydration contain no overlay and never hold back the shell. The first eligible visit shows 1,200ms of boot followed by a 300ms opacity fade, then returns null with no persistent wrapper. Click or any key starts dismissal. All timers/listeners are cleaned up. Storage failure skips the overlay. Repeat visits have no overlay, typing animations, or dismissal timers.

## Fault console

Both failures share a 46-column box-drawing frame. 404 reads `SIGNAL LOST // SECTOR NOT FOUND`; error reads `KERNEL FAULT // RECOVERY INITIATED`. Only `FAULT` uses semantic red `#ff5f57`. Status flicker uses two stepped opacity frames, twice over 480ms total, then stops. Retry retains the route reset handler; 404 links home. Decorative frame is hidden from assistive technology, with a full status heading supplied separately.

## Reduced motion and accessibility

Reduced motion shows the complete static loading readout with no cursor and a static fault status. It skips the first-load overlay entirely, including if the preference changes while active. Loading exposes a single stable status label rather than announcing every character. The overlay uses z-index 150 (shell navigation is 100; drawers and palette are 200/300), and yields visibility whenever a dialog is open, including dialogs nested in shell stacking contexts. Keyboard focus remains with the shell; the decorative overlay never captures focus.

## Validation

- `npx tsc --noEmit`: passed.
- `npm run build`: passed. Existing workspace-root, middleware deprecation, NFT tracing, and experimental SQLite warnings remain.
