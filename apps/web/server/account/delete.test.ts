import { DEFAULT_ENDPOINTS } from "@daydeck/buffer";
import { eq, schema, sql } from "@daydeck/db";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { connect, createUser, FakeTokenServer, setupDeps, T0 } from "@/test/buffer-fakes";
import type { BufferDeps } from "../buffer/deps";
import { createChallenge, joinChallenge } from "../challenges/service";
import { deleteMyData } from "./data";

// "Disconnect Buffer and delete my data", end to end in the database: two people in each other's
// challenges, with something in every table, then one of them deletes their data. Every row of
// every table is then searched for anything left of that person.

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterAll(() => server.close());

let deps: BufferDeps;
let close: () => Promise<void>;
let revoked: string[];
beforeEach(async () => {
  ({ deps, close } = await setupDeps());
  revoked = [];
});
afterEach(async () => {
  server.resetHandlers();
  await close();
});

const PROMPTS = ["One", "Two", "Three"].map((title) => ({
  title,
  description: "",
  body: "",
  emoji: "",
  bufferTemplateId: null,
}));

/** Every row of every table in the database, as text, with the table's name. */
async function everyRow(db: BufferDeps["db"]): Promise<{ table: string; row: string }[]> {
  const tables = (await db.execute(
    sql`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`,
  )) as unknown as { rows: { table_name: string }[] };
  const found: { table: string; row: string }[] = [];
  for (const { table_name: table } of tables.rows) {
    const rows = (await db.execute(
      sql.raw(`select row_to_json(t)::text as row from "${table}" t`),
    )) as unknown as { rows: { row: string }[] };
    for (const { row } of rows.rows) found.push({ table, row });
  }
  return found;
}

describe("delete my data", () => {
  it("leaves nothing of the person behind, and keeps everyone else's data", async () => {
    const fake = new FakeTokenServer();
    server.use(
      fake.handler(),
      http.post(`${DEFAULT_ENDPOINTS.authUrl}/token/revocation`, async ({ request }) => {
        revoked.push(new URLSearchParams(await request.text()).get("token_type_hint") ?? "");
        return new HttpResponse(null, { status: 200 });
      }),
    );
    const db = deps.db;
    const ana = await createUser(deps, "acc-ana-gone");
    await db.update(schema.users).set({ name: "Ana Gone" }).where(eq(schema.users.id, ana.id));
    const ben = await createUser(deps, "acc-ben-stays");
    await db.update(schema.users).set({ name: "Ben Stays" }).where(eq(schema.users.id, ben.id));
    await connect(deps, ana.id, fake.issue(), 60 * 60 * 1000);
    await db.insert(schema.sessions).values({
      idHash: "ana-session-hash",
      userId: ana.id,
      expiresAt: new Date(T0.getTime() + 86_400_000),
    });
    await db.insert(schema.channels).values({
      userId: ana.id,
      bufferChannelId: "ana-channel-id",
      organizationId: "org-ana",
      service: "linkedin",
      name: "ana-channel",
      timezone: "Europe/Bucharest",
      syncedAt: T0,
    });

    const base = {
      prompts: PROMPTS,
      cadence: "daily" as const,
      startMode: "rolling" as const,
      startDate: "2026-11-08",
      timezone: "Europe/Bucharest",
      visibility: "private" as const,
    };
    // Ana hosts one challenge that Ben joined; Ben hosts one that Ana joined, and one that bans Ana.
    const anas = await createChallenge(
      db,
      { ...ana, name: "Ana Gone" },
      { ...base, title: "Ana's own" },
      T0,
    );
    await joinChallenge(db, { ...ben, name: "Ben Stays" }, anas, [], T0);
    const bens = await createChallenge(
      db,
      { ...ben, name: "Ben Stays" },
      { ...base, title: "Ben's" },
      T0,
    );
    await joinChallenge(db, { ...ana, name: "Ana Gone" }, bens, [], T0);
    const other = await createChallenge(
      db,
      { ...ben, name: "Ben Stays" },
      { ...base, title: "Other" },
      T0,
    );
    await db.insert(schema.challengeBans).values([
      {
        challengeId: other.id,
        bufferAccountId: "acc-ana-gone",
        name: "Ana Gone",
        userId: ana.id,
        bannedBy: ben.id,
      },
      { challengeId: anas.id, bufferAccountId: "acc-someone", name: "Someone", bannedBy: ana.id },
    ]);

    const [anaInBens] = await db
      .select()
      .from(schema.participants)
      .where(
        sql`${schema.participants.userId} = ${ana.id} and ${schema.participants.challengeId} = ${bens.id}`,
      );
    const [benInBens] = await db
      .select()
      .from(schema.participants)
      .where(
        sql`${schema.participants.userId} = ${ben.id} and ${schema.participants.challengeId} = ${bens.id}`,
      );
    if (!anaInBens || !benInBens) throw new Error("no participants");
    const [anaEntry] = await db
      .select()
      .from(schema.entries)
      .where(eq(schema.entries.participantId, anaInBens.id));
    const [benEntry] = await db
      .select()
      .from(schema.entries)
      .where(eq(schema.entries.participantId, benInBens.id));
    if (!anaEntry || !benEntry) throw new Error("no entries");

    await db.insert(schema.entryPosts).values({
      entryId: anaEntry.id,
      channelId: "ana-channel-id",
      bufferPostId: "ana-post-1",
      externalLink: "https://example.com/ana-post-1",
    });
    await db.insert(schema.seenPosts).values({
      participantId: anaInBens.id,
      bufferPostId: "ana-seen-1",
      channelId: "ana-channel-id",
      status: "sent",
      textHash: "ana-text-hash",
      matchKind: "none",
    });
    await db
      .insert(schema.alerts)
      .values({ participantId: anaInBens.id, kind: "failed_post", dedupeKey: "ana-alert" });
    await db
      .insert(schema.readMarks)
      .values({ participantId: anaInBens.id, place: "chat", readAt: T0 });
    const [anaAsks] = await db
      .insert(schema.feedbackRequests)
      .values({
        entryId: anaEntry.id,
        requesterId: anaInBens.id,
        bufferPostId: "ana-post-1",
        draftSnapshot: "ana-draft-text",
      })
      .returning();
    const [benAsks] = await db
      .insert(schema.feedbackRequests)
      .values({
        entryId: benEntry.id,
        requesterId: benInBens.id,
        bufferPostId: "ben-post-1",
        draftSnapshot: "ben-draft-text",
      })
      .returning();
    if (!anaAsks || !benAsks) throw new Error("no requests");
    await db.insert(schema.feedbackItems).values([
      { requestId: anaAsks.id, authorId: benInBens.id, text: "ben-feedback-for-ana" },
      { requestId: benAsks.id, authorId: anaInBens.id, text: "ana-feedback-text" },
    ]);
    const [anaSays] = await db
      .insert(schema.messages)
      .values({
        challengeId: bens.id,
        channel: "chat",
        authorId: ana.id,
        body: "ana-secret-message",
      })
      .returning();
    if (!anaSays) throw new Error("no message");
    const [benSays] = await db
      .insert(schema.messages)
      .values({
        challengeId: bens.id,
        channel: "chat",
        authorId: ben.id,
        body: "ben-reply",
        replyToId: anaSays.id,
      })
      .returning();
    if (!benSays) throw new Error("no reply");
    await db.insert(schema.messageReactions).values([
      { messageId: benSays.id, userId: ana.id, emoji: "🔥" },
      { messageId: anaSays.id, userId: ben.id, emoji: "👏" },
    ]);
    await db.insert(schema.endpointHits).values([
      { key: `send-message:user:${ana.id}`, windowStart: T0, count: 3 },
      { key: `send-message:user:${ben.id}`, windowStart: T0, count: 1 },
    ]);

    const anaParticipantIds = (
      await db
        .select({ id: schema.participants.id })
        .from(schema.participants)
        .where(eq(schema.participants.userId, ana.id))
    ).map((row) => row.id);

    const deleted = await deleteMyData(deps, ana.id);
    expect(deleted.revokedAtBuffer).toBe(true);
    expect(revoked).toEqual(["refresh_token"]);

    // Nothing that points to Ana or holds her words is left, in any table.
    const marks = [
      ana.id,
      ...anaParticipantIds,
      anas.id,
      "Ana Gone",
      "ana-channel",
      "ana-session-hash",
      "ana-post-1",
      "ana-seen-1",
      "ana-text-hash",
      "ana-alert",
      "ana-draft-text",
      "ana-feedback-text",
      "ana-secret-message",
      "ben-feedback-for-ana",
    ];
    const rows = await everyRow(db);
    const left = rows.filter(({ row }) => marks.some((mark) => row.includes(mark)));
    expect(left).toEqual([]);
    // The one thing kept on purpose: Ben's ban on her Buffer account, without her name.
    const withAccount = rows.filter(({ row }) => row.includes("acc-ana-gone"));
    expect(withAccount.map(({ table }) => table)).toEqual(["challenge_bans"]);
    expect(withAccount[0]?.row).toContain('"name":null');

    // Ben keeps his account, his challenges, his words and his rate-limit counter.
    expect(rows.some(({ row }) => row.includes("Ben Stays"))).toBe(true);
    const challenges = await db.select({ id: schema.challenges.id }).from(schema.challenges);
    expect(challenges.map((c) => c.id).sort()).toEqual([bens.id, other.id].sort());
    const [reply] = await db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.id, benSays.id));
    expect(reply?.replyToId).toBeNull();
    expect(rows.some(({ row }) => row.includes("ben-draft-text"))).toBe(true);
    expect(rows.some(({ row }) => row.includes(`send-message:user:${ben.id}`))).toBe(true);
  });
});
