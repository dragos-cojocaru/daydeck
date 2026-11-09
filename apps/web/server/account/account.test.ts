import { DEFAULT_ENDPOINTS } from "@daydeck/buffer";
import { eq, schema } from "@daydeck/db";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { connect, createUser, FakeTokenServer, setupDeps, T0 } from "@/test/buffer-fakes";
import { loadBoard } from "../board/board";
import type { BufferDeps } from "../buffer/deps";
import { createChallenge, joinChallenge } from "../challenges/service";
import { closeChallenge, dataSummary, deleteMyData, leaveChallenge, setDayPaused } from "./data";
import { closeFinishedChallenges, deletionTime, purgeOldData } from "./retention";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterAll(() => server.close());

let deps: BufferDeps;
let close: () => Promise<void>;
let revoked: string[];
let host: Awaited<ReturnType<typeof createUser>>;
let guest: Awaited<ReturnType<typeof createUser>>;
let slug: string;

beforeEach(async () => {
  ({ deps, close } = await setupDeps());
  revoked = [];
  const fake = new FakeTokenServer();
  server.use(
    fake.handler(),
    http.post(`${DEFAULT_ENDPOINTS.authUrl}/token/revocation`, async ({ request }) => {
      revoked.push(new URLSearchParams(await request.text()).get("token_type_hint") ?? "");
      return new HttpResponse(null, { status: 200 });
    }),
  );
  host = await createUser(deps, "acc-host");
  guest = await createUser(deps, "acc-guest");
  await deps.db.update(schema.users).set({ name: "Ben" }).where(eq(schema.users.id, guest.id));
  await connect(deps, guest.id, fake.issue(), 60 * 60 * 1000);
  const challenge = await createChallenge(
    deps.db,
    host,
    {
      title: "Kickstart",
      prompts: ["One", "Two", "Three"].map((title) => ({
        title,
        description: "",
        body: "",
        emoji: "",
        bufferTemplateId: null,
      })),
      cadence: "daily",
      startMode: "rolling",
      startDate: "2026-11-08",
      timezone: "Europe/Bucharest",
      visibility: "private",
    },
    T0,
  );
  slug = challenge.slug;
  await joinChallenge(deps.db, { ...guest, name: "Ben" }, challenge, [], T0);
});
afterEach(async () => {
  server.resetHandlers();
  await close();
});

describe("board", () => {
  it("puts the viewer first and labels every cell in full", async () => {
    const board = await loadBoard(deps.db, slug, guest.id, T0);
    expect(board?.rows.map((row) => [row.name, row.isYou, row.isHost])).toEqual([
      ["Ben", true, false],
      ["Ana", false, true],
    ]);
    expect(board?.rows[0]?.cells[0]?.label).toBe("Ben, day 1, not saved yet: One");
    expect(board?.viewerTodayIndex).toBe(0);
  });

  it("is only for members", async () => {
    const stranger = await createUser(deps, "acc-stranger");
    expect(await loadBoard(deps.db, slug, stranger.id, T0)).toBeNull();
  });

  it("shows a passed open day as waiting, and a paused day as paused", async () => {
    const twoDaysLater = new Date(T0.getTime() + 2 * 86_400_000);
    const [entry] = await deps.db
      .select({ id: schema.entries.id })
      .from(schema.entries)
      .innerJoin(schema.participants, eq(schema.participants.id, schema.entries.participantId))
      .where(eq(schema.participants.userId, guest.id))
      .limit(1);
    expect(await setDayPaused(deps.db, guest.id, entry?.id ?? "", true)).toBe(true);
    // Someone else cannot pause your day.
    expect(await setDayPaused(deps.db, host.id, entry?.id ?? "", false)).toBe(false);
    const board = await loadBoard(deps.db, slug, guest.id, twoDaysLater);
    expect(board?.rows[0]?.cells.map((cell) => cell.state)).toEqual(["paused", "missed", "open"]);
  });
});

describe("data controls", () => {
  it("counts what Daydeck keeps, then deletes it all and revokes the grant at Buffer", async () => {
    const summary = await dataSummary(deps.db, guest.id);
    expect(summary).toMatchObject({ challengesJoined: 1, challengesHosted: 0, daysTracked: 3 });
    const deleted = await deleteMyData(deps, guest.id);
    expect(deleted.revokedAtBuffer).toBe(true);
    expect(revoked).toEqual(["refresh_token"]);
    expect(await deps.db.select().from(schema.users).where(eq(schema.users.id, guest.id))).toEqual(
      [],
    );
    expect(await deps.db.select().from(schema.bufferConnections)).toEqual([]);
    // The host's challenge stays; only the guest's place in it went.
    expect((await loadBoard(deps.db, slug, host.id, T0))?.rows).toHaveLength(1);
  });

  it("lets a participant leave, but a host closes instead", async () => {
    expect(await leaveChallenge(deps.db, host.id, slug)).toBeNull();
    expect(await leaveChallenge(deps.db, guest.id, slug)).toBeTruthy();
    expect(await loadBoard(deps.db, slug, guest.id, T0)).toBeNull();
    expect(await closeChallenge(deps.db, guest.id, slug, T0)).toBe(false);
    expect(await closeChallenge(deps.db, host.id, slug, T0)).toBe(true);
  });
});

describe("retention", () => {
  it("closes fixed challenges after their last day and purges them 30 days later", async () => {
    await deps.db
      .update(schema.challenges)
      .set({ endsAt: new Date(T0.getTime() - 1000) })
      .where(eq(schema.challenges.slug, slug));
    expect(await closeFinishedChallenges(deps.db, T0)).toBe(1);
    expect(await closeFinishedChallenges(deps.db, T0)).toBe(0);
    expect((await purgeOldData(deps.db, new Date(T0.getTime() + 29 * 86_400_000))).challenges).toBe(
      0,
    );
    expect((await purgeOldData(deps.db, new Date(T0.getTime() + 31 * 86_400_000))).challenges).toBe(
      1,
    );
    expect(await deps.db.select().from(schema.entries)).toEqual([]);
  });

  it("purges a closed challenge on exactly the date people are shown", async () => {
    await closeChallenge(deps.db, host.id, slug, T0);
    const [row] = await deps.db
      .select({ closedAt: schema.challenges.closedAt, timezone: schema.challenges.timezone })
      .from(schema.challenges)
      .where(eq(schema.challenges.slug, slug));
    if (!row?.closedAt) throw new Error("not closed");
    const due = deletionTime(row.closedAt, row.timezone);
    // The purge run a day before keeps it; the run at its deletion time deletes it.
    expect((await purgeOldData(deps.db, new Date(due.getTime() - 86_400_000))).challenges).toBe(0);
    expect((await purgeOldData(deps.db, due)).challenges).toBe(1);
  });

  it("clears a post's preview once it has a day, its challenge closes, or after 30 days", async () => {
    const day = 86_400_000;
    const [participant] = await deps.db
      .select({ id: schema.participants.id })
      .from(schema.participants)
      .where(eq(schema.participants.userId, guest.id));
    if (!participant) throw new Error("no participant");
    const row = (id: string, matchKind: "none" | "suggested" | "manual", firstSeenAt: Date) => ({
      participantId: participant.id,
      bufferPostId: id,
      channelId: "ch-1",
      status: "draft",
      textHash: id,
      matchKind,
      preview: `Preview of ${id}`,
      firstSeenAt,
    });
    await deps.db
      .insert(schema.seenPosts)
      .values([
        row("waiting", "none", T0),
        row("asked", "suggested", T0),
        row("decided", "manual", T0),
        row("old", "none", new Date(T0.getTime() - 31 * day)),
      ]);
    const purged = await purgeOldData(deps.db, T0);
    expect(purged.postPreviews).toBe(2);
    const kept = await deps.db
      .select({ id: schema.seenPosts.bufferPostId, preview: schema.seenPosts.preview })
      .from(schema.seenPosts)
      .orderBy(schema.seenPosts.bufferPostId);
    expect(kept).toEqual([
      { id: "asked", preview: "Preview of asked" },
      { id: "decided", preview: null },
      { id: "old", preview: null },
      { id: "waiting", preview: "Preview of waiting" },
    ]);
    // Once the challenge closes, nothing waits any more.
    await closeChallenge(deps.db, host.id, slug, T0);
    expect((await purgeOldData(deps.db, T0)).postPreviews).toBe(2);
  });

  it("deletes link previews after a week, and rate-limit counters after a day", async () => {
    const day = 86_400_000;
    await deps.db.insert(schema.linkPreviews).values([
      {
        url: "https://example.com/old",
        status: "ok",
        title: "Old",
        fetchedAt: new Date(T0.getTime() - 8 * day),
      },
      {
        url: "https://example.com/new",
        status: "ok",
        title: "New",
        fetchedAt: new Date(T0.getTime() - day),
      },
    ]);
    await deps.db.insert(schema.endpointHits).values([
      { key: "send-message:user:old", windowStart: new Date(T0.getTime() - 2 * day), count: 1 },
      { key: "send-message:user:new", windowStart: T0, count: 1 },
    ]);
    const purged = await purgeOldData(deps.db, T0);
    expect(purged).toMatchObject({ previews: 1, counters: 1 });
    const left = await deps.db.select({ url: schema.linkPreviews.url }).from(schema.linkPreviews);
    expect(left).toEqual([{ url: "https://example.com/new" }]);
  });
});
