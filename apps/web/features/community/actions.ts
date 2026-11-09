"use server";

import { refresh, updateTag } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/server/auth/current-user";
import { inviteTag } from "@/server/challenges/cached";
import {
  type BanView,
  banMember,
  listBans,
  memberProfile,
  newInviteLink,
  type ProfileView,
  removeMember,
  setChatEnabled,
  setInvitePaused,
  setShowOnHome,
  unban,
} from "@/server/community/moderation";
import { ensurePreview } from "@/server/community/previews";
import {
  bumpCommunity,
  CommunityError,
  deleteAllFrom,
  deleteMessage,
  type Member,
  markRead,
  memberOf,
  postMessage,
  toggleReaction,
} from "@/server/community/service";
import { getDb } from "@/server/db";
import { limitUser } from "@/server/security/rate-limit";

export type CommunityResult<T = null> = { ok: true; data: T } | { ok: false; message: string };

type Found = {
  session: NonNullable<Awaited<ReturnType<typeof getCurrentSession>>>;
  member: Member;
};

const slugSchema = z.string().min(1).max(120);
const channelSchema = z.enum(["updates", "chat", "posts"]);
const placeSchema = z.enum(["updates", "chat", "posts", "feedback"]);

/** The signed-in member of this challenge, or the message to show instead. */
async function member(slug: unknown): Promise<Found | { error: string }> {
  const session = await getCurrentSession();
  if (!session) return { error: "Your session ended. Connect Buffer again to continue." };
  const parsed = slugSchema.safeParse(slug);
  if (!parsed.success) return { error: "That challenge could not be read. Reload the page." };
  const found = await memberOf(getDb(), parsed.data, session.user.id);
  if (!found) return { error: "You are not in this challenge." };
  return { session, member: found };
}

function failure(error: unknown): { ok: false; message: string } {
  if (error instanceof CommunityError) return { ok: false, message: error.message };
  throw error;
}

const postSchema = z.object({
  slug: slugSchema,
  channel: channelSchema,
  body: z.string().max(4000),
  replyToId: z.uuid().nullish(),
  entryId: z.uuid().nullish(),
});

/** Sends a message. A link in it gets its preview read after the reply, so sending stays fast. */
export async function postMessageAction(
  input: z.input<typeof postSchema>,
): Promise<CommunityResult> {
  const parsed = postSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "That message could not be read." };
  const found = await member(parsed.data.slug);
  if ("error" in found) return { ok: false, message: found.error };
  const db = getDb();
  const limited = await limitUser(db, "message", found.session.user.id);
  if (limited) return { ok: false, message: limited };
  try {
    const row = await postMessage(db, found.member, parsed.data, new Date());
    if (row.linkUrl) {
      const url = row.linkUrl;
      after(async () => {
        if (await ensurePreview(db, url, new Date())) {
          await bumpCommunity(db, found.member.challenge.id);
        }
      });
    }
    return { ok: true, data: null };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteMessageAction(
  slug: string,
  messageId: string,
): Promise<CommunityResult> {
  const found = await member(slug);
  if ("error" in found) return { ok: false, message: found.error };
  if (!z.uuid().safeParse(messageId).success)
    return { ok: false, message: "That message is gone." };
  try {
    await deleteMessage(getDb(), found.member, messageId);
    return { ok: true, data: null };
  } catch (error) {
    return failure(error);
  }
}

/** Sets your reaction on or off. The page shows the change at once and checks back here. */
export async function toggleReactionAction(
  slug: string,
  messageId: string,
  emoji: string,
  on: boolean,
): Promise<CommunityResult> {
  const found = await member(slug);
  if ("error" in found) return { ok: false, message: found.error };
  if (!z.uuid().safeParse(messageId).success)
    return { ok: false, message: "That message is gone." };
  const db = getDb();
  const limited = await limitUser(db, "react", found.session.user.id);
  if (limited) return { ok: false, message: limited };
  try {
    await toggleReaction(db, found.member, messageId, emoji, Boolean(on));
    return { ok: true, data: null };
  } catch (error) {
    return failure(error);
  }
}

/** Marks a channel, or the feedback list, as read up to now. */
export async function markReadAction(slug: string, place: string): Promise<CommunityResult> {
  const found = await member(slug);
  if ("error" in found) return { ok: false, message: found.error };
  const parsed = placeSchema.safeParse(place);
  if (!parsed.success) return { ok: false, message: "That place could not be read." };
  await markRead(getDb(), found.member, parsed.data, new Date());
  return { ok: true, data: null };
}

/** One person's card: their days and latest messages. */
export async function memberProfileAction(
  slug: string,
  userId: string,
): Promise<CommunityResult<ProfileView>> {
  const found = await member(slug);
  if ("error" in found) return { ok: false, message: found.error };
  if (!z.uuid().safeParse(userId).success) return { ok: false, message: "That person is gone." };
  const profile = await memberProfile(getDb(), found.member, userId);
  if (!profile) return { ok: false, message: "That person is gone." };
  return { ok: true, data: profile };
}

/** Host actions below: each one checks the host again on the server. */
async function hostAction<T>(
  slug: string,
  run: (found: Found) => Promise<T>,
): Promise<CommunityResult<T>> {
  const found = await member(slug);
  if ("error" in found) return { ok: false, message: found.error };
  const limited = await limitUser(getDb(), "moderate", found.session.user.id);
  if (limited) return { ok: false, message: limited };
  try {
    const data = await run(found);
    refresh();
    return { ok: true, data };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteAllFromAction(slug: string, userId: string) {
  return hostAction(slug, (found) => deleteAllFrom(getDb(), found.member, userId));
}

export async function removeMemberAction(slug: string, userId: string) {
  return hostAction(slug, async (found) => {
    await removeMember(getDb(), found.member, userId);
    updateTag(inviteTag(found.member.challenge.id));
    return true;
  });
}

const banSchema = z.object({ deleteMessages: z.boolean(), newInviteLink: z.boolean() });

export async function banMemberAction(
  slug: string,
  userId: string,
  options: z.input<typeof banSchema>,
) {
  return hostAction(slug, async (found) => {
    const parsed = banSchema.parse(options);
    const result = await banMember(getDb(), found.member, userId, parsed);
    updateTag(inviteTag(found.member.challenge.id));
    return result;
  });
}

export async function unbanAction(slug: string, bufferAccountId: string) {
  return hostAction(slug, async (found) => {
    await unban(getDb(), found.member, z.string().max(128).parse(bufferAccountId));
    return true;
  });
}

export async function listBansAction(slug: string): Promise<CommunityResult<BanView[]>> {
  return hostAction(slug, (found) => listBans(getDb(), found.member));
}

export async function newInviteLinkAction(slug: string) {
  return hostAction(slug, async (found) => {
    const code = await newInviteLink(getDb(), found.member);
    updateTag(inviteTag(found.member.challenge.id));
    return code;
  });
}

export async function setInvitePausedAction(slug: string, paused: boolean) {
  return hostAction(slug, async (found) => {
    await setInvitePaused(getDb(), found.member, Boolean(paused));
    return Boolean(paused);
  });
}

export async function setShowOnHomeAction(slug: string, on: boolean) {
  return hostAction(slug, async (found) => {
    await setShowOnHome(getDb(), found.member, Boolean(on));
    return Boolean(on);
  });
}

export async function setChatEnabledAction(slug: string, enabled: boolean) {
  return hostAction(slug, async (found) => {
    await setChatEnabled(getDb(), found.member, Boolean(enabled));
    return Boolean(enabled);
  });
}
