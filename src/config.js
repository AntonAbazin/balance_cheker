require('dotenv').config();

module.exports = {
  port: Number(process.env.PORT) || 3000,
  etherscanApiKey: process.env.ETHERSCAN_API_KEY || '',
  trongridApiKey: process.env.TRONGRID_API_KEY || '',
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  telegramChatId: process.env.TELEGRAM_CHAT_ID || '',
  telegramProxyUrl: process.env.TELEGRAM_PROXY_URL || '',
  checkIntervalMinutes: Number(process.env.CHECK_INTERVAL_MINUTES) || 5,
};
