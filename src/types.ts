export type Role = 'user' | 'assistant';

export interface Message {
  id: string;
  seq: number;
  role: Role;
  text: string;
  kind: 'text' | 'voice';
  audioId?: string | null;
  proactive?: boolean;
  meta?: {
    intro?: boolean;
    gist?: string | null;
    transcript?: string;
    mimeType?: string;
    durationMs?: number;
    replyAudioId?: string;
  };
  createdAt: number;
  pending?: boolean;
  failed?: boolean;
}

export interface FamilyMember {
  name: string;
  relation: string;
  age?: number | string;
  personality: string;
}

export interface Friend {
  name: string;
  howTheyMet?: string;
  personality: string;
}

export interface LifeEvent {
  id?: string;
  summary: string;
  status?: 'active' | 'resolved';
  startedAt?: number;
}

export interface CharacterSheet {
  selfName: string;
  age?: number | string;
  hometown: string;
  currentCity?: string;
  workOrStudy?: string;
  personalitySummary?: string;
  family: FamilyMember[];
  friends: Friend[];
  hobbies: string[];
  favouriteMovies: string[];
  favouriteMusic: string[];
  interests: string[];
  quirks?: string[];
  ongoingEvents: LifeEvent[];
  pastExperiences: string[];
  voiceStyle?: string;
}

export interface Companion {
  name: string;
  traits: string[];
  createdAt: number;
  updatedAt: number;
  sheet: CharacterSheet;
}

export interface Profile {
  preferredName: string;
  ageGroup: string;
  interests: string[];
  entertainment: string[];
  humour: string;
  communicationStyle: string;
  companionship: string;
  aboutYou: string;
  completedAt: number | null;
  skipped: string[];
}

export interface Settings {
  notificationsEnabled: boolean;
  quietStart: string;
  quietEnd: string;
  frequency: 'off' | 'low' | 'medium' | 'high';
  timezoneOffsetMinutes: number;
  lastProactiveAt: number;
  nextProactiveAt: number;
}

export interface Memory {
  id: string;
  content: string;
  category: 'preference' | 'person' | 'event' | 'plan' | 'feeling' | 'fact';
  origin: 'auto' | 'manual';
  createdAt: number;
  updatedAt: number;
}

export interface Me {
  user: { id: string; email: string; createdAt: number } | null;
  profile?: Profile;
  settings?: Settings;
  companion?: Companion | null;
  onboardingComplete?: boolean;
  stats?: { messages: number; memories: number; since: number };
  ai: { configured: boolean; chatModel?: string | null };
}

export interface CatalogOption {
  id: string;
  label: string;
  blurb?: string;
  emoji?: string;
}

export interface Options {
  ageGroups: CatalogOption[];
  traits: CatalogOption[];
  humours: CatalogOption[];
  styles: CatalogOption[];
  goals: CatalogOption[];
  interestSuggestions: string[];
  frequencies: CatalogOption[];
}

export interface TrendingItem {
  title: string;
  detail: string;
  status: 'confirmed' | 'rumour' | 'reported';
}

export interface TrendingSource {
  title?: string;
  uri?: string;
}

export interface TrendingResult {
  available: boolean;
  reason?: string;
  message?: string;
  items: TrendingItem[];
  sources: TrendingSource[];
  fetchedAt: number;
  cached?: boolean;
  stale?: boolean;
}

export interface Gist {
  topic: string;
  opener: string;
  source: 'ai' | 'local';
}
