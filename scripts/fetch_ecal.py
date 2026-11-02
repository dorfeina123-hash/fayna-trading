"""Mirror the ForexFactory weekly calendar into the market-data branch.

The browser cannot read nfs.faireconomy.media directly (no CORS headers) and the
public proxies the app used have closed. This runs on a schedule in GitHub Actions,
saves ecal/thisweek.json, and keeps the previous week as ecal/lastweek.json, so the
app reads both from raw.githubusercontent.com (which allows CORS).
"""
import json, os, sys, urllib.request

out = os.path.join(sys.argv[1] if len(sys.argv) > 1 else '.', 'ecal')
os.makedirs(out, exist_ok=True)
req = urllib.request.Request('https://nfs.faireconomy.media/ff_calendar_thisweek.json',
                             headers={'User-Agent': 'Mozilla/5.0 (fayna-trading calendar mirror)'})
with urllib.request.urlopen(req, timeout=30) as r:
    data = json.load(r)
if not isinstance(data, list) or not data:
    sys.exit('empty feed, keeping the saved copy')

def week_of(events):
    return min(str(e.get('date', ''))[:10] for e in events)

this_path, last_path = os.path.join(out, 'thisweek.json'), os.path.join(out, 'lastweek.json')
try:
    with open(this_path, encoding='utf-8') as f:
        prev = json.load(f)
    if isinstance(prev, list) and prev and week_of(prev) != week_of(data):
        with open(last_path, 'w', encoding='utf-8') as f:
            json.dump(prev, f, ensure_ascii=False)
except FileNotFoundError:
    pass
with open(this_path, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False)
print(len(data), 'events, week of', week_of(data))
