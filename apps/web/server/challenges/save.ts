// "Save to Buffer": turns one day's prompt into a draft on each chosen channel, or into an idea.
import { BufferMutationError, createDraft, createIdea, ensureTag } from "@daydeck/buffer";
import { and, type Database, eq, inArray, schema, sql } from "@daydeck/db";
import { callBuffer } from "../buffer/call";
import type { BufferDeps } from "../buffer/deps";
import { BufferNotConnectedError } from "../buffer/errors";
import { upsertDayPost } from "../progress/day-posts";

const { challenges, challengePrompts, participants, entries, bufferConnections, channels } = schema;

/** Ember, from the app's palette. Buffer maps it to its closest named tag color. */
const TAG_COLOR = "#F97316";

export type SaveKind = "draft" | "idea";

export interface SavedChannel {
  channelId: string;
  name: string;
  service: string | null;
}

export interface SaveResult {
  kind: SaveKind;
  /** The channels that got a draft; empty for an idea. */
  saved: SavedChannel[];
  /** The channels whose draft Buffer refused, each with Buffer's reason. */
  failed: (SavedChannel & { message: string })[];
  tagged: boolean;
  /** Whose day it is, so the caller can queue a progress check. */
  participantId: string;
}

export class SaveRefusedError extends Error {
  override name = "SaveRefusedError";
}

/** The text a draft starts with: the prompt's starting text, or its title. */
export function draftText(prompt: { title: string; body: string }): string {
  return prompt.body.trim() || prompt.title.trim();
}

async function loadEntry(db: Database, entryId: string, userId: string) {
  const [row] = await db
    .select({
      entry: entries,
      participant: participants,
      prompt: challengePrompts,
      challenge: challenges,
    })
    .from(entries)
    .innerJoin(participants, eq(participants.id, entries.participantId))
    .innerJoin(challengePrompts, eq(challengePrompts.id, entries.challengePromptId))
    .innerJoin(challenges, eq(challenges.id, participants.challengeId))
    .where(
      and(
        eq(entries.id, entryId),
        eq(participants.userId, userId),
        eq(participants.status, "active"),
      ),
    );
  return row ?? null;
}

/**
 * The challenge tag in the person's Buffer organization, created on first use. A failure here
 * never blocks saving: the draft is still saved, just without the tag.
 */
export async function challengeTagId(
  deps: BufferDeps,
  participant: { id: string; userId: string; bufferTagId: string | null },
  tagName: string,
  organizationId: string,
): Promise<string | null> {
  if (participant.bufferTagId) return participant.bufferTagId;
  try {
    const tagId = await callBuffer(deps, participant.userId, (options) =>
      ensureTag({ organizationId, name: tagName, color: TAG_COLOR }, options),
    );
    await deps.db
      .update(participants)
      .set({ bufferTagId: tagId })
      .where(eq(participants.id, participant.id));
    return tagId;
  } catch (error) {
    console.warn("Could not create the challenge tag; saving without it", error);
    return null;
  }
}

export async function saveToBuffer(
  deps: BufferDeps,
  input: {
    userId: string;
    entryId: string;
    kind: SaveKind;
    /** The channels to save the draft to, each one a separate Buffer post. */
    channelIds: string[];
    /** The participant's edit of the draft text; the prompt's own text when null. */
    text?: string | null;
  },
): Promise<SaveResult> {
  const row = await loadEntry(deps.db, input.entryId, input.userId);
  if (!row) throw new SaveRefusedError("This prompt is not part of a challenge you are in.");
  const { entry, participant, prompt, challenge } = row;
  const text = input.text?.trim() || draftText(prompt);

  const [connection] = await deps.db
    .select({ organizationId: bufferConnections.organizationId })
    .from(bufferConnections)
    .where(eq(bufferConnections.userId, input.userId));
  if (!connection) throw new BufferNotConnectedError();

  let result: SaveResult;
  if (input.kind === "idea") {
    const { ideaId } = await callBuffer(deps, input.userId, (options) =>
      createIdea(
        {
          organizationId: connection.organizationId,
          title: `${prompt.emoji} ${prompt.title}`.trim(),
          text: [prompt.description, text].filter(Boolean).join("\n\n"),
          templateId: prompt.bufferTemplateId,
        },
        options,
      ),
    );
    await deps.db
      .update(entries)
      .set({
        bufferIdeaId: ideaId,
        // Saving never moves a day backwards: scheduled and posted stay as they are.
        state: sql`case when ${entries.state} in ('open', 'missed') then 'saved'::entry_state else ${entries.state} end`,
        updatedAt: deps.now(),
      })
      .where(eq(entries.id, entry.id));
    result = { kind: "idea", saved: [], failed: [], tagged: false, participantId: participant.id };
  } else {
    const channelIds = [...new Set(input.channelIds)];
    if (
      channelIds.length === 0 ||
      channelIds.some((channelId) => !participant.channelIds.includes(channelId))
    ) {
      throw new SaveRefusedError(
        "Choose at least one of the channels that count for this challenge.",
      );
    }
    const channelRows = await deps.db
      .select({
        id: channels.bufferChannelId,
        name: channels.name,
        displayName: channels.displayName,
        service: channels.service,
      })
      .from(channels)
      .where(and(eq(channels.userId, input.userId), inArray(channels.bufferChannelId, channelIds)));
    const describe = (channelId: string): SavedChannel => {
      const channel = channelRows.find((row) => row.id === channelId);
      return {
        channelId,
        name: channel ? channel.displayName || channel.name : "a channel",
        service: channel?.service ?? null,
      };
    };

    const tagId = await challengeTagId(
      deps,
      participant,
      challenge.tagName,
      connection.organizationId,
    );
    result = {
      kind: "draft",
      saved: [],
      failed: [],
      tagged: Boolean(tagId),
      participantId: participant.id,
    };
    // One Buffer post per channel. A refusal on one channel never stops the others.
    let firstError: BufferMutationError | null = null;
    for (const channelId of channelIds) {
      try {
        const draft = await callBuffer(deps, input.userId, (options) =>
          createDraft({ channelId, text, tagIds: tagId ? [tagId] : [] }, options),
        );
        await upsertDayPost(
          deps.db,
          entry.id,
          {
            channelId,
            bufferPostId: draft.postId,
            status: "draft",
            dueAt: null,
            sentAt: null,
            externalLink: null,
          },
          { matchSource: "app" },
        );
        result.saved.push(describe(channelId));
      } catch (error) {
        if (!(error instanceof BufferMutationError)) throw error;
        firstError ??= error;
        result.failed.push({ ...describe(channelId), message: error.message });
      }
    }
    if (result.saved.length > 0) {
      await deps.db
        .update(entries)
        .set({
          state: sql`case when ${entries.state} in ('open', 'missed') then 'saved'::entry_state else ${entries.state} end`,
          updatedAt: deps.now(),
        })
        .where(eq(entries.id, entry.id));
    } else if (firstError) {
      // Nothing saved: report Buffer's reason as before.
      throw firstError;
    }
  }

  await deps.db
    .update(challenges)
    .set({ boardVersion: sql`${challenges.boardVersion} + 1` })
    .where(eq(challenges.id, challenge.id));
  return result;
}

export { BufferMutationError };
