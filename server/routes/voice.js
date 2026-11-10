import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { cleanText, uid } from '../util.js';

const ALLOWED_AUDIO = new Set([
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/aac',
  'audio/mp4a-latm',
]);

export function registerVoiceRoutes(app, { services, ai, config }) {
  const router = express.Router();

  function findMessageByAudio(userId, audioId) {
    return (
      services.store.find(
        'messages',
        (m) => m.userId === userId && (m.audioId === audioId || m.meta?.replyAudioId === audioId),
      )[0] || null
    );
  }

  /** Upload a recorded voice note. Audio stays on the server, never in the client bundle. */
  router.post('/voice', express.raw({ type: () => true, limit: '8mb' }), async (req, res) => {
    if (!req.user) return res.status(401).json({ error: { code: 'unauthorized', message: 'Please sign in.' } });
    const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (buffer.length < 512) {
      return res.status(400).json({ error: { code: 'empty_audio', message: 'That recording was too short.' } });
    }
    const mimeType = String(req.headers['content-type'] || 'audio/webm').split(';')[0].trim();
    if (!ALLOWED_AUDIO.has(mimeType)) {
      return res.status(415).json({ error: { code: 'unsupported_audio', message: 'That audio format is not supported.' } });
    }
    if (!services.companionFor(req.user.id)) {
      return res.status(409).json({ error: { code: 'no_companion', message: 'Create your companion first.' } });
    }

    const audioId = uid('aud');
    await fs.mkdir(config.audioDir, { recursive: true });
    await fs.writeFile(path.join(config.audioDir, `${audioId}.audio`), buffer);

    const transcript = await services.transcribe(buffer, mimeType);
    const durationMs = Math.max(0, Math.min(300000, Number(req.headers['x-audio-duration']) || 0));

    const message = services.addMessage(req.user.id, {
      role: 'user',
      text: transcript || '[voice note]',
      kind: 'voice',
      audioId,
      meta: { mimeType, durationMs, bytes: buffer.length, transcript },
    });

    res.status(201).json({
      message,
      transcript,
      audioUrl: `/api/voice/${audioId}`,
      canReply: Boolean(transcript) || !ai.configured,
    });
  });

  /** Streams an owned audio file back to the browser. */
  router.get('/voice/:audioId', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: { code: 'unauthorized', message: 'Please sign in.' } });
    const audioId = String(req.params.audioId || '').replace(/[^a-zA-Z0-9_-]/g, '');
    if (!audioId) return res.status(400).json({ error: { code: 'invalid_id', message: 'Bad audio reference.' } });
    const message = findMessageByAudio(req.user.id, audioId);
    if (!message) return res.status(404).json({ error: { code: 'not_found', message: 'Audio not found.' } });
    const mimeType = message.audioId === audioId ? message.meta?.mimeType || 'audio/webm' : 'audio/wav';
    try {
      const file = await fs.readFile(path.join(config.audioDir, `${audioId}.audio`));
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.setHeader('Accept-Ranges', 'none');
      res.send(file);
    } catch {
      res.status(404).json({ error: { code: 'not_found', message: 'Audio file is no longer available.' } });
    }
  });

  /** Spoken companion reply (opt-in). Uses Gemini TTS, wrapped into a playable WAV. */
  router.post('/voice/speak', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: { code: 'unauthorized', message: 'Please sign in.' } });
    const messageId = cleanText(req.body?.messageId, 60);
    const message = services.store.get('messages', messageId);
    if (!message || message.userId !== req.user.id || message.role !== 'assistant') {
      return res.status(404).json({ error: { code: 'not_found', message: 'That message cannot be spoken.' } });
    }
    if (message.meta?.replyAudioId) {
      return res.json({ audioId: message.meta.replyAudioId, audioUrl: `/api/voice/${message.meta.replyAudioId}`, cached: true });
    }
    if (!ai.configured) {
      return res.status(503).json({
        error: { code: 'ai_not_configured', message: 'Spoken replies need the AI connection (GEMINI_API_KEY).' },
      });
    }
    try {
      const { wav } = await ai.speak({ text: message.text.slice(0, 900) });
      const audioId = uid('aud');
      await fs.mkdir(config.audioDir, { recursive: true });
      await fs.writeFile(path.join(config.audioDir, `${audioId}.audio`), wav);
      services.store.update('messages', message.id, {
        meta: { ...(message.meta || {}), replyAudioId: audioId, replyMimeType: 'audio/wav' },
      });
      res.json({ audioId, audioUrl: `/api/voice/${audioId}`, cached: false });
    } catch (err) {
      console.error('[voice] speak failed:', err.code || err.message);
      res.status(502).json({
        error: {
          code: err.code || 'tts_failed',
          message: 'I could not record that reply. You can still read it above.',
        },
      });
    }
  });

  app.use('/api', router);
}
