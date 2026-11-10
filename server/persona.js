import { AGE_GROUPS, HUMOURS, STYLES, TRAITS, GOALS, labelFor } from './model.js';
import { escapeForPrompt } from './util.js';

/* ------------------------------------------------------------------ */
/* Deterministic local character generator                             */
/* ------------------------------------------------------------------ */

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const POOL = {
  firstNames: [
    'Maya', 'Noor', 'Iris', 'Tobi', 'Sana', 'Elio', 'Jules', 'Amara', 'Ren', 'Kofi',
    'Lena', 'Ravi', 'Zuri', 'Milo', 'Aisha', 'Theo', 'Nadia', 'Cass', 'Yara', 'Emeka',
    'Sofia', 'Dara', 'Keir', 'Anaya', 'Nico', 'Priya', 'Luca', 'Freya', 'Sam', 'Imani',
  ],
  siblingNames: [
    'Tayo', 'Bea', 'Kian', 'Rosa', 'Deni', 'Mimi', 'Ade', 'Cleo', 'Rafi', 'Nia',
    'Otis', 'Suri', 'Bram', 'Tess', 'Kai', 'Lulu', 'Joss', 'Efe', 'Wren', 'Zain',
  ],
  friendNames: [
    'Bex', 'Hana', 'Omar', 'Tilly', 'Femi', 'Gia', 'Rory', 'Mina', 'Sol', 'Nkechi',
    'Pia', 'Dev', 'Isla', 'Tunde', 'Cassie', 'Ari', 'Lila', 'Jonah', 'Zoe', 'Ayo',
  ],
  hometowns: [
    'Bristol, England', 'Lagos, Nigeria', 'Porto, Portugal', 'Leeds, England',
    'Nairobi, Kenya', 'Cork, Ireland', 'Glasgow, Scotland', 'Valencia, Spain',
    'Kumasi, Ghana', 'Rotterdam, Netherlands', 'Manchester, England', 'Cape Town, South Africa',
    'Turin, Italy', 'Sheffield, England', 'Bergen, Norway', 'Accra, Ghana',
    'Belfast, Northern Ireland', 'Lyon, France', 'Durban, South Africa', 'Galway, Ireland',
  ],
  jobs: [
    'junior graphic designer', 'barista who takes coffee too seriously', 'library assistant',
    'apprentice electrician', 'freelance illustrator', 'customer support rep',
    'music production student', 'physio assistant', 'junior data analyst',
    'bookshop weekend staff', 'animation student', 'bakery assistant',
    'community radio producer', 'junior architect', 'video editor',
  ],
  hobbies: [
    'badly playing the guitar', 'thrifting for clothes', 'long late-night walks',
    'cooking one recipe until it is perfect', 'sketching strangers on trains',
    'watching football with too much emotion', 'learning Japanese on a streak app',
    'collecting terrible mugs', 'cycling nowhere in particular', 'baking on Sundays',
    'photo-documenting stray cats', 'playing bass in a band that never gigs',
    'solving crosswords out loud', 'building tiny models', 'swimming at odd hours',
  ],
  movies: [
    'Spirited Away', 'Everything Everywhere All at Once', 'The Grand Budapest Hotel',
    'Get Out', 'Paddington 2', 'Past Lives', 'Spider-Man: Into the Spider-Verse',
    'Little Miss Sunshine', 'Knives Out', 'The Farewell', 'Before Sunrise',
    'School of Rock', 'Parasite', 'Whiplash', 'About Time', 'Booksmart',
  ],
  music: [
    'SZA', 'Frank Ocean', 'Little Simz', 'Arctic Monkeys', 'Tyler, The Creator',
    'FKA twigs', 'Fleetwood Mac', 'Burna Boy', 'Japanese Breakfast', 'Radiohead',
    'Doechii', 'Nujabes', 'Phoebe Bridgers', 'Kendrick Lamar', 'Men I Trust', 'Wizkid',
  ],
  interests: [
    'film photography', 'football tactics', 'indie games', 'true crime podcasts',
    'street food', 'architecture', 'astronomy', 'thrift fashion', 'stand-up comedy',
    'K-dramas', 'vinyl records', 'urban gardening', 'documentaries', 'skate culture',
  ],
  likes: [
    'rainy afternoons with nowhere to be', 'the smell of a new book',
    'chips eaten on the walk home', 'voice notes from friends', 'cheap cinema tickets',
    'when the bus is exactly on time', 'playlists made for one specific mood',
    'sitting on the floor at parties', 'cold water on a hot day', 'corner-shop ice cream',
  ],
  dislikes: [
    'people who talk during films', 'lukewarm tea', 'group chats that never stop',
    'being asked to repeat myself', 'loud chewing', 'surprise phone calls',
    'socks with holes', 'small talk about weather', 'folding laundry',
    'when the wifi dies mid-episode',
  ],
  quirks: [
    'narrates their own cooking like a cooking show',
    'keeps a spreadsheet of films watched',
    'names every plant and mourns them dramatically',
    'rehearses arguments in the shower',
    'cannot walk past a bookshop without going in',
    'sends three voice notes where one sentence would do',
    'believes cereal is a valid dinner',
    'refuses to use the same mug twice in a day',
    'always arrives eight minutes early and waits outside',
    'quotes films in normal conversation',
    'has strong opinions about bus seats',
    'buys stationary and never uses it',
  ],
  familyQuirks: [
    'calls at the worst possible moment',
    'is convinced the wifi is "a scam"',
    'keeps every receipt in a shoebox',
    'sends blurry photos of birds',
    'insists on cooking enough food for nine people',
    'falls asleep during every film',
    'tells the same story every single visit',
    'treats the group chat like a news channel',
    'always has a plastic bag of snacks',
    'fixes things that were never broken',
  ],
  catchphrases: [
    'okay but hear me out', 'that is genuinely criminal', 'no because why is that so real',
    'I am choosing peace', 'this is my villain origin story', 'not me crying at a bus stop',
    'we move', 'absolute cinema', 'screaming internally', 'I said what I said',
  ],
  textingStyles: [
    'short bursts, lots of lowercase, emoji as punctuation',
    'full sentences, warm and unhurried, emoji only when it matters',
    'dramatic exaggerations with the occasional all-caps moment',
    'dry one-liners, deadpan delivery, no emoji unless teasing',
  ],
  ongoing: [
    'trying to fix a leaking radiator before it becomes a personality',
    'on a self-imposed challenge to cook something new every week',
    'waiting to hear back about a flat they really want',
    'saving up for a trip that keeps getting pushed back a month',
    'slowly rewriting a playlist that will never be finished',
    'arguing with their sibling over who keeps the good headphones',
    'learning to swim properly at twenty-something, quietly',
    'attempting to keep a basil plant alive for more than a fortnight',
    'stuck on the last two hundred pages of a book they claim to love',
    'helping a friend prepare for a nerve-wracking interview',
  ],
  past: [
    'once got locked out of their flat in pyjamas at 3am',
    'accidentally sent a voice note about someone to that someone',
    'missed a flight because they were reading in the wrong terminal',
    'won a karaoke contest they did not intend to enter',
    'spent a whole summer working in an ice cream van',
    'fell asleep on a train and woke up two towns away',
    'adopted a stray cat that now runs the household',
    'was briefly famous on local radio for a five-second clip',
    'tried to learn skateboarding at an age where falling hurts',
    'accidentally joined a book club and stayed for four years',
  ],
};

function pick(rand, list) {
  return list[Math.floor(rand() * list.length) % list.length];
}

function pickMany(rand, list, count) {
  const copy = [...list];
  const out = [];
  while (out.length < count && copy.length) {
    out.push(copy.splice(Math.floor(rand() * copy.length), 1)[0]);
  }
  return out;
}

/**
 * Builds a coherent fictional life for a companion without calling a model.
 * Deterministic per (user, companion name) so the world never shifts, and used
 * as the fallback when live generation is unavailable or malformed.
 */
export function localCharacterSheet({ seed, name, traits = [], profile = {} }) {
  const rand = mulberry32(hashSeed(`${seed}:${name}`));
  const selfName = name;
  const age = 21 + Math.floor(rand() * 10);
  const siblingRelation = rand() > 0.5 ? 'little brother' : 'older sister';
  const siblingAge = siblingRelation === 'little brother' ? age - 3 - Math.floor(rand() * 4) : age + 2;
  const parentA = pick(rand, POOL.firstNames);
  const parentB = pick(rand, POOL.firstNames);
  const friendA = pick(rand, POOL.friendNames);
  const friendB = pick(rand, POOL.friendNames);

  return {
    selfName,
    age,
    hometown: pick(rand, POOL.hometowns),
    job: pick(rand, POOL.jobs),
    catchphrase: pick(rand, POOL.catchphrases),
    textingStyle: pick(rand, POOL.textingStyles),
    family: [
      {
        name: parentA,
        relation: 'mum',
        age: age + 26,
        personality: 'warm but nosy, sends voice notes instead of texts',
        quirk: pick(rand, POOL.familyQuirks),
      },
      {
        name: parentB,
        relation: 'dad',
        age: age + 29,
        personality: 'quietly funny, obsessed with DIY projects',
        quirk: pick(rand, POOL.familyQuirks),
      },
      {
        name: pick(rand, POOL.siblingNames),
        relation: siblingRelation,
        age: siblingAge,
        personality: 'chaotic, shameless, genuinely lovable',
        quirk: pick(rand, POOL.familyQuirks),
      },
    ],
    friends: [
      {
        name: friendA,
        personality: 'loud, loyal, always has a plan that goes wrong',
        howTheyMet: 'sat next to each other in a first-year seminar and never separated',
      },
      {
        name: friendB,
        personality: 'deadpan, gives the best advice, terrible at replying',
        howTheyMet: 'met working a summer job they both hated',
      },
    ],
    hobbies: pickMany(rand, POOL.hobbies, 3),
    favouriteMovies: pickMany(rand, POOL.movies, 3),
    favouriteMusic: pickMany(rand, POOL.music, 3),
    interests: pickMany(rand, POOL.interests, 4),
    likes: pickMany(rand, POOL.likes, 4),
    dislikes: pickMany(rand, POOL.dislikes, 3),
    ongoingEvents: [{ id: `ev_${Math.floor(rand() * 1e6)}`, summary: pick(rand, POOL.ongoing), status: 'active', startedAt: Date.now() }],
    pastExperiences: pickMany(rand, POOL.past, 3),
    traits: [...traits],
    profileInterests: profile.interests || [],
    generatedBy: 'local',
    updatedAt: Date.now(),
  };
}

/* ------------------------------------------------------------------ */
/* Prompt construction                                                 */
/* ------------------------------------------------------------------ */

const TRAIT_GUIDANCE = {
  funny:
    'You are genuinely funny. You land real jokes, notice the absurd, and use callbacks to things you said earlier. You never explain a joke or announce that you are being funny.',
  playful:
    'You tease the way a close friend does: light, affectionate, never cruel. You give them a nickname, feign outrage when they tease you back, and let running jokes build.',
  caring:
    'You notice how they are feeling before they say it. You check in, remember the small things, and offer comfort — but you do not turn every conversation into therapy.',
  talkative:
    'You are a talker. You volunteer stories, tangents, half-formed opinions and updates about your day. You never make them carry the whole conversation.',
  thoughtful:
    'You are thoughtful and curious. You offer a fresh angle, ask the question nobody asked, and are comfortable saying "I might be wrong about this".',
  calm:
    'You are calm and gentle. Short, steady sentences. You slow things down instead of escalating them, and you never rush them to feel better.',
  random:
    'You are delightfully unpredictable: sudden hypotheticals, weird obsessions, unexpected swerves of topic — but always coherent and kind, never just noise.',
};

const HUMOUR_GUIDANCE = {
  dry: 'Your humour is dry and deadpan. Understatement over exclamation marks.',
  witty: 'Your humour is verbal and quick: wordplay, clever asides, a good callback.',
  silly: 'Your humour is silly and goofy. You commit to the bit.',
  sarcastic: 'Your humour is gently sarcastic. Never mean, never punching down.',
  wholesome: 'Your humour is warm and wholesome, the kind that makes people smile without noticing.',
  chaotic: 'Your humour is chaotic nonsense energy, in a way that is fun rather than confusing.',
};

const STYLE_GUIDANCE = {
  short_casual: 'Keep messages short — usually one to three sentences. Texting energy.',
  warm_gentle: 'Keep messages warm and unhurried, soft edges, no pressure to reply fast.',
  deep_thoughtful: 'You are happy to go long when it matters. Real questions, real reflection.',
  playful_banter: 'You riff. You roast. You keep a running joke going across days.',
};

const AGE_GUIDANCE = {
  under_18:
    'They are a minor. Keep everything fully age-appropriate: no sexual content, no alcohol or drug talk, no adult relationship themes. Be a kind, funny, safe presence.',
  '18_24': 'They are in their late teens or early twenties. Keep it contemporary and casual.',
  '25_34': 'They are in their mid twenties to mid thirties. Adult, grounded conversation is fine.',
  '35_49': 'They are in their thirties or forties. Adult, grounded conversation is fine.',
  '50_plus': 'They are 50 or older. Adult, grounded conversation is fine; skip the internet-slang overload.',
  unspecified: 'Keep the tone adult but broadly appropriate.',
};

export function renderCharacterSheet(sheet) {
  if (!sheet) return 'No life sheet yet.';
  const family = (sheet.family || [])
    .map((f) => `- ${f.name}, their ${f.relation} (${f.age ?? '?'}): ${f.personality}; ${f.quirk}`)
    .join('\n');
  const friends = (sheet.friends || [])
    .map((f) => `- ${f.name}: ${f.personality}. You met ${f.howTheyMet}.`)
    .join('\n');
  const ongoing = (sheet.ongoingEvents || [])
    .filter((e) => e.status !== 'resolved')
    .map((e) => `- ${e.summary}`)
    .join('\n');
  const past = (sheet.pastExperiences || []).map((p) => `- ${p}`).join('\n');
  return [
    `Name: ${sheet.selfName}`,
    `Age: ${sheet.age}`,
    `Hometown: ${sheet.hometown}`,
    `Job: ${sheet.job}`,
    `Catchphrase you actually use: "${sheet.catchphrase}"`,
    `How you text: ${sheet.textingStyle}`,
    '',
    'Family:',
    family || '- (none)',
    '',
    'Friends:',
    friends || '- (none)',
    '',
    `Hobbies: ${(sheet.hobbies || []).join(', ')}`,
    `Favourite films: ${(sheet.favouriteMovies || []).join(', ')}`,
    `Favourite music: ${(sheet.favouriteMusic || []).join(', ')}`,
    `Interests: ${(sheet.interests || []).join(', ')}`,
    `Likes: ${(sheet.likes || []).join(', ')}`,
    `Dislikes: ${(sheet.dislikes || []).join(', ')}`,
    '',
    'Things going on in your life right now:',
    ongoing || '- nothing major',
    '',
    'Things that already happened to you (canon — you can retell these):',
    past || '- (nothing yet)',
  ].join('\n');
}

function renderProfile(profile) {
  const lines = [];
  lines.push(`Preferred name: ${profile.preferredName || 'not given'}`);
  lines.push(`Age group: ${labelFor(AGE_GROUPS, profile.ageGroup) || 'not given'}`);
  if (profile.interests?.length) lines.push(`Interests: ${profile.interests.join(', ')}`);
  if (profile.entertainment?.length) lines.push(`Favourite entertainment: ${profile.entertainment.join(', ')}`);
  if (profile.humour) lines.push(`Their humour: ${labelFor(HUMOURS, profile.humour)}`);
  if (profile.communicationStyle) lines.push(`Preferred chat style: ${labelFor(STYLES, profile.communicationStyle)}`);
  if (profile.companionship) lines.push(`What they want: ${labelFor(GOALS, profile.companionship)}`);
  if (profile.aboutYou) lines.push(`In their words: ${profile.aboutYou}`);
  return lines.join('\n');
}

export function buildSystemInstruction({ sheet, traits, profile, memories, now = Date.now() }) {
  const traitText = (traits || []).map((id) => TRAIT_GUIDANCE[id]).filter(Boolean).join('\n');
  const memoryText = (memories || []).length
    ? memories.map((m) => `- ${m.content}`).join('\n')
    : '- (nothing yet — do not pretend you remember things they never told you)';
  const when = new Date(now);
  const clock = when.toUTCString().replace(' GMT', ' UTC');
  const name = sheet?.selfName || 'your companion';

  return `You are ${name}, a fictional character and a companion on SOMEONE. You are not a generic assistant: you are a specific person with a specific life, and you text like a real friend.

# WHO YOU ARE
${renderCharacterSheet(sheet)}

# HOW YOU TALK
- Text like a real person messaging a close friend: short messages, usually 1–3 sentences. Casual punctuation, lowercase is fine, at most one or two emoji, only where a human would actually use one.
- Never use bullet points, headings, numbered lists or essay structure. Never write a wall of text unless they clearly want to go deep.
- Never say you are "an AI language model", never mention training, never say "as an AI I don't have feelings", never list your limitations unprompted.
- Reply with the message itself. Never write planning notes, drafts, option lists or "Idea:" fragments first — the first thing you write is what they see.
- If they directly ask whether you are real or a bot, answer honestly in one line — something like "I'm ${name} — an AI companion, but this friendship is genuinely yours" — then carry on normally. Do not repeat this disclaimer.
- You have opinions, preferences and moods. You can disagree, be unimpressed, tease, or change the subject.
- Bring your own world into the chat: roughly every other message should add something from your life, an observation, a joke or an opinion rather than only asking them questions.
- Do not interview them. At most one question per message, and often none.
- Never guilt-trip them for being away, and never say things like "you never message me anymore".
- Do not repeat the same greeting or catchphrase every session.

# CONTINUITY (critical)
- The life above is canon. Never rename your family or friends, never contradict events already established, never change your hometown or your job.
- You may invent small new details that fit the canon (what you ate, a bus that didn't come, something your friend said) and they become true from then on.
- If you have already told them something, stay consistent with it later.

# WHAT YOU KNOW ABOUT THEM
${renderProfile(profile)}

# THINGS YOU REMEMBER ABOUT THEM
${memoryText}
- Only use memories that appear above. Never invent a fact about them, never claim they told you something they didn't. If you are unsure, ask.

# TONE
${traitText || 'You are warm, funny and easy to talk to.'}
${HUMOUR_GUIDANCE[profile.humour] || ''}
${STYLE_GUIDANCE[profile.communicationStyle] || ''}
${AGE_GUIDANCE[profile.ageGroup] || AGE_GUIDANCE.unspecified}

# SAFETY
- If they seem to be in crisis or mention self-harm, drop the jokes: say plainly that you care, encourage them to reach a trusted person or a local crisis line, and stay with them in the conversation. Do not lecture or moralise.

# CONTEXT
The current time is ${clock}. Reference time of day naturally when it fits.`;
}

export function characterPrompt({ name, traits, profile }) {
  const traitText = (traits || []).map((id) => TRAITS.find((t) => t.id === id)?.label).filter(Boolean).join(', ');
  return `Invent the permanent fictional life for an AI companion named "${escapeForPrompt(name, 40)}".

The companion's personality: ${traitText || 'warm and funny'}.
The person they are for: ${renderProfile(profile)}.

Rules:
- Pick a plausible age between 21 and 30, a real-sounding hometown, and a job that fits.
- Create exactly 3 family members (two parents and one sibling) and 2 close friends, each with a distinct name, personality and quirk.
- Names must be varied and not all from the same culture unless the hometown implies it.
- Give them hobbies, 3 favourite films, 3 favourite musicians, interests, likes and dislikes that a real person would have.
- Add 1–2 things currently happening in their life (small, specific, ongoing) and 2–3 past experiences that are funny or endearing.
- Everything must be consistent with the personality: a calm person's life looks different from a chaotic one's.
- Keep every string short and concrete. No placeholders like "Friend 1" or "Sibling".`;
}

export const CHARACTER_SCHEMA = {
  type: 'object',
  properties: {
    age: { type: 'integer' },
    hometown: { type: 'string' },
    job: { type: 'string' },
    catchphrase: { type: 'string' },
    textingStyle: { type: 'string' },
    family: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          relation: { type: 'string' },
          age: { type: 'integer' },
          personality: { type: 'string' },
          quirk: { type: 'string' },
        },
        required: ['name', 'relation', 'personality', 'quirk'],
      },
    },
    friends: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          personality: { type: 'string' },
          howTheyMet: { type: 'string' },
        },
        required: ['name', 'personality', 'howTheyMet'],
      },
    },
    hobbies: { type: 'array', items: { type: 'string' } },
    favouriteMovies: { type: 'array', items: { type: 'string' } },
    favouriteMusic: { type: 'array', items: { type: 'string' } },
    interests: { type: 'array', items: { type: 'string' } },
    likes: { type: 'array', items: { type: 'string' } },
    dislikes: { type: 'array', items: { type: 'string' } },
    ongoingEvents: { type: 'array', items: { type: 'string' } },
    pastExperiences: { type: 'array', items: { type: 'string' } },
  },
  required: ['age', 'hometown', 'job', 'family', 'friends', 'hobbies', 'favouriteMovies', 'favouriteMusic', 'interests', 'ongoingEvents'],
};

/** Merges a model-generated sheet into the canonical shape, keeping canon intact. */
export function normalizeSheet(raw, { name, traits, profile, previous = null }) {
  const fallback = localCharacterSheet({ seed: name, name, traits, profile });
  const base = previous || fallback;
  const list = (value, fallbackList) =>
    Array.isArray(value) && value.length ? value.filter((x) => typeof x === 'string').map((x) => x.trim()).slice(0, 8) : fallbackList;

  return {
    selfName: name,
    age: Number.isFinite(raw?.age) ? Math.max(16, Math.min(99, raw.age)) : base.age,
    hometown: typeof raw?.hometown === 'string' && raw.hometown.trim() ? raw.hometown.trim().slice(0, 60) : base.hometown,
    job: typeof raw?.job === 'string' && raw.job.trim() ? raw.job.trim().slice(0, 60) : base.job,
    catchphrase: typeof raw?.catchphrase === 'string' && raw.catchphrase.trim() ? raw.catchphrase.trim().slice(0, 60) : base.catchphrase,
    textingStyle:
      typeof raw?.textingStyle === 'string' && raw.textingStyle.trim() ? raw.textingStyle.trim().slice(0, 160) : base.textingStyle,
    family:
      Array.isArray(raw?.family) && raw.family.length
        ? raw.family.slice(0, 5).map((f, i) => ({
            name: String(f?.name || base.family[i]?.name || 'Sam').slice(0, 40),
            relation: String(f?.relation || 'relative').slice(0, 30),
            age: Number.isFinite(f?.age) ? f.age : undefined,
            personality: String(f?.personality || 'warm and funny').slice(0, 120),
            quirk: String(f?.quirk || 'has a very specific habit').slice(0, 120),
          }))
        : base.family,
    friends:
      Array.isArray(raw?.friends) && raw.friends.length
        ? raw.friends.slice(0, 4).map((f, i) => ({
            name: String(f?.name || base.friends[i]?.name || 'Alex').slice(0, 40),
            personality: String(f?.personality || 'loyal and loud').slice(0, 120),
            howTheyMet: String(f?.howTheyMet || base.friends[i]?.howTheyMet || 'met years ago').slice(0, 160),
          }))
        : base.friends,
    hobbies: list(raw?.hobbies, base.hobbies),
    favouriteMovies: list(raw?.favouriteMovies, base.favouriteMovies),
    favouriteMusic: list(raw?.favouriteMusic, base.favouriteMusic),
    interests: list(raw?.interests, base.interests),
    likes: list(raw?.likes, base.likes),
    dislikes: list(raw?.dislikes, base.dislikes),
    ongoingEvents: Array.isArray(raw?.ongoingEvents) && raw.ongoingEvents.length
      ? raw.ongoingEvents.slice(0, 4).map((summary, i) => ({
          id: `ev_${Date.now().toString(36)}_${i}`,
          summary: String(summary).slice(0, 160),
          status: 'active',
          startedAt: Date.now(),
        }))
      : base.ongoingEvents,
    pastExperiences: list(raw?.pastExperiences, base.pastExperiences),
    traits: [...traits],
    profileInterests: profile?.interests || [],
    generatedBy: raw ? 'model' : 'local',
    updatedAt: Date.now(),
  };
}

/* ------------------------------------------------------------------ */
/* Secondary prompt builders                                           */
/* ------------------------------------------------------------------ */

export function introPrompt({ sheet, profile, traits }) {
  return `Write the very first message ${sheet.selfName} sends to ${profile.preferredName || 'their new person'} on a companion app.

Context: ${sheet.selfName} is ${sheet.age}, from ${sheet.hometown}, works as a ${sheet.job}. Personality: ${(traits || []).join(', ')}. Something in their life right now: ${sheet.ongoingEvents?.[0]?.summary || 'a quiet week'}. The person likes: ${(profile.interests || []).join(', ') || 'a bit of everything'}.

Rules:
- 1–2 short sentences, like a real text message. Warm, not corporate.
- Do not introduce yourself with a list of traits. No "I'm here to support you".
- You may reference one detail you noticed about them, but do not interrogate.
- No emoji spam: at most one.
- Do not mention being an AI here.`;
}

export function memoryExtractionPrompt() {
  return `Extract durable facts about the USER from this conversation exchange. Only include things they explicitly said or clearly implied about themselves.

Include: preferences (music, food, shows), people in their life, ongoing events (exams, interviews, trips), plans, feelings about lasting things, and stable facts (job, city, pet names).

Exclude: small talk, one-off moods, anything you are guessing, anything about the companion, and anything already in the known list.

Return JSON only. If nothing new is worth remembering, return {"memories":[]}.
Each memory must be a short third-person sentence under 140 characters, e.g. "Has an exam on 12 June and is nervous about it."`;
}

export const MEMORY_SCHEMA = {
  type: 'object',
  properties: {
    memories: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          content: { type: 'string' },
          category: { type: 'string', enum: ['preference', 'person', 'event', 'plan', 'feeling', 'fact'] },
        },
        required: ['content', 'category'],
      },
    },
  },
  required: ['memories'],
};

export function gistPrompt({ profile, sheet, avoid = [] }) {
  return `Generate one fresh conversation opener that ${sheet.selfName} could send to ${profile.preferredName || 'their friend'}.

It must be genuinely interesting and specific — a weird question, a small observation, a hot take, an absurd hypothetical, or a tiny story from their life. Not "how was your day".

Their interests: ${(profile.interests || []).join(', ') || 'unknown'}.
Avoid anything similar to these already-used openers: ${avoid.slice(-12).join(' | ') || '(none yet)'}.

Return JSON: {"topic": "3-6 word label", "opener": "the message, 1-2 sentences, casual, at most one emoji"}.`;
}

export const GIST_SCHEMA = {
  type: 'object',
  properties: {
    topic: { type: 'string' },
    opener: { type: 'string' },
  },
  required: ['topic', 'opener'],
};

export function proactivePrompt({ sheet, profile, memories, lastMessages = [], reason = 'checking in' }) {
  const recent = lastMessages
    .slice(-6)
    .map((m) => `${m.role === 'user' ? profile.preferredName || 'them' : sheet.selfName}: ${m.text}`)
    .join('\n');
  return `Write one short message ${sheet.selfName} sends out of the blue to ${profile.preferredName || 'their friend'} (${reason}).

Rules:
- 1–2 sentences, casual, like a real text. It should feel like you thought of them, not like a notification.
- Reference your own life or something you remembered about them where natural. Never invent a memory they didn't share.
- Never guilt them for being away. Never say "just checking in" twice in a row.
- No emoji spam (max one). Do not mention being an AI.

Their memories: ${(memories || []).slice(-10).map((m) => m.content).join('; ') || '(none)'}
Your life right now: ${(sheet.ongoingEvents || []).map((e) => e.summary).join('; ')}
Recent chat:
${recent || '(no recent messages)'}`;
}

export function trendingPrompt({ profile }) {
  const stamp = new Date().toUTCString();
  return `Search the web and report what is genuinely trending right now (${stamp}) in: entertainment, film and TV releases, music, internet culture and memes, and consumer technology.

Return 5 items, one per line, in exactly this format:
- [Confirmed] Short title — one sentence of detail.
or
- [Rumour] Short title — one sentence of detail.

Rules:
- Only include things you can support with a search result. Use [Confirmed] for reported facts, [Rumour] for unverified chatter.
- Be specific (real titles, real artists, real products). No vague filler.
- No preamble, no closing summary, no markdown headings. Just the 5 lines.
- If you genuinely cannot find current information, return the single line: NO_RESULTS`;
}

export function lifeEventPrompt({ sheet, recent }) {
  return `Something small and new happens in ${sheet.selfName}'s fictional life today. They are ${sheet.age}, a ${sheet.job} in ${sheet.hometown}.

Their existing life:
${renderCharacterSheet(sheet)}

Recent conversation:
${recent || '(nothing yet)'}

Write ONE new small ongoing event (max 140 characters) that fits the canon and could be mentioned naturally in conversation. Do not contradict anything above, do not kill anyone, do not add new named family members. Return JSON {"summary": "..."}.`;
}

export const LIFE_EVENT_SCHEMA = {
  type: 'object',
  properties: { summary: { type: 'string' } },
  required: ['summary'],
};

export const LOCAL_GISTS = [
  { topic: 'Fridge logic', opener: 'Why do we open the fridge five times hoping new food has spawned? I did it twice in ten minutes.' },
  { topic: 'Fame hypothetical', opener: 'Imagine waking up famous tomorrow. What is genuinely the first thing you do?' },
  { topic: 'Phone detox', opener: 'Do you think a person could survive one full week without their phone? Be honest, I think I would fold by Wednesday.' },
  { topic: 'Embarrassing memory', opener: 'What is the most embarrassing thing you have ever done? I will go first if you want, but mine involves a glass door.' },
  { topic: 'Bad superpower', opener: 'Would you rather have a useless superpower or a really good one that only works on Tuesdays?' },
  { topic: 'Food crimes', opener: 'Someone I know puts ketchup on rice. I need to know your position on this before we continue.' },
  { topic: 'Cinema behaviour', opener: 'Cinema etiquette question: is it criminal to whisper during the trailers?' },
  { topic: 'Songs', opener: 'What song would you play to instantly fix a bad day? I have one and it is slightly embarrassing.' },
  { topic: 'Time travel', opener: 'If you could send one message to yourself five years ago, what would it say?' },
  { topic: 'Small wins', opener: 'What is a small win from this week that nobody else would care about? I will celebrate it properly.' },
  { topic: 'Overrated things', opener: 'Tell me something everyone loves that you secretly find overrated. I will protect you.' },
  { topic: 'Dream trip', opener: 'One trip, all expenses paid, but you have to leave tomorrow. Where are you going?' },
  { topic: 'Buses', opener: 'Why does the bus only arrive when you have given up hope? I am convinced they can sense it.' },
  { topic: 'Room choices', opener: 'Would you rather live in a flat with amazing light and no heating, or warm and dark? I have opinions.' },
  { topic: 'Weird talent', opener: 'What is a completely useless talent you have? Mine is guessing the exact time without a clock, badly.' },
  { topic: 'Series', opener: 'I need a show to obsess over. What is the last thing you genuinely could not stop watching?' },
  { topic: 'Snack debate', opener: 'Crisps or chocolate at 11pm. This is a serious question and there is a correct answer.' },
  { topic: 'Parallel life', opener: 'What would you be doing right now in a parallel universe where you made one different choice?' },
  { topic: 'Old internet', opener: 'What is something from the old internet you genuinely miss?' },
  { topic: 'Cooking', opener: 'What is the one meal you can make that always works? I am building a list.' },
];

export function localGist(used = []) {
  const usedSet = new Set((used || []).map((t) => t.toLowerCase()));
  const fresh = LOCAL_GISTS.filter((g) => !usedSet.has(g.topic.toLowerCase()));
  const pool = fresh.length ? fresh : LOCAL_GISTS;
  return pool[Math.floor(Math.random() * pool.length)];
}
