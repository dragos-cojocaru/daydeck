import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createUser, setupDeps, T0 } from "@/test/buffer-fakes";
import type { BufferDeps } from "../buffer/deps";
import { createChallenge, joinChallenge } from "../challenges/service";
import {
  liveSnapshot,
  liveStamp,
  markAllRead,
  notificationFeed,
  notificationSettings,
  notifiedCount,
  setMuted,
} from "./live";
import { markRead, memberOf, postMessage } from "./service";

// What the live stream and the notification bell are built from.

let deps: BufferDeps;
let close: () => Promise<void>;
beforeEach(async () => {
  ({ deps, close } = await setupDeps());
});
afterEach(async () => {
  await close();
});

const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);

async function setup() {
  const host = await createUser(deps, "acc-host");
  const guest = await createUser(deps, "acc-guest");
  const challenge = await createChallenge(
    deps.db,
    host,
    {
      title: "Live test",
      prompts: [{ title: "One", description: "", body: "", emoji: "", bufferTemplateId: null }],
      cadence: "daily",
      startMode: "rolling",
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

describe("live stream", () => {
  it("changes its stamp on a new message, a read and a mute, and only then", async () => {
    const { host, guest, challenge, hostMember } = await setup();
    const first = await liveStamp(deps.db, guest.id);
    expect(await liveStamp(deps.db, guest.id)).toBe(first);
    await postMessage(deps.db, hostMember, { channel: "chat", body: "Hi" }, at(5));
    const afterMessage = await liveStamp(deps.db, guest.id);
    expect(afterMessage).not.toBe(first);
    const guestMember = await memberOf(deps.db, challenge.slug, guest.id);
    if (!guestMember) throw new Error("no member");
    await markRead(deps.db, guestMember, "chat", at(6));
    const afterRead = await liveStamp(deps.db, guest.id);
    expect(afterRead).not.toBe(afterMessage);
    await setMuted(deps.db, guest.id, challenge.slug, "chat", true);
    expect(await liveStamp(deps.db, guest.id)).not.toBe(afterRead);
    // The host's own view is not touched by the guest's mute.
    expect(await liveStamp(deps.db, host.id)).toBe(await liveStamp(deps.db, host.id));
  });

  it("counts unread items, minus the places and challenges you turned off", async () => {
    const { guest, challenge, hostMember } = await setup();
    await postMessage(deps.db, hostMember, { channel: "chat", body: "One" }, at(5));
    await postMessage(deps.db, hostMember, { channel: "chat", body: "Two" }, at(6));
    await postMessage(deps.db, hostMember, { channel: "updates", body: "News" }, at(7));
    let entry = (await liveSnapshot(deps.db, guest.id))[challenge.slug];
    expect(entry?.unread).toMatchObject({ chat: 2, updates: 1 });
    expect(notifiedCount(entry)).toBe(3);

    await setMuted(deps.db, guest.id, challenge.slug, "chat", true);
    entry = (await liveSnapshot(deps.db, guest.id))[challenge.slug];
    expect(entry?.muted).toEqual(["chat"]);
    expect(notifiedCount(entry)).toBe(1);
    // Turning it off twice keeps one entry; "all" silences the challenge.
    await setMuted(deps.db, guest.id, challenge.slug, "chat", true);
    await setMuted(deps.db, guest.id, challenge.slug, "all", true);
    entry = (await liveSnapshot(deps.db, guest.id))[challenge.slug];
    expect(entry?.muted.sort()).toEqual(["all", "chat"]);
    expect(notifiedCount(entry)).toBe(0);
    expect(await notificationFeed(deps.db, guest.id)).toEqual([]);

    await setMuted(deps.db, guest.id, challenge.slug, "all", false);
    await setMuted(deps.db, guest.id, challenge.slug, "chat", false);
    const settings = await notificationSettings(deps.db, guest.id);
    expect(settings).toEqual([{ slug: challenge.slug, title: "Live test", muted: [] }]);
  });

  it("lists one row per place with the newest message, and marks all read", async () => {
    const { guest, challenge, hostMember } = await setup();
    await postMessage(deps.db, hostMember, { channel: "chat", body: "Older" }, at(5));
    await postMessage(deps.db, hostMember, { channel: "chat", body: "Newest" }, at(9));
    await postMessage(deps.db, hostMember, { channel: "updates", body: "News" }, at(7));
    const rows = await notificationFeed(deps.db, guest.id);
    expect(rows.map((row) => [row.place, row.count, row.latest?.text])).toEqual([
      ["chat", 2, "Newest"],
      ["updates", 1, "News"],
    ]);
    expect(rows[0]?.latest?.author).toBe("Ana");
    // Your own messages never notify you.
    expect(await notificationFeed(deps.db, (await setupHostId())(hostMember))).toEqual([]);

    await markAllRead(deps.db, guest.id, at(10));
    expect(await notificationFeed(deps.db, guest.id)).toEqual([]);
    expect(notifiedCount((await liveSnapshot(deps.db, guest.id))[challenge.slug])).toBe(0);
    expect(await setMuted(deps.db, guest.id, "no-such-challenge", "chat", true)).toBe(false);
  });
});

/** The host's user ID, from their membership. */
async function setupHostId() {
  return (member: { participant: { userId: string } }) => member.participant.userId;
}
