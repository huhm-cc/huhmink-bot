# HuhmINK LINE Bot

**HuhmINK 官方 LINE Bot** — 把網址傳給機器人，馬上收到 `huhm.cc` 短連結。

- 🔗 傳送網址 → 60 秒內選擇保護選項 → 回傳短連結
- 🔒 支援**密碼保護**與 🔞 **18+ 年齡驗證**（與網站完全相同的功能）
- 🎫 **客服服務單**：`求救` 開單（自動轉交管理員）、`關閉` 結案，序號 10 位數字不變
- 🧠 **模糊指令辨識**：打「求就」「板本」這種相近字也會自動幫你執行
- 🇹🇼 全繁體中文
- 🛠 零相依（core 不需要 `npm install` 任何套件）、Node.js 18+
- ☁️ 可 24 小時運行：Vercel Serverless（推薦）或任何長駐主機

> 🌐 主網站：<https://l.huhm.cc>　短網址：<https://huhm.cc>
> 📖 API 文件：<https://l.huhm.cc/howto>

---

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

## 指令一覽

| 指令 | 說明 | 回覆 |
| --- | --- | --- |
| `ver` 或 `版本` | 查看版本 | 目前最新版本為v1.1.0…（含聯絡 Email） |
| `求救`（可接問題描述） | 開啟客服服務單 | 服務單已開啟＋10 位數字序號，同時**推播轉交管理員** |
| `關閉` | 結束服務單 | 服務單已關閉＋同一組序號，亦通知管理員 |

服務單範例：

```text
你      求救 帳號無法登入
        ─────────────────────────
Bot     📝服務單已開啟📝
        🎫服務序號：4829103765
        😼客服人員將在 5日 內回覆您
        😼若您未收到回覆請聯係 Email
        hi@mail.huhm.cc

（管理員同時收到推播：序號、用戶 ID、問題內容）

你      關閉
        ─────────────────────────
Bot     📝服務單已關閉📝
        🎫服務序號：4829103765
```

**模糊指令辨識**：輸入不是指令的文字時，自動比對相近指令——「求就」→ 求救、「板本」→ 版本、「關單」→ 關閉、
"version" → ver。比對規則：完全相等 > 包含 > 編輯距離 ≤ 1。完全比不到才回覆指令說明。

| 保護選項 | 效果 |
| --- | --- |
| `N1` / `N2` / `NA` | 建立一般連結（不開啟保護） |
| `Y` | 開啟 18+ 年齡驗證 |
| `{直接輸入密碼}` | 以輸入內容作為密碼（4–72 字） |
| `C` | 取消本次建立 |

---

## 快速開始

### ① 申請 HuhmINK API 金鑰

到 <https://l.huhm.cc/howto> 的「申請 API 金鑰」，免費、即開即用。

### ② 建立 LINE 官方帳號（新版流程）

LINE 已改為「先建官方帳號、再啟用 Messaging API」：

1. 到 [LINE Developers Console](https://developers.line.biz/) 建立 Provider
2. 依畫面指示「Create a LINE Official Account」（會導到 Official Account Manager）
3. 在管理後台的「設定 → Messaging API」頁確認狀態為**使用中**，記下 Channel secret
4. 在 Developers Console 的 channel「Messaging API」分頁按 **Issue** 取得 Channel access token（long-lived）

### ③ 設定環境變數並執行

```bash
git clone https://github.com/huhm-cc/huhmink-bot.git
cd huhmink-bot

# Linux/macOS
export LINE_CHANNEL_ACCESS_TOKEN=你的token
export LINE_CHANNEL_SECRET=你的secret
export HUHMINK_API_KEY=你的金鑰
node server.js

# Windows PowerShell
$env:LINE_CHANNEL_ACCESS_TOKEN="你的token"
$env:LINE_CHANNEL_SECRET="你的secret"
$env:HUHMINK_API_KEY="你的金鑰"
node server.js
```

### ④ 讓 LINE 找得到你的 Bot（Webhook）

LINE 要求 Webhook 必須是 **HTTPS** 網址。本機測試最簡單的方式：

```bash
npx ngrok http 3000
```

把 ngrok 給你的網址填到 Developers Console → Messaging API → **Webhook URL**：

```text
https://xxxx.ngrok-free.app/webhook
```

按下「Verify」看到 Success 即完成。開啟「Use webhook」，並到管理後台「回應設定」把**自動回應訊息關閉**（避免和機器人重複回覆），把機器人加為好友後傳個網址試試！

---

## 可以 24 小時都開著嗎？

**可以，而且不需要把自己的電腦開著。** 本 Bot 是 Webhook 架構——LINE 把訊息 POST 過來才會執行程式碼，平常完全不吃資源。兩種上線方式：

### 方式 A：Vercel（推薦，免費、零維運）

```bash
npm i -g vercel
vercel login
vercel link          # 建立新專案 huhmink-bot
vercel env add LINE_CHANNEL_ACCESS_TOKEN
vercel env add LINE_CHANNEL_SECRET
vercel env add HUHMINK_API_KEY
vercel deploy --prod
```

部署後把 Webhook URL 設為：

```text
https://你的網域/api/webhook
```

`api/webhook.mjs` 使用 `context.waitUntil` 在背景等 60 秒逾時，不會影響回應速度。
`vercel.json` 已將函式上限設 120 秒，足夠逾時推播使用。

### 方式 B：任何長駐主機（VPS / Railway / Render / Fly.io / 樹莓派 / NAS）

任何能跑 Node 18+ 並提供 HTTPS 的環境都可以：

```bash
node server.js        # 監聽 PORT（預設 3000），Webhook 路徑 /webhook
```

- **Railway**：連結 GitHub repo 直接部署，會自動執行 `npm start`
- **Render**：Build `npm install`、Start `npm start`，記得設定環境變數
- **自有 VPS**：建議搭配 `pm2` 或 `systemd` 保持常駐 + Nginx/Caddy 做 HTTPS

> 💡 兩種方式的差別：Vercel 的 60 秒逾時訊息走 `waitUntil`（單一實例記憶體，Fluid Compute 常駐時有效）；長駐主機用原生 `setTimeout`，狀態最可靠。若逾時訊息偶爾沒送達，可改用方式 B。

---

## 環境變數

| 變數 | 必填 | 說明 |
| --- | --- | --- |
| `LINE_CHANNEL_ACCESS_TOKEN` | ✅ | LINE Messaging API 的 access token |
| `LINE_CHANNEL_SECRET` | ✅ | LINE 頻道的 secret（驗證 Webhook 簽名） |
| `HUHMINK_API_KEY` | ✅ | HuhmINK API 金鑰（免費申請：<https://l.huhm.cc/howto>） |
| `ADMIN_LINE_USER_ID` | — | 管理員的 LINE User ID（`U` 開頭）；設定後服務單會推播轉交，**管理員需先把機器人加為好友** |
| `HUHMINK_API_URL` | — | API 端點，預設 `https://l.huhm.cc/api/v1/shorten` |
| `PORT` | — | 長駐模式埠號，預設 `3000` |

---

## 開發指南

### 檔案結構

```text
huhmink-bot/
├── bot.js            # 核心：狀態機、指令與模糊辨識、服務單、LINE API、HuhmINK API（零相依）
├── server.js         # 長駐模式：HTTP server + setTimeout 計時器
├── api/webhook.mjs    # Vercel Serverless 模式：waitUntil 計時器
├── test.js           # 本地測試：node test.js（模糊辨識 + 服務單 26 項測試）
├── vercel.json       # Vercel 函式 maxDuration 設定
├── package.json
└── .env.example      # 環境變數範本
```

`bot.js` 是純邏輯核心，平台相關的程式（HTTP server、計時器）拆在 `server.js` 與 `api/webhook.mjs`，兩種部署共用同一套對話流程。

### 狀態機

`bot.js` 用兩個 `Map` 管理狀態：

```js
const pending = new Map(); // userId → { url }        縮址流程（60 秒逾時）
const tickets = new Map(); // userId → { ticket, ... } 開啟中的服務單
```

1. 收到網址 → `pending.set(userId, { url })` + 回覆選單 + 註冊 60 秒計時器
2. 60 秒內收到回覆 → 解析 `N1/N2/NA/Y/密碼/C` → 呼叫 API → 回覆短連結
3. 逾時 → `onTimeout(userId)` 清除狀態並 **push** 取消訊息（reply token 已過期，所以用 push）
4. `求救` → 產生 10 位數字序號 → 回覆開單 → **push 轉交管理員**；`關閉` → 以同序號結案

### 模糊辨識怎麼運作

`matchCommand()` 依序比對：**完全相等 → 包含（別名）→ 編輯距離 ≤ 1**，
別名表在 `COMMANDS` 常數（求救/求助/help/客服/支援/回報、關閉/close/結案/關單…）。
要加新指令或新別名，直接加進 `COMMANDS` 再在 `runCommand()` 實作行為即可。

### 自訂與擴充

- **改文案**：所有訊息集中在 `bot.js` 頂端常數（`MENU`、`CANCELLED`、`VERSION_TEXT`、`HELP`）
- **改版本**：更新 `bot.js` 的 `VERSION` 與 `package.json` 的 `version`
- **加指令**：在 `COMMANDS` 加一筆，並在 `runCommand()` 加分支
- **支援圖片/檔案**：在 `handleMessageEvent()` 的 `event.message.type` 加入 `image`/`file`，先向 LINE 下載內容（`https://api-data.line.me/v2/bot/message/{id}/content`），再以 base64 透過 HuhmINK API 的 `type: "file"` 上傳（單檔上限 30MB，base64 路徑約 3MB）

### 本地測試（不透過 LINE）

```bash
node test.js          # 模糊辨識 + 服務單流程的單元測試

# 假造一個 webhook 呼叫（簽名需用 secret 計算）
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -H "X-Line-Signature: <hmac-base64>" \
  -d '{"events":[{"type":"message","replyToken":"test","source":{"userId":"u1"},"message":{"type":"text","text":"https://example.com"}}]}'

# 簽名一行計算
node -e "const c=require('crypto');console.log(c.createHmac('sha256',process.env.LINE_CHANNEL_SECRET).update(require('fs').readFileSync(0,'utf8')).digest('base64'))" < body.json
```

### 注意事項

- **Push 配額**：逾時取消與服務單轉交使用 push；免費方案有每月額度，一般用量足夠
- **金鑰安全**：`HUHMINK_API_KEY` 與 LINE token 都是機密，永遠不要寫進程式碼或 commit
- **API 限流**：HuhmINK API 每支金鑰每小時 300 次，超過會收到 429（詳見 <https://l.huhm.cc/howto>）
- **回應 200**：無論內部發生什麼錯，webhook 都要回 200，否則 LINE 會不斷重試

## 常見問題

**Q：一定要 24 小時開機嗎？**
A：不用。用 Vercel Serverless 部署，訊息來了才執行、其餘時間零成本零維運。

**Q：為什麼逾時訊息用 push 而不是 reply？**
A：reply token 是單次使用且時效短，60 秒後不一定可用；push 只要對方是好友就能送。

**Q：很多同時上線的使用者會互相干擾嗎？**
A：不會，狀態以 LINE userId 為 key，每個人獨立。

**Q：管理員收不到服務單通知？**
A：確認 (1) 有設定 `ADMIN_LINE_USER_ID`，(2) 管理員已把機器人加為好友（push 只送得給好友），(3) 免費方案的 push 額度還夠。

**Q：我想改 60 秒的時長？**
A：改 `bot.js` 的 `TIMEOUT_MS`（選單文案記得一起改）。

## 授權

MIT — 與 [HuhmINK](https://l.huhm.cc) 主專案相同，歡迎自行架設與改造。
