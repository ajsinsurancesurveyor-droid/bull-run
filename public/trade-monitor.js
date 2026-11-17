(function (root) {
  'use strict';

  function update(trade, candles, livePrice, now = Date.now()) {
    if (!trade || trade.status !== 'RUNNING') return trade;
    const side = String(trade.side || '').toUpperCase();
    // Snapshot the complete trade plan once; never recalculate or trail it.
    if (!Number.isFinite(Number(trade.lockedEntry))) trade.lockedEntry = Number(trade.entry);
    if (!Number.isFinite(Number(trade.lockedTarget))) trade.lockedTarget = Number(trade.target);
    if (!Number.isFinite(Number(trade.lockedSL))) trade.lockedSL = Number(trade.sl);
    if (!trade.planLockedAt) trade.planLockedAt = Number(trade.confirmedAt) || now;
    trade.entry = trade.lockedEntry;
    trade.target = trade.lockedTarget;
    trade.sl = trade.lockedSL;
    const target = Number(trade.lockedTarget);
    const stop = Number(trade.lockedSL);
    const confirmedAt = Number(trade.confirmedAt) || 0;
    if (!['CALL', 'PUT'].includes(side) || !Number.isFinite(target) || !Number.isFinite(stop)) return trade;

    const dayKey = value => {
      const d = new Date(value);
      if (!Number.isFinite(d.getTime())) return '';
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
      }).format(d);
    };
    const today = dayKey(now);
    const todayRows = (Array.isArray(candles) ? candles : []).map(row => ({
      t: new Date(row?.t).getTime(), h: Number(row?.h), l: Number(row?.l)
    })).filter(row => Number.isFinite(row.t) && dayKey(row.t) === today &&
      Number.isFinite(row.h) && Number.isFinite(row.l) && row.h > 0 &&
      row.l > 0 && row.h >= row.l).sort((a, b) => a.t - b.t);
    const rows = todayRows.filter(row => row.t >= confirmedAt - 1000);

    // Track the full current-session high/low and separate post-entry extremes.
    if (todayRows.length) {
      trade.dayHigh = Math.max(...todayRows.map(r => r.h));
      trade.dayLow = Math.min(...todayRows.map(r => r.l));
      trade.dayRangeUpdatedAt = now;
    }
    if (rows.length) {
      trade.highSinceEntry = Math.max(...rows.map(r => r.h));
      trade.lowSinceEntry = Math.min(...rows.map(r => r.l));
    }

    for (const row of rows) {
      const targetTouched = side === 'CALL' ? row.h >= target : row.l <= target;
      const stopTouched = side === 'CALL' ? row.l <= stop : row.h >= stop;
      if (targetTouched && stopTouched) {
        trade.status = 'REVIEW REQUIRED';
        trade.completedAt = row.t + 300000;
        trade.hitSource = 'Both target and stop were inside the same 5-minute candle; sequence cannot be confirmed.';
        return trade;
      }
      if (targetTouched) {
        trade.status = 'TARGET ACHIEVED';
        trade.completedAt = row.t + 300000;
        trade.hitSource = 'Day high/low and completed 5-minute candle';
        trade.targetHitPrice = side === 'CALL' ? row.h : row.l;
        return trade;
      }
      if (stopTouched) {
        trade.status = 'SL HIT';
        trade.completedAt = row.t + 300000;
        trade.hitSource = 'Day high/low and completed 5-minute candle';
        trade.stopHitPrice = side === 'CALL' ? row.l : row.h;
        return trade;
      }
    }

    const price = Number(livePrice);
    if (Number.isFinite(price) && price > 0) {
      const targetTouched = side === 'CALL' ? price >= target : price <= target;
      const stopTouched = side === 'CALL' ? price <= stop : price >= stop;
      if (targetTouched && !stopTouched) {
        trade.status = 'TARGET ACHIEVED';
        trade.completedAt = now;
        trade.hitSource = 'Live underlying LTP';
        trade.targetHitPrice = price;
      } else if (stopTouched && !targetTouched) {
        trade.status = 'SL HIT';
        trade.completedAt = now;
        trade.hitSource = 'Live underlying LTP';
        trade.stopHitPrice = price;
      }
    }
    return trade;
  }

  const api = { update };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.AJSTradeMonitor = api;
})(typeof window !== 'undefined' ? window : globalThis);
