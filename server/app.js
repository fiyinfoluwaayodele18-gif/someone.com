import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { attachUser, requireAuth, sameOriginGuard } from './auth.js';
import { createGemini } from './gemini.js';
import { createServices } from './services.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerProfileRoutes } from './routes/profile.js';
import { registerCompanionRoutes } from './routes/companion.js';
import { registerChatRoutes } from './routes/chat.js';
import { registerMemoryRoutes } from './routes/memory.js';
import { registerLiveRoutes } from './routes/live.js';
import { registerSettingsRoutes } from './routes/settings.js';
import { registerVoiceRoutes } from './routes/voice.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = path.resolve(__dirname, '..', 'dist');

export function createApp({ config, store, ai = null }) {
  const app = express();
  const gemini = ai || createGemini(config.ai);
  const services = createServices({ store, ai: gemini });
  services.store = store;

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'microphone=(self), camera=(), geolocation=()');
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com data:",
        "img-src 'self' data: blob:",
        "media-src 'self' blob:",
        "connect-src 'self'",
        "base-uri 'none'",
        "form-action 'self'",
        "frame-ancestors 'none'",
      ].join('; '),
    );
    next();
  });

  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  app.use(express.json({ limit: '1mb' }));
  app.use(sameOriginGuard);
  app.use(attachUser(store));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      aiConfigured: gemini.configured,
      uptimeSeconds: Math.round(process.uptime()),
      version: 1,
    });
  });

  const ctx = { store, ai: gemini, config, services };
  registerAuthRoutes(app, ctx);
  registerProfileRoutes(app, ctx);
  registerCompanionRoutes(app, ctx);
  registerChatRoutes(app, ctx);
  registerMemoryRoutes(app, ctx);
  registerLiveRoutes(app, ctx);
  registerSettingsRoutes(app, ctx);
  registerVoiceRoutes(app, ctx);

  app.use('/api', (req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: `No API route for ${req.method} ${req.originalUrl}` } });
  });

  if (fs.existsSync(CLIENT_DIR)) {
    app.use(
      express.static(CLIENT_DIR, {
        index: false,
        maxAge: '1h',
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
        },
      }),
    );
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(CLIENT_DIR, 'index.html'));
    });
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    console.error('[server] unhandled error:', err.message);
    if (res.headersSent) return;
    res.status(err.status || 500).json({
      error: { code: 'server_error', message: 'Something went wrong on our side. Please try again.' },
    });
  });

  app.locals.services = services;
  app.locals.gemini = gemini;
  app.locals.store = store;
  return app;
}

export { requireAuth };
