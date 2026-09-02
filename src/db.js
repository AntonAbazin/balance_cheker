const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, 'balance_checker.db'));
db.exec('PRAGMA journal_mode = WAL;');

db.exec(`
  CREATE TABLE IF NOT EXISTS wallets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    blockchain TEXT NOT NULL CHECK(blockchain IN ('ethereum', 'bsc', 'tron')),
    currency TEXT NOT NULL,
    token_contract TEXT,
    decimals INTEGER NOT NULL,
    address TEXT NOT NULL,
    last_balance REAL,
    last_checked_at TEXT,
    last_error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const listWalletsStmt = db.prepare('SELECT * FROM wallets ORDER BY created_at DESC');
const getWalletStmt = db.prepare('SELECT * FROM wallets WHERE id = ?');
const insertWalletStmt = db.prepare(`
  INSERT INTO wallets (label, blockchain, currency, token_contract, decimals, address)
  VALUES (@label, @blockchain, @currency, @token_contract, @decimals, @address)
`);
const deleteWalletStmt = db.prepare('DELETE FROM wallets WHERE id = ?');
const updateBalanceStmt = db.prepare(`
  UPDATE wallets SET last_balance = ?, last_checked_at = datetime('now'), last_error = NULL WHERE id = ?
`);
const updateErrorStmt = db.prepare(`
  UPDATE wallets SET last_error = ?, last_checked_at = datetime('now') WHERE id = ?
`);

module.exports = {
  listWallets: () => listWalletsStmt.all(),
  getWallet: (id) => getWalletStmt.get(id),
  createWallet: (wallet) => {
    const info = insertWalletStmt.run({
      label: wallet.label,
      blockchain: wallet.blockchain,
      currency: wallet.currency,
      token_contract: wallet.token_contract,
      decimals: wallet.decimals,
      address: wallet.address,
    });
    return getWalletStmt.get(info.lastInsertRowid);
  },
  deleteWallet: (id) => deleteWalletStmt.run(id),
  setBalance: (id, balance) => updateBalanceStmt.run(balance, id),
  setError: (id, message) => updateErrorStmt.run(message, id),
};
