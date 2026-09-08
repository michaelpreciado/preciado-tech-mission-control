# W2-E — Holo dispatch bodies

## Bodies

- `components/threed/dispatch-hub.ts`: procedural hexagonal command dais with wide console wings, a lower plinth, and a raised crown antenna. Used for Jarvis (or the fallback hub).
- `components/threed/agent-chassis.ts`: recessed central face, shoulder rails, and split feet. Used for agents including Hermes. Both factories merge simple low-poly parts and immediately dispose the temporary geometries. No GLB, external assets, or dependencies.
- A single shared metallic/rough body material uses instance colors for state and selection. Agents, hub, and task octahedra use three instanced meshes; connectors use one merged mesh. Gentle working-agent breathing replaces error flashing and automatic orbiting.

## Risk fixes

- `HOLO_NODE_CAP = 24` in `components/threed/holo-config.ts` bounds the entire visual roster, including root and hub. IDs are deduplicated; Hermes/Jarvis get priority, then telemetry order. At most 24 labels and 24 task markers. The full HTML roster is intentionally retained without truncation.
- Grid positions are assigned to every agent, including unknown IDs, instead of stacking unknown agents at the origin. Scene scale fits the viewport.
- Old merged branch geometry is disposed on every data replacement and unmount. Shared body/task geometry and materials are disposed when the scene unmounts; automatic disposal is disabled on their mesh group to avoid duplicate ownership.
- ContactShadows removed entirely. Branch segmentation reduced to 12 longitudinal / 4 radial segments, and all branches/task links share one draw call/material.
- HTML projection is limited to one truncated, noninteractive name per visible node. Task labels, icons, click targets, and cluster projections were removed; detailed text stays in the roster.
- Page visibility and IntersectionObserver gates unmount Canvas when hidden/offscreen. Listeners and observers are cleaned up. Closing the host or disabling teamGraph unmounts the panel.
- CoreOrb's matchMedia/visibility approach is reused locally without modifying CoreOrb. OS reduced motion and UI motion `reduced`/`off` select demand rendering, static bodies/tasks, and no control damping. No automatic rotation.
- DPR capped at 1.5. SubAgentPanel and HoloHud3D both load dynamically with SSR disabled. WebGL fallback/error boundary keeps the roster usable if rendering fails.

## Host and accessibility

- `/bots` has a default-closed “Holo dispatch view” button with aria-expanded/aria-controls. Opening mounts SubAgentPanel with initialHolo enabled; closing releases it. Available even while the bots endpoint is loading/unreachable. No /team route added.
- `elements3d.teamGraph` remains authoritative; disabled settings show explanatory text and do not mount telemetry/WebGL.
- Canvas and its projected labels are aria-hidden, with no hidden buttons or links. Orbit gestures are optional decoration.
- The complete visible roster stays alongside holo. Native buttons retain Enter/Space behavior; listitem roles moved to wrappers so they no longer override button semantics. Selection opens the existing detail sheet and highlights a mapped agent. State text/glyphs convey information without relying on color.

## Validation

- `npx tsc --noEmit`: passed.
- `npm run build`: passed, including /bots. Nonfatal repository/toolchain warnings: multiple lockfile root inference, deprecated middleware convention, broad NFT tracing through next.config.ts, experimental SQLite.
- No browser visual/a11y automation run; viewport fitting and interaction gates reviewed in code.
- Protected components, API routes, and dependencies unchanged.
