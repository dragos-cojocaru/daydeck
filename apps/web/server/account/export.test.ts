import { eq, schema } from "@daydeck/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { connect, createUser, setupDeps, T0 } from "@/test/buffer-fakes";
import type { BufferDeps } from "../buffer/deps";
import { createChallenge, joinChallenge } from "../challenges/service";
import { EXPORT_FORMAT, exportMyData } from "./export";

// "Download a copy": the file holds the person's own data, and nothing that could hurt them or
// someone else if it leaked: no tokens, no session IDs, no other people's words or names.

let deps: BufferDeps;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ deps, close } = await setupDeps());
});
afterEach(async () => {
  await close();
});

const SECRET = { accessToken: "secret-access-xyz", refreshToken: "secret-refresh-xyz" };

async function world() {
  const db = deps.db;
  const host = await createUser(deps, "acc-host");
  const guest = await createUser(deps, "acc-guest");
  await db.update(schema.users).set({ name: "Zed Host" }).where(eq(schema.users.id, host.id));
  await db.update(schema.users).set({ name: "Ben" }).where(eq(schema.users.id, guest.id));
  await connect(deps, guest.id, SECRET, 60 * 60 * 1000);
  await db
    .insert(schema.sessions)
    .values({ idHash: "session-hash-xyz", userId: guest.id, expiresAt: T0 });
  const challenge = await createChallenge(
    db,
    host,
    {
      title: "Kickstart",
      prompts: ["One", "Two"].map((title) => ({
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
  const me = await joinChallenge(db, { ...guest, name: "Ben" }, challenge, [], T0);
  const [hostRow] = await db
    .select()
    .from(schema.participants)
    .where(eq(schema.participants.userId, host.id));
  const [prompt] = await db
    .select()
    .from(schema.challengePrompts)
    .where(eq(schema.challengePrompts.challengeId, challenge.id));
  if (!hostRow || !prompt) throw new Error("setup failed");

  // Ben's day, a draft he shares, and a reply from the host on it.
  // Joining creates a row for each day; this one becomes a saved draft.
  const [entry] = await db
    .update(schema.entries)
    .set({ state: "saved" })
    .where(eq(schema.entries.participantId, me.id))
    .returning();
  if (!entry) throw new Error("no entry");
  await db.insert(schema.entryPosts).values({
    entryId: entry.id,
    channelId: "ch-1",
    bufferPostId: "post-1",
    externalLink: "https://example.com/post-1",
  });
  const [request] = await db
    .insert(schema.feedbackRequests)
    .values({
      entryId: entry.id,
      requesterId: me.id,
      bufferPostId: "post-1",
      draftSnapshot: "Ben's own draft text",
    })
    .returning();
  if (!request) throw new Error("no request");
  await db
    .insert(schema.feedbackItems)
    .values({ requestId: request.id, authorId: hostRow.id, text: "Zed's private feedback" });

  // A message each, and a reaction each on the other's message.
  const [hostMessage] = await db
    .insert(schema.messages)
    .values({ challengeId: challenge.id, channel: "chat", authorId: host.id, body: "Zed says hi" })
    .returning();
  const [myMessage] = await db
    .insert(schema.messages)
    .values({ challengeId: challenge.id, channel: "chat", authorId: guest.id, body: "Ben says hi" })
    .returning();
  if (!hostMessage || !myMessage) throw new Error("no messages");
  await db.insert(schema.messageReactions).values([
    { messageId: hostMessage.id, userId: guest.id, emoji: "🔥" },
    { messageId: myMessage.id, userId: host.id, emoji: "👏" },
  ]);
  return { guest, challenge, hostMessage };
}

describe("exportMyData", () => {
  it("holds the person's own data", async () => {
    const { guest, challenge, hostMessage } = await world();
    const data = await exportMyData(deps.db, guest.id, T0);
    if (!data) throw new Error("no export");
    expect(data.format).toBe(EXPORT_FORMAT);
    expect(data.account).toMatchObject({ bufferAccountId: "acc-guest", name: "Ben" });
    expect(data.bufferConnection?.scopes).toContain("posts:read");
    expect(data.signIns).toHaveLength(1);
    expect(data.challenges).toHaveLength(1);
    expect(data.challenges[0]).toMatchObject({ slug: challenge.slug, role: "participant" });
    expect(data.challenges[0]?.days[0]?.posts[0]).toMatchObject({ bufferPostId: "post-1" });
    expect(data.feedbackYouAskedFor[0]).toMatchObject({ draft: "Ben's own draft text" });
    expect(data.messages.map((m) => m.text)).toEqual(["Ben says hi"]);
    // A reaction names the message it is on, by ID only.
    expect(data.reactions).toEqual([
      expect.objectContaining({ messageId: hostMessage.id, emoji: "🔥" }),
    ]);
  });

  it("leaves out tokens, session IDs, and what other people wrote or are called", async () => {
    const { guest } = await world();
    const json = JSON.stringify(await exportMyData(deps.db, guest.id, T0));
    for (const secret of ["secret-access-xyz", "secret-refresh-xyz", "session-hash-xyz"]) {
      expect(json).not.toContain(secret);
    }
    const [grant] = await deps.db.select().from(schema.bufferConnections);
    expect(json).not.toContain(grant?.accessTokenEnc);
    expect(json).not.toContain(grant?.refreshTokenEnc);
    expect(json).not.toMatch(/tokenEnc|idHash|textHash|keyId/);
    expect(json).not.toContain("Zed");
    expect(json).not.toContain("👏");
  });

  it("returns null for someone who is not there", async () => {
    expect(await exportMyData(deps.db, "7d3c6f0e-2a4b-4c1d-9e8f-123456789abc", T0)).toBeNull();
  });
});
