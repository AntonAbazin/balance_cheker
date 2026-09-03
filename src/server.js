const path = require('path');
const express = require('express');
const config = require('./config');
const db = require('./db');
const { CHAINS, isValidBlockchain, resolvePreset } = require('./providers/tokens');
const { checkWallet, checkAllWallets, startScheduler } = require('./scheduler');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/chains', (req, res) => {
  res.json(CHAINS);
});

app.get('/api/wallets', (req, res) => {
  res.json(db.listWallets());
});

app.post('/api/wallets', async (req, res) => {
  const { label, blockchain, currency, address, tokenContract, decimals } = req.body || {};

  if (!blockchain || !isValidBlockchain(blockchain)) {
    return res.status(400).json({ error: 'Некорректный блокчейн' });
  }
  if (!currency || typeof currency !== 'string') {
    return res.status(400).json({ error: 'Не указана валюта' });
  }
  if (!address || typeof address !== 'string') {
    return res.status(400).json({ error: 'Не указан адрес' });
  }

  let contract = null;
  let dec = null;

  const preset = resolvePreset(blockchain, currency);
  if (preset) {
    contract = preset.contract;
    dec = preset.decimals;
  } else {
    // Произвольный токен — контракт и decimals обязательны
    if (!tokenContract || typeof tokenContract !== 'string') {
      return res.status(400).json({ error: 'Для произвольного токена нужен адрес контракта' });
    }
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
      return res.status(400).json({ error: 'Для произвольного токена нужны корректные decimals (0-36)' });
    }
    contract = tokenContract;
    dec = decimals;
  }

  const wallet = db.createWallet({
    label: label && label.trim() ? label.trim() : `${currency} ${address.slice(0, 8)}…`,
    blockchain,
    currency,
    token_contract: contract,
    decimals: dec,
    address: address.trim(),
  });

  // Первая проверка — база для дальнейшего сравнения, без уведомления в телеграм.
  const updated = await checkWallet(wallet);
  res.status(201).json(updated);
});

app.post('/api/wallets/check-all', async (req, res) => {
  await checkAllWallets();
  res.json(db.listWallets());
});

app.post('/api/wallets/:id/check', async (req, res) => {
  const wallet = db.getWallet(req.params.id);
  if (!wallet) return res.status(404).json({ error: 'Кошелёк не найден' });
  const updated = await checkWallet(wallet);
  res.json(updated);
});

app.delete('/api/wallets/:id', (req, res) => {
  const wallet = db.getWallet(req.params.id);
  if (!wallet) return res.status(404).json({ error: 'Кошелёк не найден' });
  db.deleteWallet(req.params.id);
  res.status(204).end();
});

app.listen(config.port, () => {
  console.log(`[server] Listening on http://localhost:${config.port}`);
  startScheduler();
});
