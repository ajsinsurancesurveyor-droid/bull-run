const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const app = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');

test('every ranked stock and index card uses consistent explicit breakout status labels', () => {
  assert.ok(app.includes('breakoutWatchMarkup(x,b1)'));
  assert.match(app, /WAIT · RANGE NOT READY/);
  assert.match(app, /WAIT · INSIDE RANGE/);
  assert.ok(app.includes('WAIT · B${stage} CONFIRMATION'));
  assert.match(app, /CALL BREAKOUT CONFIRMED/);
  assert.match(app, /PUT BREAKDOWN CONFIRMED/);
  assert.match(app, /FAILED/);
  assert.match(app, /INVALIDATED/);
});

test('index overview cards also receive live breakout and breakdown badges', () => {
  assert.match(app, /index-breakout-watch-\$\{esc\(d\.id\)\}/);
  assert.match(app, /index-breakout-watch-\$\{id\}/);
});

test('confirmation uses completed five-minute candle close, not intrabar LTP', () => {
  assert.match(app, /immediately next completed 5-minute candle/);
  assert.match(app, /Latest completed 5-minute close/);
});
