// The demo challenge: a public, rolling challenge with sample members, so anyone (Buffer's judges
// first) can join alone and still see a busy board, chat, shared posts and feedback on drafts.
//
//   pnpm --filter @daydeck/db demo:seed     creates or refreshes it, then prints its invite code
//   pnpm --filter @daydeck/db demo:remove   closes it and removes the sample members
//
// Re-running the seed moves every sample date up to today. Real people who joined keep their
// own days and messages; only their replies to sample members' drafts go, with those drafts.
// Sample people have Buffer account IDs that start with "demo-", so
// Daydeck never calls Buffer for them. To host it from a real account, set
// DEMO_HOST_BUFFER_ACCOUNT_ID to that account's Buffer ID (it must have signed in once).
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import pg from "pg";
import { withVerifiedTls } from "../src/connection-url.ts";

const appEnv = new URL("../../../apps/web/.env.local", import.meta.url).pathname;
if (!process.env.DATABASE_URL && existsSync(appEnv)) process.loadEnvFile(appEnv);
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set.");

const TITLE = "Daydeck demo: build in public";
const PROMPT_SET = "starter-build-in-public-week";
const TIME_ZONE = "Europe/London";
const SAMPLE_HOST_ID = "demo-host";
const MEMBER_PREFIX = "demo-member-";
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// --- Sample people. `ago`: days since their day 1, so `ago` is also today's index. -------------
// `days`, one letter per prompt: d posted on the day, c posted a day late, m missed, p paused,
// s draft saved in Buffer, l scheduled in Buffer, o nothing yet.
const HOST = {
  key: "host",
  name: "Hannah Lewis",
  colors: ["#16a34a", "#0d9488"],
  ago: 6,
  days: "dddddds",
};
const MEMBERS = [
  {
    key: "liam",
    name: "Liam Turner",
    colors: ["#2563eb", "#7c3aed"],
    ago: 6,
    days: "ddcddds",
    named: true,
  },
  {
    key: "olivia",
    name: "Olivia Bennett",
    colors: ["#db2777", "#f97316"],
    ago: 5,
    days: "dmddslo",
    named: true,
  },
  {
    key: "noah",
    name: "Noah Patel",
    colors: ["#059669", "#0891b2"],
    ago: 5,
    days: "ddpddlo",
    named: true,
  },
  {
    key: "sophie",
    name: "Sophie Walker",
    colors: ["#9333ea", "#ec4899"],
    ago: 4,
    days: "ddddsoo",
    named: true,
  },
  {
    key: "james",
    name: "James Carter",
    colors: ["#ea580c", "#facc15"],
    ago: 4,
    days: "dmmdooo",
    named: false,
  },
  {
    key: "mia",
    name: "Mia Hughes",
    colors: ["#0d9488", "#22c55e"],
    ago: 3,
    days: "ddclooo",
    named: true,
  },
  {
    key: "oliver",
    name: "Oliver Reed",
    colors: ["#475569", "#0ea5e9"],
    ago: 2,
    days: "dddoooo",
    named: true,
  },
  {
    key: "grace",
    name: "Grace Morgan",
    colors: ["#be123c", "#a855f7"],
    ago: 1,
    days: "ddooooo",
    named: true,
  },
];
const STATE: Record<string, string> = {
  d: "done",
  c: "caught_up",
  m: "missed",
  p: "paused",
  s: "saved",
  l: "planned",
  o: "open",
};

// What the sample host writes. A real host's own messages are never touched: re-running
// removes only messages with exactly these texts.
type Reactions = Record<string, string[]>;

const HOST_UPDATES: { hoursAgo: number; body: string; reactions: Reactions }[] = [
  {
    hoursAgo: 6 * 24 - 2,
    body: "Welcome to the Daydeck demo! It is a real challenge with sample members, so you can try every part on your own. Join, and your day 1 is today.",
    reactions: { "🎉": ["liam", "olivia", "sophie", "grace"], "🙌": ["noah", "mia"] },
  },
  {
    hoursAgo: 30,
    body: "Great week so far: 6 of 8 of you posted yesterday. Tip: if you post straight in Buffer, Daydeck's AI works out which day it is for.",
    reactions: { "🔥": ["liam", "sophie", "oliver", "mia", "james"] },
  },
];

const CHAT: {
  key: string;
  body: string;
  hoursAgo: number;
  replyTo?: number;
  reactions?: Reactions;
}[] = [
  {
    key: "liam",
    body: "Morning all! Today's draft is in Buffer before my first coffee. Who else is on it?",
    hoursAgo: 9,
    reactions: { "🔥": ["sophie", "grace", "host"] },
  },
  {
    key: "sophie",
    body: "Me! Mine is saved for lunch. This prompt made me write way more than I planned 😅",
    hoursAgo: 8.5,
    replyTo: 0,
  },
  { key: "olivia", body: "I missed day 2. Is it too late to catch up?", hoursAgo: 7 },
  {
    key: "host",
    body: "Not at all. Post it any time and it counts as caught up. The board shows it with a small dot.",
    hoursAgo: 6.8,
    replyTo: 2,
    reactions: { "❤️": ["olivia", "noah"], "👍": ["mia"] },
  },
  {
    key: "noah",
    body: "Tip: I write three drafts on Sunday and let Daydeck check them off as they go out. Saves my week.",
    hoursAgo: 5,
    reactions: { "💡": ["liam", "oliver", "grace", "host"] },
  },
  {
    key: "grace",
    body: "Stealing this. Also, did the AI pick the right day for anyone else's post written straight in Buffer? Felt like magic.",
    hoursAgo: 4.5,
    replyTo: 4,
  },
  {
    key: "mia",
    body: "Yes! It matched my thread to day 3 on its own.",
    hoursAgo: 1.6,
    replyTo: 5,
    reactions: { "😂": ["grace"] },
  },
  {
    key: "oliver",
    body: "Just shared today's post in Posts. Feedback welcome, it is my first carousel.",
    hoursAgo: 0.7,
    reactions: { "👏": ["sophie"] },
  },
];

const SHARED: {
  key: string;
  day: number;
  slug: string;
  title: string;
  description: string;
  emoji: string;
  gradient: string[];
  body: string;
  hoursAgo: number;
  reactions: Reactions;
}[] = [
  {
    key: "liam",
    day: 2,
    slug: "the-bug-that-took-3-days",
    title: "The bug that took 3 days and one line to fix",
    description:
      "Building in public, day 3: what went wrong, what I learned, and the one-line fix.",
    emoji: "🐛",
    gradient: ["#0a66c2", "#1e3a8a", "#38bdf8"],
    body: "Day 3 is live: the bug that took three days and one line to fix",
    hoursAgo: 26,
    reactions: { "👏": ["host", "sophie", "grace"], "😂": ["noah"] },
  },
  {
    key: "sophie",
    day: 3,
    slug: "what-i-cut-from-the-launch",
    title: "What I cut from the launch",
    description:
      "We cut 4 features to ship on time. Here is the list, and why none of them mattered.",
    emoji: "✂️",
    gradient: ["#0f172a", "#334155", "#a855f7"],
    body: "What I cut from the launch, and why it was the right call",
    hoursAgo: 11,
    reactions: { "🔥": ["liam", "host", "mia", "oliver"], "💡": ["grace"] },
  },
  {
    key: "oliver",
    day: 2,
    slug: "5-lessons-from-a-week-of-posting",
    title: "My first carousel: 5 lessons from a week of posting",
    description: "Five things a week of daily posts taught me about writing short.",
    emoji: "🎠",
    gradient: ["#16a34a", "#0f766e", "#bbf7d0"],
    body: "My first carousel ever. Be kind 🙏",
    hoursAgo: 0.6,
    reactions: { "🙌": ["sophie", "host"] },
  },
];

const FEEDBACK = [
  {
    key: "olivia",
    day: 4,
    draft:
      "The hardest bug I fixed this month.\n\nOur checkout broke for 2% of people, and only on Fridays. It took me two days to see it: a time zone. Lesson: test the boring edges first.",
    hoursAgo: 6,
    replies: [
      {
        key: "host",
        text: "Great hook. I would open with 'only on Fridays': that line makes people stop scrolling.",
      },
      { key: "liam", text: "Love it. Maybe end with a question: what is your weirdest bug?" },
    ],
  },
  {
    key: "sophie",
    day: 4,
    draft:
      "Three drafts every Sunday. That is my whole system for posting daily without burning out. Here is how it works ↓",
    hoursAgo: 3,
    replies: [
      { key: "grace", text: "The arrow at the end is a nice touch. Add one example of a draft?" },
    ],
  },
];

// --- Helpers -------------------------------------------------------------------------------------

function svgUri(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function avatar(name: string, [a, b]: string[]): string {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("");
  return svgUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="64" height="64" fill="url(#g)"/><text x="32" y="41" font-family="Helvetica, Arial, sans-serif" font-size="24" font-weight="700" fill="#ffffff" text-anchor="middle">${initials}</text></svg>`,
  );
}

/** A link card picture: one big emoji in the middle, so it still reads in a narrow thumbnail. */
function cardImage(emoji: string, [a, b, accent]: string[]): string {
  return svgUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="1200" height="630" fill="url(#g)"/><circle cx="600" cy="315" r="200" fill="${accent}" opacity="0.3"/><text x="600" y="315" font-size="220" text-anchor="middle" dominant-baseline="central">${emoji}</text></svg>`,
  );
}

const dateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
/** The local date ("2026-11-09") in the demo's time zone. */
function localDate(at: Date): string {
  return dateFormat.format(at);
}

/** A sample post link. example.com is reserved for examples, so it never points at a real person. */
function sampleLink(key: string, path: string): string {
  return `https://example.com/daydeck-demo/${key}/${path}`;
}

// --- The run ---------------------------------------------------------------------------------------

const command = process.argv[2] ?? "seed";
if (command !== "seed" && command !== "remove") throw new Error('Use "seed" or "remove".');

const pool = new pg.Pool({ connectionString: withVerifiedTls(url), max: 1 });
const client = await pool.connect();
const now = new Date();
console.warn(`Database: ${new URL(url).host}`);

try {
  await client.query("begin");
  const host = await findHost();
  const challenge = await findChallenge(host.id);

  if (command === "remove") {
    if (challenge) {
      // Closed like any challenge: off the homepage now, deleted by Daydeck 30 days later.
      await client.query(
        "update challenges set status = 'closed', closed_at = $2, show_on_home = false, board_version = board_version + 1 where id = $1 and status = 'open'",
        [challenge.id, now],
      );
    }
    const removed = await client.query("delete from users where buffer_account_id like $1", [
      `${MEMBER_PREFIX}%`,
    ]);
    await client.query("commit");
    console.warn(`Demo closed. Removed ${removed.rowCount} sample members.`);
  } else {
    const demo = challenge ?? (await createChallenge(host.id));
    await refresh(demo.id, host);
    await client.query("commit");
    console.warn(`Demo ready: "${TITLE}"`);
    console.warn(`Invite link path: /c/${demo.inviteCode}`);
    console.warn(`Set DEMO_INVITE_CODE=${demo.inviteCode}`);
  }
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  client.release();
  await pool.end();
}

/** The host: a real account from DEMO_HOST_BUFFER_ACCOUNT_ID, or the sample host. */
async function findHost(): Promise<{ id: string; sample: boolean }> {
  const real = process.env.DEMO_HOST_BUFFER_ACCOUNT_ID;
  if (real) {
    const { rows } = await client.query("select id from users where buffer_account_id = $1", [
      real,
    ]);
    if (!rows[0])
      throw new Error("No Daydeck account has that Buffer ID yet. Sign in with it once first.");
    return { id: rows[0].id, sample: false };
  }
  const { rows } = await client.query(
    `insert into users (buffer_account_id, name, avatar_url, timezone) values ($1, $2, $3, $4)
     on conflict (buffer_account_id) do update set name = excluded.name, avatar_url = excluded.avatar_url, updated_at = now()
     returning id`,
    [SAMPLE_HOST_ID, HOST.name, avatar(HOST.name, HOST.colors), TIME_ZONE],
  );
  return { id: rows[0].id, sample: true };
}

/** The demo from DEMO_INVITE_CODE, or else the host's challenge with the demo's title. */
async function findChallenge(hostId: string): Promise<{ id: string; inviteCode: string } | null> {
  const code = process.env.DEMO_INVITE_CODE;
  const { rows } = code
    ? await client.query("select id, invite_code from challenges where invite_code = $1", [code])
    : await client.query(
        "select id, invite_code from challenges where host_user_id = $1 and title = $2 order by created_at desc limit 1",
        [hostId, TITLE],
      );
  return rows[0] ? { id: rows[0].id, inviteCode: rows[0].invite_code } : null;
}

async function createChallenge(hostId: string): Promise<{ id: string; inviteCode: string }> {
  const suffix = randomBytes(4)
    .toString("base64url")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "x");
  const inviteCode = randomBytes(16).toString("base64url");
  const { rows } = await client.query(
    `insert into challenges (slug, host_user_id, title, cadence, start_mode, start_date, timezone, visibility, show_on_home, chat_enabled, invite_code, tag_name, created_at)
     values ($1, $2, $3, 'daily', 'rolling', $4, $5, 'public', true, true, $6, $7, $8) returning id`,
    [
      `daydeck-demo-build-in-public-${suffix}`,
      hostId,
      TITLE,
      localDate(new Date(now.getTime() - HOST.ago * DAY)),
      TIME_ZONE,
      inviteCode,
      "Daydeck: demo",
      new Date(now.getTime() - HOST.ago * DAY - 3 * HOUR),
    ],
  );
  const id: string = rows[0].id;
  const prompts = await client.query(
    `insert into challenge_prompts (challenge_id, day_index, title, description, body, emoji)
     select $1, p.position, p.title, p.description, p.body, p.emoji
     from prompts p join prompt_sets s on s.id = p.prompt_set_id where s.slug = $2 order by p.position
     returning id`,
    [id, PROMPT_SET],
  );
  if (prompts.rowCount !== HOST.days.length)
    throw new Error(`The "${PROMPT_SET}" prompts are missing. Run db:migrate first.`);
  await client.query(
    `insert into participants (challenge_id, user_id, role, joined_at, day_one, timezone, wall_opt_in)
     values ($1, $2, 'host', $3, $4, $5, true)`,
    [
      id,
      hostId,
      new Date(now.getTime() - HOST.ago * DAY - 2 * HOUR),
      localDate(new Date(now.getTime() - HOST.ago * DAY)),
      TIME_ZONE,
    ],
  );
  await client.query(
    `insert into entries (participant_id, challenge_prompt_id)
     select p.id, cp.id from participants p join challenge_prompts cp on cp.challenge_id = p.challenge_id
     where p.challenge_id = $1 and p.user_id = $2`,
    [id, hostId],
  );
  return { id, inviteCode };
}

/** Puts every sample row back, with dates around today. */
async function refresh(challengeId: string, host: { id: string; sample: boolean }) {
  // Listed, open and joinable, so the homepage can show it (the database checks this too).
  await client.query(
    `update challenges set status = 'open', closed_at = null, visibility = 'public', invite_paused = false,
       show_on_home = true, chat_enabled = true, start_date = least(start_date, $2::date),
       board_version = board_version + 1, community_version = community_version + 1
     where id = $1`,
    [challengeId, localDate(new Date(now.getTime() - HOST.ago * DAY))],
  );

  // Old samples go first; deleting a sample user removes their days, posts and messages too.
  await client.query("delete from users where buffer_account_id like $1", [`${MEMBER_PREFIX}%`]);
  await client.query(
    host.sample
      ? "delete from messages where challenge_id = $1 and author_id = $2"
      : "delete from messages where challenge_id = $1 and author_id = $2 and body = any($3)",
    host.sample
      ? [challengeId, host.id]
      : [
          challengeId,
          host.id,
          [
            ...HOST_UPDATES.map((u) => u.body),
            ...CHAT.filter((c) => c.key === "host").map((c) => c.body),
          ],
        ],
  );

  const people: Record<string, { userId: string; participantId: string; entries: string[] }> = {};
  const hostRow = await client.query(
    "select id from participants where challenge_id = $1 and user_id = $2",
    [challengeId, host.id],
  );
  const hostParticipant: string = hostRow.rows[0].id;
  people.host = {
    userId: host.id,
    participantId: hostParticipant,
    entries: await entryIds(hostParticipant),
  };
  if (host.sample) {
    await client.query(
      "update participants set day_one = $2, joined_at = $3, wall_opt_in = true where id = $1",
      [
        hostParticipant,
        localDate(new Date(now.getTime() - HOST.ago * DAY)),
        new Date(now.getTime() - HOST.ago * DAY - 2 * HOUR),
      ],
    );
    await setDays("host", HOST, people.host);
  }

  for (const member of MEMBERS) {
    const user = await client.query(
      "insert into users (buffer_account_id, name, avatar_url, timezone) values ($1, $2, $3, $4) returning id",
      [`${MEMBER_PREFIX}${member.key}`, member.name, avatar(member.name, member.colors), TIME_ZONE],
    );
    const pauses = [...member.days].flatMap((letter, index) =>
      letter === "p" ? [localDate(new Date(now.getTime() - (member.ago - index) * DAY))] : [],
    );
    const participant = await client.query(
      `insert into participants (challenge_id, user_id, role, joined_at, day_one, timezone, wall_opt_in, pause_dates)
       values ($1, $2, 'participant', $3, $4, $5, $6, $7) returning id`,
      [
        challengeId,
        user.rows[0].id,
        new Date(now.getTime() - member.ago * DAY - 2 * HOUR),
        localDate(new Date(now.getTime() - member.ago * DAY)),
        TIME_ZONE,
        member.named,
        pauses,
      ],
    );
    const participantId: string = participant.rows[0].id;
    await client.query(
      `insert into entries (participant_id, challenge_prompt_id)
       select $1, id from challenge_prompts where challenge_id = $2`,
      [participantId, challengeId],
    );
    const sample = {
      userId: user.rows[0].id,
      participantId,
      entries: await entryIds(participantId),
    };
    people[member.key] = sample;
    await setDays(member.key, member, sample);
  }

  const person = (key: string) => {
    const found = people[key];
    if (!found) throw new Error(`No sample person "${key}"`);
    return found;
  };
  const at = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * HOUR);
  const post = async (
    key: string,
    channel: "updates" | "chat" | "posts",
    body: string,
    hoursAgo: number,
    extra: { replyTo?: string; linkUrl?: string; entryId?: string } = {},
  ): Promise<string> => {
    const { rows } = await client.query(
      `insert into messages (challenge_id, channel, kind, author_id, body, link_url, entry_id, reply_to_id, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
      [
        challengeId,
        channel,
        channel === "posts" ? "share" : "text",
        person(key).userId,
        body,
        extra.linkUrl ?? null,
        extra.entryId ?? null,
        extra.replyTo ?? null,
        at(hoursAgo),
      ],
    );
    return rows[0].id;
  };
  const react = async (messageId: string, reactions: Reactions = {}) => {
    for (const [emoji, keys] of Object.entries(reactions)) {
      for (const key of keys) {
        await client.query(
          "insert into message_reactions (message_id, user_id, emoji) values ($1, $2, $3) on conflict do nothing",
          [messageId, person(key).userId, emoji],
        );
      }
    }
  };

  // Updates from the host (a real host keeps their own, and gets these too).
  for (const update of HOST_UPDATES) {
    await react(await post("host", "updates", update.body, update.hoursAgo), update.reactions);
  }
  const chatIds: string[] = [];
  for (const line of CHAT) {
    const replyTo = line.replyTo === undefined ? undefined : chatIds[line.replyTo];
    const id = await post(line.key, "chat", line.body, line.hoursAgo, { replyTo });
    chatIds.push(id);
    await react(id, line.reactions);
  }

  // Shared posts with their link cards. Daydeck reads cards from the page itself; these are set.
  for (const share of SHARED) {
    const link = sampleLink(share.key, share.slug);
    await client.query(
      `insert into link_previews (url, status, final_url, title, description, image_url, site_name, fetched_at)
       values ($1, 'ok', $1, $2, $3, $4, 'Sample post', $5)
       on conflict (url) do update set title = excluded.title, description = excluded.description,
         image_url = excluded.image_url, site_name = excluded.site_name, fetched_at = excluded.fetched_at, status = 'ok'`,
      [link, share.title, share.description, cardImage(share.emoji, share.gradient), now],
    );
    const id = await post(share.key, "posts", `${share.body} ${link}`, share.hoursAgo, {
      linkUrl: link,
      entryId: person(share.key).entries[share.day],
    });
    await react(id, share.reactions);
  }

  // Feedback on drafts: each request is on a day with a draft or scheduled post in Buffer.
  for (const request of FEEDBACK) {
    const entryId = person(request.key).entries[request.day];
    const { rows } = await client.query(
      `insert into feedback_requests (entry_id, requester_id, buffer_post_id, draft_snapshot, created_at)
       values ($1, $2, $3, $4, $5) returning id`,
      [
        entryId,
        person(request.key).participantId,
        `${MEMBER_PREFIX}post-${request.key}-${request.day}`,
        request.draft,
        at(request.hoursAgo),
      ],
    );
    for (const [index, reply] of request.replies.entries()) {
      await client.query(
        `insert into feedback_items (request_id, author_id, text, note_status, created_at)
         values ($1, $2, $3, 'copy', $4)`,
        [
          rows[0].id,
          person(reply.key).participantId,
          reply.text,
          at(request.hoursAgo - 0.5 - index * 0.4),
        ],
      );
    }
  }
}

/** A participant's entry IDs, in day order. */
async function entryIds(participantId: string): Promise<string[]> {
  const { rows } = await client.query(
    `select e.id from entries e join challenge_prompts cp on cp.id = e.challenge_prompt_id
     where e.participant_id = $1 order by cp.day_index`,
    [participantId],
  );
  return rows.map((row) => row.id);
}

/** Sets each day's state and adds its Buffer post: sent, scheduled or a draft. */
async function setDays(
  key: string,
  person: { ago: number; days: string },
  ids: { entries: string[] },
) {
  await client.query("delete from entry_posts where entry_id = any($1)", [ids.entries]);
  for (const [index, letter] of [...person.days].entries()) {
    const entryId = ids.entries[index];
    const state = STATE[letter];
    if (!entryId || !state) continue;
    await client.query("update entries set state = $2 where id = $1", [entryId, state]);
    if (!"dcsl".includes(letter)) continue;
    const daysAgo = person.ago - index;
    // Today's posts went out a little while ago; earlier ones at about this time of day.
    const sentAt =
      letter === "c"
        ? new Date(now.getTime() - (daysAgo - 1) * DAY - 3 * HOUR)
        : new Date(now.getTime() - daysAgo * DAY - (daysAgo === 0 ? 1 : 2) * HOUR);
    const sent = letter === "d" || letter === "c";
    await client.query(
      `insert into entry_posts (entry_id, channel_id, buffer_post_id, status, match_source, sent_at, due_at, external_link)
       values ($1, $2, $3, $4, 'app', $5, $6, $7)`,
      [
        entryId,
        `${MEMBER_PREFIX}channel-${key}`,
        `${MEMBER_PREFIX}post-${key}-${index}`,
        sent ? "sent" : letter === "l" ? "scheduled" : "draft",
        sent ? sentAt : null,
        letter === "l" ? new Date(now.getTime() + (index - person.ago) * DAY + 3 * HOUR) : null,
        sent ? sampleLink(key, `day-${index + 1}`) : null,
      ],
    );
  }
}
