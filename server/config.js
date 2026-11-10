import path from 'node:path';

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

export function loadConfig(env = process.env) {
  const dataDir = env.SOMEONE_DATA_DIR || path.join(process.cwd(), 'data');
  return {
    env: env.NODE_ENV || 'development',
    port: Number(env.PORT || 3000),
    dataDir,
    storeFile: path.join(dataDir, 'someone.json'),
    audioDir: path.join(dataDir, 'audio'),
    sessionTtlMs: 1000 * 60 * 60 * 24 * 30,
    secureCookies: env.NODE_ENV === 'production' || bool(env.SOMEONE_SECURE_COOKIES),
    ai: {
      apiKey: env.GEMINI_API_KEY || '',
      baseUrl: env.GEMINI_API_URL || 'https://generativelanguage.googleapis.com',
      chatModel: env.GEMINI_MODEL || 'gemini-2.5-flash',
      ttsModel: env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts',
      ttsVoice: env.GEMINI_TTS_VOICE || 'Leda',
      enabled: Boolean(env.GEMINI_API_KEY) && !bool(env.SOMEONE_DISABLE_AI),
    },
    proactive: {
      // Scheduler tick. Proactive messages themselves are frequency-gated per user.
      tickMs: Number(env.SOMEONE_PROACTIVE_TICK_MS || 60_000),
      enabled: !bool(env.SOMEONE_DISABLE_PROACTIVE),
    },
  };
}

export const config = loadConfig();
