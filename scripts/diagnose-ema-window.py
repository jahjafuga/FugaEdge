"""Time-window check: do the cached intraday bars cover the trade entry times?

Prints the bar window in three timezone interpretations + the trade entry
times in those same interpretations so we can see exactly why
computeEma9Distance returns null for ODYS 2026-05-11.
"""
import json
import os
import sqlite3
from datetime import datetime, timezone, timedelta

db_path = os.path.join(os.environ["APPDATA"], "fugaedge", "fugaedge.db")
conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)

# Pull all cached bars
row = conn.execute(
    "SELECT bars FROM intraday_bars WHERE symbol='ODYS' AND date='2026-05-11'"
).fetchone()
bars = json.loads(row[0])
first_ms, last_ms = bars[0]["t"], bars[-1]["t"]


def fmt(ms, tz):
    return datetime.fromtimestamp(ms / 1000, tz=tz).strftime("%Y-%m-%d %H:%M:%S %Z")


utc = timezone.utc
edt = timezone(timedelta(hours=-4), name="EDT")
pdt = timezone(timedelta(hours=-7), name="PDT")
local = datetime.now().astimezone().tzinfo

print(f"BAR WINDOW (ODYS 2026-05-11), {len(bars)} bars")
print(f"  first bar t={first_ms}")
print(f"    UTC : {fmt(first_ms, utc)}")
print(f"    EDT : {fmt(first_ms, edt)}")
print(f"    LOCAL ({local}): {fmt(first_ms, local)}")
print(f"  last bar  t={last_ms}")
print(f"    UTC : {fmt(last_ms, utc)}")
print(f"    EDT : {fmt(last_ms, edt)}")
print(f"    LOCAL ({local}): {fmt(last_ms, local)}")

trades = conn.execute(
    "SELECT id, open_time FROM trades WHERE symbol='ODYS' AND date='2026-05-11' ORDER BY open_time"
).fetchall()

print("\nTRADE ENTRIES — what Node Date.parse() would yield in local time:")
for tid, open_time in trades:
    # Mimic Node's Date.parse() of a TZ-less ISO string → local time
    dt_local = datetime.fromisoformat(open_time).replace(tzinfo=local)
    ms_local = int(dt_local.timestamp() * 1000)
    dt_utc_assumed = datetime.fromisoformat(open_time).replace(tzinfo=utc)
    ms_utc_assumed = int(dt_utc_assumed.timestamp() * 1000)
    print(f"  #{tid} open_time={open_time!r}")
    print(f"    if parsed as LOCAL ({local}): ms={ms_local}  →  vs first bar: {'BEFORE' if ms_local < first_ms else 'AFTER'} ({ms_local - first_ms:+d} ms = {(ms_local - first_ms) / 60000:+.1f} min)")
    print(f"    if parsed as UTC:             ms={ms_utc_assumed}  →  vs first bar: {'BEFORE' if ms_utc_assumed < first_ms else 'AFTER'} ({ms_utc_assumed - first_ms:+d} ms = {(ms_utc_assumed - first_ms) / 60000:+.1f} min)")

# Count bars before each trade entry under both interpretations
print("\nBARS AVAILABLE BEFORE EACH ENTRY (need >= 9 to seed EMA9):")
for tid, open_time in trades:
    ms_local = int(datetime.fromisoformat(open_time).replace(tzinfo=local).timestamp() * 1000)
    ms_utc = int(datetime.fromisoformat(open_time).replace(tzinfo=utc).timestamp() * 1000)
    n_local = sum(1 for b in bars if b["t"] <= ms_local)
    n_utc = sum(1 for b in bars if b["t"] <= ms_utc)
    print(f"  #{tid}: bars_<=_local={n_local}  bars_<=_utc={n_utc}")

conn.close()
