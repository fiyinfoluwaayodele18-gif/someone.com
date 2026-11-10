import { useEffect, useRef, useState } from 'react';
import { MicIcon, SendIcon, Spinner } from './Icons';
import { mmss } from '../lib/format';

interface ComposerProps {
  onSend: (text: string) => void;
  onVoice: (blob: Blob, durationMs: number) => void;
  busy: boolean;
  disabled?: boolean;
  placeholder?: string;
}

const MAX_MS = 120_000;

export default function Composer({ onSend, onVoice, busy, disabled, placeholder }: ComposerProps) {
  const [value, setValue] = useState('');
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);

  const areaRef = useRef<HTMLTextAreaElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cancelledRef = useRef(false);

  const autosize = () => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  };

  useEffect(() => {
    autosize();
  }, [value]);

  useEffect(
    () => () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  const submit = () => {
    const text = value.trim();
    if (!text || busy || disabled) return;
    setValue('');
    onSend(text);
    requestAnimationFrame(autosize);
  };

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const finishRecording = (blob: Blob) => {
    const duration = Date.now() - startedRef.current;
    if (cancelledRef.current || blob.size < 900 || duration < 400) {
      setMicError('That was too short to send — hold on a little longer.');
      return;
    }
    onVoice(blob, duration);
  };

  const startRecording = async () => {
    setMicError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setMicError('This browser cannot record audio. Try Chrome, Edge or Safari.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((m) =>
        MediaRecorder.isTypeSupported(m),
      );
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      cancelledRef.current = false;
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        stopStream();
        if (timerRef.current) window.clearInterval(timerRef.current);
        timerRef.current = null;
        setRecording(false);
        setElapsed(0);
        finishRecording(blob);
      };
      rec.start(250);
      recorderRef.current = rec;
      startedRef.current = Date.now();
      setRecording(true);
      setElapsed(0);
      timerRef.current = window.setInterval(() => {
        const ms = Date.now() - startedRef.current;
        setElapsed(ms);
        if (ms >= MAX_MS) recorderRef.current?.stop();
      }, 200);
    } catch {
      setMicError('Microphone access was blocked. Allow it in your browser settings to send voice notes.');
      stopStream();
    }
  };

  const stopRecording = (cancel: boolean) => {
    cancelledRef.current = cancel;
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    } else {
      setRecording(false);
      stopStream();
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="composer-wrap">
      <div className="composer">
        {recording ? (
          <div className="recording">
            <span className="recording__dot" aria-hidden="true" />
            <span className="recording__time">{mmss(elapsed)}</span>
            <div className="waveform" aria-hidden="true">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => (
                <i
                  key={i}
                  style={{
                    height: `${6 + ((i * 5) % 13)}px`,
                    animationDelay: `${i * 0.07}s`,
                  }}
                />
              ))}
            </div>
            <div className="spacer" />
            <button
              type="button"
              className="btn btn--quiet"
              onClick={() => stopRecording(true)}
              aria-label="Cancel recording"
            >
              Cancel
            </button>
            <button
              type="button"
              className="composer__btn composer__btn--send"
              onClick={() => stopRecording(false)}
              aria-label="Send voice note"
            >
              <SendIcon size={18} />
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              className="composer__btn composer__btn--ghost"
              onClick={startRecording}
              disabled={busy || disabled}
              aria-label="Record a voice note"
              title="Record a voice note"
            >
              <MicIcon size={19} />
            </button>
            <textarea
              ref={areaRef}
              className="composer__input"
              rows={1}
              value={value}
              placeholder={placeholder || 'Say anything at all…'}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={disabled}
              aria-label="Message"
            />
            <button
              type="button"
              className="composer__btn composer__btn--send"
              onClick={submit}
              disabled={busy || disabled || !value.trim()}
              aria-label="Send message"
            >
              {busy ? <Spinner size={17} /> : <SendIcon size={18} />}
            </button>
          </>
        )}
      </div>
      {micError ? (
        <div className="composer__hint" role="alert" style={{ color: '#8f3239' }}>
          {micError}
        </div>
      ) : (
        <div className="composer__hint">
          Enter to send · Shift + Enter for a new line · voice notes welcome
        </div>
      )}
    </div>
  );
}
