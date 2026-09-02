const evm = require('./evm');
const tron = require('./tron');

// wallet — запись из БД: { blockchain, address, token_contract, decimals }
async function fetchBalance(wallet) {
  const { blockchain, address, token_contract: contract, decimals } = wallet;

  if (blockchain === 'ethereum' || blockchain === 'bsc') {
    return contract
      ? evm.getTokenBalance(blockchain, address, contract, decimals)
      : evm.getNativeBalance(blockchain, address);
  }

  if (blockchain === 'tron') {
    return contract
      ? tron.getTokenBalance(address, contract, decimals)
      : tron.getNativeBalance(address);
  }

  throw new Error(`Неизвестный блокчейн: ${blockchain}`);
}

module.exports = { fetchBalance };
