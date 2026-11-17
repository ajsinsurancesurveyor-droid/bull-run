# AJS TRADING PRO — Final revision test report

## Changes in this revision
- Latest final build: NIFTY and BANK NIFTY support sequential B1/B2/B3 attempts; all 11 stocks remain B1-only.
- Index B1 failure/invalidation arms B2; B2 failure/invalidation arms B3; stock B1 failure/invalidation blocks same-day re-entry.
- Paper mode is the default profile. Real trading and automatic broker order execution remain disabled.
- Added API-key protection for all `/api` endpoints on public deployments. Production requires `AJS_API_KEY` with at least 32 characters. The browser stores the entered key in session storage for the current tab only.
- Removed `.env` from the project package; added `.env.example` and ignored local secret files.
- Corrected preflight fields so unimplemented live execution protections are not reported as implemented or verified.
- Updated Hindi setup and Render deployment instructions.

## Automated verification
- JavaScript syntax checks: passed (`server.js`, `public/app.js`, `real-trading-safety.js`).
- Node automated tests: 30 passed, 0 failed.
- Regression coverage includes B1 CALL, B1 PUT, B1 failure/no re-entry, B1 next-candle wait, opening-range not ready, cached-data resilience, completed-candle confirmation, and live-order fail-closed checks.

## Not verified in this environment
- Upstox live token authentication, live market feed, option chain, browser rendering, Render deployment, and multi-hour stability.
- Broker-side stop-loss/target management, fill reconciliation, restart recovery, and emergency exit are not complete/verified.
- Live order placement remains disabled. Keep the app in paper mode until these are independently validated.


## B1 range re-entry correction
- Added CALL and PUT invalidation tests: after B1 confirmation, a later completed 5-minute candle close back inside the opening range invalidates the setup.
- Added persistent RUNNING trade invalidation when the same condition is detected.


## Index B1/B2/B3 sequence tests
- Added index-only B2 opposite-side activation after B1 failure and B1 range invalidation.
- Added B3 original-side activation after B2 failure and B2 range invalidation.
- Added max-three-attempt stop and stock B1-only regression tests.


## Final index sequence regression run
- 43 automated Node tests passed, 0 failed.
- Covers index B1 -> B2 opposite-side transition, B2 -> B3 original-side transition, range invalidation transitions, B3 max-attempt stop, stock B1-only behavior, and card status selection for the current sequence.
- JavaScript syntax check passed.


## Card status consistency regression tests
- Added explicit WAIT · RANGE NOT READY display test for missing current-session OR data.
- Added null-safe opening-range level guard test to prevent false zero range and ABOVE HIGH badges.


## Latest all-corrections build
- Standardized breakout/breakdown status text across all instrument cards.
- Added WAIT · RANGE NOT READY before six completed 5-minute candles for the current IST session.
- Added WAIT · INSIDE RANGE after the opening range is ready but no breakout is confirmed.
- Prevented null range values from being coerced to zero, which previously caused false ABOVE HIGH / distance displays.
- Final automated test run: 45 passed, 0 failed. Browser/Upstox live integration remains unverified.


## Colorful + fast UI regression check
- Removed external Google Fonts network import for faster initial page rendering.
- Updated premium colorful visual styling and long-list rendering optimization.
- JavaScript source is unchanged; full Node syntax and automated test suite re-run after packaging.

## Upstox stability + Windows launcher revision
- Kept the Upstox request timeout active through full response-body reading, not just until response headers arrive.
- Added one bounded retry for transient GET transport/server errors (502/503/504); 429 cooldowns and non-idempotent writes are never automatically retried.
- Added a global Express JSON error response so unexpected route errors do not leave the browser waiting silently.
- Added a Windows server console launcher with a restart prompt; the console remains open after a server exit and the main launcher opens Chrome.
- Restored bundled runtime dependencies so the Windows package can start without a first-run npm download when the included dependencies are present.
- Removed all personal `.env` credentials from the distribution. Local API key is optional; public production deployments still require a 32+ character key.
- Verification: JavaScript syntax checks passed; 48 automated tests passed; HTTP smoke test returned `/api/status` JSON and homepage HTTP 200 with paper trading ON and real orders OFF.
- Not verified: a real Upstox token, market-hours live feed, broker permissions, and extended live stability. These require the user's fresh token and live Upstox access.


## Target / stop-loss touch detection correction
- B1 trade monitor now scans completed 5-minute candle highs/lows after trade confirmation, not only the latest underlying LTP.
- A target touched intrabar is recorded even if price reverses before the next browser refresh.
- If target and stop are both inside the same 5-minute candle, status becomes REVIEW REQUIRED because OHLC alone cannot establish which was hit first.
- Added five trade-monitor regression tests for CALL, PUT, earlier SL, target touch after reversal, and same-candle ambiguity.
- Full test suite: 53 passed, 0 failed. Upstox live market integration still requires the user's valid token and broker permissions.


## Full-session day high/low tracking
- B1 trade cards now record and display the current IST session DAY HIGH and DAY LOW from available 5-minute candles.
- Separate post-entry high/low values are recorded for the active B1 trade.
- Target/SL detection remains directional: CALL target uses post-entry candle HIGH; PUT target uses post-entry candle LOW. The full-session extreme is displayed for context and is not allowed to trigger a trade if it occurred before entry.
- Previous IST session extremes are excluded.
- Regression suite: 55 passed, 0 failed.


## Locked entry / target / stop-loss plan
- At B1 confirmation, entry, target and stop-loss are snapshotted as lockedEntry, lockedTarget and lockedSL.
- Every monitor pass restores the displayed/monitored plan values from that immutable snapshot; later recalculation or accidental mutation cannot move the levels.
- CALL and PUT monitoring use the same locked levels with direction-appropriate high/low checks.
- UI continues to display Entry Locked, Stop Loss and Target - 2R.
- Regression suite: 57 passed, 0 failed. JavaScript syntax checks passed.


## Unified dashboard ranking correction
- All index and equity cards now share one global ranking.
- Priority: TARGET ACHIEVED first, RUNNING second, in/awaiting opening range third, FAILED / SL HIT / INVALIDATED last.
- Within each category, higher directional score (max CALL/PUT score) ranks first; directional score edge breaks ties.
- Removed the old behavior that pinned NIFTY/BANK NIFTY above completed target trades.
- Ranking regression guard added.


## Index-first display order correction
- NIFTY and BANK NIFTY are always pinned at the top in that exact order.
- All equity stocks follow underneath, ranked by TARGET ACHIEVED, RUNNING, IN RANGE/WAITING, FAILED/SL HIT; within each category higher directional score appears first.
- Index cards retain their own signal and trade status but do not interrupt the stock ranking.
- Regression suite: 59 passed, 0 failed.
