// Предустановленные монеты/токены по блокчейнам.
// Адреса контрактов и decimals проверены по Etherscan/BscScan/Tronscan (сентябрь 2026).
// Для произвольного токена пользователь указывает контракт и decimals вручную (currency = 'CUSTOM').

const CHAINS = {
  ethereum: {
    label: 'Ethereum',
    chainId: 1, // для Etherscan API V2 (multichain)
    native: { symbol: 'ETH', decimals: 18 },
    tokens: {
      USDT: { contract: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
      USDC: { contract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
    },
  },
  bsc: {
    label: 'BNB Smart Chain (BSC)',
    chainId: 56,
    native: { symbol: 'BNB', decimals: 18 },
    tokens: {
      USDT: { contract: '0x55d398326f99059fF775485246999027B3197955', decimals: 18 },
      USDC: { contract: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18 },
    },
  },
  tron: {
    label: 'TRON',
    native: { symbol: 'TRX', decimals: 6 },
    tokens: {
      USDT: { contract: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', decimals: 6 },
    },
  },
};

function isValidBlockchain(blockchain) {
  return Object.prototype.hasOwnProperty.call(CHAINS, blockchain);
}

module.exports = { CHAINS, isValidBlockchain };
