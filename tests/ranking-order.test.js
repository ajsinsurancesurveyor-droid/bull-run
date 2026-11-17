const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('dashboard uses one unified rank order: target, running, range, failed', () => {
  const source = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
  assert.match(source, /if\(t\?\.status==='TARGET ACHIEVED'\)return 0;/);
  assert.match(source, /if\(t\?\.status==='RUNNING'\)return 1;/);
  assert.match(source, /if\(isFailed\(t,b1\)\)return 3;/);
  assert.match(source, /return 2;/);
  assert.match(source, /if\(av!==bv\)return bv-av;/);
  assert.match(source, /\$\('rankedGrid'\)\.innerHTML=rankedCards\.join\(''\)/);
});


test('NIFTY and BANK NIFTY are pinned first in that order, before ranked stocks', () => {
  const source = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
  assert.match(source, /const fixedIndexes=ranked\.filter\(x=>x\.item\.kind==='index'\)\.sort/);
  assert.match(source, /\{NIFTY:0,BANKNIFTY:1\}/);
  assert.match(source, /const rankedStocks=ranked\.filter\(x=>x\.item\.kind==='equity'\)/);
  assert.match(source, /fixedIndexes\.map\(\(x,i\)=>scorePanel\(x,i\+1\)\)\.concat\(rankedStocks\.map/);
});
