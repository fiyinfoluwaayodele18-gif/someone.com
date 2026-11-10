import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, streamChat, uploadVoice } from '../api';
import type { Me, Message, Options, TrendingResult } from '../types';
import Composer from '../components/Composer';
import { ErrorNote, Skeleton } from '../components/ui';
import {
  ArrowDownIcon,
  BrainIcon,
  DiceIcon,
  GlobeIcon,
  HeartIcon,
  PauseIcon,
  PlayIcon,
  RefreshIcon,
  SettingsIcon,
  SpeakerIcon,
  SparkleIcon,
} from '../components/Icons';
import { dayKey, dayLabel, initials, mmss, timeOfDay } from '../lib/format';

/* ------------------------------------------------------------------ */
/* Audio bubbles                                                       */
/* ------------------------------------------------------------------ */

function AudioBubble({ audioId, durationMs }: { audioId: string; durationMs?: number }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pct, setPct] = useState(0);

  useEffect(
    () => () => {
      audioRef.current?.pause();
    },
    [],
  );

  const toggle = async () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
      setPlaying(false);
      return;
    }
    try {
      await el.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  };

  return (
    <div className="voice">
      <button
        type="button"
        className="voice__play"
        onClick={toggle}
        aria-label={playing ? 'Pause voice note' : 'Play voice note'}
      >
        {playing ? <PauseIcon size={13} /> : <PlayIcon size={13} />}
      </button>
      <div className="voice__track" aria-hidden="true">
        <span className="voice__fill" style={{ width: `${pct}%` }} />
        <span className="voice__bars">
          {Array.from({ length: 18 }).map((_, i) => (
            <i key={i} style={{ height: `${5 + ((i * 7) % 12)}px` }} />
          ))}
        </span>
      </div>
      <span className="voice__time">{mmss(durationMs || 0)}</span>
      <audio
        ref={audioRef}
        src={`/api/voice/${audioId}`}
        preload="none"
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          setPct(el.duration ? (el.currentTime / el.duration) * 100 : 0);
        }}
        onEnded={() => {
          setPlaying(false);
          setPct(0);
        }}
      />
    </div>
  );
}

function ListenButton({ messageId, onError }: { messageId: string; onError: (msg: string) => void }) {
  const [state, setState] = useState<'idle' | 'loading' | 'playing'>('idle');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(
    () => () => {
      audioRef.current?.pause();
      audioRef.current = null;
    },
    [],
  );

  const onClick = async () => {
    if (state === 'playing') {
      audioRef.current?.pause();
      setState('idle');
      return;
    }
    if (audioRef.current) {
      try {
        await audioRef.current.play();
        setState('playing');
      } catch {
        setState('idle');
      }
      return;
    }
    setState('loading');
    try {
      const { audioUrl } = await api.speak(messageId);
      const audio = new Audio(audioUrl);
      audio.onended = () => setState('idle');
      audio.onerror = () => {
        setState('idle');
        onError('That spoken reply could not be played.');
      };
      audioRef.current = audio;
      await audio.play();
      setState('playing');
    } catch (err) {
      setState('idle');
      onError(err instanceof ApiError ? err.message : 'Spoken replies are unavailable right now.');
    }
  };

  return (
    <button
      type="button"
      className="msg__speak"
      onClick={onClick}
      aria-label="Play this reply out loud"
      title="Play out loud"
      data-state={state}
    >
      {state === 'loading' ? <span className="msg__speak-dot" /> : <SpeakerIcon size={13} />}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Message bubble                                                      */
/* ------------------------------------------------------------------ */

function Bubble({
  message,
  companionName,
  onError,
}: {
  message: Message;
  companionName: string;
  onError: (msg: string) => void;
}) {
  const mine = message.role === 'user';
  return (
    <div className={`msg ${mine ? 'msg--me' : 'msg--them'}`}>
      {!mine && <div className="msg__avatar">{initials(companionName)}</div>}
      <div className="msg__col">
        <div className={`bubble ${mine ? 'bubble--me' : 'bubble--them'} ${message.failed ? 'bubble--failed' : ''}`}>
          {message.kind === 'voice' && message.audioId ? (
            <AudioBubble audioId={message.audioId} durationMs={message.meta?.durationMs} />
          ) : (
            <span className="bubble__text">{message.text}</span>
          )}
        </div>
        <div className="msg__meta">
          <span>{timeOfDay(message.createdAt)}</span>
          {message.pending && <span>· sending…</span>}
          {message.failed && <span className="msg__failed">· not sent</span>}
          {message.proactive && <span className="msg__tag">they started this</span>}
          {!mine && message.kind !== 'voice' && !message.pending && (
            <ListenButton messageId={message.id} onError={onError} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Chat screen                                                         */
/* ------------------------------------------------------------------ */

export default function Chat({
  me,
  options,
  onOpenSettings,
}: {
  me: Me;
  options: Options;
  onOpenSettings: () => void;
}) {
  const companion = me.companion!;
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [gistBusy, setGistBusy] = useState(false);
  const [atBottom, setAtBottom] = useState(true);

  const [trendingOpen, setTrendingOpen] = useState(false);
  const [trending, setTrending] = useState<TrendingResult | null>(null);
  const [trendingLoading, setTrendingLoading] = useState(false);
  const [trendingError, setTrendingError] = useState<string | null>(null);

  const seqRef = useRef(0);
  const sendingRef = useRef(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const merge = useCallback((incoming: Message[]) => {
    if (!incoming.length) return;
    setMessages((prev) => {
      const map = new Map(prev.map((m) => [m.id, m]));
      for (const m of incoming) {
        map.set(m.id, { ...(map.get(m.id) || {}), ...m });
        seqRef.current = Math.max(seqRef.current, m.seq || 0);
      }
      return [...map.values()].sort((a, b) => a.seq - b.seq || a.createdAt - b.createdAt);
    });
  }, []);

  /* initial history */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api.messages(60);
        if (!alive) return;
        seqRef.current = res.messages.reduce((max, m) => Math.max(max, m.seq), 0);
        setMessages(res.messages);
      } catch (err) {
        if (alive) {
          setLoadError(err instanceof ApiError ? err.message : 'Could not load your conversation.');
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  /* proactive / cross-tab delivery */
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (document.hidden || cancelled) return;
      try {
        const res = await api.updates(seqRef.current);
        if (!cancelled && res.messages.length) merge(res.messages);
      } catch {
        /* offline — the next tick retries */
      }
    };
    const timer = window.setInterval(tick, 20_000);
    const onVisible = () => {
      if (!document.hidden) void tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [merge]);

  const scrollToBottom = useCallback((smooth = false) => {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'end' });
  }, []);

  useEffect(() => {
    if (atBottom) scrollToBottom();
  }, [messages, streamText, atBottom, scrollToBottom]);

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 90);
  };

  /* text handed back to the composer when a send never reached the server */
  const [restore, setRestore] = useState<{ text: string; token: number } | null>(null);

  /* send text */
  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setError(null);
    setAtBottom(true);

    const tempId = `tmp_${Date.now()}`;
    const optimistic: Message = {
      id: tempId,
      seq: seqRef.current + 0.5,
      role: 'user',
      text,
      kind: 'text',
      createdAt: Date.now(),
      pending: true,
    };
    setMessages((prev) => [...prev, optimistic]);

    let acc = '';
    let settled = false;
    let acknowledged = false;
    try {
      await streamChat(
        { text },
        {
          onStart: ({ userMessage }) => {
            if (!userMessage) return;
            acknowledged = true;
            seqRef.current = Math.max(seqRef.current, userMessage.seq);
            setMessages((prev) => prev.map((m) => (m.id === tempId ? userMessage : m)));
          },
          onDelta: (chunk) => {
            acc += chunk;
            setStreamText(acc);
          },
          onDone: (message) => {
            settled = true;
            seqRef.current = Math.max(seqRef.current, message.seq);
            setMessages((prev) => [...prev.filter((m) => m.id !== tempId), message]);
            setStreamText('');
          },
          onError: (err) => {
            settled = true;
            setStreamText('');
            if (acknowledged) {
              /* the message is stored; only the reply failed — never call that "not sent" */
              setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, pending: false } : m)));
              setError(`${err.message} Your message is saved — you don't need to retype it.`);
            } else {
              setError(err.message);
              /* never reached the server — give the words back rather than swallow them */
              setMessages((prev) => prev.filter((m) => m.id !== tempId));
              setRestore({ text, token: Date.now() });
            }
          },
        },
      );
    } finally {
      if (!settled) {
        if (acknowledged) {
          setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, pending: false } : m)));
          setError('The reply didn’t come through, but your message is saved — you don’t need to retype it.');
        } else {
          setMessages((prev) => prev.filter((m) => m.id !== tempId));
          setRestore({ text, token: Date.now() });
        }
        setStreamText('');
      }
      sendingRef.current = false;
      setSending(false);
    }
  };

  /* send voice note, then let them reply to it */
  const sendVoice = async (blob: Blob, durationMs: number) => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setError(null);
    setAtBottom(true);
    try {
      const { message } = await uploadVoice(blob, durationMs);
      seqRef.current = Math.max(seqRef.current, message.seq);
      setMessages((prev) => [...prev, message]);

      let acc = '';
      await streamChat(
        { voiceMessageId: message.id },
        {
          onDelta: (chunk) => {
            acc += chunk;
            setStreamText(acc);
          },
          onDone: (reply) => {
            seqRef.current = Math.max(seqRef.current, reply.seq);
            setMessages((prev) => [...prev, reply]);
            setStreamText('');
          },
          onError: (err) => {
            setError(err.message);
            setStreamText('');
          },
        },
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That voice note could not be sent.');
    } finally {
      sendingRef.current = false;
      setSending(false);
      setStreamText('');
    }
  };

  /* random gist — they start the conversation */
  const sendGist = async () => {
    if (gistBusy || sendingRef.current) return;
    setGistBusy(true);
    setError(null);
    setAtBottom(true);
    try {
      const { message } = await api.sendGist();
      merge([message]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'They could not start a conversation just now.');
    } finally {
      setGistBusy(false);
    }
  };

  const loadTrending = async (refresh = false) => {
    setTrendingLoading(true);
    setTrendingError(null);
    try {
      setTrending(await api.trending(refresh));
    } catch (err) {
      setTrendingError(err instanceof ApiError ? err.message : 'Live topics are unavailable right now.');
    } finally {
      setTrendingLoading(false);
    }
  };

  useEffect(() => {
    if (trendingOpen && !trending) void loadTrending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trendingOpen]);

  const grouped: [string, Message[]][] = [];
  for (const m of messages) {
    const key = dayKey(m.createdAt);
    const last = grouped[grouped.length - 1];
    if (last && last[0] === key) last[1].push(m);
    else grouped.push([key, [m]]);
  }

  const showEmpty = !loading && !loadError && messages.length === 0 && !streamText;

  return (
    <div className="shell shell--app">
      <div className="chat">
        <header className="chat__head">
          <div className="avatar avatar--sm">{initials(companion.name)}</div>
          <div className="chat__who">
            <div className="chat__name">{companion.name}</div>
            <div className="chat__status">
              <span className={`dot ${sending ? 'dot--busy' : me.ai.configured ? 'dot--live' : 'dot--off'}`} />
              {sending
                ? 'typing…'
                : me.ai.configured
                  ? me.settings?.notificationsEnabled
                    ? 'here with you · may message first'
                    : 'here with you'
                  : 'offline right now'}
            </div>
          </div>
          <div className="chat__actions">
            <button
              type="button"
              className="icon-btn"
              onClick={sendGist}
              disabled={gistBusy || sending}
              aria-label="Ask them to start a conversation"
              title="They start a conversation"
            >
              {gistBusy ? <RefreshIcon size={18} className="spin" /> : <DiceIcon size={19} />}
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setTrendingOpen(true)}
              aria-label="What's trending right now"
              title="What's trending"
            >
              <GlobeIcon size={19} />
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={onOpenSettings}
              aria-label="Settings"
              title="Settings"
            >
              <SettingsIcon size={19} />
            </button>
          </div>
        </header>

        {!me.ai.configured && (
          <div className="banner banner--warn">
            Live AI replies are not configured on this server yet. Add a <code>GEMINI_API_KEY</code> in
            Settings → Environment to switch them on — everything else already works.
          </div>
        )}

        {error && (
          <div className="banner banner--error">
            <span>{error}</span>
            <button type="button" className="banner__x" onClick={() => setError(null)} aria-label="Dismiss">
              ×
            </button>
          </div>
        )}

        <div className="thread" ref={scrollerRef} onScroll={onScroll}>
          {loading && (
            <div className="thread__loading">
              <Skeleton height={46} width="62%" />
              <Skeleton height={34} width="44%" />
              <Skeleton height={58} width="70%" />
            </div>
          )}

          {loadError && (
            <div className="thread__error">
              <ErrorNote>{loadError}</ErrorNote>
              <button type="button" className="btn btn--ghost" onClick={() => window.location.reload()}>
                Reload
              </button>
            </div>
          )}

          {showEmpty && (
            <div className="empty">
              <div className="empty__mark">
                <HeartIcon size={26} />
              </div>
              <h2 className="empty__title">
                This is the start of you and {companion.name}.
              </h2>
              <p className="empty__body">
                Say anything — a thought, a complaint, something that made you laugh. {companion.name} has their
                own day going on too, and they will bring it up without being asked.
              </p>
              <div className="empty__actions">
                <button type="button" className="btn btn--primary" onClick={sendGist} disabled={gistBusy}>
                  {gistBusy ? <RefreshIcon size={16} className="spin" /> : <DiceIcon size={16} />}
                  Let {companion.name} start
                </button>
                <button type="button" className="btn btn--ghost" onClick={() => setTrendingOpen(true)}>
                  <GlobeIcon size={16} /> What's trending
                </button>
              </div>
            </div>
          )}

          {grouped.map(([key, dayMessages]) => (
            <Fragment key={key}>
              <div className="daydiv">
                <span>{dayLabel(dayMessages[0].createdAt)}</span>
              </div>
              {dayMessages.map((m) => (
                <Bubble
                  key={m.id}
                  message={m}
                  companionName={companion.name}
                  onError={setError}
                />
              ))}
            </Fragment>
          ))}

          {streamText && (
            <div className="msg msg--them">
              <div className="msg__avatar">{initials(companion.name)}</div>
              <div className="msg__col">
                <div className="bubble bubble--them">
                  <span className="bubble__text">{streamText}</span>
                  <span className="caret" aria-hidden="true" />
                </div>
              </div>
            </div>
          )}

          {sending && !streamText && (
            <div className="msg msg--them">
              <div className="msg__avatar">{initials(companion.name)}</div>
              <div className="msg__col">
                <div className="bubble bubble--them typing" aria-label={`${companion.name} is typing`}>
                  <i />
                  <i />
                  <i />
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} className="thread__end" />
        </div>

        {!atBottom && (
          <button
            type="button"
            className="jump"
            onClick={() => {
              setAtBottom(true);
              scrollToBottom(true);
            }}
            aria-label="Jump to the latest message"
          >
            <ArrowDownIcon size={16} />
          </button>
        )}

        <Composer
          onSend={send}
          onVoice={sendVoice}
          busy={sending}
          restore={restore}
          placeholder={`Message ${companion.name}…`}
        />
      </div>

      <aside className="rail">
        <div className="rail__card">
          <div className="rail__head">
            <div className="avatar">{initials(companion.name)}</div>
            <div style={{ minWidth: 0 }}>
              <div className="rail__name">{companion.name}</div>
              <div className="tiny muted">
                {companion.traits.length ? `${companion.traits.length} traits · ` : ''}
                {companion.sheet?.hometown || 'somewhere warm'}
              </div>
            </div>
          </div>
          <div className="rail__meta">
            <div>
              <span className="rail__label">Work</span>
              <span className="rail__value">{companion.sheet?.workOrStudy || 'figuring things out'}</span>
            </div>
            <div>
              <span className="rail__label">Family</span>
              <span className="rail__value">
                {companion.sheet?.family?.length
                  ? companion.sheet.family.map((f) => f.name).slice(0, 3).join(', ')
                  : 'keeps them close'}
              </span>
            </div>
            <div>
              <span className="rail__label">Currently</span>
              <span className="rail__value">
                {companion.sheet?.ongoingEvents?.[0]?.summary || 'nothing dramatic… yet'}
              </span>
            </div>
          </div>
          <div className="rail__traits">
            {companion.traits.map((t) => (
              <span className="pill" key={t}>
                {options.traits.find((x) => x.id === t)?.label || t}
              </span>
            ))}
          </div>
        </div>

        <div className="rail__card rail__card--quiet">
          <div className="rail__label">Memory</div>
          <div className="rail__big">{me.stats?.memories ?? 0}</div>
          <p className="tiny muted" style={{ margin: '4px 0 10px' }}>
            things {companion.name} is holding onto about you. You can read, correct or delete every one.
          </p>
          <button type="button" className="btn btn--ghost btn--block" onClick={onOpenSettings}>
            <BrainIcon size={16} /> Open memory & settings
          </button>
        </div>

        <div className="rail__card rail__card--quiet">
          <div className="rail__label">Start something</div>
          <div className="stack" style={{ marginTop: 10 }}>
            <button type="button" className="btn btn--ghost btn--block" onClick={sendGist} disabled={gistBusy}>
              <SparkleIcon size={16} /> Random gist
            </button>
            <button type="button" className="btn btn--ghost btn--block" onClick={() => setTrendingOpen(true)}>
              <GlobeIcon size={16} /> Trending now
            </button>
          </div>
        </div>

        <p className="tiny muted rail__note">
          {companion.name} is an AI character with a fictional life. Not a human, not a therapist, and never a
          replacement for the people around you.
        </p>
      </aside>

      {trendingOpen && (
        <div
          className="sheet-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setTrendingOpen(false);
          }}
        >
          <div className="sheet" role="dialog" aria-modal="true" aria-label="What's trending">
            <div className="sheet__handle" />
            <div className="sheet__head">
              <h2 className="sheet__title">What's happening</h2>
              <button
                className="icon-btn"
                style={{ marginLeft: 'auto' }}
                onClick={() => setTrendingOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="sheet__body">
              <p className="tiny muted" style={{ marginTop: 0 }}>
                Live results with sources. Tap one to talk it through with {companion.name} — nothing here is
                invented, and anything unconfirmed is labelled.
              </p>

              {trendingLoading && (
                <div className="stack">
                  <Skeleton height={54} />
                  <Skeleton height={54} />
                  <Skeleton height={54} />
                </div>
              )}

              {trendingError && <ErrorNote>{trendingError}</ErrorNote>}

              {trending && !trending.available && (
                <div className="notice">
                  <GlobeIcon size={18} />
                  <div>
                    <strong>Live topics aren't available right now.</strong>
                    <p className="tiny muted" style={{ margin: '4px 0 0' }}>
                      {trending.message || trending.reason || 'Search grounding did not return results.'}{' '}
                      {companion.name} won't pretend to know what's trending — they'll say so instead.
                    </p>
                  </div>
                </div>
              )}

              {trending?.available && (
                <>
                  <ul className="trend-list">
                    {trending.items.map((item, i) => (
                      <li key={`${item.title}-${i}`}>
                        <button
                          type="button"
                          className="trend"
                          onClick={() => {
                            setTrendingOpen(false);
                            void send(
                              `I saw something about ${item.title}. ${item.detail} What do you think about it?`,
                            );
                          }}
                        >
                          <span className="trend__num">{i + 1}</span>
                          <span className="trend__body">
                            <span className="trend__title">{item.title}</span>
                            <span className="trend__detail">{item.detail}</span>
                          </span>
                          <span className={`tag tag--${item.status}`}>
                            {item.status === 'confirmed'
                              ? 'confirmed'
                              : item.status === 'rumour'
                                ? 'rumour'
                                : 'reported'}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>

                  {trending.sources.length > 0 && (
                    <div className="sources">
                      <span className="rail__label">Sources</span>
                      <ul>
                        {trending.sources.slice(0, 6).map((s, i) => (
                          <li key={`${s.uri || s.title}-${i}`}>
                            {s.uri ? (
                              <a href={s.uri} target="_blank" rel="noreferrer noopener">
                                {s.title || s.uri}
                              </a>
                            ) : (
                              <span>{s.title}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}

              <div className="row-inline" style={{ marginTop: 14 }}>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => loadTrending(true)}
                  disabled={trendingLoading}
                >
                  <RefreshIcon size={15} /> Refresh
                </button>
                {trending?.stale && <span className="tiny muted">Showing slightly older results.</span>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
