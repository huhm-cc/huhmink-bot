/**
 * server.js — 長駐模式（本機測試 / VPS / Railway / Render / Fly.io）
 *
 * 啟動：
 *   LINE_CHANNEL_ACCESS_TOKEN=... LINE_CHANNEL_SECRET=... HUHMINK_API_KEY=... node server.js
 *
 * Webhook 網址：http(s)://你的主機/webhook
 * 本機測試（LINE 需要 HTTPS）可用 ngrok：ngrok http 3000
 */

const http = require('http');
const bot = require('./bot');

const PORT = Number(process.env.PORT || 3000);

const timers = new Map();

function cancelTimeout(userId) {
  const timer = timers.get(userId);
  if (timer) {
    clearTimeout(timer);
    timers.delete(userId);
  }
}

function registerTimeout(userId) {
  cancelTimeout(userId);
  timers.set(
    userId,
    setTimeout(() => {
      timers.delete(userId);
      bot.onTimeout(userId).catch(() => undefined);
    }, bot.TIMEOUT_MS)
  );
}

const server = http.createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/webhook') {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
    return;
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');

  let ok = false;
  try {
    if (bot.verifySignature(raw, req.headers['x-line-signature'])) {
      await bot.handleEvents(raw, { registerTimeout, cancelTimeout });
      ok = true;
    }
  } catch (error) {
    console.error('[webhook]', error.message);
  }

  // LINE 要求 webhook 一律回 200，否則會不斷重試
  res.writeHead(ok ? 200 : 401, { 'Content-Type': 'application/json' });
  res.end('{}');
});

server.listen(PORT, () => {
  console.log(`✓ HuhmINK LINE Bot 已啟動，監聽 :${PORT}`);
  console.log('  Webhook 路徑：POST /webhook');
  if (!process.env.LINE_CHANNEL_ACCESS_TOKEN || !process.env.LINE_CHANNEL_SECRET) {
    console.warn('  ⚠ 尚未設定 LINE_CHANNEL_ACCESS_TOKEN / LINE_CHANNEL_SECRET');
  }
  if (!process.env.HUHMINK_API_KEY) {
    console.warn('  ⚠ 尚未設定 HUHMINK_API_KEY（到 l.huhm.cc/howto 免費申請）');
  }
});
