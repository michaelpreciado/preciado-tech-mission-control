#!/usr/bin/env python3
"""Mission Control — month-end plan confirmation. Reads the current Claude
subscription schedule from data/config.json and reminds the owner to confirm
next month's plan. Runs monthly via cron; stdout is delivered verbatim."""
import json, os, datetime

CFG = os.path.join('/home/mp/Documents/mission-control', 'data', 'config.json')

def load():
    try:
        return json.load(open(CFG))
    except Exception:
        return {}

def month_key(dt):
    return dt.strftime('%Y-%m')

d = load()
billing = d.get('billing', {})
subs = billing.get('subscriptions', {})
default = billing.get('defaultPlan', {})

now = datetime.date.today()
cur_key = month_key(now)
# next month
if now.month == 12:
    nxt = now.replace(year=now.year + 1, month=1)
else:
    nxt = now.replace(month=now.month + 1)
nxt_key = month_key(nxt)

cur = subs.get(cur_key, default)
nxt_plan = subs.get(nxt_key, default)

lines = ['🗓 **Mission Control · Month-End Plan Check**',
         f"_today {now.strftime('%b %d, %Y')}_", '',
         f"Current month ({now.strftime('%b %Y')}): **{cur.get('plan')} — {cur.get('amount')}$**",
         f"Next month ({nxt.strftime('%b %Y')}): **{nxt_plan.get('plan')} — {nxt_plan.get('amount')}$**",
         '',
         'Reminder: reply here to set next month’s Claude plan (e.g. "Max 125" or "Pro 20"),',
         'or leave it — the default applies. Plans live in `data/config.json → billing` (no code edits).']
print('\n'.join(lines))
