"use server";

import { and, eq, schema } from "@daydeck/db";
import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isValidTimeZone, localDateOf } from "@/lib/day-engine";
import { getCurrentSession } from "@/server/auth/current-user";
import { getBufferDeps } from "@/server/buffer/config";
import { BufferNotConnectedError, BufferReconnectRequiredError } from "@/server/buffer/errors";
import { bufferErrorMessage } from "@/server/buffer/messages";
import { inviteTag } from "@/server/challenges/cached";
import { type FindSlotsResult, saveWeekPlan, toFindSlotsResult } from "@/server/challenges/plan";
import { cachedWeekSlots, planKey, planTag } from "@/server/challenges/plan-cache";
import { type SaveKind, saveToBuffer } from "@/server/challenges/save";
import {
  challengeForMember,
  createChallenge,
  getChallengeByInvite,
  JoinRefusedError,
  joinChallenge,
  setParticipantChannels,
} from "@/server/challenges/service";
import { type LibraryTemplate, publicTemplates } from "@/server/challenges/templates";
import { getDb } from "@/server/db";
import { queueCheck } from "@/server/progress/queue";
import { limitUser } from "@/server/security/rate-limit";

const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date such as 2026-11-09");

const promptSchema = z.object({
  title: z.string().trim().min(1, "Every prompt needs a title").max(200),
  description: z.string().trim().max(600).default(""),
  body: z.string().trim().max(2000).default(""),
  emoji: z.string().trim().max(16).default(""),
  theme: z.string().trim().max(40).default(""),
  steps: z
    .array(z.string().trim().min(1).max(240))
    .max(8, "Keep it to 8 steps or fewer")
    .default([]),
  bufferTemplateId: z.string().max(64).nullable().default(null),
});

const createSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "Use at least 3 characters")
    .max(80, "Use 80 characters or fewer"),
  prompts: z
    .array(promptSchema)
    .min(1, "Choose at least one prompt")
    .max(30, "A challenge can have up to 30 prompts"),
  cadence: z.enum(["daily", "weekdays"]),
  startMode: z.enum(["fixed", "rolling"]),
  startDate: localDate,
  timezone: z.string().refine(isValidTimeZone, "Choose a time zone from the list"),
  visibility: z.enum(["private", "public"]),
  // Listed on the homepage while active. Only a public challenge can be (the database checks too).
  showOnHome: z.boolean().default(false),
  // Empty means every network counts.
  allowedServices: z
    .array(z.string().regex(/^[A-Za-z]{2,32}$/))
    .max(20)
    .default([]),
  chatEnabled: z.boolean().default(true),
});

export type CreateChallengeResult =
  | { ok: true; slug: string; inviteCode: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

/** Creates a challenge from the setup wizard. */
export async function createChallengeAction(input: unknown): Promise<CreateChallengeResult> {
  const session = await getCurrentSession();
  if (!session)
    return { ok: false, message: "Your session ended. Connect Buffer again to continue." };
  const limited = await limitUser(getDb(), "createChallenge", session.user.id);
  if (limited) return { ok: false, message: limited };

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] ??= issue.message;
    }
    return { ok: false, message: "Some answers need a fix.", fieldErrors };
  }

  const today = localDateOf(new Date(), parsed.data.timezone);
  if (parsed.data.startMode === "fixed" && parsed.data.startDate < today) {
    return {
      ok: false,
      message: "Some answers need a fix.",
      fieldErrors: { startDate: "Choose today or a later date" },
    };
  }
  // A rolling challenge opens for joining today unless the host picks a later day.
  const startDate =
    parsed.data.startMode === "rolling" && parsed.data.startDate < today
      ? today
      : parsed.data.startDate;

  try {
    const challenge = await createChallenge(
      getDb(),
      session.user,
      { ...parsed.data, startDate },
      new Date(),
    );
    // The sidebar lives in the layout, which a navigation keeps; refresh it to list this one.
    refresh();
    return { ok: true, slug: challenge.slug, inviteCode: challenge.inviteCode };
  } catch (error) {
    console.error("Creating a challenge failed", error);
    return {
      ok: false,
      message: "The challenge could not be saved. Your answers are kept; try again.",
    };
  }
}

export type LibraryResult =
  | { ok: true; templates: LibraryTemplate[] }
  | { ok: false; message: string };

/** Buffer's public template library, for the wizard's prompt step. */
export async function loadLibraryAction(): Promise<LibraryResult> {
  const session = await getCurrentSession();
  if (!session)
    return { ok: false, message: "Your session ended. Connect Buffer again to continue." };
  try {
    return { ok: true, templates: await publicTemplates(getBufferDeps(), session.user.id) };
  } catch (error) {
    return { ok: false, message: bufferErrorMessage(error) };
  }
}

const joinSchema = z.object({
  code: z.string().min(10).max(64),
  channelIds: z.array(z.string().min(1).max(64)).max(20),
  agreed: z.literal("on", { error: "Tick the box to agree before joining" }),
});

export type JoinState = { status: "idle" } | { status: "error"; message: string; at: number };

/** Joins the challenge behind an invite code, then opens it. */
export async function joinChallengeAction(
  _previous: JoinState,
  formData: FormData,
): Promise<JoinState> {
  const session = await getCurrentSession();
  if (!session)
    return {
      status: "error",
      message: "Your session ended. Connect Buffer again to join.",
      at: Date.now(),
    };
  const joinLimited = await limitUser(getDb(), "join", session.user.id);
  if (joinLimited) return { status: "error", message: joinLimited, at: Date.now() };

  const parsed = joinSchema.safeParse({
    code: formData.get("code"),
    channelIds: formData.getAll("channelIds"),
    agreed: formData.get("agreed") ?? undefined,
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Check your answers.",
      at: Date.now(),
    };
  }

  const challenge = await getChallengeByInvite(getDb(), parsed.data.code);
  if (!challenge || challenge.status !== "open") {
    return {
      status: "error",
      message: "This challenge is no longer open for joining.",
      at: Date.now(),
    };
  }
  if (challenge.invitePaused) {
    return {
      status: "error",
      message: "The host has paused joining for now. Ask them when it opens again.",
      at: Date.now(),
    };
  }
  let participant: Awaited<ReturnType<typeof joinChallenge>>;
  try {
    participant = await joinChallenge(
      getDb(),
      session.user,
      challenge,
      parsed.data.channelIds,
      new Date(),
    );
  } catch (error) {
    if (error instanceof JoinRefusedError) {
      return { status: "error", message: error.message, at: Date.now() };
    }
    throw error;
  }
  if (participant.channelIds.length === 0 && parsed.data.channelIds.length > 0) {
    return {
      status: "error",
      message: "Those channels could not be used. Refresh your channels and try again.",
      at: Date.now(),
    };
  }
  // Showing up on the public recap is a separate, optional choice.
  if (formData.get("wallOptIn") === "on") {
    await getDb()
      .update(schema.participants)
      .set({ wallOptIn: true })
      .where(eq(schema.participants.id, participant.id));
  }
  // The invite page lists who is in; show the new member straight away.
  updateTag(inviteTag(challenge.id));
  // And the sidebar, so it lists the challenge just joined.
  refresh();
  queueCheck(participant.id);
  redirect(`/challenges/${challenge.slug}?joined=1`);
}

export type SaveState =
  | { status: "idle" }
  | { status: "saved"; kind: SaveKind; channelIds: string[]; message: string; at: number }
  | { status: "error"; message: string; reconnect?: boolean; at: number };

const saveSchema = z.object({
  entryId: z.uuid(),
  kind: z.enum(["draft", "idea"]),
  channelIds: z.array(z.string().min(1).max(64)).max(20),
  // The participant's own edit of the draft. Sent to Buffer only; Daydeck never stores it.
  text: z.string().trim().max(10_000).nullable(),
});

/** "Save to Buffer" on a prompt card: a draft on each chosen channel, or an idea. */
export async function saveToBufferAction(
  _previous: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const session = await getCurrentSession();
  if (!session) {
    return {
      status: "error",
      message: "Your session ended. Connect Buffer again to save.",
      reconnect: true,
      at: Date.now(),
    };
  }
  const saveLimited = await limitUser(getDb(), "saveToBuffer", session.user.id);
  if (saveLimited) return { status: "error", message: saveLimited, at: Date.now() };
  const parsed = saveSchema.safeParse({
    entryId: formData.get("entryId"),
    kind: formData.get("kind"),
    channelIds: formData.getAll("channelIds").filter((value) => typeof value === "string"),
    text: formData.get("draftText") || null,
  });
  if (!parsed.success)
    return {
      status: "error",
      message: "That prompt could not be read. Reload the page.",
      at: Date.now(),
    };

  try {
    const result = await saveToBuffer(getBufferDeps(), { userId: session.user.id, ...parsed.data });
    // Follow the new post in Buffer from here on: scheduled, sent or failed.
    queueCheck(result.participantId);
    updateTag(planTag(session.user.id));
    refresh();
    const names = listNames(result.saved.map((channel) => channel.name));
    const refused = result.failed
      .map((channel) => ` Buffer did not save it on ${channel.name}: ${channel.message}`)
      .join("");
    return {
      status: "saved",
      kind: result.kind,
      channelIds: result.saved.map((channel) => channel.channelId),
      message:
        result.kind === "draft"
          ? `Saved as a draft on ${names}. Finish it in Buffer when you are ready.${refused}`
          : "Saved to your Ideas in Buffer.",
      at: Date.now(),
    };
  } catch (error) {
    const reconnect =
      error instanceof BufferReconnectRequiredError || error instanceof BufferNotConnectedError;
    if (reconnect) refresh();
    return { status: "error", message: bufferErrorMessage(error), reconnect, at: Date.now() };
  }
}

/** "A", "A and B", "A, B and C". */
function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

export type ChannelsState =
  | { status: "idle" }
  | { status: "saved" | "error"; message: string; at: number };

/** Changes which channels count for one challenge. */
export async function setChallengeChannelsAction(
  _previous: ChannelsState,
  formData: FormData,
): Promise<ChannelsState> {
  const session = await getCurrentSession();
  if (!session)
    return {
      status: "error",
      message: "Your session ended. Connect Buffer again.",
      at: Date.now(),
    };
  const challengeId = z.uuid().safeParse(formData.get("challengeId"));
  const channelIds = z.array(z.string().max(64)).max(20).safeParse(formData.getAll("channelIds"));
  if (!challengeId.success || !channelIds.success) {
    return {
      status: "error",
      message: "That choice could not be read. Reload the page.",
      at: Date.now(),
    };
  }
  const { participants } = schema;
  const [participant] = await getDb()
    .select()
    .from(participants)
    .where(
      and(eq(participants.challengeId, challengeId.data), eq(participants.userId, session.user.id)),
    );
  if (!participant)
    return { status: "error", message: "You are not in this challenge.", at: Date.now() };

  const saved = await setParticipantChannels(getDb(), participant, channelIds.data);
  updateTag(planTag(session.user.id));
  refresh();
  return {
    status: saved.length > 0 ? "saved" : "error",
    message:
      saved.length > 0
        ? `Saved. ${saved.length === 1 ? "1 channel counts" : `${saved.length} channels count`} for this challenge.`
        : "Choose at least one channel.",
    at: Date.now(),
  };
}

/** Checks Buffer again for free slots, skipping the cached plan (two Buffer requests). */
export async function findSlotsAction(slug: string): Promise<FindSlotsResult> {
  const session = await getCurrentSession();
  if (!session) return { status: "error", message: "Your session ended. Connect Buffer again." };
  // Clear the kept copy, then fill it with Buffer's fresh answer, so the next visit shows it.
  updateTag(planTag(session.user.id));
  try {
    const parsed = z.string().max(80).parse(slug);
    const data = await challengeForMember(getDb(), parsed, session.user.id, new Date());
    if (!data?.participant) return { status: "error", message: "You are not in this challenge." };
    const result = await cachedWeekSlots(session.user.id, parsed, planKey(data));
    return toFindSlotsResult(result);
  } catch (error) {
    return { status: "error", message: bufferErrorMessage(error) };
  }
}

const picksSchema = z
  .array(
    z
      .object({
        entryId: z.uuid(),
        channelId: z.string().min(1).max(64),
        dueAt: z.iso.datetime().optional(),
        time: z
          .string()
          .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
          .optional(),
      })
      .refine((pick) => Boolean(pick.dueAt) !== Boolean(pick.time), "Choose one time."),
  )
  .min(1)
  .max(7);

export type SavePlanState =
  | { status: "ok"; saved: number; failed: { entryId: string; message: string }[] }
  | { status: "error"; message: string };

/** Saves the chosen slots as timed drafts in Buffer. */
export async function savePlanAction(slug: string, picks: unknown): Promise<SavePlanState> {
  const session = await getCurrentSession();
  if (!session) return { status: "error", message: "Your session ended. Connect Buffer again." };
  const parsed = picksSchema.safeParse(picks);
  if (!parsed.success) return { status: "error", message: "Choose at least one time to save." };
  try {
    const result = await saveWeekPlan(
      getBufferDeps(),
      session.user.id,
      z.string().max(80).parse(slug),
      parsed.data,
    );
    updateTag(planTag(session.user.id));
    refresh();
    return { status: "ok", ...result };
  } catch (error) {
    return { status: "error", message: bufferErrorMessage(error) };
  }
}
