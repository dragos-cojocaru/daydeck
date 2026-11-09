import { eq, schema } from "@daydeck/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { homeListingBlock, VERY_ACTIVE } from "@/lib/home-listing";
import { createUser, setupDeps, T0 } from "@/test/buffer-fakes";
import { closeChallenge } from "../account/data";
import { closeFinishedChallenges } from "../account/retention";
import type { BufferDeps } from "../buffer/deps";
import { createChallenge, joinChallenge } from "../challenges/service";
import { newInviteLink, setInvitePaused, setShowOnHome } from "../community/moderation";
import { CommunityError, memberOf, postMessage } from "../community/service";
import { veryActiveChallenges } from "./popular";

// "Popular challenges" on the homepage: which challenges count as very active, and the rule that
// keeps private, paused and closed challenges off the homepage, in the code and in the database.

let deps: BufferDeps;
let close: () => Promise<void>;
beforeEach(async () => {
  ({ deps, close } = await setupDeps());
});
afterEach(async () => {
  await close();
});

const HOUR = 60 * 60 * 1000;
const PROMPTS = Array.from({ length: 7 }, (_, day) => ({
  title: `Day ${day + 1}`,
  description: "",
  body: "",
  emoji: "",
  bufferTemplateId: null,
}));
let made = 0;

/** A challenge with `people` members (host included) and `posts` posts sent `hoursAgo` ago. */
async function challengeWith({
  people = VERY_ACTIVE.people,
  posts = VERY_ACTIVE.postsThisWeek,
  hoursAgo = 2,
  showOnHome = true,
  visibility = "public",
  title = "Busy",
}: {
  people?: number;
  posts?: number;
  hoursAgo?: number;
  showOnHome?: boolean;
  visibility?: "public" | "private";
  title?: string;
} = {}) {
  made += 1;
  const host = await createUser(deps, `acc-host-${made}`);
  const challenge = await createChallenge(
    deps.db,
    host,
    {
      title,
      prompts: PROMPTS,
      cadence: "daily",
      startMode: "rolling",
      startDate: "2026-11-02",
      timezone: "UTC",
      visibility,
      showOnHome,
    },
    new Date(T0.getTime() - 6 * 24 * HOUR),
  );
  for (let index = 1; index < people; index += 1) {
    const user = await createUser(deps, `acc-${made}-${index}`);
    await joinChallenge(deps.db, user, challenge, [], new Date(T0.getTime() - 5 * 24 * HOUR));
  }
  const entries = await deps.db
    .select({ id: schema.entries.id })
    .from(schema.entries)
    .innerJoin(schema.participants, eq(schema.participants.id, schema.entries.participantId))
    .where(eq(schema.participants.challengeId, challenge.id));
  for (const [index, entry] of entries.slice(0, posts).entries()) {
    await deps.db.insert(schema.entryPosts).values({
      entryId: entry.id,
      channelId: "ch-1",
      bufferPostId: `post-${made}-${index}`,
      status: "sent",
      sentAt: new Date(T0.getTime() - hoursAgo * HOUR),
    });
  }
  const hostMember = await memberOf(deps.db, challenge.slug, host.id);
  if (!hostMember) throw new Error("no host");
  return { challenge, host, hostMember };
}

const listed = async () => (await veryActiveChallenges(deps.db, T0)).map((c) => c.slug);

async function showOnHomeOf(id: string) {
  const [row] = await deps.db
    .select({ on: schema.challenges.showOnHome })
    .from(schema.challenges)
    .where(eq(schema.challenges.id, id));
  return row?.on;
}

describe("very active challenges", () => {
  it("lists a public, open challenge that meets every rule", async () => {
    const { challenge } = await challengeWith();
    expect(await listed()).toEqual([challenge.slug]);
  });

  it("leaves out a challenge one person or one post short", async () => {
    await challengeWith({ people: VERY_ACTIVE.people - 1 });
    await challengeWith({ posts: VERY_ACTIVE.postsThisWeek - 1 });
    expect(await listed()).toEqual([]);
  });

  it("leaves out a challenge with nothing new in the last two days", async () => {
    await challengeWith({ hoursAgo: VERY_ACTIVE.quietHours + 1 });
    expect(await listed()).toEqual([]);
  });

  it("counts a new message as something new", async () => {
    const { challenge, hostMember } = await challengeWith({ hoursAgo: VERY_ACTIVE.quietHours + 1 });
    await postMessage(deps.db, hostMember, { channel: "chat", body: "Still here" }, T0);
    // The posts are older than two days but newer than a week, so they still count.
    expect(await listed()).toEqual([challenge.slug]);
  });

  it("needs the host's choice", async () => {
    await challengeWith({ showOnHome: false });
    expect(await listed()).toEqual([]);
  });

  it("puts the busiest first", async () => {
    const calm = await challengeWith({ title: "Calm" });
    const busy = await challengeWith({ title: "Busy", posts: VERY_ACTIVE.postsThisWeek + 5 });
    expect(await listed()).toEqual([busy.challenge.slug, calm.challenge.slug]);
  });
});

describe("the listing rule", () => {
  it("never keeps a private challenge's choice from the setup form", async () => {
    const { challenge } = await challengeWith({ visibility: "private" });
    expect(await showOnHomeOf(challenge.id)).toBe(false);
  });

  it("is refused by the database for a private, paused or closed challenge", async () => {
    const { challenge } = await challengeWith();
    const set = (values: Partial<typeof schema.challenges.$inferInsert>) =>
      deps.db.update(schema.challenges).set(values).where(eq(schema.challenges.id, challenge.id));
    await expect(set({ visibility: "private" })).rejects.toThrow();
    await expect(set({ invitePaused: true })).rejects.toThrow();
    await expect(set({ status: "closed" })).rejects.toThrow();
    expect(await showOnHomeOf(challenge.id)).toBe(true);
  });

  it("comes off when the host pauses joining or makes a new invite link", async () => {
    const { challenge, hostMember } = await challengeWith();
    await setInvitePaused(deps.db, hostMember, true);
    expect(await showOnHomeOf(challenge.id)).toBe(false);
    // Opening joining again does not list it again by itself.
    await setInvitePaused(deps.db, hostMember, false);
    expect(await showOnHomeOf(challenge.id)).toBe(false);
    await setShowOnHome(deps.db, hostMember, true);
    await newInviteLink(deps.db, hostMember);
    expect(await showOnHomeOf(challenge.id)).toBe(false);
  });

  it("comes off when the challenge closes, by the host or by the daily job", async () => {
    const first = await challengeWith();
    await closeChallenge(deps.db, first.host.id, first.challenge.slug, T0);
    expect(await showOnHomeOf(first.challenge.id)).toBe(false);

    const second = await challengeWith();
    await deps.db
      .update(schema.challenges)
      .set({ endsAt: new Date(T0.getTime() - HOUR) })
      .where(eq(schema.challenges.id, second.challenge.id));
    await closeFinishedChallenges(deps.db, T0);
    expect(await showOnHomeOf(second.challenge.id)).toBe(false);
  });

  it("lets only the host turn it on, and only while it can be listed", async () => {
    const { challenge, hostMember } = await challengeWith({ showOnHome: false });
    const guestUser = await createUser(deps, "acc-guest");
    await joinChallenge(deps.db, guestUser, challenge, [], T0);
    const guest = await memberOf(deps.db, challenge.slug, guestUser.id);
    if (!guest) throw new Error("no guest");
    await expect(setShowOnHome(deps.db, guest, true)).rejects.toThrow(CommunityError);

    await setInvitePaused(deps.db, hostMember, true);
    const paused = await memberOf(deps.db, challenge.slug, hostMember.participant.userId);
    if (!paused) throw new Error("no host");
    await expect(setShowOnHome(deps.db, paused, true)).rejects.toThrow(/Pause joining/);
    expect(await showOnHomeOf(challenge.id)).toBe(false);
  });

  it("says why a challenge cannot be listed", () => {
    const open = { visibility: "public", status: "open", invitePaused: false } as const;
    expect(homeListingBlock(open)).toBeNull();
    expect(homeListingBlock({ ...open, visibility: "private" })).toMatch(/recap/);
    expect(homeListingBlock({ ...open, invitePaused: true })).toMatch(/Pause joining/);
    expect(homeListingBlock({ ...open, status: "closed" })).toMatch(/closed/);
  });
});
