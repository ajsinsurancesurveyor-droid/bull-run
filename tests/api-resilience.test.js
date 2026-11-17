 "use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const app=fs.readFileSync(path.join(__dirname,"..","public","app.js"),"utf8");
test("frontend API timeout is extended and aborts the actual fetch",()=>{
 assert.match(app,/timeoutMs=Math\.max\(10000,Number\(opts\.timeoutMs\)\|\|30000\)/);
 assert.match(app,/signal:controller\.signal/);
 assert.doesNotMatch(app,/signal:opts\.signal\|\|controller\.signal/);
});
test("frontend API safely handles empty and non-JSON responses",()=>{
 assert.match(app,/const raw=await r\.text\(\)/);
 assert.match(app,/Server returned an invalid response/);
});
test("timeout message is actionable and retains cached market data",()=>{
 assert.match(app,/Last valid market data will be retained/);
});

test("Upstox timeout remains active until the response body is read",()=>{
 const server=fs.readFileSync(path.join(__dirname,"..","server.js"),"utf8");
 assert.match(server,/const raw = await r\.text\(\);[\s\S]*?finally \{\s*clearTimeout\(requestTimer\)/);
});
test("Upstox retries only transient GET requests and never retries 429 or writes",()=>{
 const server=fs.readFileSync(path.join(__dirname,"..","server.js"),"utf8");
 assert.match(server,/const retryable = method === "GET"/);
 assert.match(server,/const transient = \[502, 503, 504\]\.includes\(Number\(err\.status\)\)/);
 assert.match(server,/if \(!retryable \|\| !transient \|\| attempt >= 1\) throw err/);
});
test("Windows launcher keeps a server console open and offers restart",()=>{
 const bat=fs.readFileSync(path.join(__dirname,"..","RUN_AJS_SERVER.bat"),"utf8");
 assert.match(bat,/choice \/c RQ/);
 assert.match(bat,/goto RUN_SERVER/);
});
