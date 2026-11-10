// The demo challenge: a public, rolling challenge whose other members are samples, so anyone
// (Buffer's judges first) can join alone and see Daydeck at work. `tickDemo` keeps it alive: each
// run brings it up to "now". Sample members post on most days and start a new round when they
// finish, the chat gets a few new messages through the day, someone shares a post, and drafts get
// feedback. Everything follows from the date, so a run repeated at the same moment changes nothing.
//
// It writes only as sample people (Buffer IDs starting with "demo-"), never as a real person,
// and only in the demo challenge. Real people who joined keep everything they did.
//
// No relative imports, so plain Node.js can load this file from scripts/demo.ts.
import { randomBytes } from "node:crypto";

type Row = Record<string, unknown>;

/** What both node-postgres and PGlite can do: run one SQL statement with parameters. */
export interface Queryable {
  query(text: string, params?: unknown[]): Promise<{ rows: Row[] }>;
}

export const DEMO_TITLE = "Daydeck demo: build in public";
export const DEMO_TIME_ZONE = "Europe/London";
export const SAMPLE_HOST_ID = "demo-host";
export const MEMBER_PREFIX = "demo-member-";
const PROMPT_SET = "starter-build-in-public-week";
/** A finished member rests this many days, then starts a new round. */
const REST_DAYS = 1;
/** Sample messages older than this many days are removed, so the chat never shows a repeat. */
export const HISTORY_DAYS = 6;
/** How many past days of chat a new demo starts with. */
const BACKFILL_DAYS = 3;
/** Open sample feedback requests close after this many days. */
const FEEDBACK_DAYS = 3;
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

// --- Sample people -------------------------------------------------------------------------------

interface Person {
  key: string;
  name: string;
  colors: [string, string];
  /** Days since their day 1 when they first join, so the board starts with people at all stages. */
  ago: number;
  /** Shows their name on the public recap. */
  named: boolean;
  /** How often they post on the day. */
  reliability: number;
  /** Schedules today's post in Buffer instead of saving a draft. */
  planner: boolean;
}

const HOST: Person = {
  key: "host",
  name: "Hannah Lewis",
  colors: ["#16a34a", "#0d9488"],
  ago: 5,
  named: true,
  reliability: 0.95,
  planner: true,
};

const MEMBERS: Person[] = [
  {
    key: "liam",
    name: "Liam Turner",
    colors: ["#2563eb", "#7c3aed"],
    ago: 6,
    named: true,
    reliability: 0.9,
    planner: true,
  },
  {
    key: "olivia",
    name: "Olivia Bennett",
    colors: ["#db2777", "#f97316"],
    ago: 5,
    named: true,
    reliability: 0.75,
    planner: false,
  },
  {
    key: "noah",
    name: "Noah Patel",
    colors: ["#059669", "#0891b2"],
    ago: 4,
    named: true,
    reliability: 0.85,
    planner: true,
  },
  {
    key: "sophie",
    name: "Sophie Walker",
    colors: ["#9333ea", "#ec4899"],
    ago: 4,
    named: true,
    reliability: 0.9,
    planner: false,
  },
  {
    key: "james",
    name: "James Carter",
    colors: ["#ea580c", "#facc15"],
    ago: 3,
    named: false,
    reliability: 0.6,
    planner: false,
  },
  {
    key: "mia",
    name: "Mia Hughes",
    colors: ["#0d9488", "#22c55e"],
    ago: 2,
    named: true,
    reliability: 0.85,
    planner: true,
  },
  {
    key: "oliver",
    name: "Oliver Reed",
    colors: ["#475569", "#0ea5e9"],
    ago: 1,
    named: true,
    reliability: 0.8,
    planner: false,
  },
  {
    key: "grace",
    name: "Grace Morgan",
    colors: ["#be123c", "#a855f7"],
    ago: 0,
    named: true,
    reliability: 0.9,
    planner: true,
  },
];

// --- What sample people say ----------------------------------------------------------------------

/** Chat threads: a message and the replies to it, each from a different person. Two a day. */
const CHAT_THREADS: string[][] = [
  [
    "Morning all! Today's draft is in Buffer before my first coffee. Who else is on it?",
    "Me! Mine is scheduled for lunch.",
    "Writing mine on the train. Ten minutes, then it goes in Buffer.",
  ],
  [
    "I missed yesterday. Does it still count if I post it today?",
    "Yes, it counts as caught up. The board shows it with a small dot.",
  ],
  [
    "Tip: I write three drafts on Sunday and let Daydeck check them off as they go out.",
    "Stealing this for next week.",
  ],
  [
    "Did the AI pick the right day for anyone else's post written straight in Buffer?",
    "Mine too. It matched my thread to the right day on its own.",
    "It asked me once when it was not sure. One tap and done.",
  ],
  [
    "Today's prompt was harder than I thought. Took me three tries to keep it short.",
    "Short is hard. The second try is usually the one.",
  ],
  ["Posted at 7 and two people already replied. Small wins.", "Love that! Mine goes out at noon."],
  [
    "Anyone else using Plan my week? It filled my free slots in two minutes.",
    "Yes, it put my posts in my usual Buffer times. Saves me a lot.",
  ],
  [
    "Halfway there. Who is still on a streak?",
    "Four in a row here 🔥",
    "Three, after one catch-up day.",
  ],
  [
    "Question: do you write in Buffer or here first?",
    "Buffer. Daydeck saves the prompt as a draft, then I finish it there.",
  ],
  [
    "Shared today's post in Posts if anyone wants to take a quick look.",
    "Just did. Great opening line.",
  ],
  ["I am away tomorrow, so I scheduled two posts tonight.", "Good call. Future you says thanks."],
  [
    "What time do you all post? Mornings get more replies for me.",
    "Lunch for me. Evenings were quiet.",
    "Mornings too, before 9.",
  ],
  ["First round done! Feels good to see a full row on the board.", "Congrats! 🎉"],
  [
    "Today's prompt made me write about an old mistake. Felt good to share it.",
    "Those are the posts people remember.",
  ],
];

const SHARES: {
  slug: string;
  title: string;
  description: string;
  emoji: string;
  gradient: [string, string, string];
  body: string;
}[] = [
  {
    slug: "the-bug-that-took-3-days",
    title: "The bug that took 3 days and one line to fix",
    description: "What went wrong, what I learned, and the one-line fix.",
    emoji: "🐛",
    gradient: ["#0a66c2", "#1e3a8a", "#38bdf8"],
    body: "Today's post: the bug that took three days and one line to fix",
  },
  {
    slug: "what-i-cut-from-the-launch",
    title: "What I cut from the launch",
    description:
      "We cut 4 features to ship on time. Here is the list, and why none of them mattered.",
    emoji: "✂️",
    gradient: ["#0f172a", "#334155", "#a855f7"],
    body: "What I cut from the launch, and why it was the right call",
  },
  {
    slug: "5-lessons-from-a-week-of-posting",
    title: "5 lessons from a week of posting",
    description: "Five things a week of daily posts taught me about writing short.",
    emoji: "🎠",
    gradient: ["#16a34a", "#0f766e", "#bbf7d0"],
    body: "My first carousel ever. Be kind 🙏",
  },
  {
    slug: "my-desk-on-a-tuesday",
    title: "A look at my desk on a Tuesday",
    description: "The notebook, the sticky notes and the plan that survived the week.",
    emoji: "🗒️",
    gradient: ["#92400e", "#451a03", "#fcd34d"],
    body: "Behind the scenes today: my messy desk",
  },
  {
    slug: "why-i-post-before-9",
    title: "Why I post before 9",
    description: "Three weeks of numbers: my morning posts got twice the replies.",
    emoji: "☀️",
    gradient: ["#c2410c", "#7c2d12", "#fde68a"],
    body: "Shared some numbers on posting times today",
  },
  {
    slug: "the-tool-i-cannot-work-without",
    title: "The one tool I cannot work without",
    description: "It is not fancy. It is a text file, and it runs my week.",
    emoji: "🧰",
    gradient: ["#1e293b", "#0f172a", "#38bdf8"],
    body: "Today's prompt: the tool I cannot work without",
  },
  {
    slug: "we-chose-boring-tech",
    title: "We chose boring tech, and it paid off",
    description: "A decision, its trade-off, and what we would do again.",
    emoji: "⚖️",
    gradient: ["#3f3f46", "#18181b", "#a3e635"],
    body: "A decision and its trade-off, in one post",
  },
];

const DRAFTS = [
  "The hardest bug I fixed this month.\n\nOur checkout broke for 2% of people, and only on Fridays. It took me two days to see it: a time zone. Lesson: test the boring edges first.",
  "Three drafts every Sunday. That is my whole system for posting daily without burning out.\n\n1. Sunday evening, I write three rough drafts in Buffer.\n2. Each morning, I pick one and finish it in ten minutes.\n3. I post, then reply to two people before I close the app.\n\nWhat keeps you posting?",
  "We said no to our biggest customer's feature request this week.\n\nIt would have taken a month and helped one team. Saying no was hard. Saying yes would have been harder.",
  "I used to wait until a post was perfect. Then I waited a lot.\n\nNow I post when it is clear, not when it is perfect. Clear is enough.",
  "A small win from today: the first person I do not know replied to my post. It was one line. It made my week.",
  "What I am building, and why: a tiny app that reminds my team to share one thing they learned every Friday.",
];

const REPLIES = [
  "Great hook. I would put your best line first: it makes people stop scrolling.",
  "Love it. Maybe end with a question, so people reply?",
  "Short and clear. I would cut the second sentence.",
  "This is good. One example would make it even better.",
  "The last line is the strongest. Could it be the first?",
  "Really relatable. I would post it as it is.",
  "Nice! A number in the first line would grab attention.",
  "Clear and honest. Maybe add what you would do differently?",
];

/** What the sample host posts in Updates, every other day. Never written as a real host. */
const UPDATES = [
  "Welcome to everyone who joined this week! Your day 1 is the day you join, so start with today's prompt.",
  "Nice streaks on the board. Tip: post straight in Buffer if you like, and Daydeck's AI works out which day it is for.",
  "Reminder: missed a day? Post it any time and it counts as caught up.",
  "Try Plan my week on the Schedule page: it puts your next prompts into your free Buffer times.",
  "Want a second pair of eyes? Ask the group for feedback on a draft from your challenge page.",
];

const EMOJIS = ["🔥", "👏", "❤️", "💡", "🙌", "😂", "👍"];

// --- Helpers -------------------------------------------------------------------------------------

/** A number from 0 to 1 that depends only on the parts: the same parts, the same number. */
function chance(...parts: (string | number)[]): number {
  let hash = 0x811c9dc5;
  for (const char of parts.join("|")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash / 2 ** 32;
}

function pick<T>(list: T[], ...parts: (string | number)[]): T {
  return list[Math.floor(chance(...parts) * list.length)] as T;
}

const partsFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: DEMO_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** The demo's local date ("2026-11-10") and time of day at `at`. */
function localParts(at: Date): { date: string; minutes: number } {
  const get = (type: string) =>
    partsFormat.formatToParts(at).find((part) => part.type === type)?.value ?? "00";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

function addDays(date: string, days: number): string {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
}

/** The moment that is `minutes` after midnight on `date`, in the demo's time zone. */
function at(date: string, minutes: number): Date {
  const guess = Date.parse(`${date}T00:00:00Z`) + minutes * MINUTE;
  const wall = localParts(new Date(guess));
  const wallMs = Date.parse(`${wall.date}T00:00:00Z`) + wall.minutes * MINUTE;
  return new Date(guess - (wallMs - guess));
}

function svgUri(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function avatar(person: Person): string {
  const [a, b] = person.colors;
  const initials = person.name
    .split(" ")
    .map((part) => part[0])
    .join("");
  return svgUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="64" height="64" fill="url(#g)"/><text x="32" y="41" font-family="Helvetica, Arial, sans-serif" font-size="24" font-weight="700" fill="#ffffff" text-anchor="middle">${initials}</text></svg>`,
  );
}

/** A link card picture: one big emoji in the middle, so it still reads in a narrow thumbnail. */
function cardImage(emoji: string, [a, b, accent]: [string, string, string]): string {
  return svgUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="1200" height="630" fill="url(#g)"/><circle cx="600" cy="315" r="200" fill="${accent}" opacity="0.3"/><text x="600" y="315" font-size="220" text-anchor="middle" dominant-baseline="central">${emoji}</text></svg>`,
  );
}

/** A sample post link. example.com is reserved for examples, so it never points at a real person. */
function sampleLink(key: string, path: string): string {
  return `https://example.com/daydeck-demo/${key}/${path}`;
}

const str = (value: unknown) => String(value);

// --- Creating and removing the demo ------------------------------------------------------------

/** The demo challenge, without changing anything: by its invite code, else by the sample host. */
export async function findDemo(
  db: Queryable,
  input: { inviteCode?: string },
): Promise<{ id: string; inviteCode: string } | null> {
  const { rows } = input.inviteCode
    ? await db.query("select id, invite_code from challenges where invite_code = $1", [
        input.inviteCode,
      ])
    : await db.query(
        `select c.id, c.invite_code from challenges c join users u on u.id = c.host_user_id
         where u.buffer_account_id = $1 and c.title = $2 order by c.created_at desc limit 1`,
        [SAMPLE_HOST_ID, DEMO_TITLE],
      );
  return rows[0] ? { id: str(rows[0].id), inviteCode: str(rows[0].invite_code) } : null;
}

/**
 * Finds the demo challenge, or creates it: by its invite code when given, else by the host and
 * title. The host is a real account (its Buffer ID) or the sample host. Leaves it listed, open
 * and joinable.
 */
export async function ensureDemo(
  db: Queryable,
  input: { now: Date; inviteCode?: string; hostBufferAccountId?: string },
): Promise<{ id: string; inviteCode: string; created: boolean }> {
  const today = localParts(input.now).date;
  let hostId: string;
  if (input.hostBufferAccountId) {
    const { rows } = await db.query("select id from users where buffer_account_id = $1", [
      input.hostBufferAccountId,
    ]);
    if (!rows[0]) {
      throw new Error("No Daydeck account has that Buffer ID yet. Sign in with it once first.");
    }
    hostId = str(rows[0].id);
  } else {
    hostId = await upsertSampleUser(db, SAMPLE_HOST_ID, HOST);
  }

  const { rows: found } = input.inviteCode
    ? await db.query("select id, invite_code from challenges where invite_code = $1", [
        input.inviteCode,
      ])
    : await db.query(
        "select id, invite_code from challenges where host_user_id = $1 and title = $2 order by created_at desc limit 1",
        [hostId, DEMO_TITLE],
      );
  if (found[0]) {
    await db.query(
      `update challenges set status = 'open', closed_at = null, visibility = 'public', invite_paused = false,
         show_on_home = true, chat_enabled = true where id = $1`,
      [found[0].id],
    );
    return { id: str(found[0].id), inviteCode: str(found[0].invite_code), created: false };
  }

  const suffix = randomBytes(4)
    .toString("base64url")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "x");
  const inviteCode = randomBytes(16).toString("base64url");
  const opened = addDays(today, -HOST.ago);
  const { rows } = await db.query(
    `insert into challenges (slug, host_user_id, title, cadence, start_mode, start_date, timezone,
       visibility, show_on_home, chat_enabled, invite_code, tag_name, created_at)
     values ($1, $2, $3, 'daily', 'rolling', $4, $5, 'public', true, true, $6, 'Daydeck: demo', $7)
     returning id`,
    [
      `daydeck-demo-build-in-public-${suffix}`,
      hostId,
      DEMO_TITLE,
      opened,
      DEMO_TIME_ZONE,
      inviteCode,
      at(opened, 8 * 60),
    ],
  );
  const id = str(rows[0]?.id);
  const prompts = await db.query(
    `insert into challenge_prompts (challenge_id, day_index, title, description, body, emoji)
     select $1, p.position, p.title, p.description, p.body, p.emoji
     from prompts p join prompt_sets s on s.id = p.prompt_set_id where s.slug = $2
     returning id`,
    [id, PROMPT_SET],
  );
  if (prompts.rows.length === 0) {
    throw new Error(`The "${PROMPT_SET}" prompts are missing. Run db:migrate first.`);
  }
  await joinAsSample(db, id, hostId, HOST, opened, "host");
  return { id, inviteCode, created: true };
}

/** Closes the demo (Daydeck deletes it 30 days later) and removes the sample members. */
export async function removeDemo(
  db: Queryable,
  input: { now: Date; challengeId: string | null },
): Promise<{ removed: number }> {
  if (input.challengeId) {
    await db.query(
      `update challenges set status = 'closed', closed_at = $2, show_on_home = false,
         board_version = board_version + 1 where id = $1 and status = 'open'`,
      [input.challengeId, input.now],
    );
  }
  const { rows } = await db.query(
    "delete from users where buffer_account_id like $1 returning id",
    [`${MEMBER_PREFIX}%`],
  );
  return { removed: rows.length };
}

async function upsertSampleUser(db: Queryable, bufferAccountId: string, person: Person) {
  const { rows } = await db.query(
    `insert into users (buffer_account_id, name, avatar_url, timezone) values ($1, $2, $3, $4)
     on conflict (buffer_account_id) do update set name = excluded.name, avatar_url = excluded.avatar_url
     returning id`,
    [bufferAccountId, person.name, avatar(person), DEMO_TIME_ZONE],
  );
  return str(rows[0]?.id);
}

async function joinAsSample(
  db: Queryable,
  challengeId: string,
  userId: string,
  person: Person,
  dayOne: string,
  role: "host" | "participant",
): Promise<void> {
  const { rows } = await db.query(
    `insert into participants (challenge_id, user_id, role, joined_at, day_one, timezone, wall_opt_in)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (challenge_id, user_id) do nothing returning id`,
    [challengeId, userId, role, at(dayOne, 7 * 60 + 30), dayOne, DEMO_TIME_ZONE, person.named],
  );
  if (!rows[0]) return;
  await db.query(
    `insert into entries (participant_id, challenge_prompt_id)
     select $1, id from challenge_prompts where challenge_id = $2
     on conflict do nothing`,
    [rows[0].id, challengeId],
  );
}

// --- Keeping it alive ------------------------------------------------------------------------------

interface Sample {
  person: Person;
  userId: string;
  participantId: string;
  dayOne: string;
  /** Entry IDs in day order. */
  entries: string[];
}

export interface TickResult {
  /** Rows written or removed. Zero means the demo was already up to date. */
  changes: number;
  /** The same, by part, for the job's log. */
  detail: Record<string, number>;
}

/**
 * Brings the demo up to `now`: everyone's days, today's chat so far, the day's shared post,
 * feedback on drafts, and the host's updates. Safe to run as often as wanted.
 */
export async function tickDemo(
  db: Queryable,
  input: { now: Date; challengeId: string },
): Promise<TickResult> {
  const { now, challengeId } = input;
  const today = localParts(now).date;
  const detail: Record<string, number> = {};
  const total = () => Object.values(detail).reduce((sum, value) => sum + value, 0);

  const { rows: challengeRows } = await db.query(
    `select c.status, u.buffer_account_id as host_account, c.host_user_id
     from challenges c join users u on u.id = c.host_user_id where c.id = $1`,
    [challengeId],
  );
  const challenge = challengeRows[0];
  if (!challenge || challenge.status !== "open") return { changes: 0, detail };
  const sampleHost = challenge.host_account === SAMPLE_HOST_ID;

  // Everyone sample, joined: members first time with their staggered start.
  for (const person of MEMBERS) {
    const userId = await upsertSampleUser(db, `${MEMBER_PREFIX}${person.key}`, person);
    await joinAsSample(db, challengeId, userId, person, addDays(today, -person.ago), "participant");
  }
  const samples = await loadSamples(db, challengeId, sampleHost);
  const days = samples[0]?.entries.length ?? 0;
  if (days === 0) return { changes: 0, detail };

  // A member who finished and rested starts a new round today.
  for (const sample of samples) {
    if (daysBetween(sample.dayOne, today) < days + REST_DAYS) continue;
    await db.query("delete from entry_posts where entry_id = any($1)", [sample.entries]);
    await db.query("update entries set state = 'open', buffer_idea_id = null where id = any($1)", [
      sample.entries,
    ]);
    await db.query(
      `update feedback_requests set status = 'closed' where requester_id = $1 and status = 'open'`,
      [sample.participantId],
    );
    await db.query("update participants set day_one = $2, joined_at = $3 where id = $1", [
      sample.participantId,
      today,
      at(today, 7 * 60 + 30),
    ]);
    sample.dayOne = today;
    detail.rounds = (detail.rounds ?? 0) + 1;
  }

  detail.days = await updateDays(db, samples, now, days);
  detail.chat = await updateChat(db, challengeId, samples, now, sampleHost);
  detail.share = await updateShare(db, challengeId, samples, now);
  detail.feedback = await updateFeedback(db, samples, now);
  if (sampleHost) detail.updates = await updateHostNews(db, challengeId, samples, now);

  // Older sample messages go, so the chat never repeats itself. Real people's stay.
  const { rows: trimmed } = await db.query(
    `delete from messages where challenge_id = $1 and created_at < $2
       and author_id = any($3) returning id`,
    [challengeId, new Date(now.getTime() - HISTORY_DAYS * DAY), samples.map((s) => s.userId)],
  );
  detail.trimmed = trimmed.length;
  // Link cards are read once and kept a week: keep the sample ones fresh.
  await db.query(
    "update link_previews set fetched_at = $1 where url like 'https://example.com/daydeck-demo/%'",
    [now],
  );

  const changes = total();
  if (changes > 0) {
    await db.query(
      `update challenges set board_version = board_version + 1,
         community_version = community_version + 1 where id = $1`,
      [challengeId],
    );
  }
  return { changes, detail };
}

async function loadSamples(
  db: Queryable,
  challengeId: string,
  sampleHost: boolean,
): Promise<Sample[]> {
  const { rows } = await db.query(
    `select p.id as participant_id, p.user_id, p.day_one::text as day_one, u.buffer_account_id,
       array_agg(e.id::text order by cp.day_index) as entries
     from participants p
     join users u on u.id = p.user_id
     join entries e on e.participant_id = p.id
     join challenge_prompts cp on cp.id = e.challenge_prompt_id
     where p.challenge_id = $1 and p.status = 'active'
       and (u.buffer_account_id like $2 or u.buffer_account_id = $3)
     group by p.id, p.user_id, p.day_one, u.buffer_account_id`,
    [challengeId, `${MEMBER_PREFIX}%`, sampleHost ? SAMPLE_HOST_ID : "-"],
  );
  return rows.flatMap((row) => {
    const account = str(row.buffer_account_id);
    const key = account === SAMPLE_HOST_ID ? "host" : account.slice(MEMBER_PREFIX.length);
    const person = key === "host" ? HOST : MEMBERS.find((member) => member.key === key);
    if (!person) return [];
    return [
      {
        person,
        userId: str(row.user_id),
        participantId: str(row.participant_id),
        dayOne: str(row.day_one).slice(0, 10),
        entries: (row.entries as unknown[]).map(str),
      },
    ];
  });
}

/** When this person's post for one day goes out, in minutes after midnight: 8:00 to 20:59. */
function postTime(sample: Sample, day: number): number {
  return 8 * 60 + Math.floor(chance(sample.person.key, sample.dayOne, day, "time") * 13 * 60);
}

type DayPlan =
  | { state: "open" | "missed" }
  | { state: "done" | "caught_up"; sentAt: Date }
  | { state: "planned"; dueAt: Date }
  | { state: "saved" };

/** What one day looks like right now: a post sent, scheduled or saved, or nothing. */
function planDay(sample: Sample, day: number, now: Date): DayPlan {
  const { person, dayOne } = sample;
  const local = localParts(now);
  const index = daysBetween(dayOne, local.date);
  const date = addDays(dayOne, day);
  const time = postTime(sample, day);
  const roll = chance(person.key, dayOne, day, "post");
  if (day < index) {
    if (roll < person.reliability) return { state: "done", sentAt: at(date, time) };
    const late = at(addDays(date, 1), time);
    if (roll < person.reliability + 0.08 && late <= now)
      return { state: "caught_up", sentAt: late };
    return { state: "missed" };
  }
  if (day === index) {
    if (roll >= person.reliability) return { state: "open" };
    if (local.minutes >= time) return { state: "done", sentAt: at(date, time) };
    if (person.planner) return { state: "planned", dueAt: at(date, time) };
    return local.minutes >= 7 * 60 ? { state: "saved" } : { state: "open" };
  }
  // Planners often schedule tomorrow's post the evening before.
  if (day === index + 1 && person.planner && local.minutes >= 19 * 60 && roll < 0.5) {
    return { state: "planned", dueAt: at(date, time) };
  }
  return { state: "open" };
}

async function updateDays(db: Queryable, samples: Sample[], now: Date, days: number) {
  const entryIds = samples.flatMap((sample) => sample.entries);
  const { rows: states } = await db.query("select id, state from entries where id = any($1)", [
    entryIds,
  ]);
  const { rows: posts } = await db.query(
    "select entry_id, status, sent_at, due_at from entry_posts where entry_id = any($1)",
    [entryIds],
  );
  const stateOf = new Map(states.map((row) => [str(row.id), str(row.state)]));
  const postOf = new Map(posts.map((row) => [str(row.entry_id), row]));
  const time = (value: unknown) => (value ? new Date(value as string).getTime() : null);
  let changes = 0;

  for (const sample of samples) {
    for (let day = 0; day < days; day++) {
      const entryId = sample.entries[day];
      if (!entryId) continue;
      const plan = planDay(sample, day, now);
      if (stateOf.get(entryId) !== plan.state) {
        await db.query("update entries set state = $2 where id = $1", [entryId, plan.state]);
        changes += 1;
      }
      const existing = postOf.get(entryId);
      const want =
        plan.state === "done" || plan.state === "caught_up"
          ? { status: "sent", sentAt: plan.sentAt, dueAt: null }
          : plan.state === "planned"
            ? { status: "scheduled", sentAt: null, dueAt: plan.dueAt }
            : plan.state === "saved"
              ? { status: "draft", sentAt: null, dueAt: null }
              : null;
      if (!want) {
        if (existing) {
          await db.query("delete from entry_posts where entry_id = $1", [entryId]);
          changes += 1;
        }
        continue;
      }
      const same =
        existing &&
        existing.status === want.status &&
        time(existing.sent_at) === (want.sentAt?.getTime() ?? null) &&
        time(existing.due_at) === (want.dueAt?.getTime() ?? null);
      if (same) continue;
      await db.query(
        `insert into entry_posts (entry_id, channel_id, buffer_post_id, status, match_source,
           sent_at, due_at, external_link)
         values ($1, $2, $3, $4, 'app', $5, $6, $7)
         on conflict (entry_id, channel_id) do update set status = excluded.status,
           sent_at = excluded.sent_at, due_at = excluded.due_at, external_link = excluded.external_link`,
        [
          entryId,
          `${MEMBER_PREFIX}channel-${sample.person.key}`,
          `${MEMBER_PREFIX}post-${entryId}`,
          want.status,
          want.sentAt,
          want.dueAt,
          want.status === "sent"
            ? sampleLink(sample.person.key, `day-${day + 1}-${sample.dayOne}`)
            : null,
        ],
      );
      changes += 1;
    }
  }
  return changes;
}

/** Writes one sample message once: the same author, text and time is never added twice. */
async function addMessage(
  db: Queryable,
  input: {
    challengeId: string;
    channel: "updates" | "chat" | "posts";
    authorId: string;
    body: string;
    createdAt: Date;
    replyTo?: string | null;
    linkUrl?: string | null;
    entryId?: string | null;
  },
): Promise<{ id: string; added: boolean }> {
  const { rows: existing } = await db.query(
    `select id from messages where challenge_id = $1 and author_id = $2 and body = $3
       and created_at = $4 limit 1`,
    [input.challengeId, input.authorId, input.body, input.createdAt],
  );
  if (existing[0]) return { id: str(existing[0].id), added: false };
  const { rows } = await db.query(
    `insert into messages (challenge_id, channel, kind, author_id, body, link_url, entry_id,
       reply_to_id, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
    [
      input.challengeId,
      input.channel,
      input.channel === "posts" ? "share" : "text",
      input.authorId,
      input.body,
      input.linkUrl ?? null,
      input.entryId ?? null,
      input.replyTo ?? null,
      input.createdAt,
    ],
  );
  return { id: str(rows[0]?.id), added: true };
}

/** One to three reactions from people other than the author. */
async function react(
  db: Queryable,
  messageId: string,
  authorId: string,
  samples: Sample[],
  seed: string,
): Promise<number> {
  const others = samples.filter((sample) => sample.userId !== authorId);
  const count = 1 + Math.floor(chance(seed, "count") * 3);
  let changes = 0;
  for (let index = 0; index < count && index < others.length; index++) {
    const who = pick(others, seed, "who", index);
    const { rows } = await db.query(
      `insert into message_reactions (message_id, user_id, emoji) values ($1, $2, $3)
       on conflict do nothing returning message_id`,
      [messageId, who.userId, pick(EMOJIS, seed, "emoji", index)],
    );
    changes += rows.length;
  }
  return changes;
}

/** Today's two chat threads and the last few days', each message once its time has come. */
async function updateChat(
  db: Queryable,
  challengeId: string,
  samples: Sample[],
  now: Date,
  sampleHost: boolean,
): Promise<number> {
  const today = localParts(now).date;
  // Only sample people chat; a real host is never written as.
  const speakers = samples.filter((sample) => sample.person.key !== "host" || sampleHost);
  let changes = 0;
  for (let back = BACKFILL_DAYS - 1; back >= 0; back--) {
    const date = addDays(today, -back);
    const dayNumber = Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY);
    for (let slot = 0; slot < 2; slot++) {
      const thread = CHAT_THREADS[(dayNumber * 2 + slot) % CHAT_THREADS.length] ?? [];
      let minute = (slot === 0 ? 8 * 60 : 13 * 60) + Math.floor(chance(date, slot, "start") * 150);
      let previous: string | null = null;
      let lastAuthor = "";
      for (const [index, body] of thread.entries()) {
        const choices = speakers.filter((sample) => sample.userId !== lastAuthor);
        const author = pick(choices, date, slot, index, "author");
        const createdAt = at(date, minute);
        if (createdAt > now) break;
        const message = await addMessage(db, {
          challengeId,
          channel: "chat",
          authorId: author.userId,
          body,
          createdAt,
          replyTo: index > 0 ? previous : null,
        });
        if (message.added) {
          changes += 1;
          changes += await react(
            db,
            message.id,
            author.userId,
            samples,
            `${date}-${slot}-${index}`,
          );
        }
        previous = message.id;
        lastAuthor = author.userId;
        minute += 12 + Math.floor(chance(date, slot, index, "gap") * 50);
      }
    }
  }
  return changes;
}

/** Each day, one person shares the post they published, with its link card. */
async function updateShare(
  db: Queryable,
  challengeId: string,
  samples: Sample[],
  now: Date,
): Promise<number> {
  const today = localParts(now).date;
  const dayNumber = Math.floor(Date.parse(`${today}T00:00:00Z`) / DAY);
  const share = SHARES[dayNumber % SHARES.length];
  if (!share) return 0;
  // Someone whose post for today is already out.
  const ordered = [...samples].sort(
    (a, b) => chance(today, a.person.key, "share") - chance(today, b.person.key, "share"),
  );
  for (const sample of ordered) {
    const day = daysBetween(sample.dayOne, today);
    const plan = planDay(sample, day, now);
    if (plan.state !== "done") continue;
    const createdAt = new Date(plan.sentAt.getTime() + 20 * MINUTE);
    if (createdAt > now) continue;
    const link = sampleLink(sample.person.key, `${share.slug}-${today}`);
    await db.query(
      `insert into link_previews (url, status, final_url, title, description, image_url, site_name, fetched_at)
       values ($1, 'ok', $1, $2, $3, $4, 'Sample post', $5)
       on conflict (url) do update set fetched_at = excluded.fetched_at`,
      [link, share.title, share.description, cardImage(share.emoji, share.gradient), now],
    );
    const message = await addMessage(db, {
      challengeId,
      channel: "posts",
      authorId: sample.userId,
      body: `${share.body} ${link}`,
      createdAt,
      linkUrl: link,
      entryId: sample.entries[day] ?? null,
    });
    if (!message.added) return 0;
    return 1 + (await react(db, message.id, sample.userId, samples, `${today}-share`));
  }
  return 0;
}

/** Keeps two drafts open for feedback, with replies from others, and closes old ones. */
async function updateFeedback(db: Queryable, samples: Sample[], now: Date): Promise<number> {
  const local = localParts(now);
  const today = local.date;
  const participantIds = samples.map((sample) => sample.participantId);
  let changes = 0;

  const { rows: closed } = await db.query(
    `update feedback_requests set status = 'closed'
     where requester_id = any($1) and status = 'open' and created_at < $2 returning id`,
    [participantIds, new Date(now.getTime() - FEEDBACK_DAYS * DAY)],
  );
  changes += closed.length;

  const { rows: open } = await db.query(
    `select id, requester_id, created_at from feedback_requests
     where requester_id = any($1) and status = 'open' order by created_at`,
    [participantIds],
  );

  // New requests in the late morning, from people with a draft or scheduled post today, until
  // two are open.
  if (open.length < 2 && local.minutes >= 10 * 60 + 30) {
    const asking = new Set(open.map((row) => str(row.requester_id)));
    const ordered = [...samples]
      .filter((sample) => !asking.has(sample.participantId))
      .sort((a, b) => chance(today, a.person.key, "ask") - chance(today, b.person.key, "ask"));
    for (const sample of ordered) {
      const day = daysBetween(sample.dayOne, today);
      const plan = planDay(sample, day, now);
      const entryId = sample.entries[day];
      if (!entryId || (plan.state !== "saved" && plan.state !== "planned")) continue;
      // The second request comes a little later, and only once its time has come.
      const createdAt = at(today, 10 * 60 + 30 + open.length * 25);
      if (createdAt > now) break;
      const dayNumber = Math.floor(Date.parse(`${today}T00:00:00Z`) / DAY);
      const { rows } = await db.query(
        `insert into feedback_requests (entry_id, requester_id, buffer_post_id, draft_snapshot, created_at)
         values ($1, $2, $3, $4, $5) returning id, requester_id, created_at`,
        [
          entryId,
          sample.participantId,
          `${MEMBER_PREFIX}post-${entryId}`,
          DRAFTS[(dayNumber + open.length) % DRAFTS.length],
          createdAt,
        ],
      );
      if (rows[0]) open.push(rows[0]);
      changes += 1;
      if (open.length >= 2) break;
    }
  }

  // Up to two replies per request, an hour or so apart, from other people.
  for (const request of open) {
    const requestId = str(request.id);
    const askedAt = new Date(request.created_at as string).getTime();
    const helpers = samples.filter((sample) => sample.participantId !== str(request.requester_id));
    for (let index = 0; index < 2; index++) {
      const when = new Date(askedAt + (70 + index * 120) * MINUTE);
      if (when > now || helpers.length === 0) break;
      const helper = pick(helpers, requestId, index, "helper");
      const text = pick(REPLIES, requestId, index, "reply");
      const { rows: existing } = await db.query(
        "select id from feedback_items where request_id = $1 and author_id = $2 and text = $3",
        [requestId, helper.participantId, text],
      );
      if (existing[0]) continue;
      await db.query(
        `insert into feedback_items (request_id, author_id, text, note_status, created_at)
         values ($1, $2, $3, 'copy', $4)`,
        [requestId, helper.participantId, text, when],
      );
      changes += 1;
    }
  }
  return changes;
}

/** Every other day, a short update from the sample host at 9:00. */
async function updateHostNews(
  db: Queryable,
  challengeId: string,
  samples: Sample[],
  now: Date,
): Promise<number> {
  const today = localParts(now).date;
  const dayNumber = Math.floor(Date.parse(`${today}T00:00:00Z`) / DAY);
  const host = samples.find((sample) => sample.person.key === "host");
  if (!host || dayNumber % 2 !== 0) return 0;
  const createdAt = at(today, 9 * 60);
  if (createdAt > now) return 0;
  const message = await addMessage(db, {
    challengeId,
    channel: "updates",
    authorId: host.userId,
    body: UPDATES[(dayNumber / 2) % UPDATES.length] ?? UPDATES[0] ?? "",
    createdAt,
  });
  if (!message.added) return 0;
  return 1 + (await react(db, message.id, host.userId, samples, `${today}-update`));
}
