import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureDemo, HISTORY_DAYS, MEMBER_PREFIX, type Queryable, tickDemo } from "./demo";
import { createTestDb } from "./testing";

// The demo challenge stays alive on its own: these runs stand in for the job every 30 minutes.

let db: Queryable;
let close: () => Promise<void>;
beforeEach(async () => {
  const test = await createTestDb();
  db = (test.db as unknown as { $client: Queryable }).$client;
  close = test.close;
});
afterEach(async () => {
  await close();
});

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/** 15:00 in London. */
const T0 = new Date("2026-11-10T15:00:00Z");
const later = (ms: number) => new Date(T0.getTime() + ms);

async function rows(sql: string, params: unknown[] = []) {
  return (await db.query(sql, params)).rows;
}
async function count(sql: string, params: unknown[] = []) {
  return Number((await rows(sql, params))[0]?.n);
}

/** Runs the job every 30 minutes from `from` to `to`. */
async function runEvery30(challengeId: string, from: Date, to: Date) {
  for (let t = from.getTime(); t <= to.getTime(); t += HOUR / 2) {
    await tickDemo(db, { now: new Date(t), challengeId });
  }
}

describe("demo challenge", () => {
  it("looks lived in from the first run: a busy board, chat, a shared post and feedback", async () => {
    const demo = await ensureDemo(db, { now: T0 });
    expect(demo.created).toBe(true);
    await tickDemo(db, { now: T0, challengeId: demo.id });

    expect(
      await count("select count(*)::int n from participants where challenge_id = $1", [demo.id]),
    ).toBe(9);
    const sentThisWeek = await count(
      `select count(*)::int n from entry_posts ep join entries e on e.id = ep.entry_id
       join participants p on p.id = e.participant_id
       where p.challenge_id = $1 and ep.status = 'sent' and ep.sent_at > $2`,
      [demo.id, later(-7 * DAY)],
    );
    expect(sentThisWeek).toBeGreaterThanOrEqual(15);
    expect(
      await count(
        "select count(*)::int n from messages where challenge_id = $1 and channel = 'chat'",
        [demo.id],
      ),
    ).toBeGreaterThanOrEqual(6);
    // Nothing is dated in the future.
    expect(
      await count(
        "select count(*)::int n from messages where challenge_id = $1 and created_at > $2",
        [demo.id, T0],
      ),
    ).toBe(0);
    expect(await count(`select count(*)::int n from entry_posts where sent_at > $1`, [T0])).toBe(0);
    expect(
      await count(
        `select count(*)::int n from feedback_requests fr join participants p on p.id = fr.requester_id
         where p.challenge_id = $1 and fr.status = 'open'`,
        [demo.id],
      ),
    ).toBeGreaterThanOrEqual(1);
  });

  it("changes nothing when run again at the same moment, and moves on later", async () => {
    const demo = await ensureDemo(db, { now: T0 });
    await tickDemo(db, { now: T0, challengeId: demo.id });
    const messages = () =>
      count("select count(*)::int n from messages where challenge_id = $1", [demo.id]);
    const before = await messages();
    expect((await tickDemo(db, { now: T0, challengeId: demo.id })).changes).toBe(0);
    expect(await messages()).toBe(before);

    await runEvery30(demo.id, later(HOUR / 2), later(DAY));
    expect(await messages()).toBeGreaterThan(before);
    // Each message once, however often the job ran.
    const duplicates = await count(
      `select count(*)::int n from (select author_id, body, created_at from messages
       where challenge_id = $1 group by 1, 2, 3 having count(*) > 1) d`,
      [demo.id],
    );
    expect(duplicates).toBe(0);
  });

  it("starts a new round for members who finished, and trims only old sample messages", async () => {
    const demo = await ensureDemo(db, { now: T0 });
    // A real person joins, writes and reacts to a sample message.
    const [real] = await rows(
      "insert into users (buffer_account_id, name) values ('acc-real', 'Real Person') returning id",
    );
    const [joined] = await rows(
      `insert into participants (challenge_id, user_id, joined_at, day_one, timezone)
       values ($1, $2, $3, '2026-11-10', 'Europe/London') returning id`,
      [demo.id, real?.id, T0],
    );
    expect(joined).toBeTruthy();
    await tickDemo(db, { now: T0, challengeId: demo.id });
    await rows(
      `insert into messages (challenge_id, channel, author_id, body, created_at)
       values ($1, 'chat', $2, 'Hello from a real person', $3)`,
      [demo.id, real?.id, T0],
    );

    // Ten days, once a day in the afternoon.
    for (let day = 1; day <= 10; day++) {
      const now = later(day * DAY);
      await tickDemo(db, { now, challengeId: demo.id });
      const stages = await rows(
        `select (date($1 at time zone 'Europe/London') - p.day_one) as index
         from participants p join users u on u.id = p.user_id
         where p.challenge_id = $2 and u.buffer_account_id like $3`,
        [now, demo.id, `${MEMBER_PREFIX}%`],
      );
      // Everyone is somewhere in their 7 days, or resting a day before the next round.
      for (const stage of stages) expect(Number(stage.index)).toBeLessThanOrEqual(7);
    }
    const end = later(10 * DAY);
    expect(
      await count("select count(*)::int n from messages where body = 'Hello from a real person'"),
    ).toBe(1);
    expect(
      await count(
        `select count(*)::int n from messages m join users u on u.id = m.author_id
         where m.challenge_id = $1 and u.buffer_account_id like $2 and m.created_at < $3`,
        [demo.id, `${MEMBER_PREFIX}%`, new Date(end.getTime() - HISTORY_DAYS * DAY)],
      ),
    ).toBe(0);
    expect(
      await count("select count(*)::int n from participants where user_id = $1", [real?.id]),
    ).toBe(1);
  });

  it("never writes as a real host", async () => {
    const [host] = await rows(
      "insert into users (buffer_account_id, name) values ('acc-host', 'Real Host') returning id",
    );
    const demo = await ensureDemo(db, { now: T0, hostBufferAccountId: "acc-host" });
    await runEvery30(demo.id, T0, later(DAY));
    expect(
      await count("select count(*)::int n from messages where author_id = $1", [host?.id]),
    ).toBe(0);
    expect(
      await count(
        `select count(*)::int n from feedback_items fi join participants p on p.id = fi.author_id
         where p.user_id = $1`,
        [host?.id],
      ),
    ).toBe(0);
    // The sample members still keep it busy.
    expect(
      await count("select count(*)::int n from messages where challenge_id = $1", [demo.id]),
    ).toBeGreaterThan(0);
  });
});
