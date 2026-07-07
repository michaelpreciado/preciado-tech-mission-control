# Contributing to F.R.I.D.A.Y.

Framework for Running Intelligent Deployed Agents — maintained by [Michael Preciado](https://github.com/michaelpreciado). Issues and PRs welcome.

## Ground rules

- **v1 scope is the dashboard.** Orchestration, built-in agents, and marketplaces live on the roadmap — PRs that add them will be parked until v2.
- **Local-first is non-negotiable.** No telemetry, no phoning home, no keys leaving the machine.
- **Degrade gracefully.** Any collector you touch must return an empty-but-valid shape when its backend is missing — never a 500, never a blank page.
- **Never commit secrets or personal data.** `data/`, `.env*`, and `data/config.json` are gitignored for a reason.

## Workflow

1. Fork and branch: `git checkout -b feat/your-idea`
2. `npm install && npm run dev`
3. Keep `npm run build` (exit 0), `npm run typecheck`, and `npm test` green
4. Test mobile at a real 375px viewport, not just desktop
5. Conventional Commits preferred: `feat:`, `fix:`, `docs:`, `chore:`
6. Open a PR with a clear description (screenshots for UI changes)

## Code style

- Match the surrounding code — monospace/neon design tokens live in `app/globals.css` (`--pt-*`)
- All paths/URLs/keys resolve through `lib/config.ts`; nothing machine-specific may be hardcoded

## License

MIT — see [LICENSE](LICENSE).
