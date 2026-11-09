import { fetchChannels } from "@daydeck/buffer";
import { and, type Channel, eq, inArray, notInArray, schema, sql } from "@daydeck/db";
import { callBuffer } from "./call";
import type { BufferDeps } from "./deps";
import { BufferNotConnectedError } from "./errors";

const { bufferConnections, channels } = schema;

/** A channel can count for a challenge only if Buffer can publish to it. */
export function isUsable(channel: Pick<Channel, "isDisconnected" | "isLocked">): boolean {
  return !channel.isDisconnected && !channel.isLocked;
}

/**
 * Copies the user's Buffer channels into the local cache with one API request. Keeps the
 * user's choices, removes channels that left Buffer, and on the first sync picks the only
 * usable channel when there is exactly one.
 */
export async function syncChannels(deps: BufferDeps, userId: string): Promise<Channel[]> {
  const [connection] = await deps.db
    .select({ organizationId: bufferConnections.organizationId })
    .from(bufferConnections)
    .where(eq(bufferConnections.userId, userId));
  if (!connection) throw new BufferNotConnectedError();

  const remote = await callBuffer(deps, userId, (options) =>
    fetchChannels(connection.organizationId, options),
  );
  const syncedAt = deps.now();

  return deps.db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: channels.id })
      .from(channels)
      .where(eq(channels.userId, userId))
      .limit(1);
    const isFirstSync = existing.length === 0;
    const usable = remote.filter((c) => !c.isDisconnected && !c.isLocked);

    const remoteIds = remote.map((c) => c.id);
    await tx
      .delete(channels)
      .where(
        remoteIds.length > 0
          ? and(eq(channels.userId, userId), notInArray(channels.bufferChannelId, remoteIds))
          : eq(channels.userId, userId),
      );

    if (remote.length > 0) {
      await tx
        .insert(channels)
        .values(
          remote.map((c) => ({
            userId,
            bufferChannelId: c.id,
            organizationId: c.organizationId,
            service: c.service,
            name: c.name,
            displayName: c.displayName,
            avatarUrl: c.avatar || null,
            timezone: c.timezone,
            isDisconnected: c.isDisconnected,
            isQueuePaused: c.isQueuePaused,
            isLocked: c.isLocked,
            postingSchedule: c.postingSchedule,
            selected: isFirstSync && usable.length === 1 && usable[0]?.id === c.id,
            syncedAt,
          })),
        )
        .onConflictDoUpdate({
          target: [channels.userId, channels.bufferChannelId],
          // Everything except `selected`, which is the user's own choice.
          set: {
            organizationId: sql`excluded.organization_id`,
            service: sql`excluded.service`,
            name: sql`excluded.name`,
            displayName: sql`excluded.display_name`,
            avatarUrl: sql`excluded.avatar_url`,
            timezone: sql`excluded.timezone`,
            isDisconnected: sql`excluded.is_disconnected`,
            isQueuePaused: sql`excluded.is_queue_paused`,
            isLocked: sql`excluded.is_locked`,
            postingSchedule: sql`excluded.posting_schedule`,
            syncedAt: sql`excluded.synced_at`,
          },
        });
    }

    return tx.select().from(channels).where(eq(channels.userId, userId)).orderBy(channels.name);
  });
}

/** The user's cached channels, in a stable order. Costs no Buffer request. */
export async function listChannels(deps: Pick<BufferDeps, "db">, userId: string) {
  return deps.db.select().from(channels).where(eq(channels.userId, userId)).orderBy(channels.name);
}

/**
 * Saves which channels count for the user's challenges. IDs that are not the user's, or not
 * usable, are ignored. Returns how many channels are selected afterwards.
 */
export async function setSelectedChannels(
  deps: Pick<BufferDeps, "db">,
  userId: string,
  channelIds: string[],
): Promise<number> {
  return deps.db.transaction(async (tx) => {
    await tx.update(channels).set({ selected: false }).where(eq(channels.userId, userId));
    if (channelIds.length === 0) return 0;
    const updated = await tx
      .update(channels)
      .set({ selected: true })
      .where(
        and(
          eq(channels.userId, userId),
          inArray(channels.id, channelIds),
          eq(channels.isDisconnected, false),
          eq(channels.isLocked, false),
        ),
      )
      .returning({ id: channels.id });
    return updated.length;
  });
}
