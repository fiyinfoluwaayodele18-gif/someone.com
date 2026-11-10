import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from './api';
import type { Me, Options } from './types';
import Welcome from './screens/Welcome';
import Onboarding from './screens/Onboarding';
import Studio from './screens/Studio';
import Chat from './screens/Chat';
import Settings from './screens/Settings';
import { HeartIcon, Spinner } from './components/Icons';

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [options, setOptions] = useState<Options | null>(null);
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const load = useCallback(async () => {
    const [meRes, optionsRes] = await Promise.all([api.me(), api.options()]);
    setMe(meRes);
    setOptions(optionsRes);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await load();
      } catch (err) {
        if (alive) {
          setBootError(
            err instanceof ApiError
              ? err.message
              : 'SOMEONE could not reach the server. Check your connection and try again.',
          );
        }
      } finally {
        if (alive) setBooting(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [load]);

  const retry = async () => {
    setBooting(true);
    setBootError(null);
    try {
      await load();
    } catch (err) {
      setBootError(err instanceof ApiError ? err.message : 'Still cannot reach the server.');
    } finally {
      setBooting(false);
    }
  };

  if (booting || (!me && !bootError)) {
    return (
      <div className="shell shell--center">
        <div className="boot">
          <span className="brand__mark brand__mark--lg">
            <HeartIcon size={22} strokeWidth={1.8} />
          </span>
          <div className="brand__word" style={{ fontSize: 22 }}>
            Someone
          </div>
          <div className="boot__line">
            <Spinner size={16} /> Finding your someone…
          </div>
        </div>
      </div>
    );
  }

  if (bootError || !me || !options) {
    return (
      <div className="shell shell--center">
        <div className="boot">
          <span className="brand__mark brand__mark--lg">
            <HeartIcon size={22} strokeWidth={1.8} />
          </span>
          <div className="brand__word" style={{ fontSize: 22 }}>
            Someone
          </div>
          <p className="boot__error">{bootError || 'Something went wrong while loading.'}</p>
          <button type="button" className="btn btn--primary" onClick={retry}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!me.user) {
    return <Welcome onAuthed={setMe} />;
  }

  if (!me.onboardingComplete) {
    return <Onboarding options={options} initial={me.profile} onDone={setMe} />;
  }

  if (!me.companion) {
    return <Studio options={options} onCreated={setMe} />;
  }

  return (
    <>
      <Chat me={me} options={options} onOpenSettings={() => setSettingsOpen(true)} />
      {settingsOpen && (
        <Settings
          me={me}
          options={options}
          onMe={setMe}
          onClose={() => setSettingsOpen(false)}
          onSignedOut={(next) => {
            setSettingsOpen(false);
            setMe(next);
          }}
        />
      )}
    </>
  );
}
