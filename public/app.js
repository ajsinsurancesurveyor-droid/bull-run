const $=id=>document.getElementById(id);const names=[["NIFTY","NIFTY 50"],["BANKNIFTY","BANK NIFTY"],["RELIANCE","Reliance"],["BHARTIARTL","Bharti Airtel"],["ICICIBANK","ICICI Bank"],["AXISBANK","Axis Bank"],["BAJFINANCE","Bajaj Finance"],["BAJAJFINSV","Bajaj Finserv"],["HDFCBANK","HDFC Bank"],["SBIN","SBI"],["SBILIFE","SBI Life"],["HDFCLIFE","HDFC Life"],["TECHM","Tech Mahindra"]];let ajsApiKey=sessionStorage.getItem("ajs_api_key")||"",statusData=null,cache={},refreshTimer=null,selectedId=null,optionData=null,optionLastFetch=0,pendingOption=null,refreshing=false,candleCache={},openingBreakState={day:null,side:null,breakoutIndex:-1,triggered:false},openingRangeLevels=null;const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));async function mapWithConcurrency(items,limit,worker){const out=new Array(items.length);let next=0;const count=Math.min(Math.max(1,Number(limit)||1),items.length);await Promise.all(Array.from({length:count},async()=>{while(true){const i=next++;if(i>=items.length)return;out[i]=await worker(items[i],i)}}));return out}async function api(url,opts={}){const controller=new AbortController(),timeoutMs=Math.max(10000,Number(opts.timeoutMs)||30000),timeout=setTimeout(()=>controller.abort(),timeoutMs);try{const requestOpts={...opts};delete requestOpts.timeoutMs;let r=await fetch(url,{...requestOpts,signal:controller.signal,headers:{"Content-Type":"application/json",...(ajsApiKey?{"X-AJS-API-Key":ajsApiKey}:{}),...(opts.headers||{})}});if(r.status===401){let authBody={};try{authBody=await r.clone().json()}catch{}if(authBody.code==="API_KEY_REQUIRED"){const entered=prompt("AJS TRADING PRO access key enter karein:");if(entered){ajsApiKey=entered.trim();sessionStorage.setItem("ajs_api_key",ajsApiKey);r=await fetch(url,{...requestOpts,signal:controller.signal,headers:{"Content-Type":"application/json","X-AJS-API-Key":ajsApiKey,...(opts.headers||{})}});}}}const raw=await r.text();let d={};if(raw){try{d=JSON.parse(raw)}catch{throw Error(`Server returned an invalid response (${r.status}). Please retry.`)}}if(!r.ok)throw Error(d.error||d.message||`Request failed (${r.status})`);return d}catch(e){if(e.name==="AbortError")throw Error(`Server did not respond within ${Math.round(timeoutMs/1000)} seconds. Last valid market data will be retained; retrying on the next refresh.`);throw e}finally{clearTimeout(timeout)}}function fmt(v){return Number.isFinite(Number(v))?Number(v).toLocaleString("en-IN",{maximumFractionDigits:2}):"—"}function fmtWhole(v){return Number.isFinite(Number(v))?Math.round(Number(v)).toLocaleString("en-IN"):"—"}function money(v){return Number.isFinite(Number(v))?Number(v).toLocaleString('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}):"—"}function indicators(candles){const rows=(candles||[]).map(c=>({t:c[0],o:+c[1],h:+c[2],l:+c[3],c:+c[4],v:+c[5]||0})).filter(x=>[x.o,x.h,x.l,x.c].every(Number.isFinite)&&x.o>0&&x.h>0&&x.l>0&&x.c>0&&x.h>=Math.max(x.o,x.c,x.l)&&x.l<=Math.min(x.o,x.c,x.h)).sort((a,b)=>new Date(a.t)-new Date(b.t));if(rows.length<55)return{ready:false,reason:`Need 55 completed candles (received ${rows.length})`,rows};const ema=p=>{const k=2/(p+1);let v=rows.slice(0,p).reduce((s,x)=>s+x.c,0)/p;const out=Array(p-1).fill(null);out.push(v);for(let i=p;i<rows.length;i++){v=rows[i].c*k+v*(1-k);out.push(v)}return out};const e9=ema(9),e21=ema(21),e50=ema(50),i=rows.length-1,last=rows[i],prev=rows[i-1],changes=rows.slice(1).map((x,j)=>x.c-rows[j].c),g=changes.slice(-14).map(x=>Math.max(0,x)),l=changes.slice(-14).map(x=>Math.max(0,-x)),ag=g.reduce((a,b)=>a+b,0)/14,al=l.reduce((a,b)=>a+b,0)/14,rsi=al===0?100:100-100/(1+ag/al),volAvg=rows.slice(-21,-1).reduce((s,x)=>s+x.v,0)/20,vrows=rows.slice(-20),vd=vrows.reduce((s,x)=>s+x.v,0),vwap=vd?vrows.reduce((s,x)=>s+((x.h+x.l+x.c)/3)*x.v,0)/vd:NaN,tr=rows.slice(-15).map((x,j)=>{const p=rows[Math.max(0,rows.length-15+j-1)].c;return Math.max(x.h-x.l,Math.abs(x.h-p),Math.abs(x.l-p))}),atr=tr.reduce((a,b)=>a+b,0)/tr.length,bull=[e9[i]>e21[i],e21[i]>e50[i],last.c>vwap,last.c>=(last.h+last.l)/2,rsi>55,last.c>prev.c,last.v>volAvg*1.5&&last.c>last.o,last.c>Math.max(...rows.slice(-6,-1).map(x=>x.h)),last.h>prev.h&&last.l>prev.l,last.c>rows[Math.max(0,i-5)].c],bear=[e9[i]<e21[i],e21[i]<e50[i],last.c<vwap,last.c<=(last.h+last.l)/2,rsi<45,last.c<prev.c,last.v>volAvg*1.5&&last.c<last.o,last.c<Math.min(...rows.slice(-6,-1).map(x=>x.l)),last.h<prev.h&&last.l<prev.l,last.c<rows[Math.max(0,i-5)].c];const names=["EMA 9 above/below EMA 21","EMA 21 above/below EMA 50","Price vs VWAP","Candle close location","RSI(14) momentum","Candle direction","Volume spike > 1.5× avg","5-candle breakout/breakdown","HH-HL / LH-LL structure","5-candle momentum"];const dma200=Array(rows.length).fill(null);let dmaSum=0;for(let j=0;j<rows.length;j++){dmaSum+=rows[j].c;if(j>=200)dmaSum-=rows[j-200].c;if(j>=199)dma200[j]=dmaSum/200;}const vwapSeries=rows.map((_,j)=>{const z=rows.slice(Math.max(0,j-19),j+1),vol=z.reduce((sum,r)=>sum+r.v,0);return vol?z.reduce((sum,r)=>sum+((r.h+r.l+r.c)/3)*r.v,0)/vol:null});const stLine=Array(rows.length).fill(null),stDir=Array(rows.length).fill(1);let prevUpper=0,prevLower=0;for(let j=1;j<rows.length;j++){const win=rows.slice(Math.max(0,j-13),j+1);const atrJ=win.reduce((sum,r,k)=>{const prevC=rows[Math.max(0,Math.max(0,j-13)+k-1)].c;return sum+Math.max(r.h-r.l,Math.abs(r.h-prevC),Math.abs(r.l-prevC))},0)/win.length;const mid=(rows[j].h+rows[j].l)/2,upper=mid+3*atrJ,lower=mid-3*atrJ;const fu=(j===1||upper<prevUpper||rows[j-1].c>prevUpper)?upper:prevUpper;const fl=(j===1||lower>prevLower||rows[j-1].c<prevLower)?lower:prevLower;stDir[j]=rows[j].c>prevUpper?1:rows[j].c<prevLower?-1:stDir[j-1];stLine[j]=stDir[j]===1?fl:fu;prevUpper=fu;prevLower=fl}return{ready:true,rows,last,call:bull.filter(Boolean).length*10,put:bear.filter(Boolean).length*10,rsi,vwap,e9:e9[i],e21:e21[i],e50:e50[i],dma200:dma200[i],supertrend:stLine[i],supertrendDir:stDir[i],atr,volAvg,bull,bear,e9Series:e9,e21Series:e21,e50Series:e50,dma200Series:dma200,vwapSeries,supertrendSeries:stLine,supertrendDirSeries:stDir,parameterNames:names}}function chosenScore(x){const v=$("view").value;return v==="daily"?x.daily:v==="5m"?x.five:x.intra}const istDateFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'});const istTimeFormatter=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function stockRangeB1(x){
 const isIndex=x?.item?.kind==='index';
 const makeStages=()=>[
  {id:1,label:'B1',state:'WAIT',side:null,entry:null,sl:null,target:null,color:'gray'},
  {id:2,label:'B2',state:isIndex?'WAIT':'DISABLED',side:null,entry:null,sl:null,target:null,color:'gray'},
  {id:3,label:'B3',state:isIndex?'WAIT':'DISABLED',side:null,entry:null,sl:null,target:null,color:'gray'}
 ];
 const stages=makeStages(),rows=x?.five?.ready?x.five.rows:[];
 const result=(status,extra={})=>({status,side:null,entry:null,sl:null,target:null,sequence:1,rangeHigh:null,rangeLow:null,stages,...extra});
 if(!rows.length)return result('WAIT',{reason:'Waiting for 5m candles'});
 const dayKey=t=>{const d=new Date(t);return Number.isNaN(d.getTime())?'':istDateFormatter.format(d);};
 const today=dayKey(Date.now()),todayRows=rows.filter(r=>dayKey(r.t)===today).sort((a,b)=>new Date(a.t)-new Date(b.t));
 const opening=todayRows.filter(r=>{const time=istTimeFormatter.format(new Date(r.t));const mins=Number(time.slice(0,2))*60+Number(time.slice(3,5));return mins>=555&&mins<585;}).slice(0,6);
 if(opening.length<6)return result('WAIT',{reason:'30-minute range forming / data incomplete'});
 const hi=Math.max(...opening.map(r=>Number(r.h))),lo=Math.min(...opening.map(r=>Number(r.l)));
 const after=todayRows.filter(r=>new Date(r.t)>new Date(opening[5].t));
 const sideAt=r=>Number(r.c)>hi?'CALL':Number(r.c)<lo?'PUT':null;
 const inside=r=>Number(r.c)>=lo&&Number(r.c)<=hi;
 const makePlan=(side,entry)=>{const atr=Number(x.five?.atr)||Number(entry)*.002,risk=Math.max(atr,Number(entry)*.002);return{entry:Number(entry),sl:side==='CALL'?Number(entry)-risk:Number(entry)+risk,target:side==='CALL'?Number(entry)+2*risk:Number(entry)-2*risk};};
 const confirms=(r,side)=>Number.isFinite(Number(r.c))&&(side==='CALL'?Number(r.c)>hi:Number(r.c)<lo);
 let stageNo=1,originalSide=null,pending=null,activePlan=null,activeStage=null,terminal=false,lastEventAt=null,terminalReason='CONFIRMATION FAILED';
 const activateNext=(fromSide,at,state)=>{
  if(!isIndex||stageNo>=3){terminal=true;return;}
  stageNo++;
  const nextSide=stageNo===2?(fromSide==='CALL'?'PUT':'CALL'):originalSide;
  stages[stageNo-1]={...stages[stageNo-1],state:'ARMED',side:nextSide,color:stageNo===2?'orange':'blue',armedAt:at};
 };
 for(let i=0;i<after.length;i++){
  const r=after[i],close=Number(r.c),at=new Date(r.t).getTime()+300000;
  if(activePlan){
   if(inside(r)){
    stages[activeStage-1]={...stages[activeStage-1],state:'INVALIDATED',color:'failed',invalidatedAt:at};terminalReason='RANGE RE-ENTRY';
    lastEventAt=at;const oldSide=stages[activeStage-1].side;activePlan=null;activeStage=null;
    activateNext(oldSide,at,'INVALIDATED');
    if(terminal)break;
   }
   continue;
  }
  if(terminal)break;
  if(!pending){
   let side=null;
   if(stageNo===1)side=sideAt(r);
   else side=sideAt(r)===stages[stageNo-1].side?stages[stageNo-1].side:null;
   if(side){
    if(stageNo===1)originalSide=side;
    pending={side,row:r,stage:stageNo};
    stages[stageNo-1]={...stages[stageNo-1],state:'PENDING',side,color:stageNo===1?'gray':stageNo===2?'orange':'blue'};
   }
   continue;
  }
  // The immediately following completed 5-minute candle alone decides the attempt.
  if(!confirms(r,pending.side)){
   const failedStage=pending.stage,failedSide=pending.side;
   stages[failedStage-1]={...stages[failedStage-1],state:'FAILED',color:'failed',failedAt:at};terminalReason='CONFIRMATION FAILED';
   pending=null;lastEventAt=at;
   if(!isIndex||failedStage===3){terminal=true;break;}
   activateNext(failedSide,at,'FAILED');
   continue;
  }
  const plan=makePlan(pending.side,close),seq=pending.stage;
  activePlan={...plan,side:pending.side,confirmedAt:at,breakoutAt:new Date(pending.row.t).getTime()+300000};
  activeStage=seq;
  stages[seq-1]={...stages[seq-1],state:'CONFIRMED',side:pending.side,color:seq===1?(pending.side==='CALL'?'green':'red'):seq===2?'orange':'blue',...plan,confirmedAt:activePlan.confirmedAt,breakoutAt:activePlan.breakoutAt};
  pending=null;
 }
 const base={rangeHigh:hi,rangeLow:lo,stages,sequence:activeStage||stageNo,originalSide};
 if(activePlan){
  const st=stages[activeStage-1];
  return{status:`B${activeStage} CONFIRMED`,side:activePlan.side,entry:activePlan.entry,sl:activePlan.sl,target:activePlan.target,confirmedAt:activePlan.confirmedAt,breakoutAt:activePlan.breakoutAt,...base,sequence:activeStage,reason:`B${activeStage} confirmed by the immediately next completed 5-minute candle. A later completed candle closing inside the opening range invalidates this attempt.`};
 }
 if(pending)return{status:`B${pending.stage} WAIT CONFIRM`,side:pending.side,...base,sequence:pending.stage,reason:`B${pending.stage} breakout detected. The immediately next completed 5-minute candle must close beyond the same boundary or this attempt fails.`};
 if(terminal){
  const last=stages[Math.min(stageNo,3)-1];
  if(!isIndex&&stageNo===1)return{status:terminalReason==='RANGE RE-ENTRY'?'B1 FAILED · RANGE RE-ENTRY':'B1 FAILED · NO RE-ENTRY',side:last?.side,...base,sequence:1,invalidatedAt:last?.invalidatedAt,failedAt:last?.failedAt,reason:'Stocks allow B1 only. Once B1 fails or is invalidated, no same-day re-entry is allowed.'};
  return{status:`B${stageNo} FAILED · NO MORE ATTEMPTS`,side:last?.side,...base,sequence:stageNo,failedAt:last?.failedAt,reason:'Maximum allowed attempts for this index have been used. No further same-day entry.'};
 }
 if(stageNo>1)return{status:`B${stageNo} WAIT BREAKOUT`,side:stages[stageNo-1].side,...base,sequence:stageNo,reason:`B${stageNo} is armed. Waiting for a fresh ${stages[stageNo-1].side} close beyond the opening-range boundary, then the next 5-minute candle must confirm.`};
 return{status:'INSIDE RANGE',...base,reason:'Waiting for the first valid breakout/breakdown after the 09:15–09:45 opening range.'};
}
const b1TradeMemory={};
function getLockedB1Trade(x,b1){
 const day=istDateFormatter.format(new Date()),trades=[];
 for(const st of (b1.stages||[])){
  const seq=Number(st.id)||1,key=`ajs-b1-trade:${day}:${x.item.id}:B${seq}`;
  let t=b1TradeMemory[key];
  if(!t){try{t=JSON.parse(localStorage.getItem(key)||'null')}catch{t=null}}
  if(st.state==='CONFIRMED'&&!t&&Number.isFinite(Number(st.entry))&&Number.isFinite(Number(st.sl))&&Number.isFinite(Number(st.target))){
   t={id:x.item.id,name:x.item.name,side:st.side,sequence:seq,stage:`B${seq}`,entry:Number(st.entry),sl:Number(st.sl),target:Number(st.target),lockedEntry:Number(st.entry),lockedSL:Number(st.sl),lockedTarget:Number(st.target),planLockedAt:Date.now(),confirmedAt:st.confirmedAt||Date.now(),status:'RUNNING'};
  }
  if(t){
   if(!Number.isFinite(Number(t.lockedEntry)))t.lockedEntry=Number(t.entry);
   if(!Number.isFinite(Number(t.lockedSL)))t.lockedSL=Number(t.sl);
   if(!Number.isFinite(Number(t.lockedTarget)))t.lockedTarget=Number(t.target);
   if(!t.planLockedAt)t.planLockedAt=t.confirmedAt||Date.now();
   t.entry=t.lockedEntry;t.sl=t.lockedSL;t.target=t.lockedTarget;
  }
  if(t?.status==='RUNNING'&&st.state==='INVALIDATED'){
   t.status='INVALIDATED';t.invalidatedAt=st.invalidatedAt||Date.now();t.completedAt=t.invalidatedAt;t.reason=`Completed 5m candle invalidated B${seq}`;
  }
  const price=x.ltpStale?NaN:Number(x.ltp?.ltp);
  if(t?.status==='RUNNING'&&window.AJSTradeMonitor){
   t=window.AJSTradeMonitor.update(t,x.five?.rows||[],price);
  }
  if(t){b1TradeMemory[key]=t;try{localStorage.setItem(key,JSON.stringify(t))}catch{};trades.push(t)}
 }
 return trades.find(t=>t.status==='RUNNING')||trades[trades.length-1]||null;
}
function renderLockedEAlert(results){const el=$("lockedEAlert");if(!el)return;const hits=[];for(const x of (results||[])){const b1=stockRangeB1(x),t=getLockedB1Trade(x,b1);if(t&&(t.status==="TARGET ACHIEVED"||t.status==="SL HIT"))hits.push({name:t.name,side:t.side,status:t.status});}if(!hits.length){el.classList.add("hidden");el.setAttribute("aria-hidden","true");el.innerHTML="";return;}el.classList.remove("hidden");el.setAttribute("aria-hidden","false");el.innerHTML=`<div class="locked-e-circle" aria-label="E alert">E</div><div class="locked-e-copy"><strong>DECISION LOCKED · ${hits.map(h=>`${esc(h.name)} ${h.status}`).join(" · ")}</strong><span>Completed 5m range invalidation / trade result is locked until the next trading day.</span></div>`;}
function breakoutWatchMarkup(x,b1){
 const rows=x?.five?.ready?x.five.rows:[];
 const dayKey=t=>{const d=new Date(t);return Number.isNaN(d.getTime())?'':istDateFormatter.format(d)};
 const today=dayKey(Date.now()),todayRows=rows.filter(r=>dayKey(r.t)===today).sort((a,b)=>new Date(a.t)-new Date(b.t));
 const opening=todayRows.filter(r=>{const tm=istTimeFormatter.format(new Date(r.t)),m=Number(tm.slice(0,2))*60+Number(tm.slice(3,5));return m>=555&&m<585}).slice(0,6);
 const chip=(label,detail,tone='idle',direction='BREAKOUT / BREAKDOWN STATUS')=>`<div class="breakout-watch-grid" aria-label="Breakout and breakdown status"><div class="breakout-watch-chip ${tone}"><small>${direction}</small><b>${label}</b><em>${esc(detail)}</em></div></div>`;
 if(opening.length<6){
  // Keep the full explanation on the two index cards only; stock cards use a compact status.
  return x?.item?.kind==='index'
   ?chip('WAIT · RANGE NOT READY','Opening Range 09:15–09:45 IST needs six completed 5-minute candles. Range levels will remain blank until ready.')
   :chip('WAIT · RANGE NOT READY','Range not ready.');
 }
 const hi=Math.max(...opening.map(r=>Number(r.h))),lo=Math.min(...opening.map(r=>Number(r.l)));
 if(!Number.isFinite(hi)||!Number.isFinite(lo)||hi<=0||lo<=0||hi<=lo){
  return chip('WAIT · INVALID RANGE DATA','Opening Range data is incomplete or invalid. Waiting for valid OHLC candles.');
 }
 const after=todayRows.filter(r=>new Date(r.t)>new Date(opening[5].t));
 if(!after.length)return chip('WAIT · INSIDE RANGE','Opening Range is ready. Waiting for the first completed 5-minute close outside Range High or Range Low.');
 const status=String(b1?.status||'');
 const stages=b1?.stages||[];
 const pending=stages.find(st=>st.state==='PENDING');
 const armed=stages.find(st=>st.state==='ARMED');
 const confirmed=stages.find(st=>st.state==='CONFIRMED');
 const failed=[...stages].reverse().find(st=>st.state==='FAILED'||st.state==='INVALIDATED');
 if(/WAIT CONFIRM/.test(status)){
  const stage=Number(status.match(/^B([1-3])/)?.[1]||pending?.id||1),side=pending?.side||b1.side;
  return chip(`WAIT · B${stage} CONFIRMATION`,`Breakout detected${side?` (${side})`:''}. The immediately next completed 5-minute candle must close beyond the same range boundary or this attempt fails.`, 'idle');
 }
 if(/WAIT BREAKOUT/.test(status)||armed){
  const stage=Number(status.match(/^B([1-3])/)?.[1]||armed?.id||2),side=armed?.side;
  return chip(`WAIT · B${stage} FRESH BREAKOUT`,`Previous attempt failed or was invalidated. Waiting for a new ${side||'opposite'} breakout beyond the Opening Range, followed by next-candle confirmation.`, 'idle');
 }
 if(/CONFIRMED/.test(status)&&confirmed){
  const side=confirmed.side||b1.side;
  return chip(side==='CALL'?'CALL BREAKOUT CONFIRMED':'PUT BREAKDOWN CONFIRMED',`B${confirmed.id} confirmed by the immediately next completed 5-minute candle. Entry, SL and target are shown in the stage card.`,side==='CALL'?'bull':'bear',side==='CALL'?'UPSIDE · RANGE HIGH':'DOWNSIDE · RANGE LOW');
 }
 if(/FAILED/.test(status)||failed){
  const stage=failed?.id||Number(status.match(/^B([1-3])/)?.[1]||1);
  return chip(`B${stage} FAILED / INVALIDATED`,`This attempt is closed. ${x?.item?.kind==='index'&&stage<3?`B${stage+1} is next, subject to a fresh breakout and confirmation.`:'No further entry is allowed for this instrument today.'}`,'fail');
 }
 const last=after[after.length-1],close=Number(last?.c);
 if(Number.isFinite(close)&&close>hi)return chip('WAIT · CALL BREAKOUT SETUP','Latest completed candle is above Range High. Waiting for the next valid setup confirmation if a breakout attempt is armed.','watch-bull','UPSIDE · RANGE HIGH');
 if(Number.isFinite(close)&&close<lo)return chip('WAIT · PUT BREAKDOWN SETUP','Latest completed candle is below Range Low. Waiting for a valid stage breakout/confirmation.','watch-bear','DOWNSIDE · RANGE LOW');
 return chip('WAIT · INSIDE RANGE','Latest completed 5-minute close is between Range Low and Range High. No breakout confirmation yet.','idle');
}

function scorePanel(x,rank){const isTopPick=arguments[2]===true;const s=chosenScore(x),d=x.daily?.ready?`${x.daily.call}/${x.daily.put}`:"— / —",c=s?.ready?s.call:null,p=s?.ready?s.put:null,ltp=x.ltp?.ltp,label=$("view").value,bias=c==null||p==null?"WAIT":c>p?"CALL BIAS":p>c?"PUT BIAS":"MIXED",biasClass=(c!=null&&p!=null&&Math.max(c,p)<70)?"bias-neutral-bg":bias.includes("CALL")?"bias-call-bg":bias.includes("PUT")?"bias-put-bg":"bias-neutral-bg",b1=stockRangeB1(x),trade=getLockedB1Trade(x,b1),currentTrade=trade&&Number(trade.sequence)===Number(b1.sequence)?trade:null,confirmed=!!currentTrade&&currentTrade.status==='RUNNING',side=currentTrade?.side||b1.side,probability=s?.ready?Math.max(s.call,s.put):0,highProbability=probability>=80||confirmed,cardClass=(confirmed?`b1-confirmed-stage-${b1.sequence||1} ${side==='CALL'?'b1-confirmed-call':'b1-confirmed-put'}`:'')+(highProbability?' high-probability-card':'')+(currentTrade?.status==='TARGET ACHIEVED'?' trade-target-hit':currentTrade?.status==='SL HIT'?' trade-sl-hit':'');const shownStatus=currentTrade?.status||(b1.status),rangeReady=b1.rangeHigh!==null&&b1.rangeHigh!==undefined&&b1.rangeLow!==null&&b1.rangeLow!==undefined&&Number.isFinite(Number(b1.rangeHigh))&&Number.isFinite(Number(b1.rangeLow))&&Number(b1.rangeHigh)>0&&Number(b1.rangeLow)>0&&Number(b1.rangeHigh)>Number(b1.rangeLow),rangeSpot=Number(ltp),aboveRange=rangeReady&&Number.isFinite(rangeSpot)&&rangeSpot>Number(b1.rangeHigh),belowRange=rangeReady&&Number.isFinite(rangeSpot)&&rangeSpot<Number(b1.rangeLow),distHigh=rangeReady&&Number.isFinite(rangeSpot)?Math.abs(Number(b1.rangeHigh)-rangeSpot):null,distLow=rangeReady&&Number.isFinite(rangeSpot)?Math.abs(rangeSpot-Number(b1.rangeLow)):null,stageMarkup=`<div class="b123-live-stages">${(x.item.kind==='index'?(b1.stages||[{id:1,label:'B1',state:'WAIT',color:'gray'},{id:2,label:'B2',state:'WAIT',color:'gray'},{id:3,label:'B3',state:'WAIT',color:'gray'}]):(b1.stages||[{id:1,label:'B1',state:'WAIT',color:'gray'}]).filter(st=>st.id===1)).map(st=>{const state=String(st.state||'WAIT'),failed=/^(FAILED|INVALIDATED)$/i.test(state),tone=failed?'failed':state==='DISABLED'?'disabled':(st.color||'gray'),stateText=failed?'✕ FAILED / INVALIDATED':state==='CONFIRMED'?'CONFIRMED':state==='ACTIVE'?'ACTIVE':state==='PENDING'?'WAIT NEXT 5M':state==='ARMED'?'WAIT BREAKOUT':state==='DISABLED'?'DISABLED':'WAITING',levels=Number.isFinite(Number(st.entry))&&st.entry!==null?`<small>ENTRY ${fmt(st.entry)} · SL ${fmt(st.sl)} · TARGET ${fmt(st.target)}</small>`:'';return `<div class="b123-stage b123-${tone} ${failed?'is-failed':''}"><div class="b123-stage-head"><b>${st.label}</b><span>${stateText}</span></div><small>${st.side?st.side:'NO SIDE'}</small>${levels}</div>`}).join('')}</div>`;return `<article class="score-card ranked-card ${biasClass} ${cardClass} ${isTopPick?'top-pick-card':''}" data-ranked="${esc(x.item.id)}" tabindex="0"><div class="rank-ribbon">#${rank}</div><div class="range-detected-banner ${confirmed?(side==='CALL'?'range-call':'range-put'):String(b1.status||'').startsWith('B1 FAILED')?'range-invalid':''}"><span>30-MINUTE RANGE · ${`B${b1.sequence||1}`} TRADE</span><b>${esc(shownStatus)}</b></div><div class="score-card-head"><div><h3>${esc(x.item.name)}</h3><div class="score-meta">${x.ltp?`LTP · ${fmt(ltp)}`:"LTP · WAITING"}</div></div><span class="count-tag">${x.item.kind==="index"?"INDEX":"STOCK"}</span></div>${breakoutWatchMarkup(x,b1)}<div class="stock-30m-range ${aboveRange?"range-break-high":belowRange?"range-break-low":""}"><div class="stock-range-title"><b>30-MINUTE RANGE</b><span>09:15–09:45</span></div><div class="stock-range-values"><div class="range-low-box ${belowRange?"range-breached-low":""}"><small>RANGE LOW</small><b>${rangeReady?fmt(b1.rangeLow):"WAITING"}</b>${belowRange?"<em class=\"range-break-label\">BELOW LOW</em>":""}</div><div class="range-high-box ${aboveRange?"range-breached-high":""}"><small>RANGE HIGH</small><b>${rangeReady?fmt(b1.rangeHigh):"WAITING"}</b>${aboveRange?"<em class=\"range-break-label\">ABOVE HIGH</em>":""}</div><div class="range-distance-low ${belowRange?"range-breached-low":""}"><small>DISTANCE TO LOW</small><b>${distLow===null?"—":fmt(distLow)+" pts"}</b></div><div class="range-distance-high ${aboveRange?"range-breached-high":""}"><small>DISTANCE TO HIGH</small><b>${distHigh===null?"—":fmt(distHigh)+" pts"}</b></div></div></div><div class="scores">${gaugeMarkup(label+" CALL",c,false)}${gaugeMarkup(label+" PUT",p,true)}</div><div class="rank-footer"><span class="bias-pill ${bias.includes("CALL")?"call":bias.includes("PUT")?"put":"wait"}">${bias}</span><span class="signal ${String(trade?.status||x.entry?.signal||"WAIT").toLowerCase().replace(/\s+/g,'-')}">${esc(trade?.status||x.entry?.signal||"WAIT")}</span></div>${stageMarkup}<div class="b1-confirm-row"><div class="b123-rounds" aria-label="B1 B2 B3 stage indicators">${(x.item.kind==="index"?(b1.stages||[{id:1,label:'B1',state:'WAIT',color:'gray'},{id:2,label:'B2',state:'WAIT',color:'gray'},{id:3,label:'B3',state:'WAIT',color:'gray'}]):(b1.stages||[{id:1,label:'B1',state:'WAIT',color:'gray'}]).filter(st=>st.id===1)).map(st=>{const failed=/^(FAILED|INVALIDATED)$/i.test(String(st.state||'')),active=['ACTIVE','CONFIRMED'].includes(String(st.state||'')),tone=failed?'failed':active?(st.color||'gray'):'wait',label=failed?'✕':st.label;return `<span class="b1-round b1-round-${tone}" title="${esc(st.label)} · ${failed?'FAILED / INVALIDATED':st.state==='DISABLED'?'DISABLED':st.state||'WAITING'}" aria-label="${esc(st.label)} ${failed?'failed':st.state||'waiting'}">${label}</span>`}).join('')}</div><span class="b1-strip-status ${trade?.status==='SL HIT'?'b1-strip-sl':trade?.status==='TARGET ACHIEVED'?'b1-strip-target':trade?.status==='RUNNING'?'b1-strip-running':'b1-strip-wait'}" aria-label="${esc(trade?.status||'WAITING')}" title="${esc(trade?.status||'WAITING')}">${trade?.status==='SL HIT'?'SL':trade?.status==='TARGET ACHIEVED'?'TR':trade?.status==='RUNNING'?'R':'W'}</span><div class="b1-status-copy"><b>${confirmed?`${trade.stage||`B${b1.sequence||1}`} CONFIRMED · ${side==='CALL'?'CALL':'PUT'} · ${esc(trade.status)}`:esc(b1.status)}</b><small>${confirmed?`${trade.stage||`B${b1.sequence||1}`} CONFIRM TIME · ${new Date(trade.confirmedAt).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit'})} · ENTRY LOCKED ${fmt(trade.entry)} · ${trade.status==='RUNNING'?'Monitoring target / SL using live underlying LTP':trade.status==='TARGET ACHIEVED'?'Target level reached': 'Stop-loss level reached'}`:esc(b1.reason)}</small></div></div><div class="b1-plan-grid b1-plan-stage-${b1.sequence||1}"><div><span>ENTRY · LOCKED</span><b>${confirmed?fmt(trade.entry):Number.isFinite(Number(b1.entry))?fmt(b1.entry):'—'}</b></div><div><span>STOP LOSS</span><b>${confirmed?fmt(trade.sl):Number.isFinite(Number(b1.sl))?fmt(b1.sl):'—'}</b></div><div><span>TARGET · 2R</span><b>${confirmed?fmt(trade.target):Number.isFinite(Number(b1.target))?fmt(b1.target):'—'}</b></div></div>${trade?`<div class="b1-plan-grid"><div><span>DAY HIGH</span><b>${Number.isFinite(Number(trade.dayHigh))?fmt(trade.dayHigh):"WAITING"}</b></div><div><span>DAY LOW</span><b>${Number.isFinite(Number(trade.dayLow))?fmt(trade.dayLow):"WAITING"}</b></div><div><span>POST-ENTRY HIGH / LOW</span><b>${Number.isFinite(Number(trade.highSinceEntry))?fmt(trade.highSinceEntry):"—"} / ${Number.isFinite(Number(trade.lowSinceEntry))?fmt(trade.lowSinceEntry):"—"}</b></div></div>`:""}<div class="trade-state-line ${trade?.status==='TARGET ACHIEVED'?'target':trade?.status==='SL HIT'?'sl':trade?.status==='REVIEW REQUIRED'?'review':trade?'running':''}">${trade?.status==='TARGET ACHIEVED'?'✓ TARGET ACHIEVED':trade?.status==='SL HIT'?'✕ SL HIT':trade?.status==='REVIEW REQUIRED'?'⚠ REVIEW REQUIRED · Both SL and target touched in one 5m candle':trade?'● RUNNING · Entry / SL / Target locked':'WAITING · Entry, SL and target appear only after B1 confirmation'}</div><div class="score-footer"><span>${s?.ready?`RSI ${fmt(s.rsi)} · VWAP ${fmt(s.vwap)}`:esc(s?.reason||"Waiting for candles")}</span><button class="secondary" data-open="${esc(x.item.id)}">Details ↗</button></div></article>`}function gaugeMarkup(label,val,put){const pct=val==null?0:Math.max(0,Math.min(100,val))*3.6,high=Number.isFinite(Number(val))&&Number(val)>70;return `<div class="score ${put?"put":""} ${high?"score-over-70":""}"><div class="gauge" style="--pct:${pct}deg"><strong>${val==null?"—":val}</strong></div><div><span>${label} ${label.includes("CALL")?"CALL":"PUT"}</span><strong class="score-number ${high?"score-number-blink":""}">${val==null?"WAIT":`${val}/100`}</strong></div></div>`}function entrySignal(intra,c5){if(!intra?.ready||!c5?.ready)return{signal:"WAIT",entry:null,sl:null,target:null,reason:"Waiting for completed 5m candle"};const last=c5.last,prev=c5.rows[c5.rows.length-2];if(intra.call>=70&&intra.call>intra.put&&last.c>prev.h&&last.v>c5.volAvg*1.2){const entry=last.c,sl=entry-Math.max(c5.atr,entry*.002);return{signal:"CALL",entry,sl,target:entry+2*(entry-sl),score:intra.call,reason:"15m bullish + 5m breakout"}}if(intra.put>=70&&intra.put>intra.call&&last.c<prev.l&&last.v>c5.volAvg*1.2){const entry=last.c,sl=entry+Math.max(c5.atr,entry*.002);return{signal:"PUT",entry,sl,target:entry-2*(sl-entry),score:intra.put,reason:"15m bearish + 5m breakdown"}}return{signal:"WAIT",entry:null,sl:null,target:null,reason:"Entry conditions not confirmed"}}async function getData(item,frame){const k=item.id+':'+frame,old=candleCache[k];const ttl=frame==='5m'?10000:frame==='15m'?25000:300000;if(old&&Date.now()-old.at<ttl)return old.value;try{const d=await api(`/api/candles/${item.id}/${frame}`),value={...indicators(d.candles),source:d.source};if(!value.ready&&old?.value?.ready){const kept={...old.value,stale:true,reason:`Using last valid score; latest ${frame} candles not ready (${value.rows?.length||0} received)`};candleCache[k]={at:Date.now(),value:kept};return kept}candleCache[k]={at:Date.now(),value};return value}catch(e){if(old?.value?.ready){const kept={...old.value,stale:true,reason:`Using last valid score; latest data refresh failed: ${e.message}`};candleCache[k]={at:Date.now(),value:kept};return kept}const value={ready:false,reason:e.message,rows:[]};candleCache[k]={at:Date.now(),value};return value}}async function getLtp(item){try{return await api(`/api/ltp/${item.id}`)}catch(e){return{error:e.message}}}let niftyPivotCache={at:0,levels:null};let rangeNotified=new Set();function notifyRangeBreak(id,name,side,level){const key=`${new Date().toLocaleDateString('en-CA')}|${id}|${side}`;if(rangeNotified.has(key))return;rangeNotified.add(key);const message=`${name}: first 30-minute range ${side} at ${fmt(level)}`;if('Notification' in window){if(Notification.permission==='granted')new Notification('AJS TRADING PRO',{body:message});else if(Notification.permission==='default')Notification.requestPermission().catch(()=>{});}const box=$('rangeAlert');if(box){box.textContent=message;box.className='range-alert '+(side==='BREAKOUT'?'breakout':'breakdown');}}
function updateIndexScoreCards(){for(const id of ["NIFTY","BANKNIFTY"]){const x=cache[id];if(!x)continue;const s=chosenScore(x);const call=$(`index-call-${id}`),put=$(`index-put-${id}`),bias=$(`index-bias-${id}`),status=$(`index-score-status-${id}`);if(call)call.textContent=s?.ready?`${s.call}/100`:"WAITING";if(put)put.textContent=s?.ready?`${s.put}/100`:"WAITING";if(bias){bias.textContent=!s?.ready?"WAIT":s.call>s.put?"CALL":s.put>s.call?"PUT":"MIXED";bias.className=s?.ready?(s.call>s.put?"bias-call":s.put>s.call?"bias-put":"bias-wait"):"bias-wait";}if(status){status.textContent=s?.ready?`${s.stale?"LAST VALID SCORE · ":""}${s.rows?.length||0} completed candles · ${$("view").selectedOptions[0]?.textContent||""}${s.stale?" · refresh pending":""}`:(s?.reason||"Waiting for completed candle data; check Upstox token, instrument key and API limit.");}const watch=$(`index-breakout-watch-${id}`);if(watch)watch.innerHTML=breakoutWatchMarkup(x,stockRangeB1(x));}}let indexOverviewLoading=false,lastIndexOverviewAt=0;async function loadIndexOverview(force=false){if(indexOverviewLoading||(!force&&Date.now()-lastIndexOverviewAt<30000))return;indexOverviewLoading=true;lastIndexOverviewAt=Date.now();try{const ids=['NIFTY','BANKNIFTY'];const out=await Promise.all(ids.map(async id=>{try{return await api(`/api/market-summary/${id}`)}catch(e){return{id,name:id,error:e.message}}}));let active=[];for(const d of out){
 const isNifty=d.id==='NIFTY'||String(d.name||'').toUpperCase().includes('NIFTY 50');
 const priceEl=$(isNifty?'stickyNiftyPrice':'stickyBankPrice'),changeEl=$(isNifty?'stickyNiftyChange':'stickyBankChange');
 if(priceEl)priceEl.textContent=d.error?'WAITING':fmt(d.ltp);
 if(changeEl){const pct=Number(d.dailyPercent);changeEl.textContent=d.error?'Live quote unavailable':`${Number.isFinite(pct)?(pct>=0?'+':'')+pct.toFixed(2)+'%':'Change unavailable'} · ${d.dailyChange==null?'—':fmt(d.dailyChange)}`;changeEl.className='ticker-change '+(Number.isFinite(pct)?pct>=0?'ticker-up':'ticker-down':'');}
}
$('indexOverview').innerHTML=out.map(d=>{if(d.error)return `<article class="index-summary-card"><h3>${esc(d.name)}</h3><p class="muted">${esc(d.error)}</p></article>`;const pct=Number(d.dailyPercent),pcls=pct>=0?'status-pass':'status-fail',r=d.first30m||{},rangeText=r.ready?`H ${fmt(r.high)} · L ${fmt(r.low)}`:'Waiting for 6 completed 5m candles';if(r.ready&&['BREAKOUT','BREAKDOWN'].includes(r.status)){active.push(`${d.name} ${r.status} · ${r.status==='BREAKOUT'?fmt(r.high):fmt(r.low)}`);notifyRangeBreak(d.id,d.name,r.status,r.status==='BREAKOUT'?r.high:r.low)}return `<article class="index-summary-card"><div class="index-summary-head"><div><h3>${esc(d.name)}</h3><div class="index-big-ltp" data-live-ltp="${esc(d.id)}">${fmt(d.ltp)}</div><div class="index-daily ${pcls}">${pct>=0?'+':''}${fmt(d.dailyChange)} (${pct>=0?'+':''}${fmt(pct)}%)</div></div><span class="count-tag">LIVE</span></div><div class="index-score-row"><div class="index-score-call"><small>CALL SCORE</small><b id="index-call-${esc(d.id)}">WAITING</b></div><div class="index-score-put"><small>PUT SCORE</small><b id="index-put-${esc(d.id)}">WAITING</b></div><div class="index-score-bias"><small>BIAS</small><b id="index-bias-${esc(d.id)}">WAIT</b></div></div><p class="muted score-data-status" id="index-score-status-${esc(d.id)}">Checking score data…</p><div class="index-levels"><div><small>Prev Close</small><b>${fmt(d.previousDay?.close??d.previousClose)}</b></div><div><small>Prev High</small><b>${fmt(d.previousDay?.high)}</b></div><div><small>Prev Low</small><b>${fmt(d.previousDay?.low)}</b></div></div><div class="index-levels"><div><small>First 30m High</small><b>${fmt(r.high)}</b></div><div><small>First 30m Low</small><b>${fmt(r.low)}</b></div><div><small>Range</small><b>09:15–09:45</b></div></div><span class="range-chip ${r.status==='BREAKOUT'?'breakout':r.status==='BREAKDOWN'?'breakdown':''}">${esc(r.status||'WAITING')}</span><p class="muted">${esc(rangeText)} · ${r.candles||0}/6 candles</p><div id="index-breakout-watch-${esc(d.id)}"></div></article>`}).join('');if(active.length){$('rangeAlert').textContent='⚠ First 30-minute range break: '+active.join(' | ');$('rangeAlert').className='range-alert '+(active.some(x=>x.includes('BREAKOUT'))?'breakout':'breakdown')}else if(!$('rangeAlert').classList.contains('breakout')&&!$('rangeAlert').classList.contains('breakdown')){$('rangeAlert').textContent='No first 30-minute range break detected. Notifications will appear when the index moves above the range high or below the range low.'}}finally{indexOverviewLoading=false}}updateIndexScoreCards();
let lastWhatsAppSetupKey="", whatsappRecipient="", whatsappRecipients=[];
async function prepareTopSetupWhatsApp(best){
 if(!best||!['CALL','PUT'].includes(best.entry?.signal)||Number(best.entry?.score)<70)return null;
 const candle=best.five?.last?.t||best.intra?.last?.t||"";
 const key=`${best.item.id}|${best.entry.signal}|${candle}`;
 if(!candle||key===lastWhatsAppSetupKey)return null;
 lastWhatsAppSetupKey=key;
 try{return await api('/api/alerts/top-setup',{method:'POST',body:JSON.stringify({key,name:best.item.name,side:best.entry.signal,score:best.entry.score,entry:best.entry.entry,stop:best.entry.sl,target:best.entry.target,reason:best.entry.reason})})}catch(e){console.warn('WhatsApp setup link:',e.message);return null}
}
async function loadAlertConfig(){try{const c=await api('/api/alerts/config');whatsappRecipients=Array.isArray(c.phones)?c.phones:(c.phone?[c.phone]:[]);whatsappRecipient=whatsappRecipients[0]||'';for(let i=1;i<=5;i++){const el=$('alertPhone'+i);if(el&&!el.value)el.value=whatsappRecipients[i-1]||''}$('smsStatus').textContent=whatsappRecipients.length?`${whatsappRecipients.length} WhatsApp contact(s) saved. Each chat requires Send.`:'Save up to five WhatsApp contacts to prepare top-setup messages.'}catch(e){if($('smsStatus'))$('smsStatus').textContent='WhatsApp settings unavailable.'}}
if($('saveAlertPhone'))$('saveAlertPhone').onclick=async()=>{try{const phones=[];for(let i=1;i<=5;i++){const v=$('alertPhone'+i).value.trim();if(v)phones.push(v)}const r=await api('/api/alerts/config',{method:'POST',body:JSON.stringify({phones})});whatsappRecipients=r.phones||[];whatsappRecipient=whatsappRecipients[0]||'';$('smsStatus').textContent=r.message;loadAlertConfig()}catch(e){$('smsStatus').textContent=e.message}};

let oiFlowData=[];
function oiSignalClass(signal){
 const s=String(signal||"").toUpperCase();
 if(s==="LONG BUILD-UP"||s==="SHORT COVERING")return "bullish";
 if(s==="SHORT BUILD-UP"||s==="LONG UNWINDING")return "bearish";
 return "neutral";
}
function oiNum(v,digits=2){const n=Number(v);return Number.isFinite(n)?n.toLocaleString("en-IN",{maximumFractionDigits:digits}):"—"}
function renderOiFlow(){
 const body=$("oiFlowRows");if(!body)return;
 const filter=$("oiFlowFilter")?.value||"ALL",query=($("oiFlowSearch")?.value||"").trim().toUpperCase();
 const rows=oiFlowData.filter(x=>{
  const sig=String(x.signal||"");
  const filterOk=filter==="ALL"||(filter==="WAITING"?(!["LONG BUILD-UP","SHORT BUILD-UP","SHORT COVERING","LONG UNWINDING"].includes(sig)):sig===filter);
  return filterOk&&(!query||String(x.symbol+" "+x.name).toUpperCase().includes(query));
 });
 if(!rows.length){body.innerHTML=`<tr><td colspan="8">${oiFlowData.length?"No instruments match this filter.":"Waiting for valid futures OI data…"}</td></tr>`;return}
 body.innerHTML=rows.map(x=>{
  const cls=oiSignalClass(x.signal),priceDelta=Number(x.priceChangePct),oiDelta=Number(x.oiChange),oiPct=Number(x.oiChangePct);
  return `<tr><td><span class="oi-symbol">${esc(x.name||x.symbol)}</span><span class="oi-expiry">${esc(x.symbol)} · Exp ${esc(x.expiry||"—")}</span></td>
  <td><b>${x.price==null?"—":oiNum(x.price)}</b></td><td>${x.oi==null?"—":oiNum(x.oi,0)}</td>
  <td class="${Number.isFinite(priceDelta)?(priceDelta>0?"positive":priceDelta<0?"negative":""):""}">${Number.isFinite(priceDelta)?(priceDelta>0?"+":"")+oiNum(priceDelta)+"%":"—"}</td>
  <td class="${Number.isFinite(oiDelta)?(oiDelta>0?"positive":oiDelta<0?"negative":""):""}">${Number.isFinite(oiDelta)?(oiDelta>0?"+":"")+oiNum(oiDelta,0):"—"}</td>
  <td>${Number.isFinite(oiPct)?(oiPct>0?"+":"")+oiNum(oiPct)+"%":"—"}</td>
  <td><span class="oi-signal ${cls}">${esc(x.signal||"WAITING")}</span></td><td><span class="oi-status" title="${esc(x.reason||"")}">${esc(x.status||"WAITING")}</span></td></tr>`;
 }).join("");
}
async function refreshOiFlow(force=false){
 const status=$("oiFlowStatus");if(status&&!force&&status.dataset.loading==="1")return;
 if(status)status.dataset.loading="1";
 try{
  const d=await api("/api/oi-flow");
  oiFlowData=Array.isArray(d.rows)?d.rows:[];
  if(status)status.textContent=`${d.status||"WAITING"} · ${d.message||"No additional details."} · ${oiFlowData.length} futures instruments · Updated ${d.at?new Date(d.at).toLocaleTimeString("en-IN"):"—"}`;
  renderOiFlow();
 }catch(e){
  if(status)status.textContent=`OI FLOW WAITING · ${e.message||"Upstox futures data unavailable."}`;
  oiFlowData=[];renderOiFlow();
 }finally{if(status)status.dataset.loading="0"}
}
$("refreshOiFlow")?.addEventListener("click",()=>refreshOiFlow(true));
$("oiFlowFilter")?.addEventListener("change",renderOiFlow);
$("oiFlowSearch")?.addEventListener("input",renderOiFlow);

async function refresh(){if(refreshing)return;refreshing=true;try{try{statusData=await api('/api/status')}catch(e){$('connection').textContent='SERVER RETRY';$('connection').className='pill warn';$('connection').title=e.message||'Local server unavailable; automatic refresh will retry.';const stamp=$('lastUpdate');if(stamp)stamp.textContent='Connection issue · last valid market snapshot retained · retrying automatically';return}$('connection').textContent=statusData.tokenConfigured?'UPSTOX TOKEN SET':'TOKEN REQUIRED';$('connection').className='pill '+(statusData.tokenConfigured?'safe':'warn');if(Date.now()-(window.__ajsIndexOverviewAt||0)>30000){window.__ajsIndexOverviewAt=Date.now();loadIndexOverview().catch(()=>{})}$('indexCount').textContent=`${statusData.instruments.filter(x=>x.kind==='index'&&x.configured).length} / 2`;$('stockCount').textContent=`${statusData.instruments.filter(x=>x.kind==='equity'&&x.configured).length} / 11`;const previousCache=cache;const results=await mapWithConcurrency(statusData.instruments,3,async item=>{try{const [ltp,intra,five]=await Promise.all([getLtp(item),getData(item,'15m'),getData(item,'5m')]);return{item,ltp:ltp?.error?null:ltp,daily:previousCache[item.id]?.daily||{ready:false,reason:'Daily score loading in background'},intra,five,entry:entrySignal(intra,five)}}catch(error){return{item,ltp:null,daily:previousCache[item.id]?.daily||{ready:false,reason:error.message},intra:{ready:false,reason:error.message},five:{ready:false,reason:error.message},entry:{signal:'WAIT',score:0,entry:null,sl:null,target:null,reason:error.message}}}});// Retain last valid market snapshot during a transient API failure.
// A successful fresh response still replaces the snapshot, including legitimate WAIT states.
for(const next of results){
 const prev=previousCache[next.item.id];
 if(!prev)continue;
 if(!next.five?.ready&&prev.five?.ready&&prev.five.last?.t&&istDateFormatter.format(new Date(prev.five.last.t))===istDateFormatter.format(new Date())){next.five=prev.five;next.fiveStale=true;}
 if(!next.intra?.ready&&prev.intra?.ready){next.intra=prev.intra;next.intraStale=true;}
 if(!next.ltp&&prev.ltp){next.ltp=prev.ltp;next.ltpStale=true;}
 if(next.fiveStale||next.intraStale){
   next.entry=entrySignal(next.intra,next.five);
   next.entryStale=true;
 }
}
cache=Object.fromEntries(results.map(x=>[x.item.id,x]));updateIndexScoreCards();updateNiftyBoxScoresAndBreadth();const b1ById=new Map(results.map(x=>[x.item.id,stockRangeB1(x)]));const ranked=[...results].sort((a,b)=>{
// Priority groups across ALL instruments:
// 0 TARGET ACHIEVED, 1 RUNNING, 2 IN/WAITING RANGE, 3 FAILED/SL HIT/INVALIDATED.
const ta=getLockedB1Trade(a,stockRangeB1(a)),tb=getLockedB1Trade(b,stockRangeB1(b));
const ba=b1ById.get(a.item.id),bb=b1ById.get(b.item.id);
const isFailed=(t,b1)=>t?.status==='SL HIT'||t?.status==='INVALIDATED'||/^B[1-3] FAILED$/i.test(b1?.status||'')||/^FAILED$/i.test(b1?.status||'')||((b1?.stages||[]).length===3&&(b1.stages||[]).every(st=>/^(FAILED|INVALIDATED)$/i.test(String(st.state||''))));
const priority=(t,b1)=>{
 if(t?.status==='TARGET ACHIEVED')return 0;
 if(t?.status==='RUNNING')return 1;
 if(isFailed(t,b1))return 3;
 return 2;
};
const ga=priority(ta,ba),gb=priority(tb,bb);
if(ga!==gb)return ga-gb;
// Within every category, highest live CALL/PUT score comes first.
const sa=chosenScore(a),sb=chosenScore(b);
const av=sa?.ready?Math.max(Number(sa.call)||0,Number(sa.put)||0):-1;
const bv=sb?.ready?Math.max(Number(sb.call)||0,Number(sb.put)||0):-1;
if(av!==bv)return bv-av;
const edgeA=sa?.ready?Math.abs((Number(sa.call)||0)-(Number(sa.put)||0)):-1;
const edgeB=sb?.ready?Math.abs((Number(sb.call)||0)-(Number(sb.put)||0)):-1;
if(edgeA!==edgeB)return edgeB-edgeA;
return String(a.item.name).localeCompare(String(b.item.name));
});
// Select exactly one TOP PICK. Prefer an already-running trade; otherwise require
// a completed 5m entry confirmation, directional score >=80 and >=20-point edge.
const stockPool=ranked.filter(x=>x.item.kind==='equity');
const topPick=stockPool.find(x=>{
 const b1=stockRangeB1(x),trade=getLockedB1Trade(x,b1);
 if(trade?.status==='RUNNING')return true;
 if(trade?.status==='SL HIT'||trade?.status==='TARGET ACHIEVED'||/^B[1-3] FAILED$/i.test(b1.status||''))return false;
 const s=chosenScore(x),side=x.entry?.signal;
 if(!s?.ready||!['CALL','PUT'].includes(side))return false;
 const primary=Number(side==='CALL'?s.call:s.put)||0,opposite=Number(side==='CALL'?s.put:s.call)||0;
 return primary>=80&&primary-opposite>=20&&Number.isFinite(Number(x.entry.entry))&&Number.isFinite(Number(x.entry.sl))&&Number.isFinite(Number(x.entry.target));
});
const top=ranked[0],confirmed=ranked.find(x=>['CALL','PUT'].includes(x.entry.signal)&&x.entry.score>=70),best=confirmed||top,bestSide=confirmed?.entry.signal||'WAIT';if(confirmed)prepareTopSetupWhatsApp(confirmed).then(()=>{});
// Keep stock order strictly score/status based. TOP PICK is a visual marker only;
 // it must never jump ahead of a higher-ranked stock or either index card.
const stockRanked=stockPool.slice();
const b1Confirmed=stockRanked.map(x=>({x,b1:stockRangeB1(x)})).filter(z=>/^B1 CONFIRMED$/.test(z.b1.status));
const b1Items=$('b1ConfirmedItems'),b1Status=$('b1TickerStatus');
if(b1Items)b1Items.innerHTML=b1Confirmed.length?b1Confirmed.slice(0,8).map((z,i)=>`<span class="b1-ticker-chip ${z.b1.side==='CALL'?'b1-chip-call':'b1-chip-put'}"><b>${i+1}</b> ${esc(z.x.item.name)} <strong>${z.b1.side}</strong></span>`).join(''):'<span class="b1-ticker-empty">No B1-confirmed stock · Waiting for completed 5m candles</span>';
if(b1Status)b1Status.textContent=b1Confirmed.length?`LIVE B1 ALERTS · ${b1Confirmed.length} CONFIRMED`:'LIVE B1 ALERTS · WAITING';
const fixedIndexes=ranked.filter(x=>x.item.kind==='index').sort((a,b)=>({NIFTY:0,BANKNIFTY:1}[a.item.id]??99)-({NIFTY:0,BANKNIFTY:1}[b.item.id]??99));const rankedStocks=ranked.filter(x=>x.item.kind==='equity');const rankedCards=fixedIndexes.map((x,i)=>scorePanel(x,i+1)).concat(rankedStocks.map((x,i)=>scorePanel(x,i+1,!!topPick&&x.item.id===topPick.item.id)));$('rankedGrid').innerHTML=rankedCards.join('');renderLockedEAlert(results);if($('stocks'))$('stocks').innerHTML=results.slice(2).map(x=>{const sc=chosenScore(x);return `<tr data-stock="${x.item.id}" tabindex="0"><td><div class="stock-icon">${esc(x.item.id.slice(0,3))}</div><strong>${esc(x.item.name)}</strong><br><small>${esc(x.item.key||'Instrument key required')}</small></td><td><b>${x.ltp?fmt(x.ltp.ltp):'WAITING'}</b></td><td>${x.daily?.ready?`${x.daily.call} / ${x.daily.put}`:'—'}</td><td><span class="mini-score">${sc?.ready?sc.call:'—'}</span></td><td><span class="mini-score put">${sc?.ready?sc.put:'—'}</span></td><td><span class="signal ${x.entry.signal.toLowerCase()}">${x.entry.signal}</span></td><td>${fmt(x.entry.entry)} / ${fmt(x.entry.sl)} / ${fmt(x.entry.target)}</td><td><button class="secondary" data-open="${x.item.id}">Open workspace ↗</button></td></tr>`}).join('');$('lastUpdate').textContent=new Date().toLocaleTimeString('en-IN')+(results.some(x=>x.fiveStale||x.intraStale||x.ltpStale)?' · Some data delayed (last valid snapshot)':'');document.querySelectorAll('[data-stock],[data-open],[data-ranked]').forEach(el=>{el.onclick=null;el.onkeydown=null;el.removeAttribute('tabindex');el.removeAttribute('role');});document.querySelectorAll('[data-whatsapp-setup]').forEach(btn=>{btn.onclick=e=>{e.stopPropagation();const item=cache[btn.dataset.whatsappSetup];if(!item||!whatsappRecipients.length){alert('Save up to five WhatsApp contacts in Settings first.');return}const msg=`AJS TOP SETUP\n${item.item.name} ${item.entry.signal}\nScore: ${item.entry.score}/100\nEntry: ${fmtWhole(item.entry.entry)}\nSL: ${fmtWhole(item.entry.sl)}\nTarget: ${fmtWhole(item.entry.target)}\nReason: ${item.entry.reason||'-'}\nVerify live market conditions before trading.`;const urls=whatsappRecipients.map(phone=>`https://wa.me/${phone.replace(/[^0-9]/g,'')}?text=${encodeURIComponent(msg)}`);const tabs=urls.map(()=>window.open('about:blank','_blank'));tabs.forEach((tab,i)=>{if(tab)tab.location.href=urls[i]});if(tabs.some(t=>!t))alert('Browser blocked some tabs. Allow pop-ups for localhost, then click again. You must press Send in each WhatsApp chat.')}});if(statusData.instruments.some(item=>!cache[item.id]?.daily?.ready)&&!window.__ajsDailyBackgroundBusy&&Date.now()-(window.__ajsDailyBackgroundAt||0)>300000){window.__ajsDailyBackgroundBusy=true;window.__ajsDailyBackgroundAt=Date.now();mapWithConcurrency(statusData.instruments,2,async item=>({id:item.id,daily:await getData(item,'daily')})).then(rows=>{for(const row of rows){if(cache[row.id])cache[row.id].daily=row.daily}return refresh()}).catch(()=>{}).finally(()=>{window.__ajsDailyBackgroundBusy=false})}}finally{refreshing=false}}async function loadPaper(){try{const p=await api('/api/paper');$('paperToggle').checked=p.enabled;$('tradeCount').textContent=p.trades.filter(t=>t.status==='OPEN').length;$('paperMessage').textContent=p.enabled?'Paper trading ON · all positions simulated; real orders disabled.':'Paper trading OFF';const open=p.trades.filter(t=>t.status==='OPEN'),realized=p.trades.filter(t=>t.status!=='OPEN').reduce((s,t)=>s+(Number(t.realizedPnl)||0),0),unrealized=open.reduce((s,t)=>s+(Number(t.pnl)||0),0);$('portfolioOpen').textContent=open.length;setPnl('realizedPnl',realized);setPnl('unrealizedPnl',unrealized);setPnl('totalPnl',realized+unrealized);$('paperRows').innerHTML=p.trades.map(t=>`<tr><td>${new Date(t.createdAt).toLocaleTimeString()}</td><td><strong>${esc(t.name)}</strong><br><small>${esc(t.tradingSymbol||t.instrumentId)}</small>${t.tradeType==='OPTION'?`<br><small>SL ${fmt(t.stop)} · TGT ${fmt(t.target)}</small>`:''}</td><td>${t.tradeType==='OPTION'?`OPTION ${esc(t.side)}`:esc(t.side)}</td><td>${fmt(t.entry)}</td><td>${fmt(t.ltp)}</td><td>${t.tradeType==='OPTION'?`${t.lots} × ${t.lotSize} = ${t.quantity}`:t.quantity}</td><td>${money(t.invested||t.entry*t.quantity)}</td><td class="${t.pnl>=0?'good':'bad'}">${money(t.pnl||0)}</td><td><span class="signal ${t.status==='OPEN'?'call':'wait'}">${esc(t.status)}</span></td><td>${t.status==='OPEN'?`<button class="secondary" data-close="${t.id}">Close</button>`:'—'}</td></tr>`).join('')||'<tr><td colspan="10" class="muted">No paper positions yet. Open a stock workspace to buy an ATM option in paper mode.</td></tr>';document.querySelectorAll('[data-close]').forEach(b=>b.onclick=async()=>{try{await api(`/api/paper/close/${b.dataset.close}`,{method:'POST'});await loadPaper()}catch(e){alert(e.message)}})}catch(e){}}function setPnl(id,v){const el=$(id);el.textContent=money(v);el.className=v>0?'good':v<0?'bad':''}function openDetail(id){selectedId=id;$('detailPanel').classList.remove('hidden');updateAiMiniPanel();$('detailPanel').scrollIntoView({behavior:'smooth',block:'start'});requestAnimationFrame(()=>{drawDetail(id);requestAnimationFrame(()=>drawChart(cache[id]?.five))})}function drawDetail(id){const x=cache[id];if(!x)return;$('detailName').textContent=x.item.name;$('detailSub').textContent=`${x.item.key||'Instrument key not configured'} · LTP ${x.ltp?fmt(x.ltp.ltp):'WAITING'} · Score 15m / entry 5m`;const sc=chosenScore(x);$('detailScores').innerHTML=`<div class="detail-metric"><span>${esc($('view').value)} CALL score</span><b class="good">${sc?.ready?sc.call+'/100':'WAITING'}</b><small>Daily ${x.daily?.ready?x.daily.call:'—'} call points</small></div><div class="detail-metric"><span>${esc($('view').value)} PUT score</span><b class="bad">${sc?.ready?sc.put+'/100':'WAITING'}</b><small>Daily ${x.daily?.ready?x.daily.put:'—'} put points</small></div><div class="detail-metric"><span>5m entry status</span><b>${x.entry.signal}</b><small>${esc(x.entry.reason)}</small></div><div class="detail-metric"><span>5m last completed close</span><b>${x.five?.ready?fmt(x.five.last.c):'—'}</b><small>SL ${fmt(x.entry.sl)} · Target ${fmt(x.entry.target)}</small></div>`;x.chartFrameData=x.five;activeChartFrame='5m';document.querySelectorAll('[data-frame]').forEach(b=>b.classList.toggle('active',b.dataset.frame==='5m'));drawChart(x.chartFrameData);drawParameters(x);if(!$('optionsTab').classList.contains('hidden')&&(!optionData||Date.now()-optionLastFetch>4500))loadOptions()}let chartZoom=1,activeChartFrame='5m',horizontalLineMode=false,horizontalLines={},lastChartGeometry=null,chartPanBars=0,chartPanY=0,selectedHorizontalLine=-1,chartPointerDrag=null;
function drawChart(ind){const canvas=$('candleChart');if(!canvas)return;const ctx=canvas.getContext('2d'),dpr=window.devicePixelRatio||1,rect=canvas.getBoundingClientRect(),w=Math.max(320,Math.floor(rect.width||canvas.parentElement?.clientWidth||900)),h=Math.max(260,Math.floor(rect.height||320));canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);ctx.fillStyle='#fbfdff';ctx.fillRect(0,0,w,h);if(!ind?.rows?.length){ctx.fillStyle='#718096';ctx.font='13px Inter,Arial';ctx.fillText(ind?.reason||'No completed candles available',18,35);$('chartFoot').textContent='Chart waiting for live/historical candle data.';return}const visibleCount=Math.max(20,Math.min(250,Math.round(100/(chartZoom||1)))),maxOffset=Math.max(0,ind.rows.length-visibleCount),offset=Math.max(0,Math.min(maxOffset,maxOffset+chartPanBars)),rows=ind.rows.slice(offset,offset+visibleCount),series={e9:ind.e9Series?.slice(offset),e21:ind.e21Series?.slice(offset),e50:ind.e50Series?.slice(offset),vwap:ind.vwapSeries?.slice(offset),dma:ind.dma200Series?.slice(offset),st:ind.supertrendSeries?.slice(offset),dir:ind.supertrendDirSeries?.slice(offset)};const pad={l:12,r:68,t:18,b:44},cw=w-pad.l-pad.r,ch=h-pad.t-pad.b;const priceMin=Math.min(...rows.map(c=>c.l)),priceMax=Math.max(...rows.map(c=>c.h)),baseRange=Math.max(priceMax-priceMin,Math.abs(priceMax)*0.002,1);const plotted=rows.flatMap((c,i)=>[c.l,c.h,...Object.values(series).map(a=>Array.isArray(a)?a[i]:null).filter(v=>Number.isFinite(v)&&v>0&&Math.abs(v-(c.c||priceMin))<=baseRange*4)]);const rawMin=Math.min(...plotted),rawMax=Math.max(...plotted),rangeSpan=rawMax-rawMin||1,shift=chartPanY*rangeSpan,min=rawMin+shift,max=rawMax+shift,range=max-min||1,y=v=>pad.t+(max-v)/range*ch;lastChartGeometry={min,max,range,pad,ch,w,h,step:cw/rows.length,offset,visibleCount};ctx.font='10px Inter,Arial';ctx.strokeStyle='#e7edf5';ctx.fillStyle='#77859a';for(let i=0;i<=4;i++){const yy=pad.t+ch*i/4,val=max-range*i/4;ctx.beginPath();ctx.moveTo(pad.l,yy);ctx.lineTo(w-pad.r,yy);ctx.stroke();ctx.fillText(fmt(val),w-pad.r+7,yy+3)}const step=cw/rows.length,body=Math.max(2,Math.min(8,step*.56));
(horizontalLines[selectedId]||[]).forEach((line,idx)=>{const item=typeof line==='number'?{price:line,color:'#b7791f'}:line,price=Number(item.price);if(price<min||price>max)return;const yy=y(price);ctx.save();ctx.strokeStyle=item.color||'#b7791f';ctx.lineWidth=idx===selectedHorizontalLine?2.6:1.6;ctx.setLineDash(idx===selectedHorizontalLine?[]:[6,4]);ctx.beginPath();ctx.moveTo(pad.l,yy);ctx.lineTo(w-pad.r,yy);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=item.color||'#b7791f';ctx.fillRect(w-pad.r+2,yy-8,62,16);ctx.fillStyle='#fff';ctx.fillText(fmt(price),w-pad.r+5,yy+3);if(idx===selectedHorizontalLine){ctx.strokeStyle='#111827';ctx.lineWidth=1;ctx.strokeRect(pad.l,yy-3,w-pad.l-pad.r,6)}ctx.restore();});
rows.forEach((c,i)=>{const x=pad.l+i*step+step/2,up=c.c>=c.o,col=up?'#15945a':'#d54a51';ctx.strokeStyle=col;ctx.fillStyle=col;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,y(c.h));ctx.lineTo(x,y(c.l));ctx.stroke();ctx.fillRect(x-body/2,y(Math.max(c.o,c.c)),body,Math.max(1,Math.abs(y(c.o)-y(c.c))))});const lines=[['e9','#159447','EMA 9'],['e21','#2474D2','EMA 21'],['vwap','#171717','VWAP'],['e50','#E88724','EMA 50'],['dma','#8539B5','DMA 200']];for(const [key,color] of lines){const a=series[key];if(!a)continue;ctx.strokeStyle=color;ctx.lineWidth=1.7;ctx.beginPath();let begun=false;a.forEach((v,i)=>{if(!Number.isFinite(v)){begun=false;return}const x=pad.l+i*step+step/2;if(!begun){ctx.moveTo(x,y(v));begun=true}else ctx.lineTo(x,y(v))});ctx.stroke()}const st=series.st,dir=series.dir;if(st){for(let i=1;i<st.length;i++){if(!Number.isFinite(st[i-1])||!Number.isFinite(st[i]))continue;ctx.strokeStyle=(dir?.[i]||1)>=0?'#159447':'#d73542';ctx.lineWidth=2.2;ctx.beginPath();ctx.moveTo(pad.l+(i-1)*step+step/2,y(st[i-1]));ctx.lineTo(pad.l+i*step+step/2,y(st[i]));ctx.stroke()}}ctx.fillStyle='#718096';ctx.font='10px Inter,Arial';const axisEl=$('chartTimeAxis');if(axisEl)axisEl.textContent=`${activeChartFrame==='daily'?'1 Day':activeChartFrame.toUpperCase()} · Time: IST · ${rows.length} candles`;const labelCount=Math.min(6,rows.length);for(let j=0;j<labelCount;j++){const idx=Math.round(j*(rows.length-1)/Math.max(1,labelCount-1)),c=rows[idx],x=pad.l+idx*step+step/2;let dt=new Date(c.t);if(!Number.isFinite(dt.getTime()))dt=new Date(c[0]);const label=activeChartFrame==='daily'?dt.toLocaleDateString('en-IN',{day:'2-digit',month:'short',timeZone:'Asia/Kolkata'}):dt.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Kolkata'});ctx.fillText(label,Math.max(pad.l,Math.min(w-pad.r-30,x-15)),h-22);}ctx.fillStyle='#159447';ctx.fillText('EMA9',12,h-8);ctx.fillStyle='#2474D2';ctx.fillText('EMA21',56,h-8);ctx.fillStyle='#171717';ctx.fillText('VWAP',108,h-8);ctx.fillStyle='#E88724';ctx.fillText('EMA50',154,h-8);ctx.fillStyle='#8539B5';ctx.fillText('DMA200',210,h-8);ctx.fillStyle='#159447';ctx.fillText('ST ▲/▼',270,h-8);const last=rows[rows.length-1];$('chartFoot').textContent=`${rows.length} ${activeChartFrame} candles · Close ${fmt(last.c)} · RSI(14) ${fmt(ind.rsi)} · EMA 9 ${fmt(ind.e9)} · EMA 21 ${fmt(ind.e21)} · VWAP ${fmt(ind.vwap)} · EMA 50 ${fmt(ind.e50)} · DMA 200 ${fmt(ind.dma200)} · SuperTrend ${fmt(ind.supertrend)} (${ind.supertrendDir>0?'GREEN':'RED'})`}function drawParameters(x){const a=chosenScore(x),rows=[];if(a?.ready){const mid=(a.last.h+a.last.l)/2,prev=a.rows[a.rows.length-2],prior=a.rows[Math.max(0,a.rows.length-6)],hi=Math.max(...a.rows.slice(-6,-1).map(r=>r.h)),lo=Math.min(...a.rows.slice(-6,-1).map(r=>r.l));const vals=[['EMA 9 vs EMA 21',`${fmt(a.e9)} vs ${fmt(a.e21)}`,a.e9>a.e21,a.e9<a.e21],['EMA 21 vs EMA 50',`${fmt(a.e21)} vs ${fmt(a.e50)}`,a.e21>a.e50,a.e21<a.e50],['Price vs VWAP',`${fmt(a.last.c)} vs ${fmt(a.vwap)}`,a.last.c>a.vwap,a.last.c<a.vwap],['Candle close location',`${fmt(a.last.c)} vs mid ${fmt(mid)}`,a.last.c>=mid,a.last.c<=mid],['RSI (14)',fmt(a.rsi),a.rsi>55,a.rsi<45],['Candle momentum direction',`${fmt(prev.c)} → ${fmt(a.last.c)}`,a.last.c>prev.c,a.last.c<prev.c],['Volume strength',`${fmt(a.last.v)} / avg ${fmt(a.volAvg)}`,a.last.v>a.volAvg*1.5&&a.last.c>a.last.o,a.last.v>a.volAvg*1.5&&a.last.c<a.last.o],['Breakout / breakdown',`High ${fmt(hi)} · Low ${fmt(lo)}`,a.last.c>hi,a.last.c<lo],['HH-HL / LH-LL',`H ${fmt(a.last.h)} · L ${fmt(a.last.l)}`,a.last.h>prev.h&&a.last.l>prev.l,a.last.h<prev.h&&a.last.l<prev.l],['5-candle momentum',fmt(a.last.c-prior.c),a.last.c>prior.c,a.last.c<prior.c],['SuperTrend',`${fmt(a.supertrend)} (${a.supertrendDir>0?'GREEN':'RED'})`,a.supertrendDir>0,a.supertrendDir<0],['DMA 200',fmt(a.dma200),a.last.c>a.dma200,a.last.c<a.dma200],['ATR (risk measure)',fmt(a.atr),false,false]];for(const [n,v,c,p] of vals)rows.push(`<tr><td>${esc(n)}</td><td>${esc(v)}</td><td class="${c?'status-pass':'status-fail'}">${c?'✓ +10':'— 0'}</td><td class="${p?'status-pass':'status-fail'}">${p?'✓ +10':'— 0'}</td></tr>`);$('parameterSummary').innerHTML=`<span>CALL ${a.call}/100</span><span>PUT ${a.put}/100</span><span>RSI ${fmt(a.rsi)}</span><span>VWAP ${fmt(a.vwap)}</span><span>EMA 9 ${fmt(a.e9)}</span><span>EMA 21 ${fmt(a.e21)}</span><span>EMA 50 ${fmt(a.e50)}</span><span>DMA 200 ${fmt(a.dma200)}</span><span>SuperTrend ${fmt(a.supertrend)} (${a.supertrendDir>0?'GREEN':'RED'})</span><span>ATR ${fmt(a.atr)}</span>`}else{$('parameterSummary').innerHTML=`<span>${esc(a?.reason||'Waiting for candle data')}</span>`;rows.push('<tr><td colspan="4">Indicator values unavailable until sufficient completed candles arrive.</td></tr>')}$('parameterRows').innerHTML=rows.join('')}async function loadOptions(){if(!selectedId)return;optionData=null;optionLastFetch=Date.now();$('optionNotice').textContent='Fetching option contracts and live ATM premiums from Upstox…';$('optionCards').innerHTML='';try{const d=await api(`/api/option-chain/${selectedId}`);optionData=d;$('optionNotice').textContent=`Underlying ${d.underlyingName} ${fmt(d.spot)} · Expiry ${d.expiry} · ATM strike ${fmt(d.strike)} · source Upstox`;const sides=[['CALL',d.call,'call'],['PUT',d.put,'put']];$('optionCards').innerHTML=sides.map(([name,o,cls])=>{if(!o)return`<div class="option-card ${cls}"><b>${name}</b><p class="muted">Option contract unavailable for this underlying/expiry.</p></div>`;if(!Number.isFinite(Number(o.ltp))||Number(o.ltp)<=0)return`<article class="option-card ${cls}"><b>ATM ${name} · ${esc(o.tradingSymbol||'')}</b><div class="option-price">LTP unavailable</div><p class="muted">Upstox returned the contract, but no valid live premium quote. Refresh or check market-data permission.</p><div>Lot size: ${fmt(o.lotSize)}</div></article>`;return`<article class="option-card ${cls}"><div class="option-head"><span class="option-side">ATM ${name} · ${esc(o.tradingSymbol)}</span><span class="signal ${cls}">${name} OPTION</span></div><div class="option-price">${money(o.ltp)}</div><div class="option-symbol">Strike ${fmt(d.strike)} · Expiry ${esc(d.expiry)}</div><div class="option-details"><div><span>Lot size</span><b>${fmt(o.lotSize)}</b></div><div><span>Bid / Ask</span><b>${fmt(o.bid)} / ${fmt(o.ask)}</b></div><div><span>OI / Volume</span><b>${fmt(o.oi)} / ${fmt(o.volume)}</b></div></div><button class="buy-btn" data-buy-option="${name}">Buy ${name} · PAPER</button></article>`}).join('');document.querySelectorAll('[data-buy-option]').forEach(b=>b.onclick=()=>showBuyModal(b.dataset.buyOption))}catch(e){$('optionNotice').textContent=`Option data unavailable: ${e.message}. Check token, instrument key, option API permission and market data.`}}function optionRiskPlan(side,o){const x=cache[selectedId],score=x?.intra?.ready?(side==='CALL'?x.intra.call:x.intra.put):0,opposite=x?.intra?.ready?(side==='CALL'?x.intra.put:x.intra.call):0,aligned=x?.entry?.signal===side,spot=Number(optionData?.spot)||Number(x?.ltp?.ltp)||0,atr=Number(x?.five?.atr)||0;const atrPct=spot>0?atr/spot:0;const stopPct=Math.max(.15,Math.min(.30,atrPct*1.5));const risk=Number(o.ltp)*stopPct;const stop=Number((Number(o.ltp)-risk).toFixed(2));const target=Number((Number(o.ltp)+risk*2).toFixed(2));const strength=Math.max(0,Math.min(100,Math.round(score*.7+Math.max(0,score-opposite)*.3+(aligned?10:0))));return{score,opposite,aligned,stop,target,stopPct:stopPct*100,strength,approved:score>=70&&score>opposite&&aligned&&strength>=70}}function showBuyModal(side){const o=side==='CALL'?optionData?.call:optionData?.put;if(!o||!Number.isFinite(Number(o.ltp))||!Number(o.lotSize)){alert('Valid live option LTP and real lot size are required.');return}const plan=optionRiskPlan(side,o);pendingOption={side,o,plan};$('modalTitle').textContent=`Buy ATM ${side} · Paper`; $('modalInfo').innerHTML=`<b>${esc(o.tradingSymbol)}</b><br>Premium: ${money(o.ltp)} · Lot size: ${o.lotSize}<br>Expiry: ${esc(optionData.expiry)} · Strike: ${fmt(optionData.strike)}<br><b>Auto Stop Loss:</b> ${money(plan.stop)} &nbsp; <b>Auto Target:</b> ${money(plan.target)}<br><b>Setup strength:</b> ${plan.strength}/100 · ${plan.approved?'Conditions aligned':'Not a high-confidence confirmed setup'}<br><span class="muted">SL/target are estimates based on premium risk and underlying ATR; not a guaranteed probability or profit.</span><br>Paper mode only — no real order will be placed.`;$('lotCount').value=1;calcOrder();$('tradeModal').classList.remove('hidden')}function calcOrder(){if(!pendingOption)return;const lots=Math.max(1,Math.floor(Number($('lotCount').value)||1)),qty=lots*Number(pendingOption.o.lotSize);$('orderQty').textContent=`${lots} × ${pendingOption.o.lotSize} = ${qty}`;$('orderValue').textContent=money(qty*Number(pendingOption.o.ltp))}$('lotCount').oninput=calcOrder;$('confirmPaperBuy').onclick=async()=>{if(!pendingOption)return;const lots=Math.max(1,Math.floor(Number($('lotCount').value)||1));try{await api('/api/paper/option-buy',{method:'POST',body:JSON.stringify({underlyingId:selectedId,side:pendingOption.side,instrumentKey:pendingOption.o.instrumentKey,lotSize:pendingOption.o.lotSize,lots,entry:pendingOption.o.ltp,stop:pendingOption.plan.stop,target:pendingOption.plan.target,score:pendingOption.plan.score,setupStrength:pendingOption.plan.strength,tradingSymbol:pendingOption.o.tradingSymbol,expiry:optionData.expiry,strike:optionData.strike})});const riskText=`Auto SL ${money(pendingOption.plan.stop)} / target ${money(pendingOption.plan.target)} saved.`;$('tradeModal').classList.add('hidden');pendingOption=null;await loadPaper();alert(`Paper option position created. ${riskText} Live P&L updates when Upstox returns LTP.`)}catch(e){alert(e.message)}};$('modalClose').onclick=()=>$('tradeModal').classList.add('hidden');$('tradeModal').onclick=e=>{if(e.target===$('tradeModal'))$('tradeModal').classList.add('hidden')};$('closeDetail').onclick=()=>$('detailPanel').classList.add('hidden');document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-tab]').forEach(t=>t.classList.toggle('active',t===b));['analysis','options','parameters'].forEach(k=>$(k+'Tab').classList.toggle('hidden',k!==b.dataset.tab));if(b.dataset.tab==='options')loadOptions()});$('loadOptions').onclick=loadOptions;$('paperToggle').onchange=async e=>{try{await api('/api/paper/toggle',{method:'POST',body:JSON.stringify({enabled:e.target.checked})});await loadPaper()}catch(err){alert(err.message)}};$('refreshNow').onclick=refresh;$('chartZoomIn').onclick=()=>{chartZoom=Math.min(4,chartZoom*1.35);chartPanBars=0;if(selectedId)drawChart(cache[selectedId]?.chartFrameData||cache[selectedId]?.five)};$('chartZoomOut').onclick=()=>{chartZoom=Math.max(.5,chartZoom/1.35);chartPanBars=0;if(selectedId)drawChart(cache[selectedId]?.chartFrameData||cache[selectedId]?.five)};$('chartZoomReset').onclick=()=>{chartZoom=1;chartPanBars=0;chartPanY=0;if(selectedId)drawChart(cache[selectedId]?.chartFrameData||cache[selectedId]?.five)};
document.querySelectorAll('[data-frame]').forEach(btn=>btn.addEventListener('click',async()=>{const frame=btn.dataset.frame;activeChartFrame=frame;document.querySelectorAll('[data-frame]').forEach(b=>b.classList.toggle('active',b===btn));if(!selectedId)return;const x=cache[selectedId];btn.disabled=true;try{x.chartFrameData=await getData(x.item,frame);drawChart(x.chartFrameData);$('chartMeta').textContent=`${frame==='daily'?'1 Day':frame.toUpperCase()} candlestick chart · Upstox`}finally{btn.disabled=false}}));
$('horizontalLineBtn').onclick=()=>{horizontalLineMode=!horizontalLineMode;$('horizontalLineBtn').classList.toggle('active',horizontalLineMode);$('horizontalLineBtn').setAttribute('aria-pressed',String(horizontalLineMode));$('chartFoot').textContent=horizontalLineMode?'Marking ON — click chart to add a line; drag a line to move it.':'Marking OFF — drag the chart to pan; click a line to select it.';const c=$('candleChart');if(c)c.style.cursor=horizontalLineMode?'crosshair':'grab';};
const chartCanvas=$('candleChart');
chartCanvas.addEventListener('pointerdown',e=>{if(!lastChartGeometry||!selectedId)return;const rect=chartCanvas.getBoundingClientRect(),g=lastChartGeometry,localX=e.clientX-rect.left,localY=e.clientY-rect.top,lines=horizontalLines[selectedId]||[];if(horizontalLineMode)return;let hit=-1,dist=Infinity;/* Only grab a marking when the pointer is inside the plotting area; price-axis dragging pans the chart vertically. */if(localX>=g.pad.l&&localX<=g.w-g.pad.r&&localY>=g.pad.t&&localY<=g.pad.t+g.ch){lines.forEach((line,i)=>{const price=typeof line==='number'?line:line.price,yy=g.pad.t+(g.max-price)/g.range*g.ch,d=Math.abs(yy-localY);if(d<dist&&d<9){dist=d;hit=i}})}if(hit>=0){selectedHorizontalLine=hit;const item=lines[hit],price=typeof item==='number'?item:item.price;chartPointerDrag={type:'line',pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,startPrice:price,moved:false};}else{chartPointerDrag={type:'pan',pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,panBars:chartPanBars,panY:chartPanY,moved:false};chartCanvas.style.cursor='grabbing'}try{chartCanvas.setPointerCapture(e.pointerId)}catch(_){}e.preventDefault();});
chartCanvas.addEventListener('pointermove',e=>{if(!chartPointerDrag||!lastChartGeometry||!selectedId||chartPointerDrag.pointerId!==e.pointerId)return;const g=lastChartGeometry,dx=e.clientX-chartPointerDrag.startX,dy=e.clientY-chartPointerDrag.startY;if(Math.abs(dx)+Math.abs(dy)>3)chartPointerDrag.moved=true;if(chartPointerDrag.type==='line'){const price=chartPointerDrag.startPrice-dy/g.ch*g.range,lines=horizontalLines[selectedId]||[],old=lines[selectedHorizontalLine];if(old!==undefined)lines[selectedHorizontalLine]=typeof old==='number'?price:{...old,price};}else{/* Horizontal drag scrolls candle history; vertical drag shifts the visible price scale. */chartPanBars=chartPointerDrag.panBars-Math.round(dx/Math.max(1,g.step));chartPanY=chartPointerDrag.panY+dy/Math.max(1,g.ch);}drawChart(cache[selectedId]?.chartFrameData||cache[selectedId]?.five);e.preventDefault()});
let suppressChartClickUntil=0;function finishChartPointer(e){if(chartPointerDrag&&e?.pointerId!==undefined&&chartPointerDrag.pointerId!==e.pointerId)return;if(chartPointerDrag?.moved)suppressChartClickUntil=Date.now()+250;if(chartPointerDrag?.type==='pan'&&chartCanvas)chartCanvas.style.cursor=horizontalLineMode?'crosshair':'grab';chartPointerDrag=null}
chartCanvas.addEventListener('pointerup',finishChartPointer);chartCanvas.addEventListener('pointercancel',finishChartPointer);chartCanvas.addEventListener('lostpointercapture',finishChartPointer);
chartCanvas.addEventListener('click',e=>{if(Date.now()<suppressChartClickUntil||!lastChartGeometry||!selectedId)return;const r=e.currentTarget.getBoundingClientRect(),yPix=e.clientY-r.top,g=lastChartGeometry,innerY=yPix-g.pad.t;if(innerY<0||innerY>g.ch)return;const lines=horizontalLines[selectedId]||(horizontalLines[selectedId]=[]);if(horizontalLineMode){const price=g.max-(innerY/g.ch)*g.range,color=$('lineColor')?.value||'#d4a017';lines.push({price,color});selectedHorizontalLine=lines.length-1;drawChart(cache[selectedId]?.chartFrameData||cache[selectedId]?.five);return}let hit=-1,dist=Infinity;lines.forEach((line,i)=>{const price=typeof line==='number'?line:line.price,yy=g.pad.t+(g.max-price)/g.range*g.ch,d=Math.abs(yy-innerY);if(d<dist&&d<9){dist=d;hit=i}});if(hit>=0){selectedHorizontalLine=hit;const line=lines[hit];if($('lineColor')&&typeof line!=='number')$('lineColor').value=line.color||'#d4a017';drawChart(cache[selectedId]?.chartFrameData||cache[selectedId]?.five)}});
$('lineColor')?.addEventListener('change',()=>{const lines=horizontalLines[selectedId]||[],line=lines[selectedHorizontalLine];if(line!==undefined){lines[selectedHorizontalLine]=typeof line==='number'?{price:line,color:$('lineColor').value}:{...line,color:$('lineColor').value};drawChart(cache[selectedId]?.chartFrameData||cache[selectedId]?.five)}});
$('deleteHorizontalLine')?.addEventListener('click',()=>{const lines=horizontalLines[selectedId]||[];if(selectedHorizontalLine<0||!lines[selectedHorizontalLine]){if(lines.length){selectedHorizontalLine=lines.length-1}else{$('chartFoot').textContent='Select a line first, then click Delete line.';return}}lines.splice(selectedHorizontalLine,1);selectedHorizontalLine=lines.length-1;drawChart(cache[selectedId]?.chartFrameData||cache[selectedId]?.five);$('chartFoot').textContent='Selected horizontal line deleted.'});
async function loadUpstoxTokenStatus(){try{const d=await api('/api/settings/upstox');$('upstoxTokenStatus').textContent=d.configured?`Token saved (${d.masked}) · source: ${d.source}. Verify/refresh when token expires.`:'No token saved. Add your Upstox access token below.';}catch(e){$('upstoxTokenStatus').textContent=e.message}}
$('toggleTokenVisibility').onclick=()=>{const i=$('upstoxAccessToken');i.type=i.type==='password'?'text':'password';$('toggleTokenVisibility').textContent=i.type==='password'?'Show':'Hide'};
$('saveUpstoxToken').onclick=async()=>{const token=$('upstoxAccessToken').value.trim();if(!token){$('upstoxTokenStatus').textContent='Please paste your access token first.';return}const b=$('saveUpstoxToken');b.disabled=true;b.textContent='Verifying…';$('upstoxTokenStatus').textContent='Testing token with Upstox profile API…';try{const d=await api('/api/settings/upstox',{method:'POST',body:JSON.stringify({accessToken:token})});$('upstoxAccessToken').value='';$('upstoxTokenStatus').textContent=d.message+' '+d.masked;await refresh();await loadUpstoxTokenStatus()}catch(e){$('upstoxTokenStatus').textContent='Not saved: '+e.message}finally{b.disabled=false;b.textContent='Verify & Save Token'}};
$('removeUpstoxToken').onclick=async()=>{if(!confirm('Remove the saved Upstox token from this computer?'))return;try{const d=await api('/api/settings/upstox',{method:'DELETE'});$('upstoxAccessToken').value='';$('upstoxTokenStatus').textContent=d.message;await refresh()}catch(e){$('upstoxTokenStatus').textContent=e.message}};
$('view').onchange=()=>refresh().catch(()=>{});$('refresh').onchange=()=>{clearInterval(refreshTimer);refreshTimer=setInterval(()=>{if(!document.hidden)refresh().catch(()=>{})},Math.max(30,Number($('refresh').value)||30)*1000)};$('settingsBtn').onclick=()=>{$('settings').classList.remove('hidden');renderKeys();loadUpstoxTokenStatus()};$('closeSettings').onclick=()=>$('settings').classList.add('hidden');function renderKeys(){$('keySettings').innerHTML=(statusData?.instruments||[]).map(i=>`<div class="key-row"><label>${esc(i.name)}</label><input id="key-${i.id}" value="${esc(i.key)}" placeholder="EXCHANGE|instrument_key"></div>`).join('')}$('saveKeys').onclick=async()=>{for(const i of statusData.instruments){const k=$('key-'+i.id).value.trim();if(k!==i.key){try{await api(`/api/instruments/${i.id}/key`,{method:'POST',body:JSON.stringify({key:k})})}catch(e){alert(`${i.name}: ${e.message}`);return}}}await refresh();renderKeys();alert('Instrument keys saved permanently.')};window.addEventListener('resize',()=>{if(selectedId)drawChart(cache[selectedId]?.chartFrameData||cache[selectedId]?.five)});
let liveEventSource=null;
function startLiveStream(){
  if(!('EventSource' in window))return;
  if(liveEventSource)liveEventSource.close();
  liveEventSource=new EventSource('/api/live/events');
  liveEventSource.onmessage=(event)=>{
    let msg;try{msg=JSON.parse(event.data)}catch{return}
    if(msg.type==='status'){
      const st=msg.status||{};
      const el=$('connection');
      if(el){el.textContent=st.status==='LIVE'?'UPSTOX LIVE':(st.status||'WEBSOCKET');el.className='pill '+(st.connected?'safe':'warn');el.title=st.message||'';}
      return;
    }
    if(msg.type!=='tick'||!msg.quote)return;
    const q=msg.quote,id=q.id;
    if(cache[id])cache[id].ltp=q;
    document.querySelectorAll(`[data-live-ltp="${id}"]`).forEach(el=>el.textContent=fmt(q.ltp));
    document.querySelectorAll(`[data-live-ts="${id}"]`).forEach(el=>el.textContent='LIVE');
    if(id==='NIFTY'||id==='BANKNIFTY'){
      const isNifty=id==='NIFTY';
      const stickyPrice=$(isNifty?'stickyNiftyPrice':'stickyBankPrice');
      if(stickyPrice&&Number.isFinite(Number(q.ltp)))stickyPrice.textContent=fmt(q.ltp);
      const overview=document.querySelector(`[data-live-ltp="${id}"]`);
      if(overview)overview.title=`Last tick ${q.ts||new Date().toISOString()}`;
    }
    if(msg.candle){
      const c=msg.candle;
      const k=id+':5m',cached=candleCache[k];
      if(cached?.value?.rows?.length){
        const rows=cached.value.rows.slice();
        const last=rows[rows.length-1], stamp=new Date(c.t).toISOString();
        const row={t:stamp,o:Number(c.o),h:Number(c.h),l:Number(c.l),c:Number(c.c),v:Number(c.v)||0,live:true};
        if(last&&new Date(last.t).getTime()===c.t)rows[rows.length-1]=row;
        else rows.push(row);
        cached.value={...cached.value,rows};
        if(cache[id]?.five?.rows?.length){
          const displayRows=cache[id].five.rows.slice();
          const lastDisplay=displayRows[displayRows.length-1];
          if(lastDisplay&&new Date(lastDisplay.t).getTime()===c.t)displayRows[displayRows.length-1]=row;
          else displayRows.push(row);
          cache[id].five={...cache[id].five,rows:displayRows};
        }
        if(id==='NIFTY'&&openingRangeLevels){
          const dayNow=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
          if(openingRangeLevels.day===dayNow){
            const watchRows=(cached.value.rows||[]).map(r=>[r.t,r.o,r.h,r.l,r.c,r.v]);
            updateBreakoutWatch(watchRows,openingRangeLevels.high,openingRangeLevels.low,new Date());
          }
        }
        if(selectedId===id){
          const plot={...(cache[id]?.five||cached.value),rows:(cache[id]?.five?.rows||rows).slice(-100)};
          drawChart(plot);
          const foot=$('chartFoot');if(foot)foot.textContent=`LIVE 5m candle · O ${fmt(c.o)} · H ${fmt(c.h)} · L ${fmt(c.l)} · LTP ${fmt(c.c)} · Volume ${fmtWhole(c.v)}`;
        }
      }
    }
  };
  liveEventSource.onerror=()=>{const el=$('connection');if(el){el.title='Live stream reconnecting; verify Upstox token and market hours.';}};
}


async function runAjsAiAnalysis(questionOverride){
 const x=selectedId?cache[selectedId]:null;
 if(!x){alert('Pehle kisi stock ya index card par click karein.');return}
 const score=chosenScore(x)||{};
 const payload={
  symbol:x.item.name, ltp:x.ltp?.ltp, timeframe:$('view')?.value||'15m',
  callScore:score.ready?score.call:null, putScore:score.ready?score.put:null,
  entrySignal:x.entry?.signal||'WAIT',entryReason:x.entry?.reason||'',
  stopLoss:x.entry?.sl,target:x.entry?.target,lastClose:x.five?.ready?x.five.last.c:null,
  question:questionOverride||''
 };
 const result=$('aiAnalysisResult'),btn=$('runAiAnalysis');
 if(result){result.innerHTML='<b>Analysing…</b><p>Reviewing available scores and entry status.</p>'}
 if(btn){btn.disabled=true;btn.textContent='Analysing…'}
 try{
  const out=await api('/api/ai/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  if(result){result.replaceChildren();const badge=document.createElement('b');badge.textContent=out.mode==='openai'?'AI ANALYSIS · OpenAI':'RULE-BASED ANALYSIS · AI KEY NOT SET';result.appendChild(badge);const para=document.createElement('p');para.style.whiteSpace='pre-wrap';para.textContent=out.answer||out.error||'No analysis returned.';result.appendChild(para)}
 }catch(e){if(result){result.replaceChildren();const para=document.createElement('p');para.textContent='Analysis failed: '+(e.message||'Server unavailable');result.appendChild(para)}}
 finally{if(btn){btn.disabled=false;btn.textContent='✦ Analyse with AI'}}
}
function updateAiMiniPanel(){
 const x=selectedId?cache[selectedId]:null;if(!x)return;
 const score=chosenScore(x)||{};
 const put=(id,val)=>{const el=$(id);if(el)el.textContent=val};
 put('aiAnalysisSub',`${x.item.name} · ${$('view')?.value||'15m'} score · 5m entry confirmation`);
 put('aiCallScore',score.ready?`${score.call}/100`:'WAITING');
 put('aiPutScore',score.ready?`${score.put}/100`:'WAITING');
 put('aiSignal',x.entry?.signal||'WAIT');
 put('aiLtp',x.ltp?fmt(x.ltp.ltp):'WAITING');
}
$('runAiAnalysis')?.addEventListener('click',()=>runAjsAiAnalysis(''));
$('askAiQuestion')?.addEventListener('click',()=>{const q=$('aiQuestion')?.value?.trim()||'';if(!q){alert('Apna sawal likhein.');return}runAjsAiAnalysis(q)});
$('aiQuestion')?.addEventListener('keydown',e=>{if(e.key==='Enter')runAjsAiAnalysis($('aiQuestion').value.trim())});

startLiveStream();loadAlertConfig();refresh().catch(()=>{});refreshOpeningBox().catch(()=>{});refreshTimer=setInterval(()=>{if(!document.hidden)refresh().catch(()=>{})},30000);setInterval(()=>{if(!document.hidden)refreshOpeningBox().catch(()=>{})},60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden){refresh().catch(()=>{});refreshOpeningBox().catch(()=>{})}});


function updateOpeningEntryFilterScore(candles,hi,lo,now){
 const set=(id,v)=>{const n=$(id);if(n)n.textContent=v};
 const rowsRoot=$('entryFilterRows'),summary=$('entryFilterSummary');
 const completed=(candles||[]).filter(c=>Array.isArray(c)&&c.length>=6&&new Date(c[0]).getTime()+300000<=now.getTime()).sort((a,b)=>new Date(a[0])-new Date(b[0]));
 const ind=indicators(completed),bank=cache.BANKNIFTY?.five;
 const last=ind.ready?ind.last:null,prev=ind.ready?ind.rows[ind.rows.length-2]:null;
 const localTime=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now);
 const timeOk=localTime>='09:45';
 const callB1=$('entryConfirmSide')?.textContent?.trim()==='CALL'&&/CONFIRMED/i.test($('entryConfirmStatus')?.textContent||'');
 const putB1=$('entryConfirmSide')?.textContent?.trim()==='PUT'&&/CONFIRMED/i.test($('entryConfirmStatus')?.textContent||'');
 const bankReady=!!bank?.ready;
 const bankBull=bankReady&&bank.call>bank.put,bankBear=bankReady&&bank.put>bank.call;
 const rows=[
  ['1. Time after 09:45',timeOk,timeOk,'9:45 IST onward'],
  ['2. NIFTY direction',!!(ind.ready&&last&&prev&&last.c>prev.c),!!(ind.ready&&last&&prev&&last.c<prev.c),ind.ready?'Latest completed candle direction':'Waiting for indicators'],
  ['3. BANK NIFTY confirmation',bankBull,bankBear,bankReady?`5m score ${bank.call}/${bank.put}`:'BANK NIFTY 5m data unavailable'],
  ['4. 5m close outside opening range',!!(last&&last.c>hi),!!(last&&last.c<lo),last?`Last close ${fmt(last.c)} · High ${fmt(hi)} · Low ${fmt(lo)}`:'Waiting for completed candles'],
  ['5. Volume ≥ 1.5× 20-candle average',!!(ind.ready&&last&&last.v>=ind.volAvg*1.5&&last.c>last.o),!!(ind.ready&&last&&last.v>=ind.volAvg*1.5&&last.c<last.o),ind.ready?`Volume ${fmtWhole(last.v)} / avg ${fmtWhole(ind.volAvg)}`:'Volume data unavailable'],
  ['6. Price vs VWAP',!!(ind.ready&&last&&last.c>ind.vwap),!!(ind.ready&&last&&last.c<ind.vwap),ind.ready?`Close ${fmt(last.c)} · VWAP ${fmt(ind.vwap)}`:'VWAP unavailable'],
  ['7. EMA 9 vs EMA 21',!!(ind.ready&&ind.e9>ind.e21),!!(ind.ready&&ind.e9<ind.e21),ind.ready?`EMA9 ${fmt(ind.e9)} · EMA21 ${fmt(ind.e21)}`:'EMA data unavailable'],
  ['8. B1 retest / hold confirmed',callB1,putB1,'B1 must be completed and setup must remain valid'],
  ['9. RSI(14) strength',!!(ind.ready&&ind.rsi>55),!!(ind.ready&&ind.rsi<45),ind.ready?`RSI ${fmt(ind.rsi)} · CALL >55 / PUT <45`:'RSI unavailable'],
  ['10. Supertrend confirmation',!!(ind.ready&&ind.supertrendDir>0&&last&&last.c>ind.supertrend),!!(ind.ready&&ind.supertrendDir<0&&last&&last.c<ind.supertrend),ind.ready?`${ind.supertrendDir>0?'GREEN':'RED'} · ST ${fmt(ind.supertrend)}`:'Supertrend unavailable']
 ];
 const callScore=rows.filter(r=>r[1]===true).length,putScore=rows.filter(r=>r[2]===true).length;
 const ready=ind.ready;
 set('niftyCallScoreExpiry',ready?`${callScore}/10`:'WAITING');set('niftyPutScoreExpiry',ready?`${putScore}/10`:'WAITING');set('niftyCallScoreOpening',ready?`${callScore}/10`:'WAITING');set('niftyPutScoreOpening',ready?`${putScore}/10`:'WAITING');
 if(summary){const callLabel=callScore>=9?'STRONG CANDIDATE':callScore===8?'WAIT · 8/10':'NO ENTRY';const putLabel=putScore>=9?'STRONG CANDIDATE':putScore===8?'WAIT · 8/10':'NO ENTRY';summary.textContent=ready?`CALL ${callScore}/10 · ${callLabel}  |  PUT ${putScore}/10 · ${putLabel}. B1, candle close and risk rules still apply; score alone never triggers entry.`:'Filter score WAITING · need sufficient completed candles and indicator data.';}
 if(rowsRoot){rowsRoot.innerHTML=`<div class="filter-col-head"><span>FILTER</span><span>CALL</span><span>PUT</span></div>`+rows.map(r=>`<div class="filter-row"><span class="filter-name" title="${esc(r[3])}">${esc(r[0])}</span><span class="${r[1]===true?'filter-pass':r[1]===false?'filter-fail':'filter-na'}">${r[1]===true?'PASS':ready?'FAIL':'—'}</span><span class="${r[2]===true?'filter-pass':r[2]===false?'filter-fail':'filter-na'}">${r[2]===true?'PASS':ready?'FAIL':'—'}</span></div>`).join('')+`<p class="opening-note">${esc(rows.map(r=>`${r[0]}: ${r[3]}`).join(' · '))}</p>`;}
}
function updateNiftyBoxScoresAndBreadth(){
 const set=(id,v)=>{const el=$(id);if(el)el.textContent=v};
 const nifty=cache.NIFTY,score=nifty?chosenScore(nifty):null;
 set('niftyCallScore',score?.ready?`${score.call}/100`:'WAITING');
 set('niftyPutScore',score?.ready?`${score.put}/100`:'WAITING');
 set('stickyNiftyCallScore',score?.ready?`${score.call}/100`:'WAITING');
 set('stickyNiftyPutScore',score?.ready?`${score.put}/100`:'WAITING');
 const applyStickyBias=(card,sideScore)=>{
  if(!card)return;
  const valid=!!(sideScore?.ready&&Number.isFinite(Number(sideScore.call))&&Number.isFinite(Number(sideScore.put)));
  const call=valid?Number(sideScore.call):null,put=valid?Number(sideScore.put):null;
  const low=valid&&call<60&&put<60;
  const callBias=valid&&!low&&call>put;
  const putBias=valid&&!low&&put>call;
  card.classList.toggle('bias-low',!!low);
  card.classList.toggle('bias-call',!!callBias);
  card.classList.toggle('bias-put',!!putBias);
  card.classList.toggle('bias-neutral',!valid||(!low&&!callBias&&!putBias));
  card.setAttribute('data-bias-state',!valid?'unavailable':low?'low-score':callBias?'call':putBias?'put':'balanced');
 };
 applyStickyBias($('ajsStickyTicker')?.querySelector('.ticker-nifty'),score);
 const bank=cache.BANKNIFTY||cache.BANK_NIFTY,bankScore=bank?chosenScore(bank):null;
 set('stickyBankCallScore',bankScore?.ready?`${bankScore.call}/100`:'WAITING');
 set('stickyBankPutScore',bankScore?.ready?`${bankScore.put}/100`:'WAITING');
 applyStickyBias($('ajsStickyTicker')?.querySelector('.ticker-bank'),bankScore);
 const conf=score?.ready?Math.max(score.call,score.put):null;
 set('niftyConfidence',conf==null?'WAITING':`${score.call===score.put?'MIXED · ':score.call>score.put?'CALL · ':'PUT · '}${conf}%`);set('stickyConfidence',conf==null?'WAITING':`${score.call===score.put?'MIXED · ':score.call>score.put?'CALL · ':'PUT · '}${conf}%`);
 const ids=['RELIANCE','BHARTIARTL','ICICIBANK','AXISBANK','BAJFINANCE','BAJAJFINSV','HDFCBANK','SBIN','SBILIFE','HDFCLIFE','TECHM'];
 let adv=0,dec=0,unch=0,waiting=0;const detail=[];
 for(const id of ids){
  const x=cache[id],ltp=Number(x?.ltp?.ltp),rows=x?.daily?.rows||[];
  if(!Number.isFinite(ltp)||ltp<=0||rows.length<2){waiting++;continue}
  const prev=Number(rows[rows.length-1].c),pct=prev>0?(ltp-prev)/prev*100:NaN;
  if(!Number.isFinite(pct)){waiting++;continue}
  if(pct>0.0001)adv++;else if(pct< -0.0001)dec++;else unch++;
  detail.push(`${x.item.name}: ${pct>0?'+':''}${pct.toFixed(2)}%`);
 }
 set('breadthAdvances',adv);set('breadthDeclines',dec);set('breadthUnchanged',unch);
 set('breadthStocks',waiting?`${detail.join(' · ')}${detail.length?' · ':''}${waiting} stock(s) waiting for live LTP/daily close.`:detail.join(' · ')||'Waiting for stock data.');
}

function launchFlowerShower(){
 const layer=document.createElement('div');layer.className='ajs-flower-shower';layer.setAttribute('aria-hidden','true');
 const flowers=['🌸','🌺','🌼','🌷','🎆','🎉'];
 for(let i=0;i<42;i++){const f=document.createElement('span');f.textContent=flowers[i%flowers.length];f.style.left=(Math.random()*100)+'%';f.style.animationDelay=(Math.random()*1.8)+'s';f.style.animationDuration=(2.8+Math.random()*2.2)+'s';f.style.fontSize=(16+Math.random()*20)+'px';layer.appendChild(f)}
 document.body.appendChild(layer);setTimeout(()=>layer.remove(),6500);
}
function celebrateAtmTrigger(side,triggerLevel,spotClose){
 launchFlowerShower();
 const root=$('openingPro');if(root){root.classList.remove('ajs-celebrate');void root.offsetWidth;root.classList.add('ajs-celebrate');setTimeout(()=>root.classList.remove('ajs-celebrate'),6500)}
 let layer=$('ajsTriggerWelcome');if(!layer){layer=document.createElement('div');layer.id='ajsTriggerWelcome';layer.className='ajs-trigger-welcome';layer.setAttribute('role','dialog');layer.setAttribute('aria-live','assertive');document.body.appendChild(layer)}
 const title=side==='CALL'?'WELCOME TO ATM CALL ENTRY':'WELCOME TO ATM PUT ENTRY';
 layer.innerHTML=`<div class="ajs-welcome-card"><button class="ajs-welcome-close" aria-label="Close">×</button><div class="ajs-confetti" aria-hidden="true">🌸 🎉 🎆 🌸 🎊 🎇 🌸</div><div class="ajs-welcome-kicker">NIFTY BOX 1 · 5-MINUTE CLOSE CONFIRMED</div><h2>${title}</h2><p>Trigger level: <b>${fmt(triggerLevel)}</b> · Confirmed candle close: <b>${fmt(spotClose)}</b></p><div class="ajs-welcome-plan"><div><small>ATM OPTION</small><b id="ajsWelcomeSymbol">Fetching live option…</b></div><div><small>LIVE PREMIUM / ENTRY</small><b id="ajsWelcomeEntry">Waiting for live quote</b></div><div><small>STOP LOSS</small><b id="ajsWelcomeSL">—</b></div><div><small>TARGET (2R estimate)</small><b id="ajsWelcomeTarget">—</b></div></div><p class="ajs-welcome-note">Confirmation is based on a completed 5-minute candle close. Verify the live premium and risk before trading. No order is placed automatically.</p><button class="ajs-welcome-dismiss">CONTINUE</button></div>`;
 const close=()=>layer.classList.remove('show');layer.querySelector('.ajs-welcome-close').onclick=close;layer.querySelector('.ajs-welcome-dismiss').onclick=close;layer.classList.add('show');
 // Refresh the actual ATM option quote and calculate a premium-based illustrative SL/target.
 api('/api/option-chain/NIFTY').then(d=>{const o=side==='CALL'?d.call:d.put;if(!o||!Number.isFinite(Number(o.ltp))||Number(o.ltp)<=0)throw Error('No valid live ATM premium');const premium=Number(o.ltp),risk=premium*.2;layer.querySelector('#ajsWelcomeSymbol').textContent=o.tradingSymbol||`ATM ${side} ${fmt(d.strike)}`;layer.querySelector('#ajsWelcomeEntry').textContent=money(premium);layer.querySelector('#ajsWelcomeSL').textContent=money(Math.max(0,premium-risk));layer.querySelector('#ajsWelcomeTarget').textContent=money(premium+risk*2)}).catch(()=>{layer.querySelector('#ajsWelcomeSymbol').textContent=`ATM ${side} · live data pending`;layer.querySelector('#ajsWelcomeEntry').textContent='Waiting for valid Upstox LTP';layer.querySelector('#ajsWelcomeSL').textContent='—';layer.querySelector('#ajsWelcomeTarget').textContent='—'});
}
function updateBreakoutWatch(candles,hi,lo,now){
 const el=$('breakoutWatch');if(!el)return;
 const set=(id,v)=>{const n=$(id);if(n)n.textContent=v};
 const stage=(id,state)=>{const n=$(id);if(n)n.className='entry-stage '+state};
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 const timeOf=c=>new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(c[0]));
 const dateOf=c=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(c[0]));
 const closed=candles.filter(c=>dateOf(c)===day&&timeOf(c)>='09:45'&&new Date(c[0]).getTime()+300000<=now.getTime()).sort((a,b)=>new Date(a[0])-new Date(b[0]));
 if(openingBreakState.day!==day)openingBreakState={day,side:null,breakoutIndex:-1,triggered:false,triggerKey:null,sequence:1};
 let sequence=1,active=null,pending=null,lastInvalidated=null;
 const sideAt=c=>Number(c[4])>hi?'CALL':Number(c[4])<lo?'PUT':null;
 for(let i=0;i<closed.length;i++){
  const candle=closed[i],close=Number(candle[4]),inside=Number.isFinite(close)&&close>=lo&&close<=hi;
  if(active){
   if(inside){lastInvalidated=active;sequence=Math.min(3,(Number(active.sequence)||1)+1);active=null;}
   continue;
  }
  if(pending){
   const side=pending.side,b1=candle,b1h=Number(b1[2]),b1l=Number(b1[3]),b1c=Number(b1[4]);
   const retest=side==='CALL'?(b1l<=hi&&b1c>=hi):(b1h>=lo&&b1c<=lo);
   const continuation=side==='CALL'?b1c>hi:b1c<lo;
   if(Number.isFinite(b1c)&&(retest||continuation))active={side,sequence:pending.sequence||sequence,breakout:pending.candle,b1,confirmedAt:new Date(b1[0]).getTime()+300000,retest};
   pending=null;continue;
  }
  const side=sideAt(candle);if(side){const nextSequence=sequence===2?3:sequence;pending={side,candle,sequence:nextSequence};sequence=nextSequence;}
 }
 const liveSpot=Number($('orSpot')?.textContent?.replace(/,/g,''));
 const side=active?.side||pending?.side||lastInvalidated?.side||null;
 const label=`B${active?.sequence||sequence}`;
 stage('entryStageBreak',active||pending?'stage-done':'');
 stage('entryStageB1',active?'stage-done':pending?'stage-wait':lastInvalidated?'stage-fail':'');
 if(active){
  const ns=cache.NIFTY?.intra,bs=(cache.BANKNIFTY||cache.BANK_NIFTY)?.intra;
  const indexGate=!!(ns?.ready&&bs?.ready&&(side==='CALL'?ns.call>=80&&ns.call>ns.put&&bs.call>=80&&bs.call>bs.put:ns.put>=80&&ns.put>ns.call&&bs.put>=80&&bs.put>bs.call));
  if(!indexGate){
   el.className='breakout-watch wait-blue';el.textContent=`${label} ${side} CONFIRMED · WAIT · 15m NIFTY + BANK NIFTY scores must both be ≥80`;
   set('entryBreakStatus',`${side} breakout confirmed · range edge ${fmt(side==='CALL'?hi:lo)}.`);
   set('entryB1Status',`${label} candle pattern confirmed, but index score filter is not met.`);
   set('entryConfirmStatus',`FILTER BLOCKED · ${label} ${side} setup exists, but both index 15m scores must be >=80.`);
   set('entryConfirmSide','—');set('entryConfirmPlan','FILTER BLOCKED');return;
  }
  const stageClass=active.sequence===1?(side==='CALL'?'confirmed-green':'confirmed-red'):active.sequence===2?'confirmed-orange':'confirmed-blue';
  const triggerKey=`${day}|${side}|B${active.sequence}|${active.b1[0]}`;
  set('entryBreakStatus',`${side} breakout confirmed on close ${fmt(active.breakout[4])}; range edge ${fmt(side==='CALL'?hi:lo)}.`);
  set('entryB1Status',`${label} ${active.retest?'retest held':'break continuation'} confirmed · close ${fmt(active.b1[4])}.`);
  const st=$('entryConfirmStatus');if(st)st.className='entry-confirm-status '+stageClass;
  set('entryConfirmSide',side);set('entryConfirmPlan',`${label} ATM ${side}`);
  set('entryConfirmStatus',`✓ ${label} CONFIRMED · ${side} · ENTRY / SL / TARGET LOCKED`);
  el.className='breakout-watch '+stageClass;el.textContent=`✓ ${side} ENTRY CONFIRMED · ${label} · 30m RANGE ${active.retest?'RETEST':'BREAKOUT HOLD'} · ATM ${side}`;
  openingBreakState={day,side,breakoutIndex:closed.indexOf(active.breakout),triggered:true,triggerKey,sequence:active.sequence};
  const closeTime=new Date(active.b1[0]).getTime()+300000,signalFresh=now.getTime()>=closeTime&&now.getTime()-closeTime<300000;
  if(openingBreakState.lastCelebrated!==triggerKey&&signalFresh){celebrateAtmTrigger(side,side==='CALL'?Number(active.b1[3]):Number(active.b1[2]),Number(active.b1[4]));openingBreakState.lastCelebrated=triggerKey;}
  return;
 }
 if(pending){
  el.className='breakout-watch '+(sequence===1?(side==='CALL'?'breakout-purple':'breakdown-pink'):sequence===2?'confirmed-orange':'confirmed-blue');
  el.textContent=`${side} BREAKOUT CONFIRMED · WAIT FOR ${label} NEXT 5-MINUTE CANDLE`;
  set('entryBreakStatus',`${side} close beyond 30-minute range confirmed.`);
  set('entryB1Status',`Waiting for next completed 5-minute candle to confirm ${label}.`);
  const pendingStatus=$('entryConfirmStatus');if(pendingStatus)pendingStatus.className='entry-confirm-status '+(sequence===1?'wait-blue':sequence===2?'confirmed-orange':'confirmed-blue');set('entryConfirmStatus',`WAIT · ${label} pending. No entry until the next 5-minute candle closes successfully.`);
  set('entryConfirmSide','—');set('entryConfirmPlan',`${label} WAIT`);return;
 }
 if(lastInvalidated){
  el.className='breakout-watch '+(sequence===2?'confirmed-orange':'confirmed-blue');
  el.textContent=`${label} · PREVIOUS ${lastInvalidated.side} SETUP INVALIDATED · WAIT FOR FRESH BREAKOUT`;
  set('entryBreakStatus','Previous breakout was invalidated after a 5-minute close returned inside the opening range.');
  set('entryB1Status',`Next valid breakout confirmation will be ${label}.`);
  const invalidStatus=$('entryConfirmStatus');if(invalidStatus)invalidStatus.className='entry-confirm-status '+(sequence===2?'confirmed-orange':'confirmed-blue');set('entryConfirmStatus',`INVALIDATED · Price closed back inside range. Wait for a fresh breakout and ${label} confirmation.`);
  set('entryConfirmSide','—');set('entryConfirmPlan',`${label} WAIT`);return;
 }
 const outside=Number.isFinite(liveSpot)&&(liveSpot>hi||liveSpot<lo);
 el.className='breakout-watch '+(outside?(liveSpot>hi?'breakout-pending-call':'breakout-pending-put'):'wait-blue');
 el.textContent=outside?(liveSpot>hi?'WAIT · PRICE ABOVE RANGE · NEED 5-MINUTE CLOSE':'WAIT · PRICE BELOW RANGE · NEED 5-MINUTE CLOSE'):'WAIT · PRICE INSIDE OPENING RANGE · NO ENTRY';
 set('entryBreakStatus','Waiting for completed candle close outside 09:15–09:45 range.');
 set('entryB1Status',`Next successful breakout confirmation will be ${label}.`);
 set('entryConfirmStatus',new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now)<'09:45'?'WAITING · Opening range is still forming.':`WAIT · Waiting for a fresh breakout and ${label} confirmation.`);
 set('entryConfirmSide','—');set('entryConfirmPlan',`${label} WAIT`);
}
function calculateClassicPivots(high,low,close){
 const h=Number(high),l=Number(low),c=Number(close);
 if(![h,l,c].every(Number.isFinite)||h<=0||l<=0||c<=0||h<l||c>h||c<l)return null;
 const p=(h+l+c)/3,bc=(h+l)/2,tc=2*p-bc;
 const levels={p,s1:2*p-h,s2:p-(h-l),r1:2*p-l,r2:p+(h-l),bc,tc,high:h,low:l,close:c};
 return Object.values(levels).every(Number.isFinite)?levels:null;
}
function renderNiftyPivot(levels,spot){
 const set=(id,v)=>{const el=$(id);if(el)el.textContent=v};
 if(!levels){['pivotP','pivotS1','pivotS2','pivotR1','pivotR2','pivotBC','pivotTC'].forEach(id=>set(id,'—'));set('pivotSpotValue',Number.isFinite(spot)&&spot>0?fmt(spot):'—');set('pivotStatus','Waiting for valid previous completed daily candle.');return}
 set('pivotP',fmt(levels.p));set('pivotS1',fmt(levels.s1));set('pivotS2',fmt(levels.s2));set('pivotR1',fmt(levels.r1));set('pivotR2',fmt(levels.r2));set('pivotBC',fmt(levels.bc));set('pivotTC',fmt(levels.tc));set('pivotSpotValue',Number.isFinite(spot)&&spot>0?fmt(spot):'—');
 const low=levels.s2,high=levels.r2,range=high-low,position=v=>range>0?Math.max(0,Math.min(100,(v-low)/range*100)):50;const ratio=Number.isFinite(spot)&&spot>0?position(spot):50;const pct=ratio.toFixed(1)+'%';[['pivotMarkS2',levels.s2],['pivotMarkS1',levels.s1],['pivotMarkP',levels.p],['pivotMarkR1',levels.r1],['pivotMarkR2',levels.r2]].forEach(([id,v])=>{const el=$(id);if(el)el.style.left=position(v).toFixed(1)+'%'});const marker=$('pivotRailMarker'),line=$('pivotCurrentLine');if(marker)marker.style.left=pct;if(line)line.style.left=pct;
 set('pivotStatus',!Number.isFinite(spot)||spot<=0?'Current NIFTY price unavailable.':spot>levels.r2?'NIFTY above R2 · extension zone':spot>levels.r1?'NIFTY between R1 and R2':spot>levels.p?'NIFTY above Pivot · bullish side':spot>levels.s1?'NIFTY below Pivot · watch S1':spot>levels.s2?'NIFTY between S1 and S2':'NIFTY below S2 · support broken');
}
function renderOiBasedPivot(rows,spot,atmStrike){
 const ids=['S2','S1','R1','R2'];const set=(id,v)=>{const el=$(id);if(el)el.textContent=v};
 const valid=(rows||[]).filter(r=>Number.isFinite(Number(r.strike))&&Number(r.strike)>0);
 const putSide=valid.filter(r=>Number(r.strike)<spot&&Number.isFinite(Number(r.putOi))).sort((a,b)=>Number(b.putOi)-Number(a.putOi)).slice(0,2).sort((a,b)=>Number(b.strike)-Number(a.strike));
 const callSide=valid.filter(r=>Number(r.strike)>spot&&Number.isFinite(Number(r.callOi))).sort((a,b)=>Number(b.callOi)-Number(a.callOi)).slice(0,2).sort((a,b)=>Number(a.strike)-Number(b.strike));
 const levels=[{key:'S2',row:putSide[1],oi:'putOi',chg:'putOiChange'},{key:'S1',row:putSide[0],oi:'putOi',chg:'putOiChange'},{key:'R1',row:callSide[0],oi:'callOi',chg:'callOiChange'},{key:'R2',row:callSide[1],oi:'callOi',chg:'callOiChange'}];
 for(const x of levels){set(`oiPivot${x.key}Strike`,x.row?fmt(x.row.strike):'—');set(`oiPivot${x.key}Oi`,x.row&&Number.isFinite(Number(x.row[x.oi]))?fmtWhole(x.row[x.oi]):'—');const ch=x.row?.[x.chg];set(`oiPivot${x.key}Chg`,ch==null?'BASELINE':`${Number(ch)>0?'+':''}${fmtWhole(ch)}`);}
 set('oiPivotAtmStrike',Number.isFinite(Number(atmStrike))?fmt(atmStrike):'—');set('oiPivotSpot',Number.isFinite(Number(spot))&&Number(spot)>0?fmt(spot):'—');
 const all=[...putSide,...callSide].map(r=>Number(r.strike)).filter(Number.isFinite);if(Number.isFinite(Number(atmStrike)))all.push(Number(atmStrike));if(!all.length||!Number.isFinite(Number(spot))||Number(spot)<=0){set('oiPivotStatus','OI levels waiting for valid option-chain strikes and NIFTY spot.');return}
 let lo=Math.min(...all),hi=Math.max(...all);if(hi<=lo){lo-=50;hi+=50}const pos=v=>Math.max(0,Math.min(100,(Number(v)-lo)/(hi-lo)*100));
 for(const x of levels){const el=$(`oiPivotMark${x.key}`);if(el)el.style.left=x.row?`${pos(x.row.strike)}%`:'-10%'}const atm=$('oiPivotMarkATM');if(atm)atm.style.left=`${pos(atmStrike??spot)}%`;const bluePos=`${pos(spot)}%`;const marker=$('oiPivotBlueMarker'),line=$('oiPivotCurrentLine');if(marker)marker.style.left=bluePos;if(line)line.style.left=bluePos;
 set('oiPivotStatus',`OI-based zones use the strongest available Put OI below spot for support and Call OI above spot for resistance · blue marker = current NIFTY · OI change is since previous refresh.`);
}
let openingBoxRefreshing=false;async function refreshOpeningBox(){if(openingBoxRefreshing||document.hidden)return;openingBoxRefreshing=true;
 const set=(id,v)=>{const el=$(id);if(el)el.textContent=v};
 try{
  const [cd,ltp]=await Promise.all([api('/api/candles/NIFTY/5m'),api('/api/ltp/NIFTY')]);
  if(!niftyPivotCache.levels||Date.now()-niftyPivotCache.at>300000){try{const dd=await api('/api/candles/NIFTY/daily');const dateKey=value=>{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));const part=k=>parts.find(x=>x.type===k)?.value||'';return `${part('year')}-${part('month')}-${part('day')}`};const todayIst=dateKey(Date.now());const daily=(dd.candles||[]).filter(c=>Array.isArray(c)&&c.length>=5&&Number.isFinite(new Date(c[0]).getTime())&&dateKey(c[0])<todayIst).sort((a,b)=>new Date(a[0])-new Date(b[0]));const prev=daily[daily.length-1];if(prev){const levels=calculateClassicPivots(prev[2],prev[3],prev[4]);if(levels)niftyPivotCache={at:Date.now(),levels:{...levels,day:prev[0]}}}}catch(e){/* Keep waiting state; never invent pivot values. */}}
  renderNiftyPivot(niftyPivotCache.levels,Number(ltp?.ltp?.ltp??ltp?.ltp??ltp?.last_price));
  const candles=(cd.candles||[]).filter(c=>Array.isArray(c)&&c.length>=6);
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const localParts=c=>{const d=new Date(c[0]);return new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(d)};
  const opening=candles.filter(c=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(c[0]))===today && localParts(c)>='09:15' && localParts(c)<='09:40' && new Date(c[0]).getTime()+300000<=Date.now());
  const spot=Number(ltp?.ltp?.ltp??ltp?.ltp??ltp?.last_price);
  set('orSpot',Number.isFinite(spot)&&spot>0?fmt(spot):'WAITING');
  if(opening.length>=6){
   const hi=Math.max(...opening.map(c=>Number(c[2]))),lo=Math.min(...opening.map(c=>Number(c[3])));openingRangeLevels={day:today,high:hi,low:lo};
   set('orHigh',fmt(hi));set('orLow',fmt(lo));set('orSize',fmt(hi-lo)+' pts');set('stickyRangeHigh',fmt(hi));set('stickyRangeLow',fmt(lo));set('stickyRangePoints',fmt(hi-lo)+' pts');set('stickyRangeTarget',fmt((hi-lo)*0.5)+' pts');updateBreakoutWatch(candles,hi,lo,new Date());updateOpeningEntryFilterScore(candles,hi,lo,new Date());
   const toHigh=hi-spot,toLow=spot-lo;
   set('distHigh',Number.isFinite(spot)?(toHigh<=0?fmt(Math.abs(toHigh))+' pts ABOVE':fmt(toHigh)+' pts'):'—');
   set('distLow',Number.isFinite(spot)?(toLow<=0?fmt(Math.abs(toLow))+' pts BELOW':fmt(toLow)+' pts'):'—');set('stickyDistHigh',Number.isFinite(spot)?(toHigh<=0?fmt(Math.abs(toHigh))+' pts ABOVE':fmt(toHigh)+' pts'):'—');set('stickyDistLow',Number.isFinite(spot)?(toLow<=0?fmt(Math.abs(toLow))+' pts BELOW':fmt(toLow)+' pts'):'—');
   const pct=Math.max(0,Math.min(100,((spot-lo)/(hi-lo||1))*100));$('orProgress').style.width=pct+'%';
   const nowParts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date());
   set('orStatus',nowParts<'09:45'?'Opening range is forming; wait until 09:45 IST.':spot>hi?'Price above opening range — breakout needs candle-close confirmation.':spot<lo?'Price below opening range — breakdown needs candle-close confirmation.':'Range formed; price is inside the opening range — WAIT for breakout.');
   const recent=candles.slice(-4), momentum=recent.length>1?Number(recent[recent.length-1][4])-Number(recent[0][1]):0;
   // Explain current NIFTY movement in plain language from available live data.
   const todaysAll=candles.filter(c=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(c[0]))===today).sort((a,b)=>new Date(a[0])-new Date(b[0]));
   const closedRecent=todaysAll.filter(c=>new Date(c[0]).getTime()+300000<=Date.now()).slice(-3);
   const move3=closedRecent.length>=2?Number(closedRecent[closedRecent.length-1][4])-Number(closedRecent[0][1]):NaN;
   const upCandles=closedRecent.filter(c=>Number(c[4])>Number(c[1])).length;
   const downCandles=closedRecent.filter(c=>Number(c[4])<Number(c[1])).length;
   const headline=$('niftyMoveHeadline'),detail=$('niftyMoveDetail');
   let moveTitle='RANGE MODE · WAIT',moveDetail='NIFTY is trading inside the opening range. No confirmed directional breakout yet; wait for a completed 5-minute candle outside the range.';
   if(spot>hi){moveTitle='PRICE ABOVE OPENING RANGE · BREAKOUT WATCH';moveDetail='NIFTY is above the opening-range high. Check whether the latest completed 5-minute candle closed above the range and whether price holds above the high; otherwise it may be a false breakout.'}
   else if(spot<lo){moveTitle='PRICE BELOW OPENING RANGE · BREAKDOWN WATCH';moveDetail='NIFTY is below the opening-range low. Check for a completed 5-minute close below the range and continued selling; a quick return inside the range can invalidate the move.'}
   else if(Number.isFinite(move3)&&move3>0&&upCandles>downCandles){moveTitle='UPWARD PRESSURE · RANGE STILL INTACT';moveDetail='Recent completed candles are moving upward, but NIFTY has not cleared the opening-range high. This is momentum, not a confirmed CALL entry.'}
   else if(Number.isFinite(move3)&&move3<0&&downCandles>upCandles){moveTitle='DOWNWARD PRESSURE · RANGE STILL INTACT';moveDetail='Recent completed candles are moving downward, but NIFTY has not broken the opening-range low. This is pressure, not a confirmed PUT entry.'}
   if(headline){headline.textContent=moveTitle;headline.className='nifty-move-headline '+(spot>hi?'move-up':spot<lo?'move-down':'move-wait')}
   if(detail)detail.textContent=moveDetail;
   set('niftyMove3',Number.isFinite(move3)?`${move3>0?'+':''}${fmt(move3)} pts`:'Waiting for candles');
   set('niftyMoveRange',spot>hi?'ABOVE HIGH':spot<lo?'BELOW LOW':'INSIDE RANGE');
   set('niftyMoveUpdated','Updated '+new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date()));
   let up=50,down=50;
   if(spot>=(hi+lo)/2)up+=8;else down+=8;
   if(momentum>0)up+=Math.min(18,Math.abs(momentum)/(hi-lo||1)*100);else if(momentum<0)down+=Math.min(18,Math.abs(momentum)/(hi-lo||1)*100);
   if(spot>hi){up+=18;down-=18}else if(spot<lo){down+=18;up-=18}
   up=Math.max(5,Math.min(95,Math.round(up)));down=100-up;
   set('upChance',up+'%');set('downChance',down+'%');set('stickyUpStrength',up+'%');set('stickyDownStrength',down+'%');$('upBar').style.width=up+'%';$('downBar').style.width=down+'%';
   set('breakBias',spot>hi?'UPSIDE BREAKOUT WATCH':spot<lo?'DOWNSIDE BREAKDOWN WATCH':up>down?'UPSIDE BIAS — NOT CONFIRMED':down>up?'DOWNSIDE BIAS — NOT CONFIRMED':'NEUTRAL / WAIT');set('stickyBreakoutWatch',spot>hi?'BREAKOUT WATCH · PRICE ABOVE RANGE HIGH':spot<lo?'BREAKDOWN WATCH · PRICE BELOW RANGE LOW':'BREAKOUT WATCH · Waiting for complete opening range');
   set('breakReason',spot>hi?'Trading above range high. Confirm with a completed 5-minute candle and volume.':spot<lo?'Trading below range low. Confirm with a completed 5-minute candle and volume.':'Distance and recent candle momentum suggest a tentative bias only; wait for a confirmed close outside the range.');
  }else{
   openingRangeLevels=null;set('orHigh','—');set('orLow','—');set('orSize','—');set('distHigh','—');set('distLow','—');set('orStatus',opening.length?`Opening range incomplete (${opening.length}/6 candles).`:'Today’s 09:15–09:45 candles not available yet.');set('breakBias','WAITING FOR OPENING RANGE');set('breakReason','Range needs six completed 5-minute candles from 09:15 through 09:40 IST.');
   set('stickyRangeHigh','—');set('stickyRangeLow','—');set('stickyRangePoints','—');set('stickyRangeTarget','—');set('stickyDistHigh','—');set('stickyDistLow','—');set('stickyConfidence','WAITING');set('stickyUpStrength','—');set('stickyDownStrength','—');set('stickyBreakoutWatch','BREAKOUT WATCH · Waiting for complete opening range');set('upChance','—');set('downChance','—');set('niftyCallScore','WAITING');set('niftyPutScore','WAITING');set('niftyConfidence','WAITING');$('upBar').style.width='0%';$('downBar').style.width='0%';const bw=$('breakoutWatch');if(bw){bw.className='breakout-watch';bw.textContent='BREAKOUT WATCH · Waiting for complete opening range';}
  }
 }catch(e){setOpeningError('Range data: '+e.message)}
 try{
  const o=await api('/api/option-chain/NIFTY');
  set('atmExpiry',o.expiry||'—');set('atmStrike',o.strike!=null?fmt(o.strike):'—');
  set('atmCall',o.call?.ltp!=null?'₹'+fmt(o.call.ltp):'WAITING');set('atmPut',o.put?.ltp!=null?'₹'+fmt(o.put.ltp):'WAITING');
  set('callOi',o.call?.oi!=null?fmtWhole(o.call.oi):'—');set('putOi',o.put?.oi!=null?fmtWhole(o.put.oi):'—');
  const ch=o.atmOiChange||{};set('callOiChange',ch.call==null?'baseline pending':(ch.call>0?'+':'')+fmtWhole(ch.call));set('putOiChange',ch.put==null?'baseline pending':(ch.put>0?'+':'')+fmtWhole(ch.put));const ach=o.aggregateOiChange||{};set('totalCallOiChange',ach.call==null?'baseline pending':(ach.call>0?'+':'')+fmtWhole(ach.call));set('totalPutOiChange',ach.put==null?'baseline pending':(ach.put>0?'+':'')+fmtWhole(ach.put));
  const ag=o.aggregateOi||{};set('oiPcr',ag.pcr!=null?Number(ag.pcr).toFixed(2):'Unavailable');set('oiCompare',ag.call!=null&&ag.put!=null?`${fmtWhole(ag.call)} C / ${fmtWhole(ag.put)} P`:'Unavailable');
  set('niftyTodayPcr',ag.pcr!=null?Number(ag.pcr).toFixed(2):'Unavailable');
  set('niftyPcrBias',ag.pcr==null?'PCR unavailable':ag.pcr>1?'PCR > 1 · Put OI higher':ag.pcr<1?'PCR < 1 · Call OI higher':'PCR balanced');
  const rows=o.strikeOiRows||[];renderOiBasedPivot(rows,Number(o.spot??ltp?.ltp?.ltp??ltp?.ltp??ltp?.last_price),o.strike);const fmtChange=v=>v==null?'BASELINE':`${v>0?'+':''}${fmtWhole(v)}`;
  const allChg=rows.reduce((a,r)=>({c:a.c+(Number.isFinite(r.callOiChange)?r.callOiChange:0),p:a.p+(Number.isFinite(r.putOiChange)?r.putOiChange:0),cn:a.cn+(Number.isFinite(r.callOiChange)?1:0),pn:a.pn+(Number.isFinite(r.putOiChange)?1:0)}),{c:0,p:0,cn:0,pn:0});
  const lean=allChg.cn&&allChg.pn?(allChg.p>allChg.c?'PUT OI STRONGER':allChg.c>allChg.p?'CALL OI STRONGER':'BALANCED OI'):'OI BASELINE';set('niftyOiLean',lean);
  const rowRoot=$('niftyStrikeRows');if(rowRoot)rowRoot.innerHTML=rows.length?rows.map(r=>{const cMetric=r.callOiChange!=null?r.callOiChange:r.callOi,pMetric=r.putOiChange!=null?r.putOiChange:r.putOi;const cClass=cMetric==null?'oi-cell-neutral':pMetric==null?'oi-cell-neutral':cMetric>pMetric?'oi-cell-strong':cMetric<pMetric?'oi-cell-weak':'oi-cell-neutral';const pClass=pMetric==null?'oi-cell-neutral':cMetric==null?'oi-cell-neutral':pMetric>cMetric?'oi-cell-strong':pMetric<cMetric?'oi-cell-weak':'oi-cell-neutral';return `<tr class="${Number(r.strike)===Number(o.strike)?'atm-row':''}"><td>${fmt(r.strike)}${Number(r.strike)===Number(o.strike)?' · ATM':''}</td><td class="${cClass}">${r.callOi==null?'—':fmtWhole(r.callOi)}</td><td class="${cClass}">${fmtChange(r.callOiChange)}</td><td class="${pClass}">${r.putOi==null?'—':fmtWhole(r.putOi)}</td><td class="${pClass}">${fmtChange(r.putOiChange)}</td></tr>`}).join(''):'<tr><td colspan="5">Strike OI unavailable</td></tr>';
  // Entry plan only appears after the completed-candle B1 confirmation.
  const side=$('entryConfirmSide')?.textContent?.trim();const premium=side==='CALL'?Number(o.call?.ltp):side==='PUT'?Number(o.put?.ltp):NaN;
  if((side==='CALL'||side==='PUT')&&Number.isFinite(premium)&&premium>0){const risk=premium*.2;const sl=premium-risk;const target=premium+risk*2;set('niftyPlanOption',`${side} · ${side==='CALL'?(o.call?.tradingSymbol||'ATM CALL'):(o.put?.tradingSymbol||'ATM PUT')}`);set('niftyPlanPrices',`${money(premium)} / SL ${money(sl)} / T ${money(target)}`);const rangeSize=openingRangeLevels?openingRangeLevels.high-openingRangeLevels.low:NaN;const spotNow=Number(o.spot??$('orSpot')?.textContent?.replace(/,/g,''));const spotTarget=Number.isFinite(rangeSize)&&rangeSize>0&&Number.isFinite(spotNow)?spotNow+(side==='CALL'?1:-1)*rangeSize*.5:NaN;set('niftyPlanTargetNote',Number.isFinite(spotTarget)?`NIFTY spot reference target: ${fmt(spotTarget)} (50% of ${fmt(rangeSize)}-point range); option target is a 2R estimate.`:'50% range target waiting for valid spot/opening-range data.');set('niftyPlanStatus',`B1 ${side} confirmation detected. OI lean: ${lean}; PCR ${ag.pcr==null?'unavailable':Number(ag.pcr).toFixed(2)}. Verify live liquidity; paper mode only.`)}else{set('niftyPlanOption','WAIT FOR B1');set('niftyPlanPrices','—');set('niftyPlanTargetNote','Target uses 50% of opening-range size as NIFTY spot target distance.');set('niftyPlanStatus',`No confirmed CALL/PUT B1 entry. OI lean: ${lean}; wait for completed B1 confirmation, do not enter on OI alone.`)}
  set('optionStatus',`Upstox · ${o.source||'option chain'} · OI change is since previous successful refresh; first read establishes baseline.`);
 }catch(e){set('oiPivotStatus','OI support/resistance unavailable: '+e.message);set('optionStatus','Option chain unavailable: '+e.message);['atmCall','atmPut','callOi','putOi','oiPcr','oiCompare','callOiChange','putOiChange','totalCallOiChange','totalPutOiChange','atmExpiry','atmStrike','niftyTodayPcr','niftyOiLean','niftyPlanOption','niftyPlanPrices','niftyPlanStatus'].forEach(id=>set(id,'WAITING'))}
 function setOpeningError(msg){set('orStatus',msg);set('breakBias','DATA UNAVAILABLE')}
 openingBoxRefreshing=false;
}


document.addEventListener('DOMContentLoaded',()=>{const b=$('refreshOpening');if(b)b.addEventListener('click',()=>refreshOpeningBox());const r=$('refreshNow');if(r)r.addEventListener('click',()=>refreshOpeningBox());});

// Upstox live-account box (read-only refresh; never auto-submits a real order).
async function refreshRealAccountBox(){
 const status=$('realAccountStatus'),btn=$('refreshRealAccount');if(btn)btn.disabled=true;if(status)status.textContent='Loading funds, positions and orders from Upstox…';
 try{
  const st=await api('/api/real/status');const badge=$('realLockBadge');if(badge){badge.textContent=st.realTradingEnabled?'LIVE ORDER API CONFIGURED · AUTO OFF':'REAL ORDERS LOCKED';badge.style.background=st.realTradingEnabled?'#fef3c7':'#fff1f2';badge.style.color=st.realTradingEnabled?'#92400e':'#b91c1c';}
  const [a,p,o]=await Promise.all([api('/api/real/account'),api('/api/real/positions'),api('/api/real/orders')]);
  const pick=(obj,keys)=>{for(const k of keys){const v=Number(obj?.[k]);if(Number.isFinite(v))return v}return null};
  const moneyOrDash=v=>v==null?'—':money(v);
  const eq=a.equity||{},fo=a.fno||{};
  $('realEquityAvailable').textContent=moneyOrDash(pick(eq,['available_margin','available_cash','available_balance','cash_balance']));$('realEquityUsed').textContent='Used: '+moneyOrDash(pick(eq,['used_margin','utilised_margin','used_amount']));
  $('realFnoAvailable').textContent=moneyOrDash(pick(fo,['available_margin','available_cash','available_balance','cash_balance']));$('realFnoUsed').textContent='Used: '+moneyOrDash(pick(fo,['used_margin','utilised_margin','used_amount']));
  const positions=Array.isArray(p.data)?p.data:[],orders=Array.isArray(o.data)?o.data:[];$('realPositionCount').textContent=positions.length;$('realOrderCount').textContent=orders.length;
  const totalPnl=positions.reduce((sum,x)=>sum+(pick(x,['pnl','unrealised','unrealized'])||0),0);$('realPnlTotal').textContent='P&L: '+money(totalPnl);$('realPnlTotal').style.color=totalPnl>=0?'#15803d':'#b91c1c';
  $('realPositionRows').innerHTML=positions.length?positions.map(x=>`<tr><td>${esc(x.trading_symbol||x.tradingsymbol||x.instrument_token||x.instrument_key||'—')}</td><td>${fmt(x.quantity??x.net_quantity??x.day_buy_quantity)}</td><td>${moneyOrDash(pick(x,['average_price','buy_price']))}</td><td>${moneyOrDash(pick(x,['last_price','ltp']))}</td><td>${moneyOrDash(pick(x,['day_pnl','dayPnL']))}</td><td>${moneyOrDash(pick(x,['pnl','unrealised','unrealized']))}</td><td>${esc(x.product||'—')}</td></tr>`).join(''):'<tr><td colspan="7">No open positions reported by Upstox.</td></tr>';
  $('realOrderRows').innerHTML=orders.slice().reverse().slice(0,20).map(x=>`<tr><td>${esc(x.order_timestamp||x.created_at||x.order_date||'—')}</td><td>${esc(x.trading_symbol||x.tradingsymbol||x.instrument_token||'—')}</td><td>${esc(x.transaction_type||'—')}</td><td>${fmt(x.quantity)}</td><td>${esc(x.order_type||'—')}</td><td>${esc(x.status||'—')}</td><td>${moneyOrDash(pick(x,['average_price','price']))}</td></tr>`).join('')||'<tr><td colspan="7">No orders returned by Upstox.</td></tr>';
  if(status)status.textContent=`Account refreshed at ${new Date().toLocaleTimeString()} · ${st.message}`;
 }catch(e){if(status)status.textContent='Upstox account data unavailable: '+e.message;}
 finally{if(btn)btn.disabled=false;}
}
document.addEventListener('DOMContentLoaded',()=>{const b=$('refreshRealAccount');if(b)b.addEventListener('click',refreshRealAccountBox);refreshRealAccountBox();});


// REAL profile configuration controls (settings only; order execution remains locked).
async function loadRealProfileConfig(){
 const status=$('realConfigStatus'); try { const p=await api('/api/real/profile');
  $('realConfigMode').value=p.mode||'paper'; $('realConfigTrigger').value='B1'; $('realConfigLots').value=p.lots||1; $('realConfigLoss').value=p.maxDailyLossINR||3200;
  if(status)status.textContent='Loaded saved profile. Live orders: disabled.';
 } catch(e){if(status)status.textContent='Could not load profile: '+e.message;}
}
document.addEventListener('DOMContentLoaded',()=>{
 const toggle=$('toggleRealConfig'),panel=$('realConfigPanel'); if(toggle&&panel)toggle.addEventListener('click',()=>{panel.classList.toggle('hidden');if(!panel.classList.contains('hidden'))loadRealProfileConfig();});
 const save=$('saveRealConfig'); if(save)save.addEventListener('click',async()=>{
  const status=$('realConfigStatus'); save.disabled=true;if(status)status.textContent='Saving profile…';
  try {const result=await api('/api/real/profile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:$('realConfigMode').value,entryTrigger:'B1',lots:Number($('realConfigLots').value),maxDailyLossINR:Number($('realConfigLoss').value),requireStopLoss:true,requireTarget:true,requireTrailingStop:true})});
   if(status)status.textContent=result.message||'Profile saved; live execution remains disabled.'; await refreshRealAccountBox();
  } catch(e){if(status)status.textContent='Save failed: '+e.message;} finally{save.disabled=false;}
 });
});
