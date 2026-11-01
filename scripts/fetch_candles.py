#!/usr/bin/env python3
"""Collects futures candles into monthly JSON files: <out>/<ROOT>/<interval>/<YYYY-MM>.json
Each file is a list of [time, open, high, low, close, volume], time in UTC seconds.
Yahoo keeps 1m bars for days and 5m bars for weeks, so every run merges into what is
already saved and the history grows. The source is unofficial; replace it before charging."""
import datetime, json, pathlib, sys, time, urllib.request

ROOTS = ['MNQ', 'NQ', 'MES', 'ES']
INTERVALS = {'1m': '7d', '5m': '60d', '1h': '730d'}
URL = 'https://query1.finance.yahoo.com/v8/finance/chart/{root}=F?interval={interval}&range={range}'


def fetch(root, interval):
    url = URL.format(root=root, interval=interval, range=INTERVALS[interval])
    request = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(request, timeout=30) as response:
        result = json.load(response)['chart']['result'][0]
    quote = result['indicators']['quote'][0]
    rows = zip(result['timestamp'], quote['open'], quote['high'], quote['low'], quote['close'], quote['volume'])
    return [[t, o, h, l, c, v or 0] for t, o, h, l, c, v in rows if None not in (o, h, l, c)]


def month(t):
    return datetime.datetime.fromtimestamp(t, datetime.timezone.utc).strftime('%Y-%m')


def merge(out, root, interval, bars):
    months = {}
    for bar in bars:
        months.setdefault(month(bar[0]), []).append(bar)
    for key, new in months.items():
        path = pathlib.Path(out, root, interval, key + '.json')
        path.parent.mkdir(parents=True, exist_ok=True)
        old = json.loads(path.read_text()) if path.exists() else []
        joined = {bar[0]: bar for bar in old}
        joined.update({bar[0]: bar for bar in new})
        path.write_text(json.dumps([joined[t] for t in sorted(joined)], separators=(',', ':')))


def main(out):
    failed = 0
    for root in ROOTS:
        for interval in INTERVALS:
            try:
                bars = fetch(root, interval)
                merge(out, root, interval, bars)
                print(root, interval, len(bars))
            except Exception as error:
                failed += 1
                print(root, interval, 'failed:', error)
            time.sleep(1)
    return 1 if failed == len(ROOTS) * len(INTERVALS) else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1]))
