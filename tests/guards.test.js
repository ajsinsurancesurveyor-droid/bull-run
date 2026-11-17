"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
const safety = fs.readFileSync(path.join(root, "real-trading-safety.js"), "utf8");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

test("live order switches default to disabled", () => {
  assert.match(server, /process\.env\.REAL_TRADING_ENABLED\s*\|\|\s*"false"/);
  assert.match(server, /const AJS_AUTO_B1_EXECUTION_ENABLED\s*=\s*false/);
});
test("order endpoint fails closed unless both live gates enabled", () => {
  assert.match(server, /if\s*\(!REAL_TRADING_ENABLED\s*\|\|\s*!AJS_AUTO_B1_EXECUTION_ENABLED\)\s*return res\.status\(403\)/);
});
test("preflight explicitly reports live orders disallowed", () => {
  assert.match(server, /app\.get\("\/api\/real\/preflight"/);
  assert.match(server, /liveOrdersAllowed:\s*false/);
  assert.match(server, /dailyLossEnforcement/);
  assert.match(server, /protectionManager/);
});
test("preflight is documented as read-only", () => {
  assert.match(server, /Read-only preflight/);
  const start = server.indexOf('app.get("/api/real/preflight"');
  const end = server.indexOf('\n});', start);
  assert.ok(start >= 0 && end > start);
  const route = server.slice(start, end);
  assert.doesNotMatch(route, /placeOrder|submitOrder|cancelOrder|modifyOrder/i);
});
test("full test command is available", () => {
  assert.equal(typeof pkg.scripts["test:all"], "string");
  assert.match(safety, /function checkDailyLoss/);
});


test("admin username/password and admin APIs are removed", () => {
  assert.doesNotMatch(server, /AJS_ADMIN_USER|AJS_ADMIN_KEY|requireAdmin|adminSessions|\/api\/admin/);
  assert.doesNotMatch(server, /currentUser\(req\).*login\.html/);
  assert.match(server, /app\.get\("\*", \(req,res\)=>res\.sendFile/);
});

test("dashboard no longer shows the removed B1/B2/B3 clarification panel", () => {
  const html = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");
  assert.doesNotMatch(html, /B1-only confirmation rules/);
  assert.doesNotMatch(html, /OPENING RANGE BREAKOUT ENGINE/);
});

test("live ranked cards render all three persistent B1/B2/B3 stage boxes", () => {
  const app = fs.readFileSync(path.join(root, "public", "app.js"), "utf8");
  const css = fs.readFileSync(path.join(root, "public", "style.css"), "utf8");
  assert.match(app, /b123-live-stages/);
  assert.match(app, /✕ FAILED/);
  assert.match(css, /\.b123-stage\.is-failed:after/);
  assert.match(css, /\.b123-orange/);
  assert.match(css, /\.b123-blue/);
});

test("both index cards and stock cards use the same B1/B2/B3 stage renderer", () => {
  const app = fs.readFileSync(path.join(root, "public", "app.js"), "utf8");
  assert.match(app, /rankedCards=fixedIndexes\.map\(\(x,i\)=>scorePanel/);
  assert.match(app, /\$\('rankedGrid'\)\.innerHTML=rankedCards\.join\(''\)/);
  assert.match(app, /const rankedStocks=ranked\.filter\(x=>x\.item\.kind==='equity'\)/);
  assert.match(app, /function scorePanel\(x,rank\)/);
  assert.match(app, /b123-live-stages/);
  assert.match(app, /✕ FAILED \/ INVALIDATED/);
});

test("every card shows three round indicators with active colors and failed cross", () => {
  const app = fs.readFileSync(path.join(root, "public", "app.js"), "utf8");
  const css = fs.readFileSync(path.join(root, "public", "style.css"), "utf8");
  assert.match(app, /b123-rounds/);
  assert.match(app, /failed\?'✕':st\.label/);
  assert.match(app, /st\.color\|\|'gray'/);
  assert.match(css, /\.b1-round\.b1-round-orange/);
  assert.match(css, /\.b1-round\.b1-round-blue/);
  assert.match(css, /\.b1-round\.b1-round-failed/);
});


test("public API is protected by a deployment key and production fails closed", () => {
  assert.match(server, /AJS_API_KEY/);
  assert.match(server, /timingSafeEqual/);
  assert.match(server, /AJS_API_KEY\.length < 32/);
  assert.match(server, /API_KEY_REQUIRED/);
});

test("card display uses current sequence trade only, not prior invalidated stage",()=>{
 const app=fs.readFileSync(path.join(root,"public","app.js"),"utf8");
 assert.match(app,/currentTrade=trade&&Number\(trade\.sequence\)===Number\(b1\.sequence\)\?trade:null/);
 assert.match(app,/shownStatus=currentTrade\?\.status\|\|\(b1\.status\)/);
});
