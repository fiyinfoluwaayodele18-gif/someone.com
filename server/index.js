import { config } from './config.js';
import { createApp } from './app.js';
import { createGemini } from './gemini.js';
import { createStore } from './store.js';

const store = createStore({ file: config.storeFile });
const ai = createGemini(config.ai);
const app = createApp({ config, store, ai });

const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(`[someone] listening on http://0.0.0.0:${config.port}`);
  console.log(`[someone] ai configured: ${ai.configured ? 'yes' : 'NO (set GEMINI_API_KEY)'}`);
});

/* Proactive companion messages: gated per user by their own settings. */
let proactiveTimer = null;
if (config.proactive.enabled) {
  const services = app.locals.services;
  proactiveTimer = setInterval(() => {
    services.runProactiveSweep().catch((err) => console.error('[proactive] sweep failed:', err.message));
  }, config.proactive.tickMs);
  if (typeof proactiveTimer.unref === 'function') proactiveTimer.unref();
}

function shutdown(signal) {
  console.log(`[someone] ${signal} received, shutting down`);
  if (proactiveTimer) clearInterval(proactiveTimer);
  server.close(() => {
    store.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
