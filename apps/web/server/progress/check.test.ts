import { eq, schema } from "@daydeck/db";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { postPreview } from "@/lib/post-preview";
import { API_URL, connect, createUser, FakeTokenServer, setupDeps, T0 } from "@/test/buffer-fakes";
import type { BufferDeps } from "../buffer/deps";
import { createChallenge } from "../challenges/service";
import { checkParticipant, type MatchPost } from "./check";
import { assignPost } from "./manual";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterAll(() => server.close());

let deps: BufferDeps;
let clock: { now: Date };
let close: () => Promise<void>;
let calls: { op: string; variables: Record<string, unknown> }[];
let remote: RemotePost[];
let participantId: string;
let userId: string;

interface RemotePost {
  id: string;
  text: string;
  status: "draft" | "needs_approval" | "scheduled" | "sending" | "sent" | "error";
  dueAt: string | null;
  sentAt: string | null;
  createdAt: string;
  tags: { id: string }[];
  error: { message: string; supportUrl: string | null } | null;
}

function post(id: string, overrides: Partial<RemotePost> = {}): RemotePost {
  return {
    id,
    text: `Text of ${id}`,
    status: "draft",
    dueAt: null,
    sentAt: null,
    createdAt: new Date(T0.getTime() + 60_000).toISOString(),
    tags: [],
    error: null,
    ...overrides,
  };
}

beforeEach(async () => {
  ({ deps, clock, close } = await setupDeps());
  calls = [];
  remote = [];
  const fake = new FakeTokenServer();
  const user = await createUser(deps);
  userId = user.id;
  await connect(deps, userId, fake.issue(), 60 * 60 * 1000);
  await deps.db.insert(schema.channels).values({
    userId,
    organizationId: "org-1",
    bufferChannelId: "ch-1",
    service: "linkedin",
    name: "Ana on LinkedIn",
    timezone: "Europe/Bucharest",
    selected: true,
    syncedAt: T0,
  });
  await createChallenge(
    deps.db,
    user,
    {
      title: "Kickstart",
      prompts: ["One", "Two", "Three"].map((title) => ({
        title,
        description: `About ${title}`,
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
  const [participant] = await deps.db.select().from(schema.participants);
  if (!participant) throw new Error("no participant");
  participantId = participant.id;
  await deps.db
    .update(schema.participants)
    .set({ bufferTagId: "tag-challenge", channelIds: ["ch-1"] })
    .where(eq(schema.participants.id, participantId));

  server.use(
    fake.handler(),
    http.post(API_URL, async ({ request }) => {
      const body = (await request.json()) as { query: string; variables: Record<string, unknown> };
      const op = /(?:query|mutation) (\w+)/.exec(body.query)?.[1] ?? "unknown";
      calls.push({ op, variables: body.variables });
      switch (op) {
        case "ParticipantPosts":
          return HttpResponse.json({
            data: {
              posts: {
                edges: remote.map((node) => ({
                  node: { ...node, via: "buffer", externalLink: null, channelId: "ch-1" },
                })),
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          });
        case "TagPost":
          return HttpResponse.json({ data: { editPost: { __typename: "PostActionSuccess" } } });
        default:
          return HttpResponse.json({ errors: [{ message: `unexpected ${op}` }] });
      }
    }),
  );
});
afterEach(async () => {
  server.resetHandlers();
  await close();
});

async function days() {
  const rows = await deps.db
    .select({ entry: schema.entries, prompt: schema.challengePrompts })
    .from(schema.entries)
    .innerJoin(
      schema.challengePrompts,
      eq(schema.challengePrompts.id, schema.entries.challengePromptId),
    )
    .orderBy(schema.challengePrompts.dayIndex);
  return rows.map((row) => row.entry);
}

async function linkDay(index: number, bufferPostId: string) {
  const day = (await days())[index];
  if (!day) throw new Error("no day");
  await deps.db.update(schema.entries).set({ state: "saved" }).where(eq(schema.entries.id, day.id));
  await deps.db
    .insert(schema.entryPosts)
    .values({ entryId: day.id, channelId: "ch-1", bufferPostId, matchSource: "app" });
  return day.id;
}

/** The posts of one day, by its position. */
async function postsOf(index: number) {
  const day = (await days())[index];
  if (!day) return [];
  return deps.db.select().from(schema.entryPosts).where(eq(schema.entryPosts.entryId, day.id));
}

const check = (matchPost: MatchPost | null = null, mode: "background" | "user" = "background") =>
  checkParticipant(deps, participantId, { matchPost, mode });

describe("posts the app created", () => {
  it("follows a draft through scheduled and sent, and reverts when deleted", async () => {
    await linkDay(0, "post-a");

    remote = [post("post-a", { status: "scheduled", dueAt: "2026-11-08T16:00:00.000Z" })];
    await check();
    expect((await days())[0]?.state).toBe("planned");

    // Sent at 18:00 local on the prompt's own day: on time.
    remote = [post("post-a", { status: "sent", sentAt: "2026-11-08T16:00:00.000Z" })];
    await check();
    expect((await days())[0]).toMatchObject({ state: "done" });
    expect((await postsOf(0))[0]).toMatchObject({ status: "sent", matchSource: "app" });

    // A draft deleted in Buffer frees its day; a sent post never goes back.
    const second = await linkDay(1, "post-b");
    remote = [post("post-a", { status: "sent", sentAt: "2026-11-08T16:00:00.000Z" })];
    await check();
    const after = await days();
    expect(after.find((day) => day.id === second)).toMatchObject({ state: "open" });
    expect(await postsOf(1)).toHaveLength(0);
    expect(after[0]?.state).toBe("done");
  });

  it("only reads posts created since the participant joined", async () => {
    await check();
    const read = calls.find((call) => call.op === "ParticipantPosts");
    const [participant] = await deps.db.select().from(schema.participants);
    expect(read?.variables.since).toBe(participant?.joinedAt.toISOString());
    expect(read?.variables.channelIds).toEqual(["ch-1"]);
  });

  it("raises one alert for a failed post, with Buffer's reason, and clears it once fixed", async () => {
    await linkDay(0, "post-a");
    remote = [
      post("post-a", {
        status: "error",
        error: { message: "The image is too large", supportUrl: "https://support.buffer.com/x" },
      }),
    ];
    await check();
    await check();
    const raised = await deps.db.select().from(schema.alerts);
    expect(raised).toHaveLength(1);
    expect(raised[0]).toMatchObject({
      kind: "failed_post",
      readAt: null,
      payload: { message: "The image is too large", channelName: "Ana on LinkedIn" },
    });

    remote = [post("post-a", { status: "scheduled" })];
    await check();
    const [cleared] = await deps.db.select().from(schema.alerts);
    expect(cleared?.readAt).not.toBeNull();
  });
});

describe("posts written elsewhere", () => {
  it("auto-matches a confident post to its day and tags it in Buffer", async () => {
    remote = [post("native-1", { status: "scheduled", tags: [{ id: "tag-other" }] })];
    const asked: string[][] = [];
    const matcher: MatchPost = async (_text, candidates) => {
      asked.push(candidates.map((candidate) => candidate.title));
      return { kind: "auto", entryId: candidates[1]?.id ?? null, confidence: 0.9 };
    };
    await check(matcher);

    // Today's prompt first, then the closest days.
    expect(asked[0]).toEqual(["One", "Two", "Three"]);
    const day = (await days())[1];
    expect(day).toMatchObject({ state: "planned" });
    expect((await postsOf(1))[0]).toMatchObject({
      bufferPostId: "native-1",
      matchSource: "matcher",
    });
    const tag = calls.find((call) => call.op === "TagPost");
    expect(tag?.variables.input).toEqual({
      id: "native-1",
      tagIds: ["tag-other", "tag-challenge"],
    });
  });

  it("asks the participant to confirm an unsure match, and matches each text once", async () => {
    remote = [post("native-2")];
    let asked = 0;
    const matcher: MatchPost = async (_text, candidates) => {
      asked += 1;
      return { kind: "suggest", entryId: candidates[0]?.id ?? null, confidence: 0.6 };
    };
    await check(matcher);
    await check(matcher);
    expect(asked).toBe(1);
    const [seen] = await deps.db.select().from(schema.seenPosts);
    expect(seen).toMatchObject({ matchKind: "suggested", entryId: null });
    expect(seen?.suggestedEntryId).toBe((await days())[0]?.id);
    expect((await days())[0]?.state).toBe("open");

    // An edit in Buffer changes the text, so the post is matched again.
    remote = [post("native-2", { text: "A new text" })];
    await check(matcher);
    expect(asked).toBe(2);
  });

  it("keeps a post's first 100 characters only while it waits for its day", async () => {
    const long = `Behind the scenes of my desk:   ${"a notebook and a mug. ".repeat(8)}`;
    remote = [post("native-4", { text: long })];
    await check(null);
    const [waiting] = await deps.db.select().from(schema.seenPosts);
    expect(waiting?.matchKind).toBe("none");
    expect(waiting?.preview).toBe(postPreview(long));
    expect(Array.from(waiting?.preview ?? "")).toHaveLength(100);
    expect(waiting?.preview?.startsWith("Behind the scenes of my desk: a notebook")).toBe(true);

    // Given a day by hand: the preview goes at once.
    const firstDay = (await days())[0];
    if (!waiting || !firstDay) throw new Error("setup");
    await assignPost(deps.db, userId, waiting.id, firstDay.id);
    const [decided] = await deps.db.select().from(schema.seenPosts);
    expect(decided).toMatchObject({ matchKind: "manual", preview: null });
    // And a later check does not bring it back.
    await check(null);
    const [after] = await deps.db.select().from(schema.seenPosts);
    expect(after?.preview).toBeNull();
  });

  it("keeps no preview for a post the AI matched", async () => {
    remote = [post("native-5")];
    await check(async (_text, candidates) => ({
      kind: "auto",
      entryId: candidates[0]?.id ?? null,
      confidence: 0.95,
    }));
    const [matched] = await deps.db.select().from(schema.seenPosts);
    expect(matched).toMatchObject({ matchKind: "auto", preview: null });
  });

  it("lists posts as unmatched when no matcher is configured", async () => {
    remote = [post("native-3")];
    const result = await check(null);
    expect(result).toMatchObject({ status: "checked", unmatched: 1, suggested: 0 });
    expect((await days()).every((day) => day.state === "open")).toBe(true);
  });
});

describe("budget and connection", () => {
  it("defers a background check below 10% of a window, while Check now still runs", async () => {
    const resetAt = new Date(T0.getTime() + 7 * 60_000);
    await deps.db
      .insert(schema.rateLimitSnapshots)
      .values({ windowSeconds: 900, quota: 110, remaining: 9, resetAt, capturedAt: T0 });
    expect(await check(null, "background")).toEqual({ status: "deferred", retryAt: resetAt });
    expect(calls).toHaveLength(0);
    expect((await check(null, "user")).status).toBe("checked");
  });

  it("stops and raises one alert when Buffer needs connecting again", async () => {
    await deps.db.update(schema.bufferConnections).set({ status: "needs_reconnect" });
    expect(await check()).toEqual({ status: "skipped", reason: "needs-reconnect" });
    await check();
    const raised = await deps.db.select().from(schema.alerts);
    expect(raised.map((alert) => alert.kind)).toEqual(["needs_reconnect"]);
    expect(calls).toHaveLength(0);
    clock.now = new Date(T0.getTime() + 60_000);
  });
});

describe("matchDescription", () => {
  it("adds the steps after the explanation and keeps the text short", async () => {
    const { matchDescription } = await import("./check");
    expect(
      matchDescription({
        description: "That pull tells you where you want to go.",
        steps: ["Think of a moment.", " ", "Share what it showed you."],
      }),
    ).toBe(
      "That pull tells you where you want to go. Think of a moment. Share what it showed you.",
    );
    expect(matchDescription({ description: "", steps: [] })).toBe("");
    const long = matchDescription({ description: "x".repeat(900) });
    expect(long).toHaveLength(700);
    expect(long.endsWith("…")).toBe(true);
  });
});
