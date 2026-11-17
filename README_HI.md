# AJS TRADING PRO — Final B1-only build

## Windows 11 पर चलाएं
1. Node.js 18 या नया install करें।
2. ZIP को पूरा Extract करें।
3. `START_AJS_TRADING.bat` पर double-click करें। यह अलग server window खोलेगा और Chrome में `http://localhost:3000` खोलेगा।
4. पहली बार bundled dependencies missing हों तो installer internet से packages install करेगा।
5. App के Settings में अपना नया Upstox Access Token paste करके Verify/Save करें। Localhost पर `AJS_API_KEY` जरूरी नहीं है।
6. Server बंद हो जाए तो server window में `R` दबाकर restart करें; `Q` से बंद करें।

इस ZIP में कोई personal `.env` या Upstox token शामिल नहीं है। पुराना साझा किया गया token revoke करके नया token इस्तेमाल करें।
## Trading rules
- 13 instruments: NIFTY 50, BANK NIFTY और 11 configured stocks।
- NIFTY 50 पहले, BANK NIFTY दूसरे; बाकी stocks score/status ranking में।
- Opening range: 09:15–09:45 IST (छह 5-minute candles)।
- केवल पहला B1 breakout/breakdown attempt। अगली completed 5-minute candle confirmation देगी।
- B1 fail होने पर उसी instrument में उस trading day कोई B2/B3 या re-entry नहीं। B2/B3 UI में disabled दिखते हैं।
- 15-minute score completed candles पर; entry confirmation completed 5-minute candle पर।
- Last valid data cache हो सकता है; stale data को नया entry trigger न मानें।

## Security और Live Trading
- Public Render deployment में `NODE_ENV=production` और `AJS_API_KEY` (32+ random characters) अनिवार्य है। API key सभी API endpoints पर लागू है; read-only market-data SSE stream exempt है क्योंकि browser EventSource custom header नहीं भेजता।
- `.env`, Upstox token या API key GitHub/ZIP में commit न करें। Render secrets केवल Environment Variables में रखें।
- Paper mode default है। Real order placement और automatic broker orders इस build में disabled/fail-closed हैं।
- Preflight read-only है; broker-side SL/target manager, fill reconciliation और restart recovery verified नहीं हैं। Real orders enable न करें।

## Tests
`npm run test:all` चलाएं। Passing tests live Upstox feed, browser rendering या Render deployment की पुष्टि नहीं करते।


## Card display rule (latest update)
- NIFTY aur BANK NIFTY index cards par B1/B2/B3 stage slots dikhte hain.
- Sabhi equity/stock cards par sirf B1 dikhaya jata hai; B2/B3 cards se hide hain.
- Note: Is build mein underlying breakout engine B1-only hai; index cards par B2/B3 slots dikhna unke live execution/confirmation logic ke implemented hone ka pramaan nahi hai. Index B2/B3 engine ko alag se implement aur test karna hoga.


## Lightweight dashboard update
- Stock/index card click se Analysis & Chart workspace open nahi hota.
- ATM option chain panels, AI analysis workspace, paper trading aur portfolio UI hidden/disabled hain.
- Score parameter workspace aur usmein B1/B2/B3 ke detailed parameter views user-facing nahi hain.
- Main dashboard, live market data, ranking, opening-range monitor aur breakout WAIT/status cards retained hain.
- WAIT state ko subtle/light style diya gaya hai; blinking animation hata di gayi hai.
- Index cards par B1/B2/B3 stage display configuration retained hai; stocks par sirf B1 display retained hai.


## Card cleanup update (V2)
- Har card se Daily C/P score text/value hata diya gaya hai.
- ★ VERY HIGH PROBABILITY · TOP PICK banner hata diya gaya hai.
- Equity/stock cards par B2 aur B3 ke round indicators hide hain; sirf B1 round rahega.
- NIFTY aur BANK NIFTY index cards par B1/B2/B3 rounds retained hain.
- Existing 60/20 scoring/entry rules ko engine se remove nahi kiya; sirf card par Daily C/P display remove kiya hai.


## Full B1 range-invalidation correction
- B1 CALL/PUT is first confirmed using completed 5-minute candles.
- After confirmation, any subsequent completed 5-minute candle closing back inside the 09:15–09:45 opening range marks B1 INVALIDATED.
- Live LTP temporarily returning inside the range does not invalidate B1; completed 5-minute candle close is required.
- Existing RUNNING trade state is changed to INVALIDATED and persisted in localStorage; it cannot silently remain RUNNING after range re-entry.
- No same-day re-entry is generated after initial B1 confirmation failure or later range invalidation.
- The same rule applies to NIFTY, BANK NIFTY and all stock cards.
- This correction does not implement the separate index-only B2/B3 execution engine; B2/B3 remain disabled in the underlying sequence logic in this build.


## Next-candle B1 confirmation rule (latest correction)
- Breakout candle sirf B1 PENDING banati hai; usi candle par entry/confirmation nahi hota.
- Uske turant baad wali completed 5-minute candle hi confirmation candle hai.
- CALL: next candle close must be strictly above Opening Range High.
- PUT: next candle close must be strictly below Opening Range Low.
- Next candle agar range ke andar close kare ya opposite side close kare, B1 turant FAILED hoga.
- Confirmation ke liye teesri ya baad ki candle ka wait nahi hoga.
- Confirmation ke baad kisi later completed 5-minute candle ka close range ke andar aaye to B1 INVALIDATED hoga.


## UI clarification removal
- Dashboard se Opening Range Breakout Engine / B1-only confirmation rules clarification panel, B1/B2/B3 explanation cards, confirmation/risk/stage footer aur disclaimer note remove kiye gaye hain. Trading logic unchanged.


## Stock ranking priority correction
- RUNNING trade wale stocks stock ranking mein sabse aage rahenge.
- RUNNING group ke andar highest current score pehle rahega.
- Baaki non-failed stocks mein bhi highest current score pehle rahega, chahe unka B1 status WAIT ho ya CONFIRMED.
- Failed / invalidated / SL HIT stocks ranking ke bottom mein rahenge.
- NIFTY aur BANK NIFTY index cards apni fixed top positions par rahenge.
- Score sirf ranking strength hai, winning probability ki guarantee nahi.


## Index-only B1 → B2 → B3 sequence (final correction)
- NIFTY and BANK NIFTY (`item.kind === index`) support up to three sequential attempts per trading day.
- B1: first breakout side is identified; the immediately next completed 5m candle must close strictly beyond the same ORH/ORL boundary.
- If B1 confirmation fails, B2 is armed for a fresh breakout in the opposite direction. B2 requires its own breakout candle plus the immediately next completed 5m candle confirmation.
- If confirmed B1 later invalidates on a completed 5m close back inside the opening range, B2 is armed in the opposite direction.
- If B2 confirmation fails or confirmed B2 later invalidates inside the range, B3 is armed in the original B1 direction and requires a fresh breakout plus next-candle confirmation.
- B3 failure/invalidation ends the day's sequence; no B4.
- Stocks remain B1-only; B2/B3 remain disabled.
- Each confirmed stage has its own entry, SL, target and persistent stage trade record. Existing risk formula is unchanged.
- B2/B3 require fresh closes beyond the relevant opening-range boundary; no automatic entry merely because a previous stage failed.
- This build advances stages on confirmation failure or completed-candle range invalidation. A broker/price-based SL hit is recorded as SL HIT but does not itself force an opposite-side stage.


## Final application build: Index B1/B2/B3 enabled
- NIFTY aur BANK NIFTY cards par B1/B2/B3 active sequence engine enabled.
- B1 first valid range breakout; next completed 5m candle must close beyond same boundary.
- B1 fail/invalidation -> B2 opposite side armed; fresh opposite boundary breakout plus immediate next-candle close confirmation required.
- B2 fail/invalidation -> B3 original B1 side armed; fresh breakout plus immediate next-candle close confirmation required.
- B3 fail/invalidation -> daily sequence ends; no B4.
- Every confirmed stage gets its own Entry, SL, Target and persisted trade record.
- All 11 stock cards remain B1-only. Stock B2/B3 remain hidden/disabled.
- RUNNING stock trades remain ahead in ranking; other stocks rank by current CALL/PUT score; failed/invalidated/SL-hit stocks remain last.
- Paper mode remains default; real broker orders remain disabled.


## Final card status and opening-range display correction
- All 13 cards use the same structured breakout/breakdown status vocabulary: RANGE NOT READY, INSIDE RANGE, B1/B2/B3 CONFIRMATION WAIT, FRESH BREAKOUT WAIT, CALL BREAKOUT CONFIRMED, PUT BREAKDOWN CONFIRMED, and FAILED/INVALIDATED.
- Before six completed 5-minute opening-range candles are available for the current IST session, show WAIT · RANGE NOT READY.
- Never coerce null ORH/ORL to zero; range boxes show WAITING and distances show — until valid range exists.
- Above High / Below Low badges are suppressed until both valid positive range levels are available.
- After OR is ready but there is no post-range candle, show WAIT · INSIDE RANGE.


## Premium UI refresh
- Updated the visual system with a premium navy header, refined live ticker, softer canvas, consistent card surfaces, improved typography, spacing, borders, shadows and status chips.
- Improved responsive layouts for desktop, tablet and mobile.
- Reduced distracting pulsing effects while preserving trading status colors and data logic.
- No trading engine, ranking, signal, API or risk logic changed in this design-only update.


## Compact stock-card range message
- Full Opening Range 09:15–09:45 explanation is shown only on NIFTY and BANK NIFTY index cards.
- Stock cards show only the compact `WAIT · RANGE NOT READY` status with `Range not ready.` detail, avoiding repeated long explanatory text on every stock.
- Trading and range calculation logic is unchanged.


## Colorful + Fast UI update
- Premium color palette: navy/violet header, blue index accents, green CALL and red PUT signals, and colorful range/status cards.
- Removed external Google Fonts import; local system fonts are used to reduce network dependency and improve first paint.
- Added content-visibility to long ranked card lists to reduce off-screen rendering work.
- Added stylesheet cache-busting version for reliable browser refresh after update.
- Trading logic, Upstox connection flow, B1/B2/B3 rules, score calculations and order safety settings are unchanged.


## Stability correction
- Upstox REST requests now have a bounded timeout; a stalled broker/network request cannot hold the request queue indefinitely.
- Browser connection failure is shown as SERVER RETRY with the last valid snapshot retained; scheduled refresh continues.
- Never include `.env` or broker tokens in a ZIP, email, screenshot, or Git repository. If a token was exposed, revoke it and create a new one.
