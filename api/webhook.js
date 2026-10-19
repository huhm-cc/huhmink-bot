/**
 * api/webhook.js — Vercel Serverless 模式
 *
 * 部署到 Vercel 後，把 LINE Webhook URL 設為：
 *   https://你的網域/api/webhook
 *
 * 60 秒逾時透過 context.waitUntil 背景等待，不會佔用回應時間；
 * Vercel 函式常駐時段內 pending Map 有效（Fluid Compute）。
 */

const bot = require('../bot');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function cancelTimeout() {
  // serverless 模式下計時器由 waitUntil 管理，無需取消
}

function registerTimeout(context, userId) {
  const waitUntil = context && typeof context.waitUntil === 'function' ? context.waitUntil.bind(context) : null;
  if (!waitUntil) return;
  waitUntil(
    sleep(bot.TIMEOUT_MS).then(() => bot.onTimeout(userId)).catch(() => undefined)
  );
}

export default async function handler(request, context) {
  if (request.method !== 'POST') {
    return new Response('Not Found', { status: 404 });
  }

  const raw = await request.text();

  let ok = false;
  try {
    if (bot.verifySignature(raw, request.headers.get('x-line-signature'))) {
      await bot.handleEvents(raw, {
        registerTimeout: (userId) => registerTimeout(context, userId),
        cancelTimeout,
      });
      ok = true;
    }
  } catch (error) {
    console.error('[webhook]', error.message);
  }

  // LINE 要求一律回 200
  return new Response('{}', {
    status: ok ? 200 : 401,
    headers: { 'Content-Type': 'application/json' },
  });
}

// waitUntil 需要函式活著等 60 秒逾時推播
export const maxDuration = 120;
export const dynamic = 'force-dynamic';
