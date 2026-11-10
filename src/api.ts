import type {
  Companion,
  Gist,
  Me,
  Memory,
  Message,
  Options,
  Settings,
  TrendingResult,
} from './types';

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(message: string, code = 'error', status = 0) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: {
      ...(init.body && typeof init.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
    ...init,
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    throw new ApiError(
      body?.error?.message || 'Something went wrong. Please try again.',
      body?.error?.code || 'http_error',
      res.status,
    );
  }
  return body as T;
}

const json = (value: unknown) => JSON.stringify(value);

export const api = {
  me: () => request<Me>('/api/'),
  options: () => request<Options>('/api/options'),

  signup: (email: string, password: string) =>
    request<{ me: Me }>('/api/auth/signup', { method: 'POST', body: json({ email, password }) }),
  login: (email: string, password: string) =>
    request<{ me: Me }>('/api/auth/login', { method: 'POST', body: json({ email, password }) }),
  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),

  completeOnboarding: (payload: Record<string, unknown>) =>
    request<{ profile: unknown; me: Me }>('/api/onboarding', { method: 'POST', body: json(payload) }),
  updateProfile: (payload: Record<string, unknown>) =>
    request<{ me: Me }>('/api/profile', { method: 'PATCH', body: json(payload) }),

  createCompanion: (name: string, traits: string[]) =>
    request<{ companion: Companion; me: Me }>('/api/companion', {
      method: 'POST',
      body: json({ name, traits }),
    }),
  updateCompanion: (payload: { name?: string; traits?: string[] }) =>
    request<{ companion: Companion; me: Me }>('/api/companion', {
      method: 'PATCH',
      body: json(payload),
    }),

  messages: (limit = 40, before?: number) =>
    request<{ messages: Message[]; hasMore: boolean }>(
      `/api/messages?limit=${limit}${before ? `&before=${before}` : ''}`,
    ),
  updates: (since: number) =>
    request<{ messages: Message[]; serverTime: number }>(`/api/updates?since=${since}`),

  memories: () => request<{ memories: Memory[] }>('/api/memories'),
  addMemory: (content: string, category: string) =>
    request<{ memory: Memory }>('/api/memories', { method: 'POST', body: json({ content, category }) }),
  updateMemory: (id: string, content: string, category: string) =>
    request<{ memory: Memory }>(`/api/memories/${id}`, {
      method: 'PATCH',
      body: json({ content, category }),
    }),
  deleteMemory: (id: string) => request<{ ok: true }>(`/api/memories/${id}`, { method: 'DELETE' }),
  clearMemories: () => request<{ ok: true; removed: number }>('/api/memories', { method: 'DELETE' }),

  updateSettings: (patch: Partial<Settings>) =>
    request<{ settings: Settings; me: Me }>('/api/settings', { method: 'PATCH', body: json(patch) }),
  sendProactiveNow: () =>
    request<{ message: Message }>('/api/proactive/test', { method: 'POST' }),

  trending: (refresh = false) =>
    request<TrendingResult>(`/api/trending${refresh ? '?refresh=1' : ''}`),
  gist: () => request<Gist>('/api/gist', { method: 'POST' }),
  sendGist: () => request<{ message: Message; gist: Gist }>('/api/gist/send', { method: 'POST' }),

  clearHistory: () => request<{ ok: true; removed: number }>('/api/messages', { method: 'DELETE' }),
  deleteAccount: () => request<{ ok: true }>('/api/account', { method: 'DELETE' }),

  speak: (messageId: string) =>
    request<{ audioUrl: string; audioId: string; cached?: boolean }>('/api/voice/speak', {
      method: 'POST',
      body: json({ messageId }),
    }),
};

export interface StreamHandlers {
  onStart?: (payload: { userMessage: Message | null }) => void;
  onDelta: (text: string) => void;
  onDone: (message: Message) => void;
  onError: (error: ApiError) => void;
}

/** Streams the companion's reply over SSE, resolving once the stream closes. */
export async function streamChat(
  body: { text?: string; voiceMessageId?: string },
  handlers: StreamHandlers,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch('/api/chat', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: json(body),
    });
  } catch {
    handlers.onError(new ApiError('You appear to be offline. Check your connection and try again.', 'offline'));
    return;
  }

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    let parsed: any = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    handlers.onError(
      new ApiError(
        parsed?.error?.message || 'The message could not be sent.',
        parsed?.error?.code || 'http_error',
        res.status,
      ),
    );
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const handleBlock = (block: string) => {
    for (const line of block.split('\n')) {
      if (!line.startsWith('data:')) continue;
      const raw = line.slice(5).trim();
      if (!raw) continue;
      let event: any;
      try {
        event = JSON.parse(raw);
      } catch {
        continue;
      }
      if (event.type === 'start') handlers.onStart?.(event);
      else if (event.type === 'delta' && typeof event.text === 'string') handlers.onDelta(event.text);
      else if (event.type === 'done' && event.message) handlers.onDone(event.message);
      else if (event.type === 'error') {
        handlers.onError(new ApiError(event.message || 'The reply failed.', event.code || 'ai_error'));
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let split = buffer.indexOf('\n\n');
    while (split !== -1) {
      handleBlock(buffer.slice(0, split));
      buffer = buffer.slice(split + 2);
      split = buffer.indexOf('\n\n');
    }
  }
  if (buffer.trim()) handleBlock(buffer);
}

/** Uploads a recorded voice note as raw bytes. */
export async function uploadVoice(blob: Blob, durationMs: number) {
  const res = await fetch('/api/voice', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': blob.type || 'audio/webm',
      'X-Audio-Duration': String(Math.round(durationMs)),
    },
    body: blob,
  });
  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  if (!res.ok) {
    throw new ApiError(
      parsed?.error?.message || 'That voice note could not be sent.',
      parsed?.error?.code || 'voice_failed',
      res.status,
    );
  }
  return parsed as { message: Message; transcript: string; audioUrl: string };
}
