const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const { CHAINS } = require('./providers/tokens');

const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, 'balance_checker.db'));
db.exec('PRAGMA journal_mode = WAL;');

// Миграция со старой схемы (одна строка = один блокчейн+валюта на адрес)
// на новую (одна строка = кошелёк, с отдельными полями usdt_*/native_*).
function migrateLegacySchema() {
  const hasLegacyTable = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='wallets'")
    .get();
  if (!hasLegacyTable) return;

  const columns = db.prepare('PRAGMA table_info(wallets)').all().map((c) => c.name);
  if (!columns.includes('currency')) return; // уже новая схема

  const legacyRows = db.prepare('SELECT * FROM wallets ORDER BY id').all();

  db.exec('ALTER TABLE wallets RENAME TO wallets_legacy;');
  createSchema();

  const groups = new Map(); // key: blockchain+address -> собранные поля
  for (const row of legacyRows) {
    const key = `${row.blockchain}::${row.address}`;
    if (!groups.has(key)) {
      groups.set(key, {
        label: row.label,
        blockchain: row.blockchain,
        address: row.address,
        usdt_balance: null,
        usdt_checked_at: null,
        usdt_error: null,
        native_balance: null,
        native_checked_at: null,
        native_error: null,
      });
    }
    const g = groups.get(key);
    const chain = CHAINS[row.blockchain];
    const nativeSymbol = chain ? chain.native.symbol : null;

    if (row.currency === 'USDT') {
      g.usdt_balance = row.last_balance;
      g.usdt_checked_at = row.last_checked_at;
      g.usdt_error = row.last_error;
    } else if (row.currency === nativeSymbol) {
      g.native_balance = row.last_balance;
      g.native_checked_at = row.last_checked_at;
      g.native_error = row.last_error;
    } else {
      console.warn(`[db] Миграция: пропущена запись с валютой "${row.currency}" (адрес ${row.address}) — больше не поддерживается`);
    }
  }

  const insert = db.prepare(`
    INSERT INTO wallets (label, blockchain, address, usdt_balance, usdt_checked_at, usdt_error, native_balance, native_checked_at, native_error)
    VALUES (@label, @blockchain, @address, @usdt_balance, @usdt_checked_at, @usdt_error, @native_balance, @native_checked_at, @native_error)
  `);
  for (const g of groups.values()) insert.run(g);

  db.exec('DROP TABLE wallets_legacy;');
  console.log(`[db] Миграция схемы завершена: ${groups.size} кошельков`);
}

function createSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS wallets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL,
      blockchain TEXT NOT NULL CHECK(blockchain IN ('ethereum', 'bsc', 'tron')),
      address TEXT NOT NULL,
      usdt_balance REAL,
      usdt_checked_at TEXT,
      usdt_error TEXT,
      native_balance REAL,
      native_checked_at TEXT,
      native_error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

migrateLegacySchema();
createSchema();

const listWalletsStmt = db.prepare('SELECT * FROM wallets ORDER BY label COLLATE NOCASE ASC');
const getWalletStmt = db.prepare('SELECT * FROM wallets WHERE id = ?');
const insertWalletStmt = db.prepare(`
  INSERT INTO wallets (label, blockchain, address)
  VALUES (@label, @blockchain, @address)
`);
const deleteWalletStmt = db.prepare('DELETE FROM wallets WHERE id = ?');
const updateUsdtBalanceStmt = db.prepare(`
  UPDATE wallets SET usdt_balance = ?, usdt_checked_at = datetime('now'), usdt_error = NULL WHERE id = ?
`);
const updateUsdtErrorStmt = db.prepare(`
  UPDATE wallets SET usdt_error = ?, usdt_checked_at = datetime('now') WHERE id = ?
`);
const updateNativeBalanceStmt = db.prepare(`
  UPDATE wallets SET native_balance = ?, native_checked_at = datetime('now'), native_error = NULL WHERE id = ?
`);
const updateNativeErrorStmt = db.prepare(`
  UPDATE wallets SET native_error = ?, native_checked_at = datetime('now') WHERE id = ?
`);

module.exports = {
  listWallets: () => listWalletsStmt.all(),
  getWallet: (id) => getWalletStmt.get(id),
  createWallet: (wallet) => {
    const info = insertWalletStmt.run({
      label: wallet.label,
      blockchain: wallet.blockchain,
      address: wallet.address,
    });
    return getWalletStmt.get(info.lastInsertRowid);
  },
  deleteWallet: (id) => deleteWalletStmt.run(id),
  setUsdtBalance: (id, balance) => updateUsdtBalanceStmt.run(balance, id),
  setUsdtError: (id, message) => updateUsdtErrorStmt.run(message, id),
  setNativeBalance: (id, balance) => updateNativeBalanceStmt.run(balance, id),
  setNativeError: (id, message) => updateNativeErrorStmt.run(message, id),
};
