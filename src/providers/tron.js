// TRON — через публичный TronGrid API.
const config = require('../config');

const BASE_URL = 'https://api.trongrid.io';

async function fetchAccount(address) {
  const headers = {};
  if (config.trongridApiKey) headers['TRON-PRO-API-KEY'] = config.trongridApiKey;

  const res = await fetch(`${BASE_URL}/v1/accounts/${address}`, { headers });
  if (!res.ok) throw new Error(`TronGrid HTTP ${res.status}`);
  const data = await res.json();
  if (data.success === false) throw new Error(`TronGrid API error: ${data.error || 'unknown'}`);

  // Аккаунт без активности в сети возвращает пустой data — считаем баланс нулевым.
  return data.data && data.data[0] ? data.data[0] : null;
}

async function getNativeBalance(address) {
  const account = await fetchAccount(address);
  const sun = account && account.balance ? account.balance : 0;
  return sun / 1e6; // 1 TRX = 1_000_000 SUN
}

async function getTokenBalance(address, contract, decimals) {
  const account = await fetchAccount(address);
  if (!account || !Array.isArray(account.trc20)) return 0;

  const entry = account.trc20.find((t) => Object.keys(t)[0] === contract);
  if (!entry) return 0;

  const raw = entry[contract];
  return Number(BigInt(raw)) / 10 ** decimals;
}

module.exports = { getNativeBalance, getTokenBalance };
