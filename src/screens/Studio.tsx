import { useState } from 'react';
import { api, ApiError } from '../api';
import type { Me, Options } from '../types';
import { ErrorNote } from '../components/ui';
import { CheckIcon, Spinner } from '../components/Icons';
import { initials } from '../lib/format';

export default function Studio({
  options,
  onCreated,
}: {
  options: Options;
  onCreated: (me: Me) => void;
}) {
  const [name, setName] = useState('');
  const [traits, setTraits] = useState<string[]>(['funny', 'caring']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) => {
    if (traits.includes(id)) setTraits(traits.filter((t) => t !== id));
    else if (traits.length < 4) setTraits([...traits, id]);
  };

  const create = async () => {
    const clean = name.trim();
    if (clean.length < 2) {
      setError('Give your companion a name of at least 2 characters.');
      return;
    }
    if (!traits.length) {
      setError('Pick at least one personality trait.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await api.createCompanion(clean, traits);
      onCreated(res.me);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create your companion. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const selected = options.traits.filter((t) => traits.includes(t.id));

  return (
    <div className="shell shell--center">
      <div className="flow">
        <div className="flow__top">
          <div className="brand">
            <span className="brand__mark" style={{ width: 28, height: 28, borderRadius: 9 }}>
              <CheckIcon size={14} />
            </span>
            <span className="brand__word" style={{ fontSize: 15 }}>
              Someone
            </span>
          </div>
        </div>

        <div className="studio">
          <div>
            <span className="eyebrow">Create your companion</span>
            <h1 className="display flow__title" style={{ marginTop: 8 }}>
              One person, just for you.
            </h1>
            <p className="flow__sub" style={{ marginTop: 8 }}>
              They arrive with a whole fictional life — a hometown, family, friends, favourite films and things
              going on this week. You choose the name and the personality.
            </p>
          </div>

          <div className="studio__preview">
            <div className="avatar">{initials(name || 'S')}</div>
            <div style={{ minWidth: 0 }}>
              <div className="studio__name">{name.trim() || 'Your companion'}</div>
              <div className="tiny muted">
                {selected.length ? selected.map((t) => t.label.toLowerCase()).join(' · ') : 'Pick a personality below'}
              </div>
            </div>
          </div>

          {error && <ErrorNote>{error}</ErrorNote>}

          <div className="field">
            <label className="field__label" htmlFor="companionName">
              Their name
            </label>
            <input
              id="companionName"
              className="input"
              value={name}
              maxLength={24}
              placeholder="e.g. Nia, Theo, Sam"
              onChange={(e) => setName(e.target.value)}
            />
            <span className="hint">You can rename them anytime — their memories stay intact.</span>
          </div>

          <div className="field">
            <span className="field__label">Personality — combine up to 4</span>
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
            <span className="hint">
              {traits.length}/4 selected. Traits blend together — funny + caring reads very differently from
              calm + thoughtful.
            </span>
          </div>

          <button className="btn btn--primary btn--block" onClick={create} disabled={busy}>
            {busy ? <Spinner size={16} /> : null}
            Meet {name.trim() || 'your companion'}
          </button>

          <p className="disclosure">
            Your companion is an AI character with a fictional life. Nothing they tell you about their family or
            friends is real.
          </p>
        </div>
      </div>
    </div>
  );
}
