// 本地測試：模糊指令辨識 + 服務單流程（不連線——未設 ADMIN_LINE_USER_ID 時通知會略過）
const bot = require('./bot');

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; } else { fail++; console.log('  ✗ ' + name); }
}

// ---- 模糊指令辨識 ----
console.log('【模糊指令辨識】');
const m = bot.matchCommand;
check('ver 精確', m('ver')?.key === 'version' && m('ver').exact === true);
check('版本 精確', m('版本')?.key === 'version' && m('版本').exact === true);
check('version 近似（前綴）', m('version')?.key === 'version');
check('求救 精確', m('求救')?.key === 'sos' && m('求救').exact === true);
check('求救 求助 近似（別名）', m('求助')?.key === 'sos');
check('求就 → 求救（編輯距離1）', m('求就')?.key === 'sos');
check('求救！我有問題（包含）', m('求救！我有問題')?.key === 'sos');
check('關閉 精確', m('關閉')?.key === 'close' && m('關閉').exact === true);
check('關單（別名）', m('關單')?.key === 'close');
check('close', m('close')?.key === 'close');
check('結案', m('結案')?.key === 'close');
check('板本 → 版本（編輯距離1）', m('板本')?.key === 'version');
check('VER 大小寫', m('  VER ')?.key === 'version');
check('純文字「你好」不應匹配', m('你好') === null);
check('一般短語不應誤判', m('今天天氣很好') === null);
check('數字不應匹配', m('123456') === null);
check('網址文字不應匹配', m('https://example.com') === null);

// ---- 服務單流程 ----
console.log('【服務單流程】');
(async () => {
  const userId = 'u-test-1';

  // 未開單就關閉
  let r = await bot.runCommand('close', userId, '關閉');
  check('無單關閉提示', r.includes('沒有開啟中的服務單'));

  // 開單
  r = await bot.runCommand('sos', userId, '求救 帳號無法登入');
  const ticketMatch = r.match(/🎫服務序號：(\d{10})/);
  check('開單回覆格式', r.startsWith('📝服務單已開啟📝'));
  check('生成 10 位數字序號', !!ticketMatch);
  const ticket = ticketMatch ? ticketMatch[1] : null;
  check('序號開頭不為 0', ticket ? ticket[0] !== '0' : false);
  check('回覆含 Email', r.includes('hi@mail.huhm.cc'));
  check('回覆含 5日', r.includes('5日'));

  // 關閉（序號不變）
  r = await bot.runCommand('close', userId, '關閉');
  check('關單回覆格式', r.startsWith('📝服務單已關閉📝'));
  check('關閉後序號不變', ticket ? r.includes(ticket) : false);

  // 再關一次 → 無單
  r = await bot.runCommand('close', userId, '關閉');
  check('結案後再關閉提示', r.includes('沒有開啟中的服務單'));

  console.log(`\n結果：${pass} 通過，${fail} 失敗`);
  process.exit(fail ? 1 : 0);
})();
