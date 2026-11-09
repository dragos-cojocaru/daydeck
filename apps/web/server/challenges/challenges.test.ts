import { and, eq, schema } from "@daydeck/db";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { API_URL, connect, createUser, FakeTokenServer, setupDeps, T0 } from "@/test/buffer-fakes";
import type { BufferDeps } from "../buffer/deps";
import { gettingStarted } from "../onboarding";
import { SaveRefusedError, saveToBuffer } from "./save";
import {
  challengeForMember,
  createChallenge,
  joinChallenge,
  setParticipantChannels,
  starterSets,
  todayOverview,
} from "./service";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterAll(() => server.close());

let deps: BufferDeps;
let close: () => Promise<void>;
let calls: { op: string; input: Record<string, unknown> }[];
let failTags: boolean;

const PROMPTS = [
  { title: "One", description: "", body: "Body one", emoji: "1️⃣", bufferTemplateId: null },
  { title: "Two", description: "", body: "", emoji: "", bufferTemplateId: "tpl-2" },
  { title: "Three", description: "", body: "", emoji: "", bufferTemplateId: null },
];

beforeEach(async () => {
  ({ deps, close } = await setupDeps());
  calls = [];
  failTags = false;
  const fake = new FakeTokenServer();
  server.use(
    fake.handler(),
    http.post(API_URL, async ({ request }) => {
      const body = (await request.json()) as {
        query: string;
        variables: { input?: Record<string, unknown> };
      };
      const op = /(?:query|mutation) (\w+)/.exec(body.query)?.[1] ?? "unknown";
      calls.push({ op, input: body.variables.input ?? {} });
      switch (op) {
        case "Tags":
          return HttpResponse.json({
            data: { tagsV2: { pageInfo: { hasNextPage: false, endCursor: null }, edges: [] } },
          });
        case "CreateTag":
          return failTags
            ? HttpResponse.json({
                data: {
                  createTag: { __typename: "LimitReachedError", message: "Tag limit reached" },
                },
              })
            : HttpResponse.json({
                data: {
                  createTag: { __typename: "TagActionSuccess", tag: { id: "tag-1", name: "x" } },
                },
              });
        case "CreateDraft":
          return HttpResponse.json({
            data: {
              createPost: {
                __typename: "PostActionSuccess",
                post: {
                  id: `post-${calls.length}`,
                  status: "draft",
                  dueAt: null,
                  channelId: "ch-1",
                },
              },
            },
          });
        case "CreateIdea":
          return HttpResponse.json({ data: { createIdea: { __typename: "Idea", id: "idea-1" } } });
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

async function setupHostAndGuest() {
  const fake = new FakeTokenServer();
  const host = await createUser(deps, "acc-host");
  const guest = await createUser(deps, "acc-guest");
  await deps.db
    .update(schema.users)
    .set({ timezone: "America/New_York" })
    .where(eq(schema.users.id, guest.id));
  for (const user of [host, guest]) {
    await connect(deps, user.id, fake.issue(), 60 * 60 * 1000);
    await deps.db.insert(schema.channels).values({
      userId: user.id,
      bufferChannelId: `ch-${user.bufferAccountId}`,
      organizationId: "org-1",
      service: "linkedin",
      name: `${user.bufferAccountId} channel`,
      timezone: "Europe/Bucharest",
      selected: true,
      syncedAt: T0,
    });
  }
  const challenge = await createChallenge(
    deps.db,
    host,
    {
      title: "Test challenge",
      prompts: PROMPTS,
      cadence: "daily",
      startMode: "rolling",
      startDate: "2026-11-08",
      timezone: "Europe/Bucharest",
      visibility: "private",
    },
    T0,
  );
  const [guestRow] = await deps.db.select().from(schema.users).where(eq(schema.users.id, guest.id));
  return { host, guest: guestRow ?? guest, challenge };
}

describe("starter sets", () => {
  it("are seeded into every new database", async () => {
    const sets = await starterSets(deps.db);
    expect(sets.map((set) => [set.slug, set.prompts.length])).toEqual([
      ["starter-five-day-kickstart", 5],
      ["starter-build-in-public-week", 7],
      ["starter-two-week-habit", 10],
    ]);
  });
});

describe("createChallenge and joinChallenge", () => {
  it("copies the prompts and makes the host the first participant, with their channels", async () => {
    const { host, challenge } = await setupHostAndGuest();
    expect(challenge.inviteCode).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(challenge.tagName).toBe("Daydeck: Test challenge");
    const view = await challengeForMember(deps.db, challenge.slug, host.id, T0);
    expect(view?.participant?.role).toBe("host");
    expect(view?.participant?.channelIds).toEqual(["ch-acc-host"]);
    expect(
      view && "days" in view && view.days
        ? view.days.map((day) => [day.prompt.title, day.entry.state, day.date])
        : [],
    ).toEqual([
      ["One", "open", "2026-11-08"],
      ["Two", "open", "2026-11-09"],
      ["Three", "open", "2026-11-10"],
    ]);
  });

  it("joins once, uses the person's own time zone for a rolling start, and keeps unknown channels out", async () => {
    const { guest, challenge } = await setupHostAndGuest();
    // 03:00 UTC on 8 November is still 7 November in New York.
    const joinedAt = new Date("2026-11-08T03:00:00Z");
    const first = await joinChallenge(
      deps.db,
      guest,
      challenge,
      ["ch-acc-guest", "ch-someone-else"],
      joinedAt,
    );
    const again = await joinChallenge(deps.db, guest, challenge, ["ch-acc-guest"], joinedAt);
    expect(again.id).toBe(first.id);
    expect(first.channelIds).toEqual(["ch-acc-guest"]);
    // Joining before the rolling challenge opens starts on its opening day.
    expect(first.dayOne).toBe("2026-11-08");
    expect(first.timezone).toBe("America/New_York");
    const entries = await deps.db
      .select()
      .from(schema.entries)
      .where(eq(schema.entries.participantId, first.id));
    expect(entries).toHaveLength(3);
  });

  it("counts only channels on the challenge's networks, for the host and for people who join", async () => {
    const { host, guest } = await setupHostAndGuest();
    await deps.db.insert(schema.channels).values({
      userId: guest.id,
      bufferChannelId: "ch-guest-x",
      organizationId: "org-1",
      service: "twitter",
      name: "guest on X",
      timezone: "Europe/Bucharest",
      selected: true,
      syncedAt: T0,
    });
    const xOnly = await createChallenge(
      deps.db,
      host,
      {
        title: "X only",
        prompts: PROMPTS,
        cadence: "daily",
        startMode: "rolling",
        startDate: "2026-11-08",
        timezone: "Europe/Bucharest",
        visibility: "private",
        allowedServices: ["twitter"],
      },
      T0,
    );
    expect(xOnly.allowedServices).toEqual(["twitter"]);
    // The host only has a LinkedIn channel, so none of theirs counts here.
    const [hostRow] = await deps.db
      .select()
      .from(schema.participants)
      .where(eq(schema.participants.challengeId, xOnly.id));
    expect(hostRow?.channelIds).toEqual([]);
    const joined = await joinChallenge(deps.db, guest, xOnly, ["ch-acc-guest", "ch-guest-x"], T0);
    expect(joined.channelIds).toEqual(["ch-guest-x"]);
    const changed = await setParticipantChannels(deps.db, joined, ["ch-acc-guest"]);
    expect(changed).toEqual([]);
  });
});

describe("saveToBuffer", () => {
  async function entryOf(userId: string, challengeId: string, dayIndex: number) {
    const [row] = await deps.db
      .select({ entry: schema.entries })
      .from(schema.entries)
      .innerJoin(schema.participants, eq(schema.participants.id, schema.entries.participantId))
      .innerJoin(
        schema.challengePrompts,
        eq(schema.challengePrompts.id, schema.entries.challengePromptId),
      )
      .where(
        and(
          eq(schema.participants.userId, userId),
          eq(schema.participants.challengeId, challengeId),
          eq(schema.challengePrompts.dayIndex, dayIndex),
        ),
      );
    if (!row) throw new Error("no entry");
    return row.entry;
  }

  it("saves a draft with the challenge tag and marks the day as saved", async () => {
    const { host, challenge } = await setupHostAndGuest();
    const entry = await entryOf(host.id, challenge.id, 0);
    const result = await saveToBuffer(deps, {
      userId: host.id,
      entryId: entry.id,
      kind: "draft",
      channelIds: ["ch-acc-host"],
    });
    expect(result).toMatchObject({
      kind: "draft",
      saved: [{ channelId: "ch-acc-host", name: "acc-host channel" }],
      failed: [],
      tagged: true,
    });

    const draft = calls.find((call) => call.op === "CreateDraft");
    expect(draft?.input).toMatchObject({
      channelId: "ch-acc-host",
      text: "Body one",
      saveToDraft: true,
      mode: "addToQueue",
      tagIds: ["tag-1"],
    });
    const saved = await entryOf(host.id, challenge.id, 0);
    expect(saved.state).toBe("saved");
    const [post] = await deps.db
      .select()
      .from(schema.entryPosts)
      .where(eq(schema.entryPosts.entryId, saved.id));
    expect(post).toMatchObject({
      channelId: "ch-acc-host",
      status: "draft",
      matchSource: "app",
    });

    // The tag is created once per participant, then reused.
    const second = await entryOf(host.id, challenge.id, 1);
    await saveToBuffer(deps, {
      userId: host.id,
      entryId: second.id,
      kind: "draft",
      channelIds: ["ch-acc-host"],
    });
    expect(calls.filter((call) => call.op === "CreateTag")).toHaveLength(1);
  });

  it("still saves the draft when the tag cannot be created", async () => {
    failTags = true;
    const { host, challenge } = await setupHostAndGuest();
    const entry = await entryOf(host.id, challenge.id, 0);
    const result = await saveToBuffer(deps, {
      userId: host.id,
      entryId: entry.id,
      kind: "draft",
      channelIds: ["ch-acc-host"],
    });
    expect(result.tagged).toBe(false);
    expect(calls.find((call) => call.op === "CreateDraft")?.input.tagIds).toBeUndefined();
  });

  it("saves an idea with the Buffer template it came from", async () => {
    const { host, challenge } = await setupHostAndGuest();
    const entry = await entryOf(host.id, challenge.id, 1);
    await saveToBuffer(deps, { userId: host.id, entryId: entry.id, kind: "idea", channelIds: [] });
    expect(calls.find((call) => call.op === "CreateIdea")?.input).toMatchObject({
      templateId: "tpl-2",
    });
    expect((await entryOf(host.id, challenge.id, 1)).bufferIdeaId).toBe("idea-1");
  });

  it("refuses someone else's prompt and channels that do not count", async () => {
    const { host, guest, challenge } = await setupHostAndGuest();
    const hostEntry = await entryOf(host.id, challenge.id, 0);
    await expect(
      saveToBuffer(deps, {
        userId: guest.id,
        entryId: hostEntry.id,
        kind: "draft",
        channelIds: ["ch-acc-guest"],
      }),
    ).rejects.toBeInstanceOf(SaveRefusedError);
    await expect(
      saveToBuffer(deps, {
        userId: host.id,
        entryId: hostEntry.id,
        kind: "draft",
        channelIds: ["ch-acc-guest"],
      }),
    ).rejects.toBeInstanceOf(SaveRefusedError);
    expect(calls.filter((call) => call.op === "CreateDraft")).toHaveLength(0);
  });

  it("never moves a day backwards when it is saved again", async () => {
    const { host, challenge } = await setupHostAndGuest();
    const entry = await entryOf(host.id, challenge.id, 0);
    await deps.db
      .update(schema.entries)
      .set({ state: "done" })
      .where(eq(schema.entries.id, entry.id));
    await saveToBuffer(deps, {
      userId: host.id,
      entryId: entry.id,
      kind: "draft",
      channelIds: ["ch-acc-host"],
    });
    expect((await entryOf(host.id, challenge.id, 0)).state).toBe("done");
  });
});

describe("home page data", () => {
  it("ticks off getting-started steps from real data, in order", async () => {
    const fresh = await createUser(deps, "acc-fresh");
    const steps = async () =>
      (await gettingStarted(deps.db, fresh.id)).map((step) => [step.key, step.done]);
    expect(await steps()).toEqual([
      ["connect", true],
      ["channels", false],
      ["challenge", false],
      ["save", false],
    ]);

    const { host, challenge } = await setupHostAndGuest();
    const hostSteps = await gettingStarted(deps.db, host.id);
    expect(hostSteps.map((step) => step.done)).toEqual([true, true, true, false]);
    // The next step links to the challenge, where the prompt can be saved.
    expect(hostSteps[3]?.href).toBe(`/challenges/${challenge.slug}`);
  });

  it("shows today's prompt and how many days are in Buffer for each challenge", async () => {
    const { host, challenge } = await setupHostAndGuest();
    const [first] = await todayOverview(deps.db, host.id, new Date("2026-11-09T10:00:00Z"));
    expect(first).toMatchObject({
      slug: challenge.slug,
      role: "host",
      days: 3,
      savedCount: 0,
      position: { kind: "prompt", index: 1 },
      prompt: { dayNumber: 2, title: "Two", state: "open" },
    });
    const [after] = await todayOverview(deps.db, host.id, new Date("2026-11-20T10:00:00Z"));
    expect(after?.position.kind).toBe("after");
    expect(after?.prompt).toBeNull();
  });
});
