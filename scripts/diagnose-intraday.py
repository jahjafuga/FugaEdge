"""One-shot diagnostic. Reads the live DB and prints:
 - schema_version + table list
 - intraday_bars count + per-(symbol,date) breakdown
 - ODYS 2026-05-11 specifically (bar count, errors, first/last bar)
 - ODYS trades for 2026-05-11 with current ema9_distance_pct
 - API key length (masked)

Run: py scripts\\diagnose-intraday.py
"""
import json
import os
import sqlite3
import sys

candidates = [
    os.path.join(os.environ.get("APPDATA", ""), "fugaedge", "fugaedge.db"),
    os.path.join(os.environ.get("APPDATA", ""), "FugaEdge", "fugaedge.db"),
    os.path.join(os.environ.get("APPDATA", ""), "fugajournal", "fugajournal.db"),
]
db_path = next((p for p in candidates if os.path.exists(p)), None)
if not db_path:
    print("No DB found", file=sys.stderr)
    sys.exit(1)
print(f"Using DB: {db_path}")

# Open read-only via URI so we never lock the file the Electron app is using.
conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
cur = conn.cursor()

cur.execute("SELECT value FROM _meta WHERE key='schema_version'")
row = cur.fetchone()
print(f"schema_version: {row[0] if row else '(none)'}")

cur.execute(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
)
tables = [r[0] for r in cur.fetchall()]
print(f"tables: {', '.join(tables)}")

if "intraday_bars" not in tables:
    print("intraday_bars table is MISSING")
    sys.exit(2)

cur.execute("SELECT COUNT(*) FROM intraday_bars")
print(f"intraday_bars total rows: {cur.fetchone()[0]}")

cur.execute(
    """
    SELECT symbol, date, length(bars) AS bytes,
           CASE WHEN error IS NULL THEN '' ELSE 'ERR: ' || substr(error, 1, 120) END
    FROM intraday_bars
    ORDER BY date DESC, symbol ASC
    LIMIT 30
    """
)
print("intraday_bars sample (latest 30):")
for sym, dt, bytes_, err in cur.fetchall():
    print(f"  {sym} {dt} bytes={bytes_} {err}")

cur.execute(
    "SELECT bars, error FROM intraday_bars WHERE symbol='ODYS' AND date='2026-05-11'"
)
row = cur.fetchone()
if row is None:
    print("\nODYS 2026-05-11: NOT CACHED (no intraday_bars row)")
else:
    bars_json, err = row
    print(f"\nODYS 2026-05-11 cached: error={err or '(none)'}")
    try:
        bars = json.loads(bars_json)
        print(f"  bar count: {len(bars)}")
        if bars:
            print(f"  first: {json.dumps(bars[0])}")
            print(f"  last : {json.dumps(bars[-1])}")
    except Exception as e:
        print(f"  parse error: {e}")

cur.execute(
    """
    SELECT id, symbol, side, open_time, close_time,
           avg_buy_price, avg_sell_price, entry_ema9_distance_pct
    FROM trades
    WHERE symbol='ODYS' AND date='2026-05-11'
    ORDER BY open_time ASC
    """
)
print("\nODYS trades on 2026-05-11:")
trades = cur.fetchall()
if not trades:
    print("  (none)")
for t in trades:
    print(
        f"  #{t[0]} {t[2]} open_time={t[3]} buy=${t[5]} sell=${t[6]} ema9_distance_pct={t[7]}"
    )

cur.execute("SELECT value FROM settings WHERE key='polygon_api_key'")
row = cur.fetchone()
if row and row[0]:
    v = row[0]
    print(f"\nAPI key in DB: {v[:4]}…{v[-4:]} (len={len(v)})")
else:
    print("\nAPI key in DB: (empty)")

conn.close()
