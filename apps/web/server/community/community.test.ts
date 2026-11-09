import { eq, schema } from "@daydeck/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createUser, setupDeps, T0 } from "@/test/buffer-fakes";
import { closeChallenge, leaveChallenge } from "../account/data";
import type { BufferDeps } from "../buffer/deps";
import { createChallenge, JoinRefusedError, joinChallenge } from "../challenges/service";
import {
  banMember,
  listBans,
  listMembers,
  memberProfile,
  newInviteLink,
  removeMember,
  setChatEnabled,
  unban,
} from "./moderation";
import {
  CommunityError,
  deleteAllFrom,
  deleteMessage,
  ensurePromptMessages,
  listMessages,
  markRead,
  memberOf,
  postMessage,
  toggleReaction,
  unreadCounts,
} from "./service";

let deps: BufferDeps;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ deps, close } = await setupDeps());
});
afterEach(async () => {
  await close();
});

const PROMPTS = [
  {
    title: "Someone else's win",
    description: "That pull tells you where you want to go next.",
    body: "",
    emoji: "",
    theme: "Consistency",
    steps: ["Think of a moment.", "Share what it showed you."],
    bufferTemplateId: null,
  },
  { title: "Two", description: "", body: "", emoji: "", bufferTemplateId: null },
];

const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);

async function setup(options: { startMode?: "fixed" | "rolling" } = {}) {
  const host = await createUser(deps, "acc-host");
  const guest = await createUser(deps, "acc-guest");
  const challenge = await createChallenge(
    deps.db,
    host,
    {
      title: "Creator camp",
      prompts: PROMPTS,
      cadence: "daily",
      startMode: options.startMode ?? "fixed",
      startDate: "2026-11-08",
      timezone: "Europe/Bucharest",
      visibility: "private",
    },
    T0,
  );
  await joinChallenge(deps.db, guest, challenge, [], T0);
  const hostMember = await memberOf(deps.db, challenge.slug, host.id);
  const guestMember = await memberOf(deps.db, challenge.slug, guest.id);
  if (!hostMember || !guestMember) throw new Error("setup failed");
  return { host, guest, challenge, hostMember, guestMember };
}

describe("messages", () => {
  it("lets only the host write in Updates, and everyone in Chat", async () => {
    const { hostMember, guestMember } = await setup();
    await postMessage(
      deps.db,
      hostMember,
      { channel: "updates", body: "Happy hour Thursday!" },
      at(1),
    );
    await expect(
      postMessage(deps.db, guestMember, { channel: "updates", body: "Me too" }, at(2)),
    ).rejects.toThrow("Only the host posts in Updates.");
    await postMessage(deps.db, guestMember, { channel: "chat", body: "Hello all" }, at(3));
    const chat = await listMessages(deps.db, hostMember, "chat", at(4));
    expect(chat.map((m) => [m.body, m.author?.isHost, m.author?.isYou])).toEqual([
      ["Hello all", false, false],
    ]);
  });

  it("needs a link in Posts, and keeps it for the preview card", async () => {
    const { guestMember } = await setup();
    await expect(
      postMessage(deps.db, guestMember, { channel: "posts", body: "My post" }, at(1)),
    ).rejects.toBeInstanceOf(CommunityError);
    await postMessage(
      deps.db,
      guestMember,
      { channel: "posts", body: "Day 1 is up: https://www.linkedin.com/posts/abc." },
      at(2),
    );
    const [shared] = await listMessages(deps.db, guestMember, "posts", at(3));
    expect(shared?.kind).toBe("share");
    expect(shared?.preview).toMatchObject({
      url: "https://www.linkedin.com/posts/abc",
      service: "linkedin",
      host: "linkedin.com",
      title: null,
    });
  });

  it("refuses Chat and Posts while the host has turned chat off", async () => {
    const { hostMember, guestMember } = await setup();
    await setChatEnabled(deps.db, hostMember, false);
    const off = await memberOf(deps.db, guestMember.challenge.slug, guestMember.participant.userId);
    if (!off) throw new Error("missing");
    await expect(postMessage(deps.db, off, { channel: "chat", body: "Hi" }, at(1))).rejects.toThrow(
      /turned off chat/,
    );
    await expect(setChatEnabled(deps.db, guestMember, true)).rejects.toThrow("Only the host");
  });

  it("toggles reactions from the fixed list and says who reacted", async () => {
    const { hostMember, guestMember } = await setup();
    const { id } = await postMessage(deps.db, hostMember, { channel: "chat", body: "Go!" }, at(1));
    expect(await toggleReaction(deps.db, guestMember, id, "🔥")).toEqual({ added: true });
    await toggleReaction(deps.db, hostMember, id, "🔥");
    await toggleReaction(deps.db, hostMember, id, "🎉");
    expect(await toggleReaction(deps.db, hostMember, id, "🎉")).toEqual({ added: false });
    await expect(toggleReaction(deps.db, guestMember, id, "🦄")).rejects.toThrow(
      "Choose one of the reactions",
    );
    const [message] = await listMessages(deps.db, guestMember, "chat", at(2));
    expect(message?.reactions).toEqual([
      { emoji: "🔥", count: 2, mine: true, names: ["You", "Ana"] },
    ]);
  });

  it("deletes your own messages, any message for the host, and never the day's prompt", async () => {
    const { hostMember, guestMember, guest } = await setup();
    const own = await postMessage(deps.db, guestMember, { channel: "chat", body: "a" }, at(1));
    const hosts = await postMessage(deps.db, hostMember, { channel: "chat", body: "b" }, at(2));
    await expect(deleteMessage(deps.db, guestMember, hosts.id)).rejects.toThrow("your own");
    expect(await deleteMessage(deps.db, guestMember, own.id)).toBe(true);
    await postMessage(deps.db, guestMember, { channel: "chat", body: "c" }, at(3));
    await postMessage(deps.db, guestMember, { channel: "chat", body: "d" }, at(4));
    await expect(deleteAllFrom(deps.db, guestMember, guest.id)).rejects.toThrow("Only the host");
    expect(await deleteAllFrom(deps.db, hostMember, guest.id)).toBe(2);
    const [prompt] = await listMessages(deps.db, hostMember, "updates", at(5));
    if (!prompt) throw new Error("no prompt post");
    await expect(deleteMessage(deps.db, hostMember, prompt.id)).rejects.toThrow("prompt");
  });

  it("adds each day's prompt to Updates once, for a shared start only", async () => {
    const { hostMember } = await setup();
    // Day 1 has begun in Bucharest; day 2 has not.
    expect(await ensurePromptMessages(deps.db, hostMember.challenge, T0)).toBe(1);
    expect(await ensurePromptMessages(deps.db, hostMember.challenge, T0)).toBe(0);
    const updates = await listMessages(deps.db, hostMember, "updates", T0);
    expect(updates.map((m) => [m.kind, m.prompt?.dayNumber, m.prompt?.theme])).toEqual([
      ["prompt", 1, "Consistency"],
    ]);
    expect(updates[0]?.prompt?.steps).toEqual(["Think of a moment.", "Share what it showed you."]);
    const nextDay = new Date("2026-11-09T08:00:00Z");
    expect(await ensurePromptMessages(deps.db, hostMember.challenge, nextDay)).toBe(1);

    const rolling = await setupRolling();
    expect(await ensurePromptMessages(deps.db, rolling.challenge, nextDay)).toBe(0);
  });
});

async function setupRolling() {
  const host = await createUser(deps, "acc-rolling");
  const challenge = await createChallenge(
    deps.db,
    host,
    {
      title: "Rolling",
      prompts: PROMPTS,
      cadence: "daily",
      startMode: "rolling",
      startDate: "2026-11-08",
      timezone: "Europe/Bucharest",
      visibility: "private",
    },
    T0,
  );
  return { challenge };
}

describe("unread", () => {
  it("counts others' messages since you last looked, not your own or the day's prompt", async () => {
    const { hostMember, guestMember } = await setup();
    await ensurePromptMessages(deps.db, hostMember.challenge, T0);
    await postMessage(deps.db, hostMember, { channel: "chat", body: "One" }, at(10));
    await postMessage(deps.db, hostMember, { channel: "updates", body: "News" }, at(11));
    await postMessage(deps.db, guestMember, { channel: "chat", body: "Mine" }, at(12));
    await postMessage(deps.db, hostMember, { channel: "chat", body: "Two" }, at(13));
    expect(await unreadCounts(deps.db, guestMember)).toEqual({
      updates: 1,
      chat: 1,
      posts: 0,
      feedback: 0,
    });
    await markRead(deps.db, guestMember, "chat", at(20));
    await markRead(deps.db, guestMember, "updates", at(20));
    expect(await unreadCounts(deps.db, guestMember)).toEqual({
      updates: 0,
      chat: 0,
      posts: 0,
      feedback: 0,
    });
  });
});

describe("moderation", () => {
  it("removes someone, who can join again with the link", async () => {
    const { hostMember, guest, challenge } = await setup();
    await expect(removeMember(deps.db, hostMember, hostMember.participant.userId)).rejects.toThrow(
      "cannot remove yourself",
    );
    await removeMember(deps.db, hostMember, guest.id);
    expect(await memberOf(deps.db, challenge.slug, guest.id)).toBeNull();
    await joinChallenge(deps.db, guest, challenge, [], at(5));
    expect(await memberOf(deps.db, challenge.slug, guest.id)).not.toBeNull();
  });

  it("bans a Buffer account for good, with its messages if asked, until the host unbans it", async () => {
    const { hostMember, guestMember, guest, challenge } = await setup();
    await postMessage(deps.db, guestMember, { channel: "chat", body: "spam" }, at(1));
    await postMessage(deps.db, guestMember, { channel: "chat", body: "more spam" }, at(2));
    await expect(
      banMember(deps.db, guestMember, hostMember.participant.userId, {
        deleteMessages: false,
        newInviteLink: false,
      }),
    ).rejects.toThrow("Only the host");

    const before = await memberProfile(deps.db, hostMember, guest.id);
    expect(before?.recent.map((m) => m.body)).toEqual(["more spam", "spam"]);

    const result = await banMember(deps.db, hostMember, guest.id, {
      deleteMessages: true,
      newInviteLink: true,
    });
    expect(result.deleted).toBe(2);
    expect(result.inviteCode).not.toBe(challenge.inviteCode);
    expect(await memberOf(deps.db, challenge.slug, guest.id)).toBeNull();
    expect((await listBans(deps.db, hostMember)).map((ban) => ban.bufferAccountId)).toEqual([
      "acc-guest",
    ]);
    await expect(joinChallenge(deps.db, guest, challenge, [], at(5))).rejects.toBeInstanceOf(
      JoinRefusedError,
    );
    expect((await memberProfile(deps.db, hostMember, guest.id))?.banned).toBe(true);

    await unban(deps.db, hostMember, "acc-guest");
    await joinChallenge(deps.db, guest, challenge, [], at(6));
    expect(await memberOf(deps.db, challenge.slug, guest.id)).not.toBeNull();
  });

  it("makes a new invite link and lists members, host first", async () => {
    const { hostMember, guestMember } = await setup();
    await expect(newInviteLink(deps.db, guestMember)).rejects.toThrow("Only the host");
    const code = await newInviteLink(deps.db, hostMember);
    const [row] = await deps.db
      .select({ inviteCode: schema.challenges.inviteCode })
      .from(schema.challenges)
      .where(eq(schema.challenges.id, hostMember.challenge.id));
    expect(row?.inviteCode).toBe(code);
    const members = await listMembers(deps.db, guestMember);
    expect(members.map((m) => [m.isHost, m.isYou])).toEqual([
      [true, false],
      [false, true],
    ]);
  });
});

describe("cached recaps stay fresh", () => {
  async function versionOf(id: string) {
    const [row] = await deps.db
      .select({ v: schema.challenges.boardVersion })
      .from(schema.challenges)
      .where(eq(schema.challenges.id, id));
    return row?.v ?? -1;
  }

  it("bumps the change counter when someone leaves and when the host closes", async () => {
    const { challenge, guest, host } = await setup();
    const start = await versionOf(challenge.id);
    expect(await leaveChallenge(deps.db, guest.id, challenge.slug)).toBe(challenge.id);
    expect(await versionOf(challenge.id)).toBe(start + 1);
    expect(await closeChallenge(deps.db, host.id, challenge.slug, at(10))).toBe(true);
    expect(await versionOf(challenge.id)).toBe(start + 2);
  });
});
