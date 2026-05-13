"""Simulate the corrected EMA9 computation for the two ODYS trades, parsing
their entry times as US/Eastern. Mirrors what computeEma9Distance() in
electron/market/intraday.ts will return after the fix.
"""
import json
import os
import sqlite3
from datetime import datetime, timezone, timedelta

db_path = os.path.join(os.environ["APPDATA"], "fugaedge", "fugaedge.db")
conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)

bars = json.loads(
    conn.execute(
        "SELECT bars FROM intraday_bars WHERE symbol='ODYS' AND date='2026-05-11'"
    ).fetchone()[0]
)
trades = conn.execute(
    """SELECT id, open_time, side, avg_buy_price, avg_sell_price
       FROM trades WHERE symbol='ODYS' AND date='2026-05-11' ORDER BY open_time"""
).fetchall()


def parse_eastern_ms(s: str) -> int:
    """Mirror parseEasternTimeMs() in electron/lib/eastern-time.ts.
    For 2026-05-11 we're in EDT (UTC-4)."""
    dt = datetime.fromisoformat(s).replace(tzinfo=timezone(timedelta(hours=-4)))
    return int(dt.timestamp() * 1000)


def sma_seeded_ema(closes, period=9):
    """Mirror electron/lib/ema.ts."""
    if len(closes) < period:
        return None
    sma = sum(closes[:period]) / period
    alpha = 2 / (period + 1)
    ema = sma
    for c in closes[period:]:
        ema = c * alpha + ema * (1 - alpha)
    return ema


print("Bars window:")
print(f"  first bar @ {datetime.fromtimestamp(bars[0]['t']/1000, tz=timezone.utc).astimezone(timezone(timedelta(hours=-4))):%H:%M:%S EDT}")
print(f"  total bars: {len(bars)}")
print()

for tid, open_time, side, buy, sell in trades:
    entry_ms = parse_eastern_ms(open_time)
    entry_ny = datetime.fromtimestamp(entry_ms / 1000, tz=timezone(timedelta(hours=-4)))
    entry_price = buy if side == "long" else (sell or buy)

    # Last bar at or before entry
    cutoff = -1
    for i, b in enumerate(bars):
        if b["t"] > entry_ms:
            break
        cutoff = i

    bars_before = cutoff + 1
    print(f"Trade #{tid}: {side} entry @ {entry_ny:%H:%M:%S EDT}, entry_price=${entry_price}")
    print(f"  bars at-or-before entry: {bars_before}")

    if cutoff < 8:
        print(f"  EMA9 distance: NULL — need ≥9 preceding bars to seed SMA, only have {bars_before}")
        print(f"  → 'Awaiting data' is correct for this trade (genuinely insufficient history)")
    else:
        closes = [b["c"] for b in bars[: cutoff + 1]]
        ema9 = sma_seeded_ema(closes, 9)
        dist_pct = ((entry_price - ema9) / ema9) * 100
        # Bucket per electron/analytics/get.ts:406-412
        abs_d = abs(dist_pct)
        if abs_d < 1:
            bucket = "at EMA (0–1%)"
        elif abs_d < 3:
            bucket = "slight (1–3%)"
        elif abs_d < 7:
            bucket = "extended (3–7%)"
        else:
            bucket = "very extended (7%+)"
        flag = " 🔴 EXTENDED (>5% from EMA9)" if abs_d > 5 else ""
        print(f"  EMA9 @ entry: ${ema9:.4f}")
        print(f"  distance: {dist_pct:+.2f}%  →  bucket: {bucket}{flag}")
    print()

conn.close()
