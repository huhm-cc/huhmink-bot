/**
 * bot.js — HuhmINK 官方 LINE Bot 核心（零相依，Node 18+）
 *
 * 職責：
 *   1. 驗證 LINE Webhook 簽名（HMAC-SHA256）
 *   2. 對話狀態機：網址 → 60 秒內選擇保護選項 → 呼叫 HuhmINK API 建立短連結
 *   3. 指令：ver / 版本
 *
 * 平台介面（server.js 與 api/webhook.js 都會用到）：
 *   handleEvents(body, { registerTimeout, cancelTimeout })
 *     registerTimeout(userId) — 由平台註冊 60 秒計時器（本機用 setTimeout、Vercel 用 waitUntil）
 *     cancelTimeout(userId)  — 使用者完成選擇後取消計時
 *   onTimeout(userId) — 60 秒到期，主動推送取消訊息
 */

const crypto = require('crypto');

const VERSION = 'v1.0.0';
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
也可以輸入「ver」或「版本」查看版本資訊。`;

const ONLY_TEXT = '🤖 目前只支援文字訊息，請直接傳送網址。';

/** 等待選擇中的對話：userId → { url } */
const pending = new Map();

function config() {
  return {
    channelSecret: process.env.LINE_CHANNEL_SECRET || '',
    accessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
    apiUrl: process.env.HUHMINK_API_URL || 'https://l.huhm.cc/api/v1/shorten',
    apiKey: process.env.HUHMINK_API_KEY || '',
  };
}

/* ---------------- LINE API ---------------- */

async function replyMessage(replyToken, text) {
  const { accessToken } = config();
  const res = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ replyToken, messages: [{ type: 'text', text: String(text).slice(0, 2000) }] }),
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

  // 指令：ver / 版本（隨時可用）
  if (!url && (lower === 'ver' || text === '版本')) {
    await replyMessage(replyToken, VERSION_TEXT);
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
  verifySignature,
  handleEvents,
  onTimeout,
};
