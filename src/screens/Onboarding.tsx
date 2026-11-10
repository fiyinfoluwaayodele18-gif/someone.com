import { useMemo, useState } from 'react';
import { api, ApiError } from '../api';
import type { Me, Options, Profile } from '../types';
import { Chip, ErrorNote } from '../components/ui';
import { BackIcon, CheckIcon, Spinner } from '../components/Icons';

const TOTAL = 5;

export default function Onboarding({
  options,
  initial,
  onDone,
}: {
  options: Options;
  initial?: Profile | null;
  onDone: (me: Me) => void;
}) {
  const [step, setStep] = useState(0);
  const [preferredName, setPreferredName] = useState(initial?.preferredName || '');
  const [ageGroup, setAgeGroup] = useState(initial?.ageGroup || '');
  const [interests, setInterests] = useState<string[]>(initial?.interests || []);
  const [entertainment, setEntertainment] = useState<string[]>(initial?.entertainment || []);
  const [humour, setHumour] = useState(initial?.humour || '');
  const [communicationStyle, setCommunicationStyle] = useState(initial?.communicationStyle || '');
  const [companionship, setCompanionship] = useState(initial?.companionship || '');
  const [aboutYou, setAboutYou] = useState(initial?.aboutYou || '');
  const [entertainmentDraft, setEntertainmentDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const skipped = useMemo(() => {
    const list: string[] = [];
    if (!ageGroup) list.push('ageGroup');
    if (!interests.length) list.push('interests');
    if (!entertainment.length) list.push('entertainment');
    if (!humour) list.push('humour');
    if (!communicationStyle) list.push('communicationStyle');
    if (!companionship) list.push('companionship');
    if (!aboutYou.trim()) list.push('aboutYou');
    return list;
  }, [ageGroup, interests, entertainment, humour, communicationStyle, companionship, aboutYou]);

  const toggle = (list: string[], setList: (v: string[]) => void, value: string, max: number) => {
    if (list.includes(value)) setList(list.filter((v) => v !== value));
    else if (list.length < max) setList([...list, value]);
  };

  const addEntertainment = () => {
    const value = entertainmentDraft.trim().replace(/,$/, '');
    if (!value) return;
    if (!entertainment.some((e) => e.toLowerCase() === value.toLowerCase()) && entertainment.length < 12) {
      setEntertainment([...entertainment, value]);
    }
    setEntertainmentDraft('');
  };

  const finish = async (skipEverything = false) => {
    setError(null);
    setBusy(true);
    try {
      const payload = skipEverything
        ? { preferredName: preferredName.trim(), skipped: ['all'] }
        : {
            preferredName: preferredName.trim(),
            ageGroup,
            interests,
            entertainment,
            humour,
            communicationStyle,
            companionship,
            aboutYou: aboutYou.trim(),
            skipped,
          };
      const res = await api.completeOnboarding(payload);
      onDone(res.me);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save your answers. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const steps = [
    {
      title: `What should we call you?`,
      sub: 'Just a first name or a nickname — whatever feels comfortable. Only your companion uses it.',
      body: (
        <div className="stack">
          <div className="field">
            <label className="field__label" htmlFor="preferredName">
              Preferred name
            </label>
            <input
              id="preferredName"
              className="input"
              value={preferredName}
              maxLength={40}
              placeholder="e.g. Ada"
              onChange={(e) => setPreferredName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="field">
            <span className="field__label">Age group (for age-appropriate chats)</span>
            <div className="chips">
              {options.ageGroups.map((a) => (
                <Chip key={a.id} active={ageGroup === a.id} onClick={() => setAgeGroup(ageGroup === a.id ? '' : a.id)}>
                  {a.label}
                </Chip>
              ))}
            </div>
            <span className="hint">Skippable. We only use this to keep conversations suitable for you.</span>
          </div>
        </div>
      ),
    },
    {
      title: 'What are you into?',
      sub: 'Pick a few things you genuinely enjoy. Your companion will remember these and bring them up later.',
      body: (
        <div className="stack">
          <div className="chips">
            {options.interestSuggestions.map((interest) => (
              <Chip
                key={interest}
                active={interests.includes(interest)}
                onClick={() => toggle(interests, setInterests, interest, 8)}
              >
                {interest}
              </Chip>
            ))}
          </div>
          <span className="hint">Choose up to 8 — or skip and let them discover it as you talk.</span>
        </div>
      ),
    },
    {
      title: 'What do you watch and listen to?',
      sub: 'Films, series, artists, games, books. Add anything — your companion has opinions and will argue about them.',
      body: (
        <div className="stack">
          <div className="row-inline">
            <input
              className="input"
              value={entertainmentDraft}
              placeholder="e.g. Atlanta, Frank Ocean, Elden Ring"
              onChange={(e) => setEntertainmentDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addEntertainment();
                }
              }}
            />
            <button type="button" className="btn btn--ghost" onClick={addEntertainment}>
              Add
            </button>
          </div>
          {entertainment.length > 0 && (
            <div className="chips">
              {entertainment.map((item) => (
                <Chip
                  key={item}
                  active
                  onClick={() => setEntertainment(entertainment.filter((e) => e !== item))}
                >
                  {item} ×
                </Chip>
              ))}
            </div>
          )}
          <span className="hint">Tap one to remove it. Skippable.</span>
        </div>
      ),
    },
    {
      title: 'How do you like to talk?',
      sub: 'This shapes their tone — not what they say.',
      body: (
        <div className="stack">
          <div className="field">
            <span className="field__label">Sense of humour</span>
            <div className="option-grid option-grid--two">
              {options.humours.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  className="option"
                  aria-pressed={humour === h.id}
                  onClick={() => setHumour(humour === h.id ? '' : h.id)}
                >
                  <span className="option__emoji">{h.emoji}</span>
                  <span>
                    <span className="option__label">{h.label}</span>
                    {h.blurb && <span className="option__blurb">{h.blurb}</span>}
                  </span>
                  <span className="option__check">
                    <CheckIcon size={15} />
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="field__label">Communication style</span>
            <div className="chips">
              {options.styles.map((s) => (
                <Chip
                  key={s.id}
                  active={communicationStyle === s.id}
                  onClick={() => setCommunicationStyle(communicationStyle === s.id ? '' : s.id)}
                >
                  {s.label}
                </Chip>
              ))}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'What kind of company do you want?',
      sub: 'Friendship first. You can change any of this later.',
      body: (
        <div className="stack">
          <div className="option-grid">
            {options.goals.map((g) => (
              <button
                key={g.id}
                type="button"
                className="option"
                aria-pressed={companionship === g.id}
                onClick={() => setCompanionship(companionship === g.id ? '' : g.id)}
              >
                <span className="option__emoji">{g.emoji}</span>
                <span>
                  <span className="option__label">{g.label}</span>
                  {g.blurb && <span className="option__blurb">{g.blurb}</span>}
                </span>
                <span className="option__check">
                  <CheckIcon size={15} />
                </span>
              </button>
            ))}
          </div>
          <div className="field">
            <label className="field__label" htmlFor="aboutYou">
              Anything they should know about you? (optional)
            </label>
            <textarea
              id="aboutYou"
              className="textarea"
              value={aboutYou}
              maxLength={600}
              placeholder="e.g. I'm in my final year at uni and I overthink everything at 2am."
              onChange={(e) => setAboutYou(e.target.value)}
            />
          </div>
        </div>
      ),
    },
  ];

  const current = steps[step];
  const isLast = step === steps.length - 1;

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
          <button className="btn btn--quiet" onClick={() => finish(true)} disabled={busy}>
            Skip for now
          </button>
        </div>

        <div className="flow__bar">
          <span style={{ width: `${((step + 1) / TOTAL) * 100}%` }} />
        </div>

        <div className="flow__body" key={step}>
          <span className="eyebrow">
            Step {step + 1} of {TOTAL}
          </span>
          <h1 className="display flow__title">{current.title}</h1>
          <p className="flow__sub">{current.sub}</p>
          {error && <ErrorNote>{error}</ErrorNote>}
          {current.body}
        </div>

        <div className="flow__actions">
          <button
            className="btn btn--ghost"
            onClick={() => (step === 0 ? finish(true) : setStep(step - 1))}
            disabled={busy}
          >
            {step === 0 ? 'Not now' : <><BackIcon size={16} /> Back</>}
          </button>
          {isLast ? (
            <button className="btn btn--primary" onClick={() => finish(false)} disabled={busy}>
              {busy ? <Spinner size={16} /> : null}
              Continue
            </button>
          ) : (
            <button className="btn btn--primary" onClick={() => setStep(step + 1)} disabled={busy}>
              Next
            </button>
          )}
        </div>

        <p className="disclosure">
          You can skip anything except your name later — nothing here is permanent, and your companion is
          always an AI character.
        </p>
      </div>
    </div>
  );
}
