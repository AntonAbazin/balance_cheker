// Telegram Bot API часто недоступен напрямую (блокировки у провайдера) —
// поддерживаем подключение через прокси (HTTP/HTTPS/SOCKS4/SOCKS5), настраиваемый
// отдельно от остального трафика (Etherscan/TronGrid прокси не нужен).
const https = require('node:https');
const { ProxyAgent } = require('proxy-agent');
const config = require('./config');

// getProxyForUrl фиксирует прокси только для этого агента — не влияет на
// остальные запросы приложения и не зависит от глобальных HTTP_PROXY/HTTPS_PROXY.
const agent = config.telegramProxyUrl
  ? new ProxyAgent({ getProxyForUrl: () => config.telegramProxyUrl })
  : undefined;

function sendMessage(text) {
  return new Promise((resolve, reject) => {
    if (!config.telegramBotToken || !config.telegramChatId) {
      console.warn('[telegram] TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID не заданы — уведомление пропущено');
      resolve();
      return;
    }

    const body = JSON.stringify({
      chat_id: config.telegramChatId,
      text,
      parse_mode: 'HTML',
    });

    const req = https.request(
      {
        hostname: 'api.telegram.org',
        path: `/bot${config.telegramBotToken}/sendMessage`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        agent,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            console.error(`[telegram] sendMessage failed: HTTP ${res.statusCode} ${data}`);
          }
          resolve();
        });
      }
    );

    // Ошибка транспорта (в т.ч. недоступный/неверный прокси) — реальный сбой,
    // пробрасываем наверх, чтобы вызывающий код мог её залогировать.
    req.on('error', reject);

    req.write(body);
    req.end();
  });
}

module.exports = { sendMessage };
