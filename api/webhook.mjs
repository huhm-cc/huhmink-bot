/**
 * api/webhook.mjs — Vercel Serverless 模式
 *
 * Vercel 的零設定 Node 函式介面是 (req, res[, context])：
 *   - req：Node IncomingMessage（用串流收原始 body 驗簽）
 *   - res：Node ServerResponse
 *   - context：Fluid Compute 提供 waitUntil（有才用於 60 秒逾時推播）
 *
 * 部署後把 LINE Webhook URL 設為：
 *   https://你的網域/api/webhook
 */

import bot from '../bot.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function registerTimeout(context, userId) {
  const waitUntil =
    context && typeof context.waitUntil === 'function' ? context.waitUntil.bind(context) : null;
  if (!waitUntil) return; // 沒有 waitUntil 時，逾時改為「下一則訊息時被動處理」
  waitUntil(sleep(bot.TIMEOUT_MS).then(() => bot.onTimeout(userId)).catch(() => undefined));
}

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

export default async function handler(req, res, context) {
  if (req.method !== 'POST') {
    res.statusCode = 404;
    res.end('Not Found');
    return;
  }

  let ok = false;
  try {
    const raw = await readRawBody(req);
    if (bot.verifySignature(raw, req.headers['x-line-signature'])) {
      await bot.handleEvents(raw, {
        registerTimeout: (userId) => registerTimeout(context, userId),
        cancelTimeout: () => {},
      });
      ok = true;
    }
  } catch (error) {
    console.error('[webhook]', error.message);
  }

  // LINE 要求一律回 200
  res.statusCode = ok ? 200 : 401;
  res.setHeader('Content-Type', 'application/json');
  res.end('{}');
}

export const maxDuration = 120;
