export const AGE_GROUPS = [
  { id: 'under_18', label: 'Under 18' },
  { id: '18_24', label: '18–24' },
  { id: '25_34', label: '25–34' },
  { id: '35_49', label: '35–49' },
  { id: '50_plus', label: '50+' },
  { id: 'unspecified', label: 'Rather not say' },
];

export const TRAITS = [
  {
    id: 'funny',
    label: 'Funny & hilarious',
    emoji: '😂',
    blurb: 'Actually lands jokes. Callbacks, one-liners, zero explaining.',
  },
  {
    id: 'playful',
    label: 'Playful & teasing',
    emoji: '😜',
    blurb: 'Affectionate mockery, nicknames, dramatic outrage.',
  },
  {
    id: 'caring',
    label: 'Caring & understanding',
    emoji: '🫶',
    blurb: 'Notices your mood before you announce it.',
  },
  {
    id: 'talkative',
    label: 'Talkative & sociable',
    emoji: '💬',
    blurb: 'Volunteers stories, tangents and opinions freely.',
  },
  {
    id: 'thoughtful',
    label: 'Intelligent & thoughtful',
    emoji: '🧠',
    blurb: 'Fresh angles, good questions, happy to be wrong.',
  },
  {
    id: 'calm',
    label: 'Calm & gentle',
    emoji: '🌙',
    blurb: 'Steady, unhurried, de-escalates everything.',
  },
  {
    id: 'random',
    label: 'Random & unpredictable',
    emoji: '🌀',
    blurb: 'Weird hypotheticals, sudden obsessions, delightful swerves.',
  },
];

export const HUMOURS = [
  { id: 'dry', label: 'Dry & deadpan' },
  { id: 'witty', label: 'Witty wordplay' },
  { id: 'silly', label: 'Silly & goofy' },
  { id: 'sarcastic', label: 'Sarcastic' },
  { id: 'wholesome', label: 'Wholesome' },
  { id: 'chaotic', label: 'Chaotic nonsense' },
];

export const STYLES = [
  { id: 'short_casual', label: 'Short & casual', blurb: 'Texting energy. Few words, quick replies.' },
  { id: 'warm_gentle', label: 'Warm & gentle', blurb: 'Soft, kind, a little slower.' },
  { id: 'deep_thoughtful', label: 'Deep & thoughtful', blurb: 'Longer conversations, real questions.' },
  { id: 'playful_banter', label: 'Playful banter', blurb: 'Riffing, roasting, running jokes.' },
];

export const GOALS = [
  { id: 'friendship', label: 'A friend to talk to every day' },
  { id: 'someone_to_laugh_with', label: 'Someone to laugh with' },
  { id: 'someone_who_remembers', label: 'Someone who remembers my life' },
  { id: 'company_during_change', label: 'Company while things are changing' },
  { id: 'someone_to_talk_to', label: 'Someone to talk to at night' },
];

export const INTEREST_SUGGESTIONS = [
  'Music', 'Movies & TV', 'Gaming', 'Books', 'Football', 'Art & design',
  'Cooking', 'Travel', 'Tech', 'Anime', 'Fashion', 'Nature',
  'Fitness', 'Photography', 'Animals', 'Science', 'Stand-up comedy', 'K-pop',
];

export const FREQUENCIES = [
  { id: 'off', label: 'Never', minGapMs: Infinity },
  { id: 'low', label: 'Rarely', minGapMs: 24 * 60 * 60 * 1000 },
  { id: 'medium', label: 'Sometimes', minGapMs: 8 * 60 * 60 * 1000 },
  { id: 'high', label: 'Often', minGapMs: 3 * 60 * 60 * 1000 },
];

export const DEFAULT_PROFILE = {
  preferredName: '',
  ageGroup: 'unspecified',
  interests: [],
  entertainment: [],
  humour: '',
  communicationStyle: '',
  companionship: 'friendship',
  aboutYou: '',
  onboardingComplete: false,
  skipped: [],
  updatedAt: 0,
};

export const DEFAULT_SETTINGS = {
  notificationsEnabled: true,
  quietStart: '22:00',
  quietEnd: '08:00',
  frequency: 'medium',
  timezoneOffsetMinutes: 0,
  lastProactiveAt: 0,
  nextProactiveAt: 0,
};

const ids = (list) => list.map((x) => x.id);

export function sanitizeProfile(patch = {}, current = DEFAULT_PROFILE) {
  const next = { ...DEFAULT_PROFILE, ...current };
  const skipped = new Set(next.skipped || []);

  if (typeof patch.preferredName === 'string') {
    next.preferredName = patch.preferredName.trim().slice(0, 40);
  }
  if (typeof patch.ageGroup === 'string' && ids(AGE_GROUPS).includes(patch.ageGroup)) {
    next.ageGroup = patch.ageGroup;
  }
  if (Array.isArray(patch.interests)) {
    next.interests = patch.interests
      .filter((x) => typeof x === 'string')
      .map((x) => x.trim().slice(0, 40))
      .filter(Boolean)
      .slice(0, 12);
  }
  if (Array.isArray(patch.entertainment)) {
    next.entertainment = patch.entertainment
      .filter((x) => typeof x === 'string')
      .map((x) => x.trim().slice(0, 60))
      .filter(Boolean)
      .slice(0, 12);
  }
  if (typeof patch.humour === 'string' && ids(HUMOURS).includes(patch.humour)) next.humour = patch.humour;
  if (typeof patch.communicationStyle === 'string' && ids(STYLES).includes(patch.communicationStyle)) {
    next.communicationStyle = patch.communicationStyle;
  }
  if (typeof patch.companionship === 'string' && ids(GOALS).includes(patch.companionship)) {
    next.companionship = patch.companionship;
  }
  if (typeof patch.aboutYou === 'string') next.aboutYou = patch.aboutYou.trim().slice(0, 400);
  if (Array.isArray(patch.skipped)) {
    for (const key of patch.skipped) {
      if (typeof key === 'string') skipped.add(key.slice(0, 40));
    }
  }
  next.skipped = [...skipped];
  next.updatedAt = Date.now();
  return next;
}

export function sanitizeSettings(patch = {}, current = DEFAULT_SETTINGS) {
  const next = { ...DEFAULT_SETTINGS, ...current };
  if (typeof patch.notificationsEnabled === 'boolean') next.notificationsEnabled = patch.notificationsEnabled;
  if (typeof patch.quietStart === 'string' && /^\d{1,2}:\d{2}$/.test(patch.quietStart)) next.quietStart = patch.quietStart;
  if (typeof patch.quietEnd === 'string' && /^\d{1,2}:\d{2}$/.test(patch.quietEnd)) next.quietEnd = patch.quietEnd;
  if (typeof patch.frequency === 'string' && ids(FREQUENCIES).includes(patch.frequency)) next.frequency = patch.frequency;
  if (Number.isFinite(patch.timezoneOffsetMinutes)) {
    next.timezoneOffsetMinutes = Math.max(-840, Math.min(840, Math.round(patch.timezoneOffsetMinutes)));
  }
  return next;
}

export function sanitizeTraits(list) {
  if (!Array.isArray(list)) return [];
  const allowed = new Set(ids(TRAITS));
  const out = [];
  for (const item of list) {
    if (typeof item === 'string' && allowed.has(item) && !out.includes(item)) out.push(item);
  }
  return out.slice(0, TRAITS.length);
}

export function traitLabels(traitIds) {
  return (traitIds || []).map((id) => TRAITS.find((t) => t.id === id)?.label || id);
}

export function labelFor(list, id) {
  return list.find((x) => x.id === id)?.label || '';
}
