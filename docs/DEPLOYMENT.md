# Mission Control — Deployment & Portable/Cloud Guide

Mission Control is one codebase that runs in three tiers of exposure, from
"just my desktop" to "publicly reachable PWA on my phone." All of them use the
same `git` repo — no forking, no separate branch. This document explains the
modes, the new env knobs, and the Android/TWA foundation.

## Architecture in one paragraph

Mission Control's collectors are local by nature — they read SSDs, SQLite DBs,
session logs, cron files, and SSH into your MacBook. You cannot lift that to a
VPS. So the cloud/portable model keeps the **data on the home box** and ships a
thin **UI-only instance** of the same app to the cloud that relays every API call
back home. Authentication: the home box trusts loopback + your Tailnet, and a new
session-cookie login gate (+ optional static-IP allowlists) protects everything
beyond that. A PWA manifest + service worker make it installable on Android today
(and a TWA wrapper later).

```
         LAN / Tailscale (default)
   phone ──▶ 10.0.0.x / 100.x.x.x:4176 ──▶ home MC (collectors here)
                    trusted IP OR session cookie

         Cloud / portable (PWA)
   phone ──▶ https://mc.example.com ──▶ cloud MC (UI only)
                 session cookie          │
                 /api/upstream/* ─────┘
                                          relay + Bearer ──▶ home MC (collectors)
```

## Modes

### 1. Local / loopback (default, no change)
Serve on `localhost` only. Nothing new required. Write routes stay gated to
loopback / trusted IPs as before. Auth (middleware/login) is OFF unless
`MC_AUTH_PASSWORD` is set.

### 2. LAN / Tailscale (default remote, recommended for your phone)
`next start -H 0.0.0.0` and browse from any device on your Tailnet / LAN.
Either set `FRIDAY_TRUSTED_IPS` (e.g. `100.64.0.0/10`) for a frictionless
experience, **or** set `MC_AUTH_PASSWORD` and log in once per browser. The
existing systemd unit already binds `0.0.0.0` and the Tailscale IP
(`http://100.79.84.9:4176`) is what your Pixel Fold hits.

### 3. Cloud / UI-only instance (portable PWA)
Deploy the SAME repo to a small VPS (or Vercel-style host). On that instance:
- `API_RELAY_BASE=https://<home-tailnet-or-tunnel>:4176` — where the home MC lives.
- `API_RELAY_TOKEN=<INTERNAL_API_SECRET from home>` (or set the same
  `INTERNAL_API_SECRET` on both — the relay uses whichever is present).
- `MC_API_BASE=/api/upstream` — tells the UI to fetch everything through the relay.
- `MC_AUTH_PASSWORD=…` + `MC_SESSION_SECRET=…` — the public login gate.

The cloud instance is the SAME build; its local `/api/*` routes exist but are
never called (the UI is pointed at `/api/upstream/*`). You can run a single
build everywhere and flip modes with runtime envs (no rebuild).

Build once, run anywhere:
```bash
npm run build                       # one build serves all modes
MC_API_BASE=/api/upstream API_RELAY_BASE=... MC_AUTH_PASSWORD=... npm run start    # cloud
npm run start                       # local/Tailscale (no envs)
```

## Auth (non-loopback access)

Enable with `MC_AUTH_PASSWORD`. Once set:

- Every page and API route beyond loopback + `FRIDAY_TRUSTED_IPS` requires an
  httpOnly, SameSite session cookie.
- Untrusted visitors are redirected to a `/login` page; the API returns 401.
- The service bearer (`INTERNAL_API_SECRET`) is accepted for `/api/*` so the
  cloud relay can authenticate server-side (browsers use the cookie instead).
- Sessions last 30 days; `MC_SESSION_SECRET` signs them (falls back to
  `INTERNAL_API_SECRET` then the password itself — set it explicitly to make
  rotating the password revoke sessions).

Security notes:
- **TLS.** The cookie is `Secure` only when the request is https. Behind a proxy or
  `tailscale cert`, terminate TLS and it's Secure automatically; over plain Tailscale
  HTTP the cookie is sent in the clear on your private network (acceptable if your
  tailnet is private — bump to HTTPS via `tailscale cert` for the paranoid).
- **Proxy TLS**: put Caddy/nginx in front of the cloud instance and it will set
  `x-forwarded-proto` — the cookie becomes Secure. Always use HTTPS for anything
  public.

## Env reference (new)

| Variable | Where | Purpose |
|---|---|---|
| `MC_AUTH_PASSWORD` | home + cloud | Enable login gate (empty = disabled) |
| `MC_SESSION_SECRET` | both | HMAC session-signing secret |
| `INTERNAL_API_SECRET` | both | Existing write/relay bearer; session secret fallback |
| `MC_API_BASE` | cloud (runtime) | UI API base; `''` = same-origin |
| `NEXT_PUBLIC_API_BASE` | build-time | Build-time variant of `MC_API_BASE` |
| `API_RELAY_BASE` | cloud only | Home MC instance the relay targets |
| `API_RELAY_TOKEN` | cloud only | Upstream auth for the relay (defaults to `INTERNAL_API_SECRET`) |
| `FRIDAY_TRUSTED_IPS` | both | CIDR allowlist bypassing the login gate |

Set them via the systemd drop-in below, or an env file, or `start.sh` envs.

## Systemd (the live unit, port 4176)

The unit is `~/.config/systemd/user/mission-control.service`. Rather than editing
it, add a drop-in for envs:

```ini
# ~/.config/systemd/user/mission-control.service.d/portable.conf
[Service]
# '-' prefix = ignore if absent
EnvironmentFile=-/home/mp/Documents/mission-control/.env.production
```

```bash
mkdir -p ~/.config/systemd/user/mission-control.service.d
cp <that file> ~/.config/systemd/user/mission-control.service.d/portable.conf
systemctl --user daemon-reload
systemctl --user restart mission-control
```

Then `/home/mp/Documents/mission-control/.env.production` (gitignored —
mirror the commented keys in `.env.example`) holds everything. A unit restart is
required for env changes (env is read at process start).

## Android / TWA foundation

Already present in the repo:
- `public/manifest.json` — name, `id`, `scope`, icons (192/512 + maskable),
  `display: standalone`, `launch_handler`.
- `public/sw.js` — conservative service worker: network-first for pages,
  stale-while-revalidate for static assets, **never intercepts `/api/*`** (preserves
  live data + SSE).
- `app/layout.tsx` registers the SW and injects the runtime API base.

**Install as a PWA today:** open the deployed site in Android Chrome → Add to Home
screen. From there a **TWA** wrapper (Bubblewrap / PWABuilder) can be built
later to give it a launcher icon, fullscreen, and Play-Signing — works for both
the Tailnet (HTTPS via `tailscale cert` + trust) and the cloud instance.

## Verification checklist after a change

```bash
npm run typecheck && npm test && npm run build
systemctl --user restart mission-control        # or: reload if only CSS changed
curl -s localhost:4176/api/mission-control | head -c 120
curl -s -o /dev/null -w '%{http_code}\n' localhost:4176/team        # 200
curl -s -o /dev/null -w '%{http_code}\n' localhost:4176/login       # 200
```

With auth on, verify the gate from a non-trusted source (simulate by spoofing
the forwarded IP):
```bash
# 401 (no session)
curl -s -o /dev/null -w '%{http_code}\n' -H 'X-Forwarded-For: 203.0.113.5' localhost:4176/api/mission-control
# cookie present → 200
curl -s -c /tmp/cj -H 'X-Forwarded-For: 203.0.113.5' -H 'Content-Type: application/json' \
     -d '{"password":"…"}' localhost:4176/api/auth/login
curl -s -o /dev/null -w '%{http_code}\n' -b /tmp/cj -H 'X-Forwarded-For: 203.0.113.5' localhost:4176/api/mission-control
```

## Troubleshooting

- **Login loops / cookie not set:** the cookie is `Secure` on https only. If you
  test over http on a non-`localhost` host, it's fine; if the page is https but
  the API is http, they're different origins — keep them the same.
- **Relay 404s on the cloud instance:** `API_RELAY_BASE` unset. The route only
  activates when it's set; otherwise it intentionally 404s (and never shadows local
  routes).
- **Relay 502s:** home unreachable or refused the bearer. Confirm `API_RELAY_TOKEN`
  / `INTERNAL_API_SECRET` matches home and home is up.
- **Data looks stale through the relay:** the home box rate-limits per client IP;
  the relay preserves the original `x-forwarded-for`, so your phone still gets its
  own budget. If you see 429s, the forwarded chain isn't reaching home.
