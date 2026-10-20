/**
 * bot.js — HuhmINK 官方 LINE Bot 核心（零相依，Node 18+）
 *
 * 職責：
 *   1. 驗證 LINE Webhook 簽名（HMAC-SHA256）
 *   2. 對話狀態機：網址 → 60 秒內選擇保護選項 → 呼叫 HuhmINK API 建立短連結
 *   3. 指令：ver / 版本、求救（服務單）、關閉（結案）
 *   4. 模糊指令辨識：非指令文字自動比對相近指令
 *
 * 平台介面（server.js 與 api/webhook.js 都會用到）：
 *   handleEvents(body, { registerTimeout, cancelTimeout })
 *     registerTimeout(userId) — 由平台註冊 60 秒計時器（本機用 setTimeout、Vercel 用 waitUntil）
 *     cancelTimeout(userId)  — 使用者完成選擇後取消計時
 *   onTimeout(userId) — 60 秒到期，主動推送取消訊息
 *
 * 服務單（求救 → 轉交管理員 → 關閉）：
 *   開單後推播通知 ADMIN_LINE_USER_ID（管理員需先將機器人加為好友）。
 */

const crypto = require('crypto');

const VERSION = 'v1.1.0';
const CONTACT = 'hi@mail.huhm.cc';
const TIMEOUT_MS = 60_000;

/** 選項選單（依官方文案） */
const MENU = `🔗是否設定密碼或成人標籤？
請輸入：
N1   代表不開啟密碼保護
N2   代表不開啟成人保護
NA   代表不開啟所有保護

-

Y    開啟成人保護
{直接輸入密碼}    設定密碼保護

-

C   取消

👶請在 1 分鐘內完成輸入，否則將取消`;

const CANCELLED = '😒本次建立已取消';

const VERSION_TEXT = `目前最新版本為${VERSION}
有任何問題或漏洞歡迎來信：${CONTACT}`;

const HELP = `👋 把網址傳給我，我會幫你縮成 huhm.cc 短連結！

🛠 可用指令：
ver／版本 — 查看版本
求救 — 開啟客服服務單
關閉 — 關閉您的服務單`;

const ONLY_TEXT = '🤖 目前只支援文字訊息，請直接傳送網址。';

/** 等待選擇中的對話：userId → { url } */
const pending = new Map();

/** 開啟中的服務單：userId → { ticket, description, openedAt } */
const tickets = new Map();

function config() {
  return {
    channelSecret: process.env.LINE_CHANNEL_SECRET || '',
    accessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
    apiUrl: process.env.HUHMINK_API_URL || 'https://l.huhm.cc/api/v1/shorten',
    apiKey: process.env.HUHMINK_API_KEY || '',
    adminUserId: process.env.ADMIN_LINE_USER_ID || '',
  };
}

/* ---------------- LINE API ---------------- */

/**
 * 回覆訊息（replyToken 只能使用一次，多段文字會併成同一則回覆）
 * textOrArray — 字串或字串陣列
 */
async function replyMessage(replyToken, textOrArray) {
  const { accessToken } = config();
  const texts = Array.isArray(textOrArray) ? textOrArray : [textOrArray];
  const res = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      replyToken,
      messages: texts.map((t) => ({ type: 'text', text: String(t).slice(0, 2000) })),
    }),
  });
  if (!res.ok) throw new Error(`LINE reply 失敗 (${res.status})`);
}

async function pushMessage(userId, text) {
  const { accessToken } = config();
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ to: userId, messages: [{ type: 'text', text: String(text).slice(0, 2000) }] }),
  });
  if (!res.ok) throw new Error(`LINE push 失敗 (${res.status})`);
}

/** 推播給管理員（未設定 ADMIN_LINE_USER_ID 時靜靜略過） */
async function notifyAdmin(text) {
  const { adminUserId } = config();
  if (!adminUserId) return;
  try {
    await pushMessage(adminUserId, text);
  } catch (error) {
    console.error('[bot] 管理員通知失敗:', error.message);
  }
}

/* ---------------- HuhmINK API ---------------- */

async function createShortLink(target, options) {
  const { apiUrl, apiKey } = config();
  if (!apiKey) {
    throw new Error('尚未設定 HUHMINK_API_KEY。請先到 l.huhm.cc/howto 申請一組 API 金鑰。');
  }
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ type: 'url', target, ...options }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `建立連結失敗 (${res.status})`);
  return data; // { code, url }
}

/* ---------------- 模糊指令辨識 ---------------- */

/** 編輯距離（Levenshtein） */
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1, // 刪除
        curr[j - 1] + 1, // 插入
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1) // 替換
      );
    }
    prev = curr;
  }
  return prev[b.length];
}

/** 指令表：label 顯示用，aliases 用於精確與模糊比對 */
const COMMANDS = [
  { label: '版本', aliases: ['ver', 'version', '版本'], key: 'version' },
  { label: '求救', aliases: ['求救', '求助', 'help', '客服', '支援', '回報'], key: 'sos' },
  { label: '關閉', aliases: ['關閉', 'close', '結案', '關單'], key: 'close' },
];

/**
 * 模糊比對：回傳 { key, label, exact } 或 null
 * 規則：正規化（小寫、去空白）→
 *   1. 完全等於 alias → exact
 *   2. 包含 alias（alias 長度 ≥ 2）→ 近似
 *   3. 編輯距離 ≤ 1（輸入長度 ≥ 2）→ 近似
 */
function matchCommand(rawText) {
  const text = String(rawText || '').toLowerCase().replace(/\s+/g, '');
  if (!text) return null;
  for (const command of COMMANDS) {
    for (const alias of command.aliases) {
      const a = alias.toLowerCase();
      if (text === a) return { key: command.key, label: command.label, exact: true };
    }
  }
  for (const command of COMMANDS) {
    for (const alias of command.aliases) {
      const a = alias.toLowerCase();
      if (a.length >= 2 && text.includes(a)) return { key: command.key, label: command.label, exact: false };
    }
  }
  for (const command of COMMANDS) {
    for (const alias of command.aliases) {
      const a = alias.toLowerCase();
      if (text.length >= 2 && levenshtein(text, a) <= 1) return { key: command.key, label: command.label, exact: false };
    }
  }
  return null;
}

/* ---------------- 指令實作 ---------------- */

/** 生成 10 位數字服務序號 */
function generateTicketNumber() {
  return String(crypto.randomInt(1_000_000_000, 10_000_000_000));
}

/** 求救：開服務單（可附問題描述），並轉交管理員。回傳給使用者的回覆文字 */
async function cmdSos(userId, description) {
  const ticket = generateTicketNumber();
  tickets.set(userId, { ticket, description, openedAt: Date.now() });

  await notifyAdmin(
    `🆕 新服務單已開啟
🎫 序號：${ticket}
👤 用戶：${userId}
📝 內容：${description || '（未填寫）'}
⏰ 時間：${new Date().toISOString()}`
  );

  return `📝服務單已開啟📝
🎫服務序號：${ticket}
😼客服人員將在 5日 內回覆您
😼若您未收到回覆請聯係 Email
${CONTACT}`;
}

/** 關閉：結束目前服務單（序號不變）。回傳給使用者的回覆文字 */
async function cmdClose(userId) {
  const active = tickets.get(userId);
  if (!active) {
    return '🎫 您目前沒有開啟中的服務單。';
  }
  tickets.delete(userId);
  await notifyAdmin(
    `✅ 服務單已由用戶關閉
🎫 序號：${active.ticket}
👤 用戶：${userId}`
  );
  return `📝服務單已關閉📝
🎫服務序號：${active.ticket}`;
}

/** 依 key 執行指令，回傳給使用者的回覆文字 */
async function runCommand(key, userId, text) {
  if (key === 'version') {
    return VERSION_TEXT;
  }
  if (key === 'sos') {
    const description = String(text || '').trim().split(/\s+/).slice(1).join(' ');
    return cmdSos(userId, description);
  }
  if (key === 'close') {
    return cmdClose(userId);
  }
  return HELP;
}

/* ---------------- 對話流程 ---------------- */

function extractUrl(text) {
  const match = text.match(/https?:\/\/\S+/i);
  return match ? match[0] : null;
}

async function finish(replyToken, session, answer) {
  const lower = answer.toLowerCase();

  if (lower === 'c') {
    await replyMessage(replyToken, CANCELLED);
    return;
  }

  let options = {};
  let note = '';
  if (lower === 'n1' || lower === 'n2' || lower === 'na') {
    // 不開啟任何保護，直接建立一般連結
  } else if (lower === 'y') {
    options = { nsfw: true };
    note = '🔞 已開啟 18+ 驗證';
  } else {
    if (answer.length < 4 || answer.length > 72) {
      await replyMessage(replyToken, '⚠️ 密碼長度需 4–72 個字元，請重新傳送網址再試一次。');
      return;
    }
    options = { password: answer };
    note = '🔒 已設定密碼保護';
  }

  try {
    const { url } = await createShortLink(session.url, options);
    await replyMessage(replyToken, `✅ 建立成功\n🔗 ${url}${note ? `\n${note}` : ''}`);
  } catch (error) {
    await replyMessage(replyToken, `⚠️ ${error.message}`);
  }
}

/** 處理一則 LINE 訊息事件 */
async function handleMessageEvent(event, timers) {
  if (event.type !== 'message' || !event.source?.userId) return;
  const userId = event.source.userId;
  const replyToken = event.replyToken;
  if (event.message?.type !== 'text') {
    await replyMessage(replyToken, ONLY_TEXT).catch(() => undefined);
    return;
  }

  const text = event.message.text.trim();
  const lower = text.toLowerCase();
  const url = extractUrl(text);

  // 指令比對（含模糊辨識；有網址時優先走縮址流程）
  const command = url ? null : matchCommand(text);
  if (command) {
    const session = pending.get(userId);
    if (session) {
      // 使用者中途改下指令 → 取消進行中的縮址流程
      pending.delete(userId);
      timers.cancelTimeout(userId);
    }
    const output = await runCommand(command.key, userId, text);
    await replyMessage(
      replyToken,
      command.exact
        ? output
        : [`🤔 您想輸入的是「${command.label}」嗎？已為您執行`, output]
    );
    return;
  }

  const session = pending.get(userId);

  // 有等待中的選擇
  if (session) {
    if (url) {
      // 使用者改傳新的網址 → 重新開始流程
      pending.set(userId, { url });
      timers.registerTimeout(userId);
      await replyMessage(replyToken, MENU);
      return;
    }
    pending.delete(userId);
    timers.cancelTimeout(userId);
    await finish(replyToken, session, text);
    return;
  }

  // 新網址 → 進入選擇流程
  if (url) {
    pending.set(userId, { url });
    timers.registerTimeout(userId);
    await replyMessage(replyToken, MENU);
    return;
  }

  // 都不是 → 說明與指令列表
  await replyMessage(replyToken, HELP);
}

/** 60 秒到期：清除狀態並主動推送取消訊息 */
async function onTimeout(userId) {
  if (!pending.has(userId)) return;
  pending.delete(userId);
  try {
    await pushMessage(userId, CANCELLED);
  } catch (error) {
    console.error('[bot] timeout push 失敗:', error.message);
  }
}

/* ---------------- Webhook 進入點 ---------------- */

/** 驗證 X-Line-Signature */
function verifySignature(rawBody, signature) {
  const { channelSecret } = config();
  if (!channelSecret) throw new Error('尚未設定 LINE_CHANNEL_SECRET');
  const expected = crypto.createHmac('sha256', channelSecret).update(rawBody).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * 處理整包 webhook 事件
 * body — LINE 傳來的 JSON（原文字串）
 */
async function handleEvents(body, timers) {
  const parsed = typeof body === 'string' ? JSON.parse(body) : body;
  const events = Array.isArray(parsed.events) ? parsed.events : [];
  for (const event of events) {
    try {
      await handleMessageEvent(event, timers);
    } catch (error) {
      console.error('[bot] 事件處理失敗:', error.message);
    }
  }
}

module.exports = {
  VERSION,
  TIMEOUT_MS,
  MENU,
  CANCELLED,
  VERSION_TEXT,
  HELP,
  pending,
  tickets,
  verifySignature,
  handleEvents,
  onTimeout,
  matchCommand,
  runCommand,
};
