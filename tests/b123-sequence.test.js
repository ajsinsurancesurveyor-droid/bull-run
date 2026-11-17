"use strict";
const test=require("node:test");const assert=require("node:assert/strict");const fs=require("node:fs");const path=require("node:path");const vm=require("node:vm");
const source=fs.readFileSync(path.join(__dirname,"..","public","app.js"),"utf8");const start=source.indexOf("function stockRangeB1(x){"),end=source.indexOf("const b1TradeMemory=",start);assert.ok(start>=0&&end>start);
const fn=source.slice(start,end);const stockRangeB1=vm.runInNewContext(`const istDateFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'});const istTimeFormatter=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});${fn};stockRangeB1;`,{Date,Intl,Math,Number});
function makeData(after){const date=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());const base=Date.parse(`${date}T03:45:00Z`);const opening=Array.from({length:6},()=>({t:base,o:100,h:110,l:90,c:100,v:1000}));opening.forEach((r,i)=>r.t=base+i*300000);const rows=[...opening,...after.map((r,i)=>({t:base+6*300000+i*300000,o:r.o??r.c,h:r.h??r.c,l:r.l??r.c,c:r.c,v:1500}))];return{five:{ready:true,rows,atr:1}};}
test("B1 CALL confirms; B2 and B3 remain disabled",()=>{const r=stockRangeB1(makeData([{c:112},{c:113}]));assert.equal(r.status,"B1 CONFIRMED");assert.equal(r.side,"CALL");assert.equal(r.stages[0].color,"green");assert.equal(r.stages[1].state,"DISABLED");assert.equal(r.stages[2].state,"DISABLED");});
test("confirmed B1 is invalidated when a later completed 5m candle closes back inside range",()=>{const r=stockRangeB1(makeData([{c:112},{c:113},{c:105}]));assert.equal(r.status,"B1 FAILED · RANGE RE-ENTRY");assert.equal(r.side,"CALL");assert.equal(r.stages[0].state,"INVALIDATED");assert.ok(r.invalidatedAt);});
test("confirmed PUT B1 is invalidated when a later completed 5m candle closes back inside range",()=>{const r=stockRangeB1(makeData([{c:88},{c:87},{c:95}]));assert.equal(r.status,"B1 FAILED · RANGE RE-ENTRY");assert.equal(r.side,"PUT");assert.equal(r.stages[0].state,"INVALIDATED");});
test("B1 PUT confirms; B2 and B3 remain disabled",()=>{const r=stockRangeB1(makeData([{c:88},{c:87}]));assert.equal(r.status,"B1 CONFIRMED");assert.equal(r.side,"PUT");assert.equal(r.stages[0].color,"red");assert.equal(r.stages[1].state,"DISABLED");});
test("B1 confirmation failure inside opening range blocks all re-entry",()=>{const r=stockRangeB1(makeData([{c:112},{c:105},{c:88},{c:87}]));assert.equal(r.status,"B1 FAILED · NO RE-ENTRY");assert.equal(r.stages[0].state,"FAILED");assert.equal(r.stages[1].state,"DISABLED");});
test("B1 waits for next completed candle",()=>{const r=stockRangeB1(makeData([{c:112}]));assert.equal(r.status,"B1 WAIT CONFIRM");assert.equal(r.stages[0].state,"PENDING");});
test("incomplete opening range stays WAIT",()=>{const r=stockRangeB1({five:{ready:true,rows:[]}});assert.equal(r.status,"WAIT");});

test("the immediate next candle alone confirms CALL only when it closes strictly above range high",()=>{const r=stockRangeB1(makeData([{c:112},{c:111}]));assert.equal(r.status,"B1 CONFIRMED");assert.equal(r.stages[0].state,"CONFIRMED");});
test("the immediate next candle closing at or inside range fails CALL immediately",()=>{const r=stockRangeB1(makeData([{c:112},{c:110}]));assert.equal(r.status,"B1 FAILED · NO RE-ENTRY");assert.equal(r.stages[0].state,"FAILED");});
test("the immediate next candle closing opposite direction fails CALL immediately",()=>{const r=stockRangeB1(makeData([{c:112},{c:88}]));assert.equal(r.status,"B1 FAILED · NO RE-ENTRY");assert.equal(r.stages[0].state,"FAILED");});

function makeIndexData(after,id="NIFTY"){return{...makeData(after),item:{kind:"index",id,name:id}};}
test("index B1 failure arms B2 in the opposite direction; B2 confirms on its next candle",()=>{
 const r=stockRangeB1(makeIndexData([{c:112},{c:105},{c:88},{c:87}]));
 assert.equal(r.status,"B2 CONFIRMED");assert.equal(r.sequence,2);assert.equal(r.side,"PUT");
 assert.equal(r.stages[0].state,"FAILED");assert.equal(r.stages[1].state,"CONFIRMED");assert.equal(r.stages[2].state,"WAIT");
});
test("index B1 confirmed then range re-entry invalidates it and arms B2",()=>{
 const r=stockRangeB1(makeIndexData([{c:112},{c:113},{c:105}]));
 assert.equal(r.status,"B2 WAIT BREAKOUT");assert.equal(r.stages[0].state,"INVALIDATED");assert.equal(r.stages[1].state,"ARMED");
});
test("index B2 failure arms B3 in the original B1 direction and B3 confirms next candle",()=>{
 const r=stockRangeB1(makeIndexData([{c:112},{c:105},{c:88},{c:95},{c:112},{c:113}]));
 assert.equal(r.status,"B3 CONFIRMED");assert.equal(r.sequence,3);assert.equal(r.side,"CALL");
 assert.equal(r.stages[0].state,"FAILED");assert.equal(r.stages[1].state,"FAILED");assert.equal(r.stages[2].state,"CONFIRMED");
});
test("index B2 confirmed then range re-entry arms B3",()=>{
 const r=stockRangeB1(makeIndexData([{c:112},{c:105},{c:88},{c:87},{c:95}]));
 assert.equal(r.status,"B3 WAIT BREAKOUT");assert.equal(r.stages[1].state,"INVALIDATED");assert.equal(r.stages[2].state,"ARMED");
});
test("index B3 failure blocks any fourth attempt",()=>{
 const r=stockRangeB1(makeIndexData([{c:112},{c:105},{c:88},{c:95},{c:112},{c:110}]));
 assert.match(r.status,/B3 FAILED/);assert.equal(r.stages[2].state,"FAILED");
});
test("stocks keep B2 and B3 disabled even after B1 fails",()=>{
 const r=stockRangeB1(makeData([{c:112},{c:105}]));
 assert.equal(r.status,"B1 FAILED · NO RE-ENTRY");assert.equal(r.stages[1].state,"DISABLED");assert.equal(r.stages[2].state,"DISABLED");
});

test("breakout card shows explicit range-not-ready state when today's OR is missing",()=>{
 const source=fs.readFileSync(path.join(__dirname,"..","public","app.js"),"utf8");
 const start=source.indexOf("function breakoutWatchMarkup"),end=source.indexOf("\nfunction ",start+10);
 const fn=source.slice(start,end);
 const render=vm.runInNewContext(`const istDateFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'});const istTimeFormatter=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});const esc=s=>String(s);const fmt=n=>String(n);${fn};breakoutWatchMarkup;`,{Date,Intl,Math,Number});
 const html=render({five:{ready:true,rows:[]},item:{kind:'stock'}},{status:'WAIT',stages:[]});
 assert.match(html,/WAIT · RANGE NOT READY/);assert.doesNotMatch(html,/ABOVE HIGH|0 pts/);
});
test("range display refuses null range levels instead of coercing null to zero",()=>{
 const source=fs.readFileSync(path.join(__dirname,"..","public","app.js"),"utf8");
 assert.ok(source.includes("rangeReady=b1.rangeHigh!==null&&b1.rangeHigh!==undefined&&b1.rangeLow!==null&&b1.rangeLow!==undefined"));
});
