// What a host can do about people and the invite link: remove someone (they can join again),
// ban them (their Buffer account can never join this challenge again), make a new invite link,
// pause joining, and turn chat off. Every function refuses anyone who is not the host.
import { and, type Database, desc, eq, schema, sql } from "@daydeck/db";
import { homeListingBlock } from "@/lib/home-listing";
import { generateInviteCode } from "../challenges/codes";
import { bumpCommunity, type Channel, CommunityError, type Member } from "./service";

const { challengeBans, challenges, entries, messages, participants, users } = schema;

function requireHost(member: Member) {
  if (!member.isHost) throw new CommunityError("Only the host can do this.");
}

export interface ProfileView {
  userId: string;
  name: string;
  avatarUrl: string | null;
  role: "host" | "participant" | null;
  isYou: boolean;
  /** Still in the challenge. */
  isMember: boolean;
  joinedAt: string | null;
  posted: number;
  days: number;
  messageCount: number;
  recent: { id: string; channel: Channel; body: string; createdAt: string }[];
  banned: boolean;
}

/** One person as the member card shows them: their days, and their latest messages. */
export async function memberProfile(
  db: Database,
  member: Member,
  userId: string,
): Promise<ProfileView | null> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) return null;
  const [participant] = await db
    .select()
    .from(participants)
    .where(and(eq(participants.challengeId, member.challenge.id), eq(participants.userId, userId)));
  const [[counts], recent, [messageCount], [ban]] = await Promise.all([
    participant
      ? db
          .select({
            days: sql<number>`count(*)::int`,
            posted: sql<number>`count(*) filter (where ${entries.state} in ('done', 'caught_up'))::int`,
          })
          .from(entries)
          .where(eq(entries.participantId, participant.id))
      : Promise.resolve([{ days: 0, posted: 0 }]),
    db
      .select({
        id: messages.id,
        channel: messages.channel,
        body: messages.body,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(and(eq(messages.challengeId, member.challenge.id), eq(messages.authorId, userId)))
      .orderBy(desc(messages.createdAt))
      .limit(5),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(messages)
      .where(and(eq(messages.challengeId, member.challenge.id), eq(messages.authorId, userId))),
    db
      .select({ id: challengeBans.bufferAccountId })
      .from(challengeBans)
      .where(
        and(
          eq(challengeBans.challengeId, member.challenge.id),
          eq(challengeBans.bufferAccountId, user.bufferAccountId),
        ),
      ),
  ]);
  // Only the host sees a ban; for anyone else a banned person is simply not a member.
  return {
    userId,
    name: user.name ?? "Someone",
    avatarUrl: user.avatarUrl,
    role: participant?.status === "active" ? participant.role : null,
    isYou: userId === member.participant.userId,
    isMember: participant?.status === "active",
    joinedAt: participant?.joinedAt.toISOString() ?? null,
    posted: counts?.posted ?? 0,
    days: counts?.days ?? 0,
    messageCount: messageCount?.n ?? 0,
    recent: recent.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
    banned: member.isHost && Boolean(ban),
  };
}

/** The target's row in the challenge, refusing the host themself. */
async function targetOf(db: Database, member: Member, userId: string) {
  requireHost(member);
  if (userId === member.participant.userId) {
    throw new CommunityError("You are the host, so you cannot remove yourself.");
  }
  const [participant] = await db
    .select()
    .from(participants)
    .where(and(eq(participants.challengeId, member.challenge.id), eq(participants.userId, userId)));
  return participant ?? null;
}

async function bumpBoard(db: Database, challengeId: string) {
  await db
    .update(challenges)
    .set({ boardVersion: sql`${challenges.boardVersion} + 1` })
    .where(eq(challenges.id, challengeId));
}

/**
 * Removes someone from the challenge. Their days go with them; their messages stay. They can
 * join again with the invite link, like a kick on Discord.
 */
export async function removeMember(db: Database, member: Member, userId: string) {
  const participant = await targetOf(db, member, userId);
  if (!participant) throw new CommunityError("They are not in this challenge.");
  await db.delete(participants).where(eq(participants.id, participant.id));
  await bumpBoard(db, member.challenge.id);
  await bumpCommunity(db, member.challenge.id);
}

export interface BanOptions {
  deleteMessages: boolean;
  /** Also replace the invite link, so it stops working for everyone who has the old one. */
  newInviteLink: boolean;
}

/**
 * Bans someone: they leave the challenge and their Buffer account can never join it again,
 * even with a new invite link. Returns how many messages were deleted.
 */
export async function banMember(
  db: Database,
  member: Member,
  userId: string,
  options: BanOptions,
): Promise<{ deleted: number; inviteCode: string | null }> {
  const participant = await targetOf(db, member, userId);
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) throw new CommunityError("That person is gone.");
  await db
    .insert(challengeBans)
    .values({
      challengeId: member.challenge.id,
      bufferAccountId: user.bufferAccountId,
      name: user.name,
      userId,
      bannedBy: member.participant.userId,
    })
    .onConflictDoNothing();
  if (participant) await db.delete(participants).where(eq(participants.id, participant.id));
  let deleted = 0;
  if (options.deleteMessages) {
    const removed = await db
      .delete(messages)
      .where(and(eq(messages.challengeId, member.challenge.id), eq(messages.authorId, userId)))
      .returning({ id: messages.id });
    deleted = removed.length;
  }
  const inviteCode = options.newInviteLink ? await newInviteLink(db, member) : null;
  await bumpBoard(db, member.challenge.id);
  await bumpCommunity(db, member.challenge.id);
  return { deleted, inviteCode };
}

/** Lets a banned Buffer account join again (with the invite link). */
export async function unban(db: Database, member: Member, bufferAccountId: string) {
  requireHost(member);
  await db
    .delete(challengeBans)
    .where(
      and(
        eq(challengeBans.challengeId, member.challenge.id),
        eq(challengeBans.bufferAccountId, bufferAccountId),
      ),
    );
}

export interface BanView {
  bufferAccountId: string;
  name: string;
  createdAt: string;
}

export async function listBans(db: Database, member: Member): Promise<BanView[]> {
  requireHost(member);
  const rows = await db
    .select()
    .from(challengeBans)
    .where(eq(challengeBans.challengeId, member.challenge.id))
    .orderBy(desc(challengeBans.createdAt));
  return rows.map((row) => ({
    bufferAccountId: row.bufferAccountId,
    name: row.name ?? "Someone",
    createdAt: row.createdAt.toISOString(),
  }));
}

/** True when this Buffer account is banned from the challenge. */
export async function isBanned(
  db: Database,
  challengeId: string,
  bufferAccountId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: challengeBans.bufferAccountId })
    .from(challengeBans)
    .where(
      and(
        eq(challengeBans.challengeId, challengeId),
        eq(challengeBans.bufferAccountId, bufferAccountId),
      ),
    );
  return Boolean(row);
}

/**
 * Replaces the invite link. The old one stops working at once. It also takes the challenge off
 * the homepage, so the new link is not public until the host chooses that again.
 */
export async function newInviteLink(db: Database, member: Member): Promise<string> {
  requireHost(member);
  const inviteCode = generateInviteCode();
  await db
    .update(challenges)
    .set({ inviteCode, showOnHome: false })
    .where(eq(challenges.id, member.challenge.id));
  return inviteCode;
}

/**
 * Pauses or opens joining. While paused, the invite link shows a notice. Pausing also takes the
 * challenge off the homepage; opening again leaves it off until the host chooses it again.
 */
export async function setInvitePaused(db: Database, member: Member, paused: boolean) {
  requireHost(member);
  await db
    .update(challenges)
    .set(paused ? { invitePaused: true, showOnHome: false } : { invitePaused: false })
    .where(eq(challenges.id, member.challenge.id));
}

/**
 * Lists the challenge under "Popular challenges" on the homepage, or takes it off. Listing
 * needs a public recap, an open challenge and open joining, checked again in the update itself.
 */
export async function setShowOnHome(db: Database, member: Member, on: boolean) {
  requireHost(member);
  if (!on) {
    await db
      .update(challenges)
      .set({ showOnHome: false })
      .where(eq(challenges.id, member.challenge.id));
    return;
  }
  const blocked = homeListingBlock(member.challenge);
  if (blocked) throw new CommunityError(blocked);
  const listed = await db
    .update(challenges)
    .set({ showOnHome: true })
    .where(
      and(
        eq(challenges.id, member.challenge.id),
        eq(challenges.visibility, "public"),
        eq(challenges.status, "open"),
        eq(challenges.invitePaused, false),
      ),
    )
    .returning({ id: challenges.id });
  if (listed.length === 0) {
    throw new CommunityError(
      "The challenge's settings just changed. Reload the page and try again.",
    );
  }
}

/** Turns chat and shared posts on or off. Updates and feedback on drafts stay on. */
export async function setChatEnabled(db: Database, member: Member, enabled: boolean) {
  requireHost(member);
  await db
    .update(challenges)
    .set({ chatEnabled: enabled })
    .where(eq(challenges.id, member.challenge.id));
  await bumpCommunity(db, member.challenge.id);
}

export interface MemberListItem {
  userId: string;
  name: string;
  avatarUrl: string | null;
  isHost: boolean;
  isYou: boolean;
  posted: number;
}

/** Everyone in the challenge, the host first, then by name. */
export async function listMembers(db: Database, member: Member): Promise<MemberListItem[]> {
  const rows = await db
    .select({
      userId: participants.userId,
      role: participants.role,
      name: users.name,
      avatarUrl: users.avatarUrl,
      posted: sql<number>`(select count(*)::int from ${entries} e where e.participant_id = ${participants.id} and e.state in ('done', 'caught_up'))`,
    })
    .from(participants)
    .innerJoin(users, eq(users.id, participants.userId))
    .where(
      and(eq(participants.challengeId, member.challenge.id), eq(participants.status, "active")),
    );
  return rows
    .map((row) => ({
      userId: row.userId,
      name: row.name ?? "Someone",
      avatarUrl: row.avatarUrl,
      isHost: row.role === "host",
      isYou: row.userId === member.participant.userId,
      posted: Number(row.posted),
    }))
    .sort((a, b) => Number(b.isHost) - Number(a.isHost) || a.name.localeCompare(b.name));
}
