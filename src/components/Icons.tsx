type P = { size?: number; className?: string; strokeWidth?: number };

const base = (size = 20, strokeWidth = 1.7) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
});

export const HeartIcon = ({ size, className, strokeWidth }: P) => (
  <svg {...base(size, strokeWidth)} className={className}>
    <path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 1 0-7.1 7.1l8.1 8.1a1 1 0 0 0 1.4 0l8.1-8.1a5 5 0 0 0 0-7.1Z" />
  </svg>
);

export const SendIcon = ({ size, className, strokeWidth }: P) => (
  <svg {...base(size, strokeWidth)} className={className}>
    <path d="M21.5 2.5 11 13" />
    <path d="M21.5 2.5 15 21l-4-8-8-4 18.5-6.5Z" />
  </svg>
);

export const MicIcon = ({ size, className, strokeWidth }: P) => (
  <svg {...base(size, strokeWidth)} className={className}>
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v4" />
  </svg>
);

export const PlayIcon = ({ size = 16, className }: P) => (
  <svg {...base(size, 1.8)} className={className} fill="currentColor" stroke="none">
    <path d="M8 5.2v13.6a1 1 0 0 0 1.5.87l11-6.8a1 1 0 0 0 0-1.74l-11-6.8A1 1 0 0 0 8 5.2Z" />
  </svg>
);

export const PauseIcon = ({ size = 16, className }: P) => (
  <svg {...base(size, 1.8)} className={className} fill="currentColor" stroke="none">
    <rect x="7" y="4.5" width="3.6" height="15" rx="1.4" />
    <rect x="13.4" y="4.5" width="3.6" height="15" rx="1.4" />
  </svg>
);

export const SparkleIcon = ({ size, className, strokeWidth }: P) => (
  <svg {...base(size, strokeWidth)} className={className}>
    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z" />
    <path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" />
  </svg>
);

export const SettingsIcon = ({ size, className, strokeWidth }: P) => (
  <svg {...base(size, strokeWidth)} className={className}>
    <circle cx="12" cy="12" r="3.1" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.64 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z" />
  </svg>
);

export const CloseIcon = ({ size, className, strokeWidth }: P) => (
  <svg {...base(size, strokeWidth)} className={className}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

export const BackIcon = ({ size, className, strokeWidth }: P) => (
  <svg {...base(size, strokeWidth)} className={className}>
    <path d="M15 18l-6-6 6-6" />
  </svg>
);

export const CheckIcon = ({ size = 16, className, strokeWidth = 2.2 }: P) => (
  <svg {...base(size, strokeWidth)} className={className}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export const TrashIcon = ({ size, className, strokeWidth }: P) => (
  <svg {...base(size, strokeWidth)} className={className}>
    <path d="M3 6h18M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6m3 0v13.5A1.5 1.5 0 0 1 17.5 21h-11A1.5 1.5 0 0 1 5 19.5V6" />
    <path d="M10 11v5M14 11v5" />
  </svg>
);

export const PencilIcon = ({ size, className, strokeWidth }: P) => (
  <svg {...base(size, strokeWidth)} className={className}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
  </svg>
);

export const BellIcon = ({ size, className, strokeWidth }: P) => (
  <svg {...base(size, strokeWidth)} className={className}>
    <path d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7" />
    <path d="M10.3 20a2 2 0 0 0 3.4 0" />
  </svg>
);

export const LockIcon = ({ size, className, strokeWidth }: P) => (
  <svg {...base(size, strokeWidth)} className={className}>
    <rect x="4" y="10.5" width="16" height="10.5" rx="2.6" />
    <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
  </svg>
);

export const BrainIcon = ({ size, className, strokeWidth }: P) => (
  <svg {...base(size, strokeWidth)} className={className}>
    <path d="M9.5 3.5A3 3 0 0 0 6.6 6.4 3 3 0 0 0 4.5 9.3a3 3 0 0 0 .4 4.5 3 3 0 0 0 1.7 4.3A3 3 0 0 0 12 20.5V5a3 3 0 0 0-2.5-1.5Z" />
    <path d="M14.5 3.5A3 3 0 0 1 17.4 6.4a3 3 0 0 1 2.1 2.9 3 3 0 0 1-.4 4.5 3 3 0 0 1-1.7 4.3A3 3 0 0 1 12 20.5" />
  </svg>
);

export const GlobeIcon = ({ size, className, strokeWidth }: P) => (
  <svg {...base(size, strokeWidth)} className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18Z" />
  </svg>
);

export const DiceIcon = ({ size, className, strokeWidth }: P) => (
  <svg {...base(size, strokeWidth)} className={className}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
    <circle cx="8.6" cy="8.6" r="1.15" fill="currentColor" stroke="none" />
    <circle cx="15.4" cy="15.4" r="1.15" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.15" fill="currentColor" stroke="none" />
  </svg>
);

export const HelpIcon = ({ size, className, strokeWidth }: P) => (
  <svg {...base(size, strokeWidth)} className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.6 9.2a2.5 2.5 0 1 1 3.6 2.3c-.8.5-1.2 1-1.2 1.9" />
    <circle cx="12" cy="16.6" r="0.9" fill="currentColor" stroke="none" />
  </svg>
);

export const UserIcon = ({ size, className, strokeWidth }: P) => (
  <svg {...base(size, strokeWidth)} className={className}>
    <circle cx="12" cy="8.2" r="3.7" />
    <path d="M4.8 20.2a7.4 7.4 0 0 1 14.4 0" />
  </svg>
);

export const ArrowDownIcon = ({ size, className, strokeWidth }: P) => (
  <svg {...base(size, strokeWidth)} className={className}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </svg>
);

export const SpeakerIcon = ({ size, className, strokeWidth }: P) => (
  <svg {...base(size, strokeWidth)} className={className}>
    <path d="M11 5 6.5 9H3v6h3.5L11 19V5Z" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" />
  </svg>
);

export const RefreshIcon = ({ size, className, strokeWidth }: P) => (
  <svg {...base(size, strokeWidth)} className={className}>
    <path d="M20 11a8 8 0 1 0-2.4 6.1" />
    <path d="M20 4v7h-7" />
  </svg>
);

export const Spinner = ({ size = 18, className }: P) => (
  <svg {...base(size, 2.2)} className={`spin ${className || ''}`}>
    <path d="M12 3a9 9 0 1 0 9 9" />
  </svg>
);
