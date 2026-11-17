const test = require('node:test');
const assert = require('node:assert/strict');
const { update } = require('../public/trade-monitor');

const base = () => ({ side: 'CALL', target: 105, sl: 95, confirmedAt: Date.parse('2026-11-17T04:00:00Z'), status: 'RUNNING' });

test('detects a CALL target touched by a completed candle even after LTP reverses', () => {
  const t = base();
  update(t, [{ t: '2026-11-17T04:00:00Z', h: 106, l: 99 }], 101);
  assert.equal(t.status, 'TARGET ACHIEVED');
  assert.match(t.hitSource, /5-minute candle/);
});

test('detects a CALL stop touched before a later target candle', () => {
  const t = base();
  update(t, [
    { t: '2026-11-17T04:00:00Z', h: 102, l: 94 },
    { t: '2026-11-17T04:05:00Z', h: 107, l: 100 }
  ], 101);
  assert.equal(t.status, 'SL HIT');
});

test('flags both levels touched in the same candle for manual review', () => {
  const t = base();
  update(t, [{ t: '2026-11-17T04:00:00Z', h: 106, l: 94 }], 101);
  assert.equal(t.status, 'REVIEW REQUIRED');
});

test('does not count candles that started before trade confirmation', () => {
  const t = base();
  update(t, [{ t: '2026-11-17T03:55:00Z', h: 106, l: 99 }], 101);
  assert.equal(t.status, 'RUNNING');
});

test('supports PUT target and stop levels', () => {
  const t = { ...base(), side: 'PUT', target: 95, sl: 105 };
  update(t, [{ t: '2026-11-17T04:00:00Z', h: 100, l: 94 }], 99);
  assert.equal(t.status, 'TARGET ACHIEVED');
});


test('records full-session day high/low and post-entry extremes separately', () => {
  const t = base();
  update(t, [
    { t: '2026-11-17T03:45:00Z', h: 110, l: 98 },
    { t: '2026-11-17T04:00:00Z', h: 104, l: 99 },
    { t: '2026-11-17T04:05:00Z', h: 106, l: 97 }
  ], 101, Date.parse('2026-11-17T04:10:00Z'));
  assert.equal(t.dayHigh, 110);
  assert.equal(t.dayLow, 97);
  assert.equal(t.highSinceEntry, 106);
  assert.equal(t.lowSinceEntry, 97);
  assert.equal(t.status, 'TARGET ACHIEVED');
});

test('does not use a previous IST session high to trigger today target', () => {
  const t = base();
  update(t, [
    { t: '2026-11-16T04:00:00Z', h: 120, l: 99 },
    { t: '2026-11-17T04:00:00Z', h: 104, l: 99 }
  ], 101, Date.parse('2026-11-17T04:10:00Z'));
  assert.equal(t.dayHigh, 104);
  assert.equal(t.status, 'RUNNING');
});


test('locks entry, target and stop loss and restores them if later values change', () => {
  const t = { ...base(), entry: 100, lockedEntry: 100, lockedTarget: 105, lockedSL: 95,
    target: 999, sl: 1, entry: 777, planLockedAt: Date.parse('2026-11-17T04:00:00Z') };
  update(t, [{ t: '2026-11-17T04:00:00Z', h: 104, l: 99 }], 101);
  assert.equal(t.entry, 100);
  assert.equal(t.target, 105);
  assert.equal(t.sl, 95);
  assert.equal(t.status, 'RUNNING');
});

test('locks PUT target and stop loss without changing their levels', () => {
  const t = { ...base(), side: 'PUT', entry: 100, target: 95, sl: 105 };
  update(t, [{ t: '2026-11-17T04:00:00Z', h: 102, l: 96 }], 99);
  assert.equal(t.lockedEntry, 100);
  assert.equal(t.lockedTarget, 95);
  assert.equal(t.lockedSL, 105);
  assert.equal(t.status, 'RUNNING');
});
