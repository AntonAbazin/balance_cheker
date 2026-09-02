let chains = {};

const blockchainSelect = document.getElementById('blockchain-select');
const currencySelect = document.getElementById('currency-select');
const customFields = document.getElementById('custom-token-fields');
const addForm = document.getElementById('add-form');
const addError = document.getElementById('add-error');
const walletsList = document.getElementById('wallets-list');
const emptyHint = document.getElementById('empty-hint');
const usdtTotal = document.getElementById('usdt-total');
const addModal = document.getElementById('add-modal');
const openAddModalBtn = document.getElementById('open-add-modal');
const closeAddModalBtn = document.getElementById('close-add-modal');

const CHAIN_BADGE = { ethereum: 'ETH', bsc: 'BSC', tron: 'TRX' };

async function loadChains() {
  const res = await fetch('/api/chains');
  chains = await res.json();
  populateCurrencies();
}

function populateCurrencies() {
  const chain = chains[blockchainSelect.value];
  currencySelect.innerHTML = '';

  const nativeOpt = document.createElement('option');
  nativeOpt.value = chain.native.symbol;
  nativeOpt.textContent = `${chain.native.symbol} (нативная)`;
  currencySelect.appendChild(nativeOpt);

  for (const symbol of Object.keys(chain.tokens)) {
    const opt = document.createElement('option');
    opt.value = symbol;
    opt.textContent = symbol;
    currencySelect.appendChild(opt);
  }

  const customOpt = document.createElement('option');
  customOpt.value = 'CUSTOM';
  customOpt.textContent = 'Другой токен…';
  currencySelect.appendChild(customOpt);

  toggleCustomFields();
}

function toggleCustomFields() {
  customFields.hidden = currencySelect.value !== 'CUSTOM';
}

blockchainSelect.addEventListener('change', populateCurrencies);
currencySelect.addEventListener('change', toggleCustomFields);

function openAddModal() {
  addForm.reset();
  populateCurrencies();
  addError.textContent = '';
  addModal.hidden = false;
}

function closeAddModal() {
  addModal.hidden = true;
}

openAddModalBtn.addEventListener('click', openAddModal);
closeAddModalBtn.addEventListener('click', closeAddModal);
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
    currency: formData.get('currency'),
    address: formData.get('address'),
  };

  if (payload.currency === 'CUSTOM') {
    payload.tokenContract = formData.get('tokenContract');
    payload.decimals = Number(formData.get('decimals'));
  }

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

function formatAmount(n) {
  return Number(n).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatBalance(w) {
  if (w.last_balance === null) return w.last_error ? '—' : 'проверяется…';
  return formatAmount(w.last_balance) + ' ' + w.currency;
}

function formatChecked(w) {
  if (!w.last_checked_at) return '—';
  return new Date(w.last_checked_at + 'Z').toLocaleString('ru-RU');
}

function shortAddress(addr) {
  return addr.length > 16 ? addr.slice(0, 8) + '…' + addr.slice(-6) : addr;
}

async function loadWallets() {
  const res = await fetch('/api/wallets');
  const wallets = await res.json();

  walletsList.innerHTML = '';
  emptyHint.hidden = wallets.length > 0;

  const usdtBalances = wallets.filter((w) => w.currency === 'USDT' && w.last_balance !== null);
  if (usdtBalances.length > 0) {
    const total = usdtBalances.reduce((sum, w) => sum + w.last_balance, 0);
    usdtTotal.hidden = false;
    usdtTotal.innerHTML = `
      <div class="wallet-icon total">Σ</div>
      <div class="wallet-info">
        <div class="wallet-title">
          <span class="wallet-label">Итого USDT</span>
        </div>
      </div>
      <div class="wallet-balance">${formatAmount(total)} USDT</div>
    `;
  } else {
    usdtTotal.hidden = true;
  }

  for (const w of wallets) {
    const row = document.createElement('div');
    row.className = 'wallet-row';

    row.innerHTML = `
      <div class="wallet-icon ${escapeHtml(w.blockchain)}">${CHAIN_BADGE[w.blockchain] || w.blockchain}</div>
      <div class="wallet-info">
        <div class="wallet-title">
          <span class="wallet-label">${escapeHtml(w.label)}</span>
          <span class="wallet-currency">${escapeHtml(w.currency)}</span>
        </div>
        <div class="wallet-address" title="${escapeHtml(w.address)}">${shortAddress(w.address)}</div>
        <div class="wallet-meta">Проверен: ${formatChecked(w)}</div>
        ${w.last_error ? `<div class="wallet-error">${escapeHtml(w.last_error)}</div>` : ''}
      </div>
      <div class="wallet-balance">${formatBalance(w)}</div>
      <div class="wallet-actions"></div>
    `;

    const actions = row.querySelector('.wallet-actions');

    const checkBtn = document.createElement('button');
    checkBtn.className = 'secondary';
    checkBtn.textContent = 'Проверить';
    checkBtn.onclick = async () => {
      checkBtn.disabled = true;
      await fetch(`/api/wallets/${w.id}/check`, { method: 'POST' });
      await loadWallets();
    };
    actions.appendChild(checkBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'danger';
    delBtn.textContent = 'Удалить';
    delBtn.onclick = async () => {
      if (!confirm(`Удалить кошелёк «${w.label}»?`)) return;
      await fetch(`/api/wallets/${w.id}`, { method: 'DELETE' });
      await loadWallets();
    };
    actions.appendChild(delBtn);

    walletsList.appendChild(row);
  }
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

loadChains();
loadWallets();
setInterval(loadWallets, 30000);
