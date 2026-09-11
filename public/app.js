let chains = {};

const blockchainSelect = document.getElementById('blockchain-select');
const addForm = document.getElementById('add-form');
const addError = document.getElementById('add-error');
const walletsList = document.getElementById('wallets-list');
const emptyHint = document.getElementById('empty-hint');
const usdtTotal = document.getElementById('usdt-total');
const addModal = document.getElementById('add-modal');
const openAddModalBtn = document.getElementById('open-add-modal');
const closeAddModalBtn = document.getElementById('close-add-modal');
const cancelAddBtn = document.getElementById('cancel-add');
const checkAllBtn = document.getElementById('check-all-btn');

const CHAIN_CODE = { ethereum: 'ETH', bsc: 'BSC', tron: 'TRX' };

async function loadChains() {
  const res = await fetch('/api/chains');
  chains = await res.json();

  blockchainSelect.innerHTML = '';
  for (const [key, chain] of Object.entries(chains)) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = chain.label;
    blockchainSelect.appendChild(opt);
  }
}

function openAddModal() {
  addForm.reset();
  addError.textContent = '';
  addModal.hidden = false;
}

function closeAddModal() {
  addModal.hidden = true;
}

openAddModalBtn.addEventListener('click', openAddModal);
closeAddModalBtn.addEventListener('click', closeAddModal);
cancelAddBtn.addEventListener('click', closeAddModal);
addModal.addEventListener('click', (e) => {
  if (e.target === addModal) closeAddModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !addModal.hidden) closeAddModal();
});

addForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  addError.textContent = '';

  const formData = new FormData(addForm);
  const payload = {
    label: formData.get('label'),
    blockchain: formData.get('blockchain'),
    address: formData.get('address'),
  };

  const res = await fetch('/api/wallets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    addError.textContent = data.error || 'Не удалось добавить кошелёк';
    return;
  }

  closeAddModal();
  await loadWallets();
});

function formatUsdt(n) {
  return Number(n).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatNative(n, symbol) {
  const val = Number(n);
  if (symbol === 'ETH' && val > 0 && val < 0.001) return `< 0.001 ${symbol}`;
  if (val === 0) return `0 ${symbol}`;
  if (val >= 100) return `${val.toFixed(2)} ${symbol}`;
  if (val >= 1) return `${val.toFixed(3)} ${symbol}`;
  return `${val.toFixed(6)} ${symbol}`;
}

function pluralize(n, [one, few, many]) {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return one;
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return few;
  return many;
}

function latestCheckedAt(w) {
  const dates = [w.usdt_checked_at, w.native_checked_at].filter(Boolean);
  if (dates.length === 0) return null;
  return dates.reduce((a, b) => (a > b ? a : b));
}

function formatChecked(w) {
  const at = latestCheckedAt(w);
  if (!at) return '—';
  return new Date(at + 'Z').toLocaleString('ru-RU');
}

function shortAddress(addr) {
  return addr.length > 16 ? addr.slice(0, 8) + '…' + addr.slice(-6) : addr;
}

checkAllBtn.addEventListener('click', async () => {
  checkAllBtn.disabled = true;
  checkAllBtn.querySelector('.icon-refresh').classList.add('spinning');
  try {
    await fetch('/api/wallets/check-all', { method: 'POST' });
    await loadWallets();
  } finally {
    checkAllBtn.disabled = false;
    checkAllBtn.querySelector('.icon-refresh').classList.remove('spinning');
  }
});

async function loadWallets() {
  const res = await fetch('/api/wallets');
  const wallets = await res.json();

  wallets.sort((a, b) => a.label.localeCompare(b.label, 'ru'));

  walletsList.innerHTML = '';
  emptyHint.hidden = wallets.length > 0;

  renderTotal(wallets);

  for (const w of wallets) {
    walletsList.appendChild(renderWalletRow(w));
  }
}

function renderTotal(wallets) {
  if (wallets.length === 0) {
    usdtTotal.hidden = true;
    return;
  }

  const total = wallets.reduce((sum, w) => sum + (w.usdt_balance || 0), 0);

  const nativeTotals = {};
  for (const w of wallets) {
    if (w.native_balance > 0) {
      const symbol = chains[w.blockchain]?.native.symbol || '';
      nativeTotals[symbol] = (nativeTotals[symbol] || 0) + w.native_balance;
    }
  }

  usdtTotal.hidden = false;
  usdtTotal.innerHTML = `
    <div class="total-left">
      <div class="total-icon">Σ</div>
      <div class="total-info">
        <span class="total-title">Итого USDT</span>
        <span class="total-count">${wallets.length} ${pluralize(wallets.length, ['кошелёк', 'кошелька', 'кошельков'])}</span>
      </div>
    </div>
    <div class="total-right">
      <span class="total-amount">${formatUsdt(total)}<span class="unit">USDT</span></span>
      ${Object.entries(nativeTotals)
        .map(([symbol, val]) => `<span class="total-native">${formatNative(val, symbol)}</span>`)
        .join('')}
    </div>
  `;
}

function renderWalletRow(w) {
  const row = document.createElement('div');
  row.className = 'wallet-row';

  const nativeSymbol = chains[w.blockchain]?.native.symbol || '';

  const usdtHtml =
    w.usdt_balance === null
      ? `<span class="wallet-usdt zero">${w.usdt_error ? '—' : 'проверяется…'}</span>`
      : `<span class="wallet-usdt${w.usdt_balance === 0 ? ' zero' : ''}">${formatUsdt(w.usdt_balance)}<span class="unit">USDT</span></span>`;

  const nativeHtml =
    w.native_balance === null
      ? (w.native_error ? '' : `<span class="wallet-native">проверяется…</span>`)
      : `<span class="wallet-native">${formatNative(w.native_balance, nativeSymbol)}</span>`;

  const errors = [];
  if (w.usdt_error) errors.push(`USDT: ${w.usdt_error}`);
  if (w.native_error) errors.push(`${nativeSymbol}: ${w.native_error}`);

  row.innerHTML = `
    <div class="chain-badge ${escapeHtml(w.blockchain)}">${CHAIN_CODE[w.blockchain] || w.blockchain}</div>
    <div class="wallet-info">
      <span class="wallet-label">${escapeHtml(w.label)}</span>
      <span class="wallet-address" title="${escapeHtml(w.address)}">${shortAddress(w.address)}</span>
      <span class="wallet-meta">Проверен: ${formatChecked(w)}</span>
      ${errors.length ? `<span class="wallet-error">${escapeHtml(errors.join(' · '))}</span>` : ''}
    </div>
    <div class="wallet-balance">
      ${usdtHtml}
      ${nativeHtml}
    </div>
    <div class="wallet-actions"></div>
  `;

  const actions = row.querySelector('.wallet-actions');

  const refreshBtn = document.createElement('button');
  refreshBtn.className = 'icon-btn refresh';
  refreshBtn.title = 'Обновить баланс';
  refreshBtn.innerHTML = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 4.5A7 7 0 1 1 3 10" stroke-linecap="round"/><path d="M4 1v4h4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  refreshBtn.onclick = async () => {
    refreshBtn.disabled = true;
    await fetch(`/api/wallets/${w.id}/check`, { method: 'POST' });
    await loadWallets();
  };
  actions.appendChild(refreshBtn);

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'icon-btn delete';
  deleteBtn.title = 'Удалить кошелёк';
  deleteBtn.innerHTML = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 5.5h14M8 5.5V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M16 5.5l-1 11a1 1 0 0 1-1 .9H6a1 1 0 0 1-1-.9L4 5.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  deleteBtn.onclick = async () => {
    if (!confirm(`Удалить кошелёк «${w.label}»?`)) return;
    await fetch(`/api/wallets/${w.id}`, { method: 'DELETE' });
    await loadWallets();
  };
  actions.appendChild(deleteBtn);

  return row;
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

loadChains().then(loadWallets);
setInterval(loadWallets, 30000);
