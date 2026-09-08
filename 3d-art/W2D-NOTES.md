# W2-D — Kanban task tokens

## Token design

`components/threed/task-token.ts` creates one shared indexed LatheGeometry and one
ShaderMaterial per mounted ring. The closed 24-sided chip has radius 1, thickness
0.36, and a two-step bevel on both faces. It lies in the existing XY ring plane.
The geometry contains 200 vertices / 336 triangles and no material groups.
An opaque, depth-writing body uses subtle local normal shading; the outer bevel
gets a modest self-emissive contribution in the same fragment shader. There is
no separate rim object, texture, light, bloom pass, or per-token material.

## Color mapping and preserved semantics

The unchanged `layoutKanbanRing` mapping supplies `node.color` through
`instanceColor`: doing/active uses info, pending/unknown statuses use accent,
done/archived uses success, and blocked/failed or positive failure counts use
error. The unchanged `nodeEnergy` attribute carries failure state and 0.35 energy
for nonfailed completed tasks. Failure pulse formula, elapsed time, and reduced
motion gate are preserved exactly; opaque alpha is now 1.

The integration changes only the geometry/material factories. It preserves the
96-node cap, 15-second visibility/online-aware polling, lane radii 1.6/2.3/3.0,
tilted coplanar group, priority scale, aggregate counts and arc sweeps, 96 segments
per arc, 0.1-second delta clamp, exponential scale damping with finite settling,
demand invalidation, scratch reuse, and explicit geometry/material/arc disposal.

## Draw calls

Before: one instanced bead draw + zero to three arc draws = at most four.
After: one instanced token draw + zero to three arc draws = at most four.
This follows from the unchanged single InstancedMesh, one material, and zero
geometry groups; it is a structural check, not a captured GPU measurement.
Geometry cost increases from 20 to 336 triangles per instance (32,256 at the cap).

## Nudge wiring

The optional status-change nudge is omitted. No new animation state or motion
loop is introduced. Existing scale reconciliation by ID, damping, and failure
energy continue to drive the tokens; no additional lib/motion wiring is needed.
No page-level preview mount or changes to CoreOrb, PipelineOrbit, NeuralUplink,
or API routes were made.

## Validation

- `npx tsc --noEmit`: passed.
- `npm run build`: passed, including TypeScript and page generation. Build emitted
  workspace-root/lockfile, middleware convention, NFT tracing, and experimental
  SQLite warnings.
- Node geometry/material assertions: passed (finite positions/normals, 96 energy
  entries, no groups, shallow Z bounds, opaque material with depth writes).
- `git diff --check`: passed.
- No browser visual review or GPU frame capture was performed.
