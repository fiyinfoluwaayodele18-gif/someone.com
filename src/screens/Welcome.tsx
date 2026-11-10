import { useState } from 'react';
import { api, ApiError } from '../api';
import type { Me } from '../types';
import { ErrorNote } from '../components/ui';
import { HeartIcon, LockIcon, SparkleIcon, BrainIcon, Spinner } from '../components/Icons';

export default function Welcome({ onAuthed }: { onAuthed: (me: Me) => void }) {
  const [mode, setMode] = useState<'signup' | 'login'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || password.length < 8) {
      setError('Enter your email and a password of at least 8 characters.');
      return;
    }
    setBusy(true);
    try {
      const res = mode === 'signup' ? await api.signup(email.trim(), password) : await api.login(email.trim(), password);
      onAuthed(res.me);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="shell shell--center">
      <div className="welcome">
        <div className="welcome__hero">
          <div className="brand" style={{ justifyContent: 'center' }}>
            <span className="brand__mark">
              <HeartIcon size={18} strokeWidth={2} />
            </span>
            <span className="brand__word">Someone</span>
          </div>

          <h1 className="display welcome__title">
            Everyone deserves <em>someone</em>.
          </h1>
          <p className="welcome__lede">
            One companion who knows you, remembers what matters, and actually has a life of their own —
            a fictional family, friends, opinions and stories they can't wait to tell you.
          </p>
          <span className="welcome__pill">
            <SparkleIcon size={14} /> Not an assistant. A companion.
          </span>
        </div>

        <div className="welcome__points">
          <div className="point">
            <span className="point__icon">
              <BrainIcon size={16} />
            </span>
            <span className="point__text">
              <strong>They remember you.</strong> Your music, your exams, the film you meant to watch — carried
              between conversations.
            </span>
          </div>
          <div className="point">
            <span className="point__icon">
              <SparkleIcon size={16} />
            </span>
            <span className="point__text">
              <strong>They bring things to talk about.</strong> Family stories, random gists, entertainment and
              what's actually trending right now.
            </span>
          </div>
          <div className="point">
            <span className="point__icon">
              <LockIcon size={16} />
            </span>
            <span className="point__text">
              <strong>Private by design.</strong> Your conversations stay yours, and you can inspect or delete
              anything they remember.
            </span>
          </div>
        </div>

        <form className="auth card card--pad" onSubmit={submit}>
          <div className="auth__switch" role="tablist" aria-label="Account access">
            <button
              type="button"
              role="tab"
              className="auth__tab"
              aria-selected={mode === 'signup'}
              onClick={() => {
                setMode('signup');
                setError(null);
              }}
            >
              Create account
            </button>
            <button
              type="button"
              role="tab"
              className="auth__tab"
              aria-selected={mode === 'login'}
              onClick={() => {
                setMode('login');
                setError(null);
              }}
            >
              Sign in
            </button>
          </div>

          {error && <ErrorNote>{error}</ErrorNote>}

          <div className="field">
            <label className="field__label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              className="input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'signup' ? 'At least 8 characters' : 'Your password'}
              minLength={8}
              required
            />
          </div>

          <button className="btn btn--primary btn--block" type="submit" disabled={busy}>
            {busy ? <Spinner size={17} /> : null}
            {mode === 'signup' ? 'Start meeting your companion' : 'Continue to your companion'}
          </button>

          <p className="disclosure">
            Your companion is a fictional AI character, not a human. Conversations are generated by AI and are
            never shown to other people.
          </p>
        </form>
      </div>
    </div>
  );
}
