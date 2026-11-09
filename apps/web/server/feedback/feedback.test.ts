import { and, type Challenge, eq, schema, type User } from "@daydeck/db";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { API_URL, connect, createUser, FakeTokenServer, setupDeps, T0 } from "@/test/buffer-fakes";
import type { BufferDeps } from "../buffer/deps";
import { createChallenge, joinChallenge } from "../challenges/service";
import { markCopy, writeNote } from "./notes";
import {
  closeRequest,
  FeedbackRefusedError,
  feedbackForParticipant,
  replyToRequest,
  requestFeedback,
} from "./service";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterAll(() => server.close());

let deps: BufferDeps;
let close: () => Promise<void>;
let calls: { op: string; auth: string; variables: Record<string, unknown> }[];
let remote: { id: string; text: string; status: string } | null;
/** How the fake Buffer answers createCollaborationNote. */
let noteMode: "ok" | "mutation-error" | "scope" | "changed-api" | "server-error";
let ana: User;
let ben: User;
let cara: User;
let challenge: Challenge;
let anaEntryId: string;

async function addUser(bufferAccountId: string, name: string) {
  const [user] = await deps.db
    .insert(schema.users)
    .values({ bufferAccountId, name, timezone: "Europe/Bucharest" })
    .returning();
  if (!user) throw new Error("no user");
  return user;
}

async function participantOf(user: User) {
  const [row] = await deps.db
    .select()
    .from(schema.participants)
    .where(
      and(
        eq(schema.participants.challengeId, challenge.id),
        eq(schema.participants.userId, user.id),
      ),
    );
  if (!row) throw new Error("not a participant");
  return row;
}

async function connectionStatus(user: User) {
  const [row] = await deps.db
    .select({ status: schema.bufferConnections.status })
    .from(schema.bufferConnections)
    .where(eq(schema.bufferConnections.userId, user.id));
  return row?.status;
}

beforeEach(async () => {
  ({ deps, close } = await setupDeps());
  calls = [];
  remote = { id: "post-a", text: "  My draft about mornings.\nSecond line.  ", status: "draft" };
  noteMode = "ok";
  const fake = new FakeTokenServer();
  ana = await createUser(deps, "acc-ana");
  ben = await addUser("acc-ben", "Ben");
  cara = await addUser("acc-cara", "Cara");
  // Ana gets at-1 and Ben at-2, so a test can see whose token a call used.
  await connect(deps, ana.id, fake.issue(), 60 * 60 * 1000);
  await connect(deps, ben.id, fake.issue(), 60 * 60 * 1000);

  challenge = await createChallenge(
    deps.db,
    ana,
    {
      title: "Kickstart",
      prompts: ["Mornings", "Evenings"].map((title) => ({
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
  await joinChallenge(deps.db, ben, challenge, [], T0);

  const anaParticipant = await participantOf(ana);
  const [first] = await deps.db
    .select({ entry: schema.entries })
    .from(schema.entries)
    .innerJoin(
      schema.challengePrompts,
      eq(schema.challengePrompts.id, schema.entries.challengePromptId),
    )
    .where(
      and(
        eq(schema.entries.participantId, anaParticipant.id),
        eq(schema.challengePrompts.dayIndex, 0),
      ),
    );
  if (!first) throw new Error("no entry");
  anaEntryId = first.entry.id;
  await deps.db
    .update(schema.entries)
    .set({ state: "saved" })
    .where(eq(schema.entries.id, anaEntryId));
  await deps.db
    .insert(schema.entryPosts)
    .values({ entryId: anaEntryId, channelId: "ch-1", bufferPostId: "post-a", matchSource: "app" });

  server.use(
    fake.handler(),
    http.post(API_URL, async ({ request }) => {
      const body = (await request.json()) as { query: string; variables: Record<string, unknown> };
      const op = /(?:query|mutation) (\w+)/.exec(body.query)?.[1] ?? "unknown";
      calls.push({
        op,
        auth: request.headers.get("authorization") ?? "",
        variables: body.variables,
      });
      switch (op) {
        case "PostText":
          return remote && body.variables.id === remote.id
            ? HttpResponse.json({ data: { post: { ...remote, channelId: "ch-1" } } })
            : HttpResponse.json({
                errors: [{ message: "Post not found", extensions: { code: "NOT_FOUND" } }],
              });
        case "CreateCollaborationNote":
          switch (noteMode) {
            case "ok":
              return HttpResponse.json({
                data: {
                  createCollaborationNote: {
                    __typename: "CreateCollaborationNoteSuccess",
                    edge: { node: { id: "note-1" } },
                  },
                },
              });
            case "mutation-error":
              return HttpResponse.json({
                data: {
                  createCollaborationNote: {
                    __typename: "CollaborationNoteThreadClosedError",
                    message: "This thread takes no new notes",
                  },
                },
              });
            case "scope":
              return HttpResponse.json({
                errors: [{ message: "Missing scope", extensions: { code: "INSUFFICIENT_SCOPE" } }],
              });
            case "changed-api":
              // What Buffer answers when an experimental field is renamed or removed.
              return HttpResponse.json(
                {
                  errors: [
                    {
                      message: 'Cannot query field "createCollaborationNote" on type "Mutation".',
                      extensions: { code: "GRAPHQL_VALIDATION_FAILED" },
                    },
                  ],
                },
                { status: 400 },
              );
            case "server-error":
              return new HttpResponse("oops", { status: 502 });
          }
          break;
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

const ask = () => requestFeedback(deps, { userId: ana.id, entryId: anaEntryId });
const reply = (user: User, requestId: string, text = "Nice hook", notesEnabled = true) =>
  replyToRequest(deps.db, { userId: user.id, requestId, text }, { notesEnabled });

async function item(id: string) {
  const [row] = await deps.db
    .select()
    .from(schema.feedbackItems)
    .where(eq(schema.feedbackItems.id, id));
  return row;
}

describe("asking for feedback", () => {
  it("stores the draft text read from Buffer with the asker's own token", async () => {
    const { request, created } = await ask();
    expect(created).toBe(true);
    expect(request).toMatchObject({
      entryId: anaEntryId,
      bufferPostId: "post-a",
      draftSnapshot: "My draft about mornings.\nSecond line.",
      status: "open",
    });
    expect(calls).toEqual([{ op: "PostText", auth: "Bearer at-1", variables: { id: "post-a" } }]);

    // Asking again while the request is open returns it, without reading Buffer again.
    const again = await ask();
    expect(again).toMatchObject({ created: false, request: { id: request.id } });
    expect(calls).toHaveLength(1);
  });

  it("refuses another person's day, a day with no draft, and a sent post", async () => {
    await expect(requestFeedback(deps, { userId: ben.id, entryId: anaEntryId })).rejects.toThrow(
      FeedbackRefusedError,
    );

    await deps.db.delete(schema.entryPosts).where(eq(schema.entryPosts.entryId, anaEntryId));
    await expect(ask()).rejects.toThrow("Save this day as a draft in Buffer first");

    await deps.db.insert(schema.entryPosts).values({
      entryId: anaEntryId,
      channelId: "ch-1",
      bufferPostId: "post-a",
      matchSource: "app",
    });
    remote = { id: "post-a", text: "Already out", status: "sent" };
    await expect(ask()).rejects.toThrow("already sent");
    expect(await deps.db.select().from(schema.feedbackRequests)).toHaveLength(0);
  });
});

describe("replying", () => {
  it("lets only active members of the same challenge reply, and not to their own request", async () => {
    const { request } = await ask();

    // Cara is not in this challenge.
    await expect(reply(cara, request.id)).rejects.toThrow("Only people in this challenge");
    // Ana cannot reply to herself.
    await expect(reply(ana, request.id)).rejects.toThrow("your own request");
    // Ben can.
    const sent = await reply(ben, request.id);
    expect(sent).toMatchObject({ requestId: request.id, text: "Nice hook", noteStatus: "pending" });

    // A member who left the challenge cannot reply.
    await deps.db
      .update(schema.participants)
      .set({ status: "left" })
      .where(eq(schema.participants.id, (await participantOf(ben)).id));
    await expect(reply(ben, request.id)).rejects.toThrow("Only people in this challenge");
  });

  it("checks the reply text and closes only for the person who asked", async () => {
    const { request } = await ask();
    await expect(reply(ben, request.id, "   ")).rejects.toThrow("Write a reply first.");
    await expect(reply(ben, request.id, "x".repeat(2_001))).rejects.toThrow("2,000 characters");

    await expect(closeRequest(deps.db, { userId: ben.id, requestId: request.id })).rejects.toThrow(
      "Only the person who asked",
    );
    await closeRequest(deps.db, { userId: ana.id, requestId: request.id });
    await expect(reply(ben, request.id)).rejects.toThrow("This request is closed");
  });

  it("shows each member only what they may see", async () => {
    const { request } = await ask();
    const sent = await reply(ben, request.id);
    const anaView = await feedbackForParticipant(
      deps.db,
      { participantId: (await participantOf(ana)).id, challengeId: challenge.id, userId: ana.id },
      T0,
    );
    const benParticipant = await participantOf(ben);
    const benView = await feedbackForParticipant(
      deps.db,
      { participantId: benParticipant.id, challengeId: challenge.id, userId: ben.id },
      T0,
    );

    expect(anaView.forGroup).toEqual([]);
    expect(anaView.mine).toMatchObject([
      {
        id: request.id,
        status: "open",
        dayNumber: 1,
        promptTitle: "Mornings",
        draftsUrl: "https://publish.buffer.com/channels/ch-1/schedule?tab=drafts",
        replies: [
          {
            id: sent.id,
            authorName: "Ben",
            text: "Nice hook",
            display: "saving",
            noteText: "Feedback from Ben (via Daydeck): Nice hook",
          },
        ],
      },
    ]);
    expect(benView.mine).toEqual([]);
    expect(benView.forGroup).toMatchObject([
      {
        id: request.id,
        askerName: "Ana",
        draftSnapshot: "My draft about mornings.\nSecond line.",
        myReplies: [{ id: sent.id, text: "Nice hook" }],
        canReply: true,
      },
    ]);

    // Someone else's participant ID shows nothing, and a closed request leaves the group's list.
    const borrowed = await feedbackForParticipant(
      deps.db,
      { participantId: benParticipant.id, challengeId: challenge.id, userId: cara.id },
      T0,
    );
    expect(borrowed).toEqual({ forGroup: [], mine: [] });
    await closeRequest(deps.db, { userId: ana.id, requestId: request.id });
    const afterClose = await feedbackForParticipant(
      deps.db,
      { participantId: benParticipant.id, challengeId: challenge.id, userId: ben.id },
      T0,
    );
    expect(afterClose.forGroup).toEqual([]);
  });
});

describe("writing the Note", () => {
  it("writes the reply as a Note on the asker's draft with the asker's token", async () => {
    const { request } = await ask();
    const sent = await reply(ben, request.id);
    calls = [];

    expect(await writeNote(deps, sent.id, { notesEnabled: true })).toBe("written");
    expect(calls).toEqual([
      {
        op: "CreateCollaborationNote",
        auth: "Bearer at-1",
        variables: {
          input: {
            subject: { postId: "post-a" },
            text: "Feedback from Ben (via Daydeck): Nice hook",
          },
        },
      },
    ]);
    expect(await item(sent.id)).toMatchObject({
      noteStatus: "written",
      bufferNoteId: "note-1",
      writtenAt: T0,
    });

    // Running it again (a retried job) writes nothing new.
    expect(await writeNote(deps, sent.id, { notesEnabled: true })).toBe("written");
    expect(calls).toHaveLength(1);
  });

  it("gives the copy button when the flag is off, without calling Buffer", async () => {
    const { request } = await ask();
    calls = [];
    // With the flag off a reply starts as "copy".
    const offAtReply = await reply(ben, request.id, "Shorter title?", false);
    expect(offAtReply.noteStatus).toBe("copy");

    // A reply queued while the flag was on, written after it was turned off.
    const queued = await reply(ben, request.id);
    expect(await writeNote(deps, queued.id, { notesEnabled: false })).toBe("copy");
    expect(calls).toEqual([]);
  });

  it.each([
    ["a Buffer error type", "mutation-error"],
    ["a missing notes scope", "scope"],
    ["a changed experimental API", "changed-api"],
  ] as const)("gives the copy button after %s", async (_label, mode) => {
    const { request } = await ask();
    const sent = await reply(ben, request.id);
    noteMode = mode;

    // Even inside the background job, a refusal is final: retrying would not help.
    expect(await writeNote(deps, sent.id, { notesEnabled: true, retryable: true })).toBe("copy");
    expect(await item(sent.id)).toMatchObject({ noteStatus: "copy", bufferNoteId: null });
    // An optional scope never pauses the asker's whole Buffer connection.
    expect(await connectionStatus(ana)).toBe("active");
  });

  it("lets the job retry a passing failure, and gives the copy button when retries run out", async () => {
    const { request } = await ask();
    const sent = await reply(ben, request.id);
    noteMode = "server-error";

    await expect(
      writeNote(deps, sent.id, { notesEnabled: true, retryable: true }),
    ).rejects.toThrow();
    expect((await item(sent.id))?.noteStatus).toBe("pending");

    // The job's onFailure step, after the last retry.
    expect(await markCopy(deps.db, sent.id)).toBe("copy");

    // Without the job (a local run), the first failure gives the copy button straight away.
    const direct = await reply(ben, request.id, "Another thought");
    expect(await writeNote(deps, direct.id, { notesEnabled: true })).toBe("copy");
  });
});
