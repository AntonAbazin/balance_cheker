const config = require('./config');
const db = require('./db');
const { fetchBalance } = require('./providers');
const { CHAINS } = require('./providers/tokens');
const { sendMessage } = require('./telegram');

// Уведомляем в телеграм только при изменении USDT-баланса больше чем на эту величину —
// иначе на «пыль» (округление, копеечные комиссии) приходило бы сообщение при каждой проверке.
const USDT_NOTIFY_THRESHOLD = 0.01;

function formatAmount(n) {
  return Number(n).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Проверяет один кошелёк: USDT и нативную монету блокчейна параллельно.
// Если это первая проверка USDT (usdt_balance = null) — баланс просто
// сохраняется как база, без уведомления. Уведомление не отправляет —
// возвращает { wallet, usdtChange } для того, чтобы вызывающая сторона
// могла собрать изменения по нескольким кошелькам в одно сообщение.
async function checkWalletNoNotify(wallet) {
  const chain = CHAINS[wallet.blockchain];
  const usdtToken = chain.tokens.USDT;

  const [nativeResult, usdtResult] = await Promise.allSettled([
    fetchBalance({ blockchain: wallet.blockchain, address: wallet.address, token_contract: null, decimals: chain.native.decimals }),
    fetchBalance({ blockchain: wallet.blockchain, address: wallet.address, token_contract: usdtToken.contract, decimals: usdtToken.decimals }),
  ]);

  if (nativeResult.status === 'fulfilled') {
    db.setNativeBalance(wallet.id, nativeResult.value);
  } else {
    console.error(`[scheduler] Ошибка проверки нативного баланса #${wallet.id} (${wallet.label}): ${nativeResult.reason.message}`);
    db.setNativeError(wallet.id, nativeResult.reason.message);
  }

  let usdtChange = null;
  if (usdtResult.status === 'fulfilled') {
    const newBalance = usdtResult.value;
    const isFirstCheck = wallet.usdt_balance === null;
    if (!isFirstCheck && Math.abs(newBalance - wallet.usdt_balance) > USDT_NOTIFY_THRESHOLD) {
      usdtChange = { oldBalance: wallet.usdt_balance, newBalance };
    }
    db.setUsdtBalance(wallet.id, newBalance);
  } else {
    console.error(`[scheduler] Ошибка проверки USDT-баланса #${wallet.id} (${wallet.label}): ${usdtResult.reason.message}`);
    db.setUsdtError(wallet.id, usdtResult.reason.message);
  }

  const updated = db.getWallet(wallet.id);
  return { wallet: updated, usdtChange };
}

// Проверяет один кошелёк и, если баланс USDT изменился, сразу шлёт уведомление.
// Используется там, где кошелёк проверяется в одиночку (создание, ручная проверка).
async function checkWallet(wallet) {
  const { wallet: updated, usdtChange } = await checkWalletNoNotify(wallet);

  if (usdtChange) {
    await notifyUsdtChanges([{ wallet: updated, ...usdtChange }]).catch((err) =>
      console.error(`[scheduler] Не удалось отправить уведомление: ${err.message}`)
    );
  }

  return updated;
}

// Отправляет одно уведомление в телеграм по всем изменениям USDT-баланса за цикл проверки.
async function notifyUsdtChanges(changes) {
  const wallets = db.listWallets();
  const changedIds = new Set(changes.map((c) => c.wallet.id));

  const byLabel = new Map();
  for (const w of wallets) {
    let group = byLabel.get(w.label);
    if (!group) {
      group = { sum: 0, hasData: false, changed: false };
      byLabel.set(w.label, group);
    }
    if (w.usdt_balance !== null) {
      group.sum += w.usdt_balance;
      group.hasData = true;
    }
    if (changedIds.has(w.id)) group.changed = true;
  }

  const lines = [...byLabel.entries()].map(([label, group]) => {
    const mark = group.changed ? '→ ' : '• ';
    const amount = group.hasData ? `${formatAmount(group.sum)} USDT` : 'нет данных';
    return `${mark}${escapeHtml(label)}: ${amount}`;
  });

  const total = wallets.reduce((sum, w) => sum + (w.usdt_balance || 0), 0);

  const changeLines = changes.map(({ wallet, oldBalance, newBalance }) => {
    const diff = newBalance - oldBalance;
    const sign = diff > 0 ? '+' : '';
    return `<b>${escapeHtml(wallet.label)}</b>: ${formatAmount(oldBalance)} → ${formatAmount(newBalance)} (Δ ${sign}${formatAmount(diff)})`;
  });

  const title = changes.length === 1 ? '💰 Изменился баланс USDT' : `💰 Изменились балансы USDT (${changes.length})`;

  await sendMessage(
    `${title}\n` +
      `${changeLines.join('\n')}\n\n` +
      `Балансы USDT:\n${lines.join('\n')}\n\n` +
      `Итого USDT: ${formatAmount(total)}`
  );
}

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

// Проверяет все кошельки и, если баланс USDT изменился хотя бы у одного,
// шлёт одно общее уведомление в телеграм — даже если изменились сразу несколько.
async function checkAllWallets() {
  const wallets = db.listWallets();
  const changes = [];
  for (const wallet of wallets) {
    const { wallet: updated, usdtChange } = await checkWalletNoNotify(wallet);
    if (usdtChange) {
      changes.push({ wallet: updated, ...usdtChange });
    }
  }

  if (changes.length > 0) {
    await notifyUsdtChanges(changes).catch((err) =>
      console.error(`[scheduler] Не удалось отправить уведомление: ${err.message}`)
    );
  }
}

function startScheduler() {
  const intervalMs = config.checkIntervalMinutes * 60 * 1000;
  console.log(`[scheduler] Проверка балансов каждые ${config.checkIntervalMinutes} мин.`);
  setInterval(() => {
    checkAllWallets().catch((err) => console.error(`[scheduler] Ошибка цикла проверки: ${err.message}`));
  }, intervalMs);
}

module.exports = { checkWallet, checkAllWallets, startScheduler };
