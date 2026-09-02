// Ethereum и BSC — через единый Etherscan API V2 (multichain, один ключ, параметр chainid).
const config = require('../config');
const { CHAINS } = require('./tokens');

const BASE_URL = 'https://api.etherscan.io/v2/api';

async function callEtherscan(chainId, params) {
  const url = new URL(BASE_URL);
  url.searchParams.set('chainid', String(chainId));
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('apikey', config.etherscanApiKey);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Etherscan HTTP ${res.status}`);
  const data = await res.json();

  // account/balance и account/tokenbalance возвращают status "0"/"1"
  if (data.status === '0' && data.message !== 'No transactions found') {
    throw new Error(`Etherscan API error: ${data.result || data.message}`);
  }
  return data.result;
}

function rawToDecimal(raw, decimals) {
  return Number(BigInt(raw)) / 10 ** decimals;
}

async function getNativeBalance(blockchain, address) {
  const chain = CHAINS[blockchain];
  const raw = await callEtherscan(chain.chainId, {
    module: 'account',
    action: 'balance',
    address,
    tag: 'latest',
  });
  return rawToDecimal(raw, chain.native.decimals);
}

async function getTokenBalance(blockchain, address, contract, decimals) {
  const chain = CHAINS[blockchain];
  const raw = await callEtherscan(chain.chainId, {
    module: 'account',
    action: 'tokenbalance',
    contractaddress: contract,
    address,
    tag: 'latest',
  });
  return rawToDecimal(raw, decimals);
}

module.exports = { getNativeBalance, getTokenBalance };
