# 3D WAVE 1 — A3: MOTION + CAMERA LANGUAGE
Repo: /home/mp/.mc-3d/a3-motion (pinned worktree). three.js ^0.185.1.
GOAL: a reusable motion/choreography kit for orbs and 3D UI, dependency-free. Work ONLY in NEW files under lib/motion/ + a demo 3d-art/ — do not touch existing components/pages.
Build:
1. lib/motion/easings.ts — curated easing curves (smooth-out, springy-settle, elastic-in-out, exponential), each a (t)=>number fn with a one-line doc.
2. lib/motion/useDamped.ts — a tiny damped-spring hook (no deps) returning a value that chases a target with configurable stiffness/damping; expose useSpringTarget.
3. lib/motion/camera.ts — cameraRig helpers: a smooth-orbit target (lat/lon/height chasing with damping), a "nudge" (ease a short push-in and settle back), and a lookAt-damp util. Pure functions + one rAF-loop helper `makeDampedLoop(cbs)`.
4. lib/motion/choreography.ts — sequence/timeline helper: chain timed animations (for orb entrance, kanban-ring stagger), cancellable.
Every module gets a 3-line usage example in the file header. No DOM writes except where a hook owns a value; keep it three-agnostic (usable with three.js Object3D or plain numbers).
OUTPUT: 3d-art/MOTION.md summarizing the API + recommended values for: orb idle pulse, button hover-press, kanban-ring orbit speed, camera nudge on status change. End with: "A3 MOTION: COMPLETE (4 modules)".
