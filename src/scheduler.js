const config = require('./config');
const db = require('./db');
const { fetchBalance } = require('./providers');
const { sendMessage } = require('./telegram');

function formatAmount(n) {
  return Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 8 });
}

// Проверяет один кошелёк. Если это первая проверка (last_balance = null) —
// баланс просто сохраняется как база, без уведомления.
// Возвращает актуальную запись кошелька.
async function checkWallet(wallet) {
  let balance;
  try {
    balance = await fetchBalance(wallet);
  } catch (err) {
    console.error(`[scheduler] Ошибка проверки кошелька #${wallet.id} (${wallet.label}): ${err.message}`);
    db.setError(wallet.id, err.message);
    return db.getWallet(wallet.id);
  }

  const isFirstCheck = wallet.last_balance === null;
  const changed = !isFirstCheck && balance !== wallet.last_balance;

  db.setBalance(wallet.id, balance);

  // Уведомляем в телеграм только об изменениях USDT-кошельков, и сразу сводкой
  // по всем USDT-кошелькам с итоговой суммой (не отдельным сообщением на кошелёк).
  if (changed && wallet.currency === 'USDT') {
    await notifyUsdtChange(wallet, wallet.last_balance, balance).catch((err) =>
      console.error(`[scheduler] Не удалось отправить уведомление: ${err.message}`)
    );
  }

  return db.getWallet(wallet.id);
}

async function notifyUsdtChange(changedWallet, oldBalance, newBalance) {
  const usdtWallets = db.listWallets().filter((w) => w.currency === 'USDT');

  const diff = newBalance - oldBalance;
  const sign = diff > 0 ? '+' : '';

  const lines = usdtWallets.map((w) => {
    const mark = w.id === changedWallet.id ? '→ ' : '• ';
    const amount = w.last_balance === null ? 'нет данных' : `${formatAmount(w.last_balance)} USDT`;
    return `${mark}${escapeHtml(w.label)}: ${amount}`;
  });

  const total = usdtWallets.reduce((sum, w) => sum + (w.last_balance || 0), 0);

  await sendMessage(
    `💰 Изменился баланс USDT: <b>${escapeHtml(changedWallet.label)}</b>\n` +
      `Было: ${formatAmount(oldBalance)} → Стало: ${formatAmount(newBalance)} (Δ ${sign}${formatAmount(diff)})\n\n` +
      `Балансы USDT:\n${lines.join('\n')}\n\n` +
      `Итого USDT: ${formatAmount(total)}`
  );
}

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

async function checkAllWallets() {
  const wallets = db.listWallets();
  for (const wallet of wallets) {
    await checkWallet(wallet);
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
