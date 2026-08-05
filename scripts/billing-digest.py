#!/usr/bin/env python3
"""Mission Control — weekly billing digest. Fetches the live costs payload and
prints a Telegram-friendly markdown summary. Intended to run from a cron and
deliver its stdout verbatim."""
import json, urllib.request, datetime

def get(url):
    req = urllib.request.Request(url, headers={'Accept': 'application/json'})
    return json.load(urllib.request.urlopen(req, timeout=15))

def month_name(s):
    try:
        return datetime.date.fromisoformat(s + '-01').strftime('%b %Y')
    except Exception:
        return s

def fmt_tokens(n):
    if n is None:
        return '—'
    if n >= 1e9: return f'{n/1e9:.2f}B'
    if n >= 1e6: return f'{n/1e6:.1f}M'
    if n >= 1e3: return f'{n/1e3:.1f}K'
    return str(n)

def money(x):
    return f'${x:,.2f}' if x is not None else 'n/a'

try:
    costs = get('http://localhost:4176/api/mission-control').get('costs', {})
except Exception as e:
    print(f'⚠ Mission Control unreachable ({e}).')
    raise SystemExit(0)  # empty-ish: avoid a scary fail; keep it visible anyway

billing = costs.get('billing', [])
orl = costs.get('openRouterLive', {}) or {}
fresh = costs.get('freshness', {}) or {}

lines = ['💰 **Mission Control · Weekly Billing Digest**',
         f"_generated {datetime.datetime.now().strftime('%a %b %d, %Y')}_", '']

if not billing:
    lines.append('No billing data yet — check the Costs tab.')
else:
    for b in billing:
        orn = money(b.get('openRouterUsd')) if b.get('openRouterUsd') is not None else 'n/a (no history)'
        real = (b.get('planAmount') or 0) + (b.get('openRouterUsd') or 0)
        is_cur = ' · current' if (costs.get('subscription') or {}).get('month') == b.get('month') else ''
        lines.append(f"**{month_name(b.get('month'))}**{is_cur} — {b.get('plan')}")
        lines.append(f"  · plan cost: **{money(b.get('planAmount'))}**")
        lines.append(f"  · openrouter billed: {orn}")
        lines.append(f"  · tokens: {fmt_tokens(b.get('totalTokens'))}  "
                     f"({fmt_tokens(b.get('claudeTokens'))} claude · {fmt_tokens(b.get('apiTokens'))} api · {fmt_tokens(b.get('localTokens'))} local)")
        lines.append(f"  · **real month cost: {money(real)}**")
        lines.append('')

if orl.get('usageLifetime') is not None:
    lines.append(f"OpenRouter lifetime billed: **{money(orl.get('usageLifetime'))}**")

if fresh.get('lastLoggedAt'):
    sd = fresh.get('staleDays')
    flag = '⚠ ' if (sd is not None and sd > 3) else ''
    lines.append(f"{flag}last usage logged: {fresh['lastLoggedAt'][:10]} ({sd}d ago)")
    if sd is not None and sd > 3:
        lines.append('_Cost data may be stale — check the collector._')

print('\n'.join(lines))
