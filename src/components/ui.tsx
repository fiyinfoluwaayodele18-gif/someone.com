import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CloseIcon } from './Icons';

/* ------------------------------------------------------------------ */
/* Bottom sheet / modal                                                */
/* ------------------------------------------------------------------ */

export function Sheet({
  title,
  onClose,
  children,
  tabs,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  tabs?: ReactNode;
  footer?: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="sheet-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={panelRef}
      >
        <div className="sheet__handle" />
        <div className="sheet__head">
          <h2 className="sheet__title">{title}</h2>
          <button className="icon-btn" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>
        {tabs}
        <div className="sheet__body">{children}</div>
        {footer}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Controls                                                            */
/* ------------------------------------------------------------------ */

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      className="toggle"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    />
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          type="button"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" className="chip" aria-pressed={active} onClick={onClick}>
      {children}
    </button>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div className="error" role="alert">
      <span aria-hidden="true">⚠️</span>
      <span>{children}</span>
    </div>
  );
}

export function Skeleton({ height = 14, width = '100%' }: { height?: number; width?: number | string }) {
  return <div className="skeleton" style={{ height, width }} aria-hidden="true" />;
}

/* ------------------------------------------------------------------ */
/* Confirm action (used for destructive settings)                      */
/* ------------------------------------------------------------------ */

export function ConfirmRow({
  title,
  description,
  actionLabel,
  onConfirm,
  danger,
}: {
  title: string;
  description: string;
  actionLabel: string;
  onConfirm: () => Promise<void> | void;
  danger?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 200px' }}>
        <div className="row__label">{title}</div>
        <div className="row__sub">{description}</div>
      </div>
      {confirming ? (
        <div className="row-inline">
          <button className="btn btn--ghost" onClick={() => setConfirming(false)} disabled={busy}>
            Cancel
          </button>
          <button
            className={`btn ${danger ? 'btn--danger' : 'btn--primary'}`}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
              } finally {
                setBusy(false);
                setConfirming(false);
              }
            }}
          >
            {busy ? 'Working…' : 'Confirm'}
          </button>
        </div>
      ) : (
        <button className={`btn ${danger ? 'btn--danger' : 'btn--ghost'}`} onClick={() => setConfirming(true)}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
