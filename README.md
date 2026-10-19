# HuhmINK LINE Bot

**HuhmINK 官方 LINE Bot** — 把網址傳給機器人，馬上收到 `huhm.cc` 短連結。

* 🔗 傳送網址 → 60 秒內選擇保護選項 → 回傳短連結
* 🔒 支援**密碼保護**與 🔞 **18+ 年齡驗證**（與網站完全相同的功能）
* 🇹🇼 全繁體中文
* 🛠 零相依（core 不需要 `npm install` 任何套件）、Node.js 18+
* ☁️ 可 24 小時運行：Vercel Serverless（推薦）或任何長駐主機

> 🌐 主網站：\[l.huhm.cc](https://l.huhm.cc)　短網址：\[huhm.cc](https://huhm.cc)
> 📖 API 文件：\[l.huhm.cc/howto](https://l.huhm.cc/howto)

\---

## 對話流程

```text
你      https://example.com/very/long/link
        ─────────────────────────
Bot     🔗是否設定密碼或成人標籤？
        請輸入：
        N1   代表不開啟密碼保護
        N2   代表不開啟成人保護
        NA   代表不開啟所有保護

        -

        Y    開啟成人保護
        {直接輸入密碼}    設定密碼保護

        -

        C   取消

        👶請在 1 分鐘內完成輸入，否則將取消

你      mypass123
        ─────────────────────────
Bot     ✅ 建立成功
        🔗 https://huhm.cc/a3f9k2
        🔒 已設定密碼保護
```

超過 1 分鐘未輸入 → `😒本次建立已取消`（主動推送，不需要你再傳訊息）

指令：傳 `ver` 或 `版本`

```text
目前最新版本為v1.0.0
有任何問題或漏洞歡迎來信：hi@mail.huhm.cc
```

|選項|效果|
|-|-|
|`N1` / `N2` / `NA`|建立一般連結（不開啟保護）|
|`Y`|開啟 18+ 年齡驗證|
|`{直接輸入密碼}`|以輸入內容作為密碼（4–72 字）|
|`C`|取消本次建立|

\---

## 快速開始

### ① 申請 HuhmINK API 金鑰

到 [l.huhm.cc/howto](https://l.huhm.cc/howto) 的「申請 API 金鑰」，免費、即開即用。

### ② 建立 LINE Messaging API channel

1. 到 [LINE Developers Console](https://developers.line.biz/) → 建立 Provider（例如 `HuhmINK`）
2. 在 Provider 下建立 **Messaging API** channel
3. 「Messaging API」分頁 → 取得 **Channel access token (long-lived)**
4. 「Basic information」分頁 → 取得 **Channel secret**

### ③ 設定環境變數並執行

```bash
git clone https://github.com/huhm-cc/huhmink-bot.git
cd huhmink-bot

# Linux/macOS
export LINE\_CHANNEL\_ACCESS\_TOKEN=你的token
export LINE\_CHANNEL\_SECRET=你的secret
export HUHMINK\_API\_KEY=你的金鑰
node server.js

# Windows PowerShell
$env:LINE\_CHANNEL\_ACCESS\_TOKEN="你的token"
$env:LINE\_CHANNEL\_SECRET="你的secret"
$env:HUHMINK\_API\_KEY="你的金鑰"
node server.js
```

### ④ 讓 LINE 找得到你的 Bot（Webhook）

LINE 要求 Webhook 必須是 **HTTPS** 網址。本機測試最簡單的方式：

```bash
npx ngrok http 3000
```

把 ngrok 給你的網址填到 LINE Developers → Messaging API → **Webhook URL**：

```
https://xxxx.ngrok-free.app/webhook
```

按下「Verify」看到 Success 即完成。打開「Use webhook」、關閉「Auto-reply messages（自動回應訊息）」，把 Bot 加為好友後傳個網址試試！

\---

## 可以 24 小時都開著嗎？

**可以，而且不需要把自己的電腦開著。** 本 Bot 是 Webhook 架構——LINE 把訊息 POST 過來才會執行程式碼，平常完全不吃資源。兩種上線方式：

### 方式 A：Vercel（推薦，免費、零維運）

```bash
npm i -g vercel
vercel login
vercel link          # 建立新專案 huhmink-bot
# 到 Dashboard 加入環境變數（三個都要），或：
vercel env add LINE\_CHANNEL\_ACCESS\_TOKEN
vercel env add LINE\_CHANNEL\_SECRET
vercel env add HUHMINK\_API\_KEY
vercel deploy --prod
```

部署後把 Webhook URL 設為：

```
https://你的網域/api/webhook
```

`api/webhook.js` 使用 `context.waitUntil` 在背景等 60 秒逾時，不會影響回應速度。
**注意**：Vercel Hobby 的函式最長執行 60–120 秒，`vercel.json` 已設 120 秒，足夠逾時推播使用。

### 方式 B：任何長駐主機（VPS / Railway / Render / Fly.io / 樹莓派 / NAS）

任何能跑 Node 18+ 並提供 HTTPS 的環境都可以：

```bash
node server.js        # 監聽 PORT（預設 3000），Webhook 路徑 /webhook
```

* **Railway**：連結 GitHub repo 直接部署，會自動執行 `npm start`
* **Render**：Build `npm install`、Start `npm start`，記得設定環境變數
* **自有 VPS**：建議搭配 `pm2` 或 `systemd` 保持常駐 + Nginx/Caddy 做 HTTPS

> 💡 兩種方式的差別：Vercel 的 60 秒逾時訊息走 `waitUntil`（單一實例記憶體，Fluid Compute 常駐時有效）；長駐主機用原生 `setTimeout`，狀態最可靠。若遇到逾時訊息偶爾沒送達（Vercel 冷啟動），可改用方式 B。

\---

## 環境變數

|變數|必填|說明|
|-|-|-|
|`LINE\_CHANNEL\_ACCESS\_TOKEN`|✅|LINE Messaging API 的 access token|
|`LINE\_CHANNEL\_SECRET`|✅|LINE 頻道的 secret（驗證 Webhook 簽名）|
|`HUHMINK\_API\_KEY`|✅|HuhmINK API 金鑰（[免費申請](https://l.huhm.cc/howto)）|
|`HUHMINK\_API\_URL`|—|API 端點，預設 `https://l.huhm.cc/api/v1/shorten`|
|`PORT`|—|長駐模式埠號，預設 `3000`|

\---

## 開發指南

### 檔案結構

```text
huhmink-bot/
├── bot.js            # 核心：狀態機、訊息流程、LINE API、HuhmINK API（零相依）
├── server.js         # 長駐模式：HTTP server + setTimeout 計時器
├── api/webhook.js    # Vercel Serverless 模式：waitUntil 計時器
├── vercel.json       # Vercel 函式 maxDuration 設定
├── package.json
└── .env.example      # 環境變數範本
```

`bot.js` 是純邏輯核心，平台相關的程式（HTTP server、計時器）拆在 `server.js` 與 `api/webhook.js`，兩種部署共用同一套對話流程。

### 狀態機

`bot.js` 用一個 `Map` 管理等待選擇中的使用者：

```js
const pending = new Map(); // userId → { url }
```

1. 收到網址 → `pending.set(userId, { url })` + 回覆選單 + 註冊 60 秒計時器
2. 60 秒內收到回覆 → 解析 `N1/N2/NA/Y/密碼/C` → 呼叫 API → 回覆短連結
3. 逾時 → `onTimeout(userId)` 清除狀態並 **push** 取消訊息（reply token 已過期，所以用 push）
4. 等待中又傳新網址 → 重設 session、重新出選單

### 自訂與擴充

* **改文案**：所有訊息文字都集中在 `bot.js` 頂端的常數（`MENU`、`CANCELLED`、`VERSION\_TEXT`、`HELP`）
* **改版本**：更新 `bot.js` 的 `VERSION` 與 `package.json` 的 `version`
* **加指令**：在 `handleMessageEvent()` 開頭加判斷即可，例如：

```js
  if (text === '說明') {
    return replyMessage(replyToken, HELP);
  }
  ```

* **支援圖片/檔案**：在 `handleMessageEvent()` 的 `event.message.type` 判斷中加入 `image`/`file`，先向 LINE 下載內容（`https://api-data.line.me/v2/bot/message/{id}/content`），再以 base64 透過 HuhmINK API 的 `type: "file"` 上傳（單檔上限 30MB，base64 路徑約 3MB）

### 本地測試（不透過 LINE）

```bash
# 假造一個 webhook 呼叫，直接看回覆輸出
curl -X POST http://localhost:3000/webhook \\
  -H "Content-Type: application/json" \\
  -H "X-Line-Signature: 需用 secret 計算" \\
  -d '{"events":\[{"type":"message","replyToken":"test","source":{"userId":"u1"},"message":{"type":"text","text":"https://example.com"}}]}'
```

簽名可以用這個一行計算：

```bash
node -e "const c=require('crypto');console.log(c.createHmac('sha256',process.env.LINE\_CHANNEL\_SECRET).update(require('fs').readFileSync(0,'utf8')).digest('base64'))" < body.json
```

### 注意事項

* **Push 配額**：逾時取消訊息使用 push，免費方案有每月額度；逾時不頻繁的話完全夠用
* **金鑰安全**：`HUHMINK\_API\_KEY` 與 LINE token 都是機密，永遠不要寫進程式碼或 commit
* **API 限流**：HuhmINK API 每支金鑰每小時 300 次，超過會收到 429（詳情見 [howto](https://l.huhm.cc/howto)）
* **回應 200**：無論內部發生什麼錯，webhook 都要回 200，否則 LINE 會不斷重試

## 常見問題

**Q：一定要 24 小時開機嗎？**
A：不用。用 Vercel Serverless 部署，訊息來了才執行、其餘時間零成本零維運。

**Q：為什麼逾時訊息用 push 而不是 reply？**
A：reply token 是單次使用且時效短，60 秒後不一定可用；push 只要對方是好友就能送。

**Q：很多同時上線的使用者會互相干擾嗎？**
A：不會，狀態以 LINE userId 為 key，每個人獨立。

**Q：我想改 60 秒的時長？**
A：改 `bot.js` 的 `TIMEOUT\_MS`（選單文案也要記得一起改）。

## 授權

MIT — 與 [HuhmINK](https://l.huhm.cc) 主專案相同，歡迎自行架設與改造。

