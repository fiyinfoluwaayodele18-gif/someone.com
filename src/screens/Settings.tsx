import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import type { Me, Memory, Options, Settings as SettingsType } from '../types';
import { Sheet, Toggle, Segmented, Chip, ErrorNote, Skeleton, ConfirmRow } from '../components/ui';
import { CheckIcon, PencilIcon, RefreshIcon, Spinner, TrashIcon } from '../components/Icons';
import { relative } from '../lib/format';

type Tab = 'companion' | 'memory' | 'life' | 'alerts' | 'privacy' | 'help';

const TABS: { id: Tab; label: string }[] = [
  { id: 'companion', label: 'Companion' },
  { id: 'memory', label: 'Memory' },
  { id: 'life', label: 'Their life' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'help', label: 'Help' },
];

const CATEGORIES: { id: Memory['category']; label: string }[] = [
  { id: 'preference', label: 'Preference' },
  { id: 'person', label: 'Person' },
  { id: 'event', label: 'Event' },
  { id: 'plan', label: 'Plan' },
  { id: 'feeling', label: 'Feeling' },
  { id: 'fact', label: 'Fact' },
];

export default function Settings({
  me,
  options,
  onMe,
  onClose,
  onSignedOut,
}: {
  me: Me;
  options: Options;
  onMe: (me: Me) => void;
  onClose: () => void;
  onSignedOut: (me: Me) => void;
}) {
  const [tab, setTab] = useState<Tab>('companion');
  const companion = me.companion;
  const settings = me.settings;

  return (
    <Sheet
      title="Settings"
      onClose={onClose}
      tabs={
        <div className="tabs" role="tablist" aria-label="Settings sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={tab === t.id}
              className="tabs__btn"
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      }
    >
      {tab === 'companion' && companion && (
        <CompanionTab me={me} options={options} onMe={onMe} />
      )}
      {tab === 'memory' && <MemoryTab onMe={onMe} />}
      {tab === 'life' && companion && <LifeTab me={me} />}
      {tab === 'alerts' && settings && <AlertsTab me={me} settings={settings} onMe={onMe} />}
      {tab === 'privacy' && <PrivacyTab me={me} onSignedOut={onSignedOut} />}
      {tab === 'help' && <HelpTab me={me} />}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */

function CompanionTab({ me, options, onMe }: { me: Me; options: Options; onMe: (m: Me) => void }) {
  const companion = me.companion!;
  const [name, setName] = useState(companion.name);
  const [traits, setTraits] = useState<string[]>(companion.traits);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const toggle = (id: string) => {
    setSaved(false);
    if (traits.includes(id)) setTraits(traits.filter((t) => t !== id));
    else if (traits.length < 4) setTraits([...traits, id]);
  };

  const save = async () => {
    if (name.trim().length < 2) {
      setError('Their name needs at least 2 characters.');
      return;
    }
    if (!traits.length) {
      setError('Keep at least one personality trait.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await api.updateCompanion({ name: name.trim(), traits });
      onMe(res.me);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2400);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save those changes.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack stack--lg">
      <div className="field">
        <label className="field__label" htmlFor="s-name">
          Their name
        </label>
        <input
          id="s-name"
          className="input"
          value={name}
          maxLength={24}
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
          }}
        />
        <span className="hint">Renaming keeps every memory and conversation intact.</span>
      </div>

      <div className="field">
        <span className="field__label">Personality — up to 4 traits</span>
        <div className="option-grid option-grid--two">
          {options.traits.map((t) => (
            <button
              key={t.id}
              type="button"
              className="option"
              aria-pressed={traits.includes(t.id)}
              onClick={() => toggle(t.id)}
            >
              <span className="option__emoji">{t.emoji}</span>
              <span>
                <span className="option__label">{t.label}</span>
                {t.blurb && <span className="option__blurb">{t.blurb}</span>}
              </span>
              <span className="option__check">
                <CheckIcon size={15} />
              </span>
            </button>
          ))}
        </div>
        <span className="hint">{traits.length}/4 selected. Changes apply to the next reply.</span>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="row-inline">
        <button type="button" className="btn btn--primary" onClick={save} disabled={busy}>
          {busy ? <Spinner size={16} /> : saved ? <CheckIcon size={16} /> : null}
          {saved ? 'Saved' : 'Save changes'}
        </button>
        <span className="tiny muted">Created {relative(companion.createdAt)}</span>
      </div>

      <div className="card card--flat">
        <div className="rail__label">What they're like</div>
        <p className="small" style={{ margin: '6px 0 0' }}>
          {companion.sheet?.personalitySummary || 'Their personality is still settling in.'}
        </p>
        <div className="rail__traits" style={{ marginTop: 10 }}>
          {companion.sheet?.quirks?.slice(0, 5).map((q) => (
            <span className="pill" key={q}>
              {q}
            </span>
          ))}
        </div>
      </div>

      <p className="disclosure">
        {companion.name} is an AI character. Their family, friends and stories are fiction written for the
        experience — not real people or events.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function MemoryTab({ onMe }: { onMe: (m: Me) => void }) {
  const [memories, setMemories] = useState<Memory[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [draftCategory, setDraftCategory] = useState<Memory['category']>('fact');
  const [newContent, setNewContent] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.memories();
      setMemories(res.memories);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load memories.');
      setMemories([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshMe = async () => {
    try {
      onMe(await api.me());
    } catch {
      /* non-fatal */
    }
  };

  const add = async () => {
    const content = newContent.trim();
    if (!content) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.addMemory(content, draftCategory);
      setMemories((prev) => [res.memory, ...(prev || [])]);
      setNewContent('');
      void refreshMe();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That memory could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async (id: string) => {
    const content = draft.trim();
    if (!content) return;
    setBusy(true);
    try {
      const res = await api.updateMemory(id, content, draftCategory);
      setMemories((prev) => (prev || []).map((m) => (m.id === id ? res.memory : m)));
      setEditing(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That memory could not be updated.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setError(null);
    try {
      await api.deleteMemory(id);
      setMemories((prev) => (prev || []).filter((m) => m.id !== id));
      void refreshMe();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That memory could not be deleted.');
    }
  };

  const clearAll = async () => {
    try {
      await api.clearMemories();
      setMemories([]);
      void refreshMe();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Memories could not be cleared.');
    }
  };

  return (
    <div className="stack stack--lg">
      <p className="small muted" style={{ margin: 0 }}>
        Only what your companion genuinely learned from your conversations appears here — nothing invented. Edit
        anything that is wrong, or delete it for good.
      </p>

      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="card card--flat">
        <div className="rail__label">Add something they should know</div>
        <textarea
          className="textarea"
          value={newContent}
          maxLength={240}
          placeholder="e.g. My final exam is on 3 December."
          onChange={(e) => setNewContent(e.target.value)}
        />
        <div className="chips" style={{ marginTop: 8 }}>
          {CATEGORIES.map((c) => (
            <Chip
              key={c.id}
              active={draftCategory === c.id}
              onClick={() => setDraftCategory(c.id)}
            >
              {c.label}
            </Chip>
          ))}
        </div>
        <button
          type="button"
          className="btn btn--primary"
          style={{ marginTop: 10 }}
          onClick={add}
          disabled={busy || !newContent.trim()}
        >
          Remember this
        </button>
      </div>

      {memories === null && (
        <div className="stack">
          <Skeleton height={52} />
          <Skeleton height={52} />
          <Skeleton height={52} />
        </div>
      )}

      {memories && memories.length === 0 && (
        <div className="notice">
          <div>
            <strong>Nothing remembered yet.</strong>
            <p className="tiny muted" style={{ margin: '4px 0 0' }}>
              As you talk, things like your music, plans and how your week is going get saved here.
            </p>
          </div>
        </div>
      )}

      {memories && memories.length > 0 && (
        <>
          <ul className="mem-list">
            {memories.map((m) => (
              <li key={m.id} className="mem">
                {editing === m.id ? (
                  <div className="stack">
                    <textarea
                      className="textarea"
                      value={draft}
                      maxLength={240}
                      onChange={(e) => setDraft(e.target.value)}
                    />
                    <div className="chips">
                      {CATEGORIES.map((c) => (
                        <Chip key={c.id} active={draftCategory === c.id} onClick={() => setDraftCategory(c.id)}>
                          {c.label}
                        </Chip>
                      ))}
                    </div>
                    <div className="row-inline">
                      <button
                        type="button"
                        className="btn btn--primary"
                        onClick={() => saveEdit(m.id)}
                        disabled={busy}
                      >
                        Save
                      </button>
                      <button type="button" className="btn btn--ghost" onClick={() => setEditing(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="mem__top">
                      <span className="tag tag--soft">{m.category}</span>
                      <span className="tiny muted">
                        {m.origin === 'manual' ? 'you added this' : 'learned'} · {relative(m.updatedAt)}
                      </span>
                    </div>
                    <p className="mem__text">{m.content}</p>
                    <div className="mem__actions">
                      <button
                        type="button"
                        className="icon-btn icon-btn--sm"
                        aria-label="Edit memory"
                        onClick={() => {
                          setEditing(m.id);
                          setDraft(m.content);
                          setDraftCategory(m.category);
                        }}
                      >
                        <PencilIcon size={15} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn icon-btn--sm"
                        aria-label="Delete memory"
                        onClick={() => remove(m.id)}
                      >
                        <TrashIcon size={15} />
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
          <ConfirmRow
            title="Forget everything"
            description="Deletes every remembered detail. Your conversation history stays."
            actionLabel="Clear all"
            onConfirm={clearAll}
            danger
          />
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function LifeTab({ me }: { me: Me }) {
  const sheet = me.companion!.sheet;
  if (!sheet) return <ErrorNote>Their profile is still being written.</ErrorNote>;

  return (
    <div className="stack stack--lg">
      <p className="small muted" style={{ margin: 0 }}>
        This is {sheet.selfName}'s fictional world — it stays consistent between conversations, and it keeps
        moving as their week goes on.
      </p>

      <div className="card card--flat">
        <div className="rail__label">Basics</div>
        <ul className="facts">
          <li>
            <span>Hometown</span>
            <strong>{sheet.hometown}</strong>
          </li>
          {sheet.currentCity && (
            <li>
              <span>Lives in</span>
              <strong>{sheet.currentCity}</strong>
            </li>
          )}
          {sheet.workOrStudy && (
            <li>
              <span>Work / study</span>
              <strong>{sheet.workOrStudy}</strong>
            </li>
          )}
          {sheet.age && (
            <li>
              <span>Age</span>
              <strong>{sheet.age}</strong>
            </li>
          )}
          {sheet.voiceStyle && (
            <li>
              <span>Speaks like</span>
              <strong>{sheet.voiceStyle}</strong>
            </li>
          )}
        </ul>
      </div>

      <div className="card card--flat">
        <div className="rail__label">Family</div>
        <ul className="people">
          {sheet.family.map((f) => (
            <li key={`${f.name}-${f.relation}`}>
              <strong>
                {f.name} <span className="muted">· {f.relation}</span>
              </strong>
              <span className="tiny muted">{f.personality}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="card card--flat">
        <div className="rail__label">Friends</div>
        <ul className="people">
          {sheet.friends.map((f) => (
            <li key={f.name}>
              <strong>{f.name}</strong>
              <span className="tiny muted">{f.personality}</span>
              {f.howTheyMet && <span className="tiny muted">Met: {f.howTheyMet}</span>}
            </li>
          ))}
        </ul>
      </div>

      <div className="card card--flat">
        <div className="rail__label">Ongoing right now</div>
        <ul className="bullets">
          {sheet.ongoingEvents.map((e) => (
            <li key={e.summary}>{e.summary}</li>
          ))}
        </ul>
      </div>

      <div className="grid-2">
        <div className="card card--flat">
          <div className="rail__label">Loves watching</div>
          <div className="chips" style={{ marginTop: 8 }}>
            {sheet.favouriteMovies.map((m) => (
              <span className="pill" key={m}>
                {m}
              </span>
            ))}
          </div>
        </div>
        <div className="card card--flat">
          <div className="rail__label">On repeat</div>
          <div className="chips" style={{ marginTop: 8 }}>
            {sheet.favouriteMusic.map((m) => (
              <span className="pill" key={m}>
                {m}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="card card--flat">
        <div className="rail__label">Hobbies & interests</div>
        <div className="chips" style={{ marginTop: 8 }}>
          {[...sheet.hobbies, ...sheet.interests].map((h) => (
            <span className="pill" key={h}>
              {h}
            </span>
          ))}
        </div>
      </div>

      {sheet.pastExperiences.length > 0 && (
        <div className="card card--flat">
          <div className="rail__label">Stories they've told</div>
          <ul className="bullets">
            {sheet.pastExperiences.slice(-6).map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="disclosure">All of the above is fiction created for this experience.</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function AlertsTab({
  me,
  settings,
  onMe,
}: {
  me: Me;
  settings: SettingsType;
  onMe: (m: Me) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const save = async (patch: Partial<SettingsType>) => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await api.updateSettings({ ...patch, timezoneOffsetMinutes: new Date().getTimezoneOffset() });
      onMe(res.me);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Those settings could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const sendNow = async () => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await api.sendProactiveNow();
      setNote(`${me.companion?.name || 'They'} just sent you something — check the chat.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That could not be sent right now.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack stack--lg">
      <div className="row">
        <div>
          <div className="row__label">Let them message first</div>
          <div className="row__sub">
            Occasional check-ins and stories when you've been quiet — never more than your chosen frequency, and
            never guilt-tripping.
          </div>
        </div>
        <Toggle
          label="Proactive messages"
          checked={settings.notificationsEnabled}
          onChange={(v) => save({ notificationsEnabled: v })}
        />
      </div>

      <div className="field">
        <span className="field__label">How often</span>
        <Segmented
          label="Notification frequency"
          value={settings.frequency}
          options={options_frequencies.map((f) => ({ id: f.id as SettingsType['frequency'], label: f.label }))}
          onChange={(v) => save({ frequency: v })}
        />
        <span className="hint">High is still gentle — a few times a week at most.</span>
      </div>

      <div className="grid-2">
        <div className="field">
          <label className="field__label" htmlFor="quietStart">
            Quiet hours start
          </label>
          <input
            id="quietStart"
            type="time"
            className="input"
            value={settings.quietStart}
            onChange={(e) => save({ quietStart: e.target.value })}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="quietEnd">
            Quiet hours end
          </label>
          <input
            id="quietEnd"
            type="time"
            className="input"
            value={settings.quietEnd}
            onChange={(e) => save({ quietEnd: e.target.value })}
          />
        </div>
      </div>

      <p className="hint" style={{ marginTop: -4 }}>
        Times use your device clock (UTC{new Date().getTimezoneOffset() <= 0 ? '+' : '−'}
        {Math.abs(new Date().getTimezoneOffset() / 60)}).
      </p>

      {error && <ErrorNote>{error}</ErrorNote>}
      {note && <div className="notice notice--ok">{note}</div>}

      <div className="row">
        <div>
          <div className="row__label">Try one now</div>
          <div className="row__sub">Sends a single proactive message immediately, ignoring quiet hours.</div>
        </div>
        <button type="button" className="btn btn--ghost" onClick={sendNow} disabled={busy}>
          {busy ? <Spinner size={15} /> : <RefreshIcon size={15} />} Send
        </button>
      </div>

      <p className="disclosure">
        Notifications are delivered in-app: open SOMEONE and their message is waiting, with an unread badge. No
        push service or browser permission is required.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function PrivacyTab({ me, onSignedOut }: { me: Me; onSignedOut: (m: Me) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    setBusy(true);
    try {
      await api.logout();
      onSignedOut(await api.me());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign out.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack stack--lg">
      <div className="card card--flat">
        <div className="rail__label">Your account</div>
        <ul className="facts">
          <li>
            <span>Email</span>
            <strong>{me.user?.email}</strong>
          </li>
          <li>
            <span>With you since</span>
            <strong>{me.stats ? relative(me.stats.since) : '—'}</strong>
          </li>
          <li>
            <span>Messages</span>
            <strong>{me.stats?.messages ?? 0}</strong>
          </li>
          <li>
            <span>Memories</span>
            <strong>{me.stats?.memories ?? 0}</strong>
          </li>
        </ul>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      <ConfirmRow
        title="Delete conversation history"
        description="Removes every message. Your companion and their memories stay."
        actionLabel="Delete history"
        danger
        onConfirm={async () => {
          try {
            await api.clearHistory();
          } catch (err) {
            setError(err instanceof ApiError ? err.message : 'History could not be deleted.');
          }
        }}
      />

      <ConfirmRow
        title="Delete account"
        description="Permanently deletes your account, companion, memories and conversations. This cannot be undone."
        actionLabel="Delete account"
        danger
        onConfirm={async () => {
          try {
            await api.deleteAccount();
            onSignedOut(await api.me());
          } catch (err) {
            setError(err instanceof ApiError ? err.message : 'The account could not be deleted.');
          }
        }}
      />

      <div className="row">
        <div>
          <div className="row__label">Sign out</div>
          <div className="row__sub">Your companion and everything they remember will be here when you return.</div>
        </div>
        <button type="button" className="btn btn--ghost" onClick={signOut} disabled={busy}>
          Sign out
        </button>
      </div>

      <div className="card card--flat">
        <div className="rail__label">How your privacy works</div>
        <ul className="bullets">
          <li>Conversations are stored on this server, tied to your account, and never shown to other users.</li>
          <li>Your session is a signed, HttpOnly cookie — no tokens are kept in browser storage.</li>
          <li>The AI key lives only on the server; it is never sent to your browser.</li>
          <li>Live trending uses search grounding and only sends the topic query, never your conversations.</li>
          <li>You can delete any memory, your history, or your whole account at any time.</li>
        </ul>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function HelpTab({ me }: { me: Me }) {
  const name = me.companion?.name || 'your companion';
  return (
    <div className="stack stack--lg">
      <div className="card card--flat">
        <div className="rail__label">What {name} can do</div>
        <ul className="bullets">
          <li>Talk about anything, in free text — no menus, no scripts.</li>
          <li>Tell you about their own fictional day, family and friends.</li>
          <li>Remember what matters to you, and ask about it later.</li>
          <li>Start conversations, share random gists and discuss entertainment.</li>
          <li>Look up what's actually trending, with sources, and say when it can't.</li>
          <li>Send and receive voice notes, and read replies out loud.</li>
        </ul>
      </div>

      <div className="card card--flat">
        <div className="rail__label">What they are not</div>
        <ul className="bullets">
          <li>Not a human, and never pretends to be one.</li>
          <li>Not a therapist or a medical service. For crisis support, contact local emergency services.</li>
          <li>Not a search engine — live facts come from grounded search, and rumours are labelled as rumours.</li>
        </ul>
      </div>

      <div className="card card--flat">
        <div className="rail__label">Something not working?</div>
        <ul className="bullets">
          <li>No replies at all: the server is missing its AI key, or the model is briefly unavailable. The banner in the chat names the reason.</li>
          <li>Trending is empty: live search returned nothing — {name} will tell you rather than invent it.</li>
          <li>Microphone blocked: allow mic access in your browser, then try the voice button again.</li>
          <li>Something remembered wrongly: fix or delete it in Memory.</li>
        </ul>
      </div>

      <p className="disclosure">
        {name} is an AI character built for companionship. If you are in crisis or unsafe, please reach out to a
        local emergency number or a trusted person — they can actually help.
      </p>
    </div>
  );
}

const options_frequencies = [
  { id: 'off', label: 'Off' },
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
];
