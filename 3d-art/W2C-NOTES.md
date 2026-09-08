# W2-C — Pipeline probe meshes

## Mesh design

`components/threed/pipeline-probe.ts` authors a single flat-shaded satellite:
a shallow hexagonal plate, two rectangular side panels, and a sensor mast with
a crossbar head. Five procedural solids merge into one ungrouped, non-indexed
BufferGeometry (72 triangles). Temporary geometries are disposed immediately;
the existing OrbitInstances cleanup disposes the merged geometry and material.

Only the dominant batch uses the probe. The ordinary batch retains its detail-0
icosahedron and 64-slot cap. There are no per-lead React subtrees or materials.

## Four-variant geometry atlas

The atlas holds eight scalar values. Each probe slot receives two instanced
floats; a per-vertex part ID selects panel or mast deformation in the vertex
shader. The body stays fixed. Variants follow ring membership, including when a
retained ID changes stages, and are assigned to replacement IDs only when the
old slot has faded out.

| Orbit stage group | Panel span | Mast height |
| --- | ---: | ---: |
| Prospecting / qualified / concept | 0.86 | 1.05 |
| Approval | 1.05 | 0.86 |
| Development / delivered | 1.05 | 1.05 |
| Shipped / lost | 0.90 | 0.90 |

Existing semantic instance colors, facet shading, energy, opacity, and pulse
remain intact. Atlas variants have maximum vertex radii of approximately
0.9465, 0.9507, 0.9507, and 0.8230. All fit within the previous unit-radius
geometry envelope before the unchanged scale and pulse, preserving the size
hierarchy and outer-ring / Kanban fit.

## Draw-call budget

| PipelineOrbit contribution | Before | After |
| --- | ---: | ---: |
| Ordinary lead instance batch | 1 | 1 |
| Dominant instance batch | 1 | 1 |
| Guide circles | 4 | 4 |
| Total | **6** | **6** |

These are structural main-pass counts, not a captured GPU measurement. The
merged probe has no material groups and uses one ShaderMaterial for all four
instances. The existing reusable transform, color, scales, offsets, and slot
objects are retained; atlas uploads happen on reconciliation/slot activation.

## Preservation and validation

The guarded 15-second polling, abort cleanup, slot reconciliation and fade-out,
clamped delta, exponential scale damping, static convergence stop, guide
construction, orbital velocities, fit calculation, stage colors, and layout
selection are unchanged. CoreOrb, OrbitalKanbanRing, NeuralUplink, and API routes
were not edited.

- Geometry check: four distinct atlas entries, zero geometry groups, and every
  deformed vertex inside radius 1; passed.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed (workspace-root, middleware deprecation, dynamic
  file-tracing, and experimental SQLite warnings).
- No browser visual or GPU capture was performed.
