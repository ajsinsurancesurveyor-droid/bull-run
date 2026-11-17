# AJS TRADING PRO — Render Deployment (Hindi)

## इस संशोधित ZIP में
- B1-only entry: B2 और B3 पूरी तरह disabled हैं; B1 fail होने पर उसी दिन दोबारा entry नहीं बनेगी।
- Opening range 09:15–09:45; B1 confirmation अगले completed 5-minute candle पर।
- Paper Trading default ON; Real Trading और automatic broker orders OFF / fail-closed।
- Public deployment पर सभी `/api` endpoints के लिए `AJS_API_KEY` आवश्यक है। Browser पहली API request पर key पूछेगा और केवल current tab session में रखेगा।
- `.env` और broker token ZIP में शामिल नहीं हैं।

## Render सेटअप
1. ZIP extract करके अंदर के project files GitHub repository root में रखें। `server.js`, `package.json`, `public/` सीधे root में हों।
2. Render Build Command: `npm install`
3. Start Command: `npm start`
4. Render → Environment में `NODE_ENV=production`, `AJS_API_KEY` (कम से कम 32 characters का random secret), `PAPER_TRADING_DEFAULT=true`, `REAL_TRADING_ENABLED=false`, `AJS_TRADING_MODE=paper` सेट करें।
5. `UPSTOX_ACCESS_TOKEN` केवल Render Environment में डालें; GitHub/ZIP/chat में कभी नहीं।
6. Deploy के बाद site खोलें और API key prompt पर वही `AJS_API_KEY` डालें। गलत key पर API requests 401 देंगी।

## Local Windows 11
1. `.env.example` की copy बनाकर उसका नाम `.env` रखें।
2. `npm install` चलाएं।
3. `.env` में local `AJS_API_KEY` और जरूरत के अनुसार Upstox token डालें।
4. `npm start` चलाकर `http://localhost:3000` खोलें।

## Live Trading Safety
Live broker order placement इस build में बंद है। API preflight केवल read-only connectivity check है; यह live execution, stop-loss/target manager, fill reconciliation या restart recovery की पुष्टि नहीं करता। Real orders enable न करें। पहले paper trading और broker sandbox/controlled validation करें।
