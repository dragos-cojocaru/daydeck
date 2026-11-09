"use server";

import { BufferRateLimitError } from "@daydeck/buffer";
import { refresh } from "next/cache";
import { z } from "zod";
import { getCurrentSession } from "@/server/auth/current-user";
import { listChannels, setSelectedChannels, syncChannels } from "@/server/buffer/channels";
import { getBufferDeps } from "@/server/buffer/config";
import { BufferNotConnectedError, BufferReconnectRequiredError } from "@/server/buffer/errors";
import { getDb } from "@/server/db";

export type ActionResult =
  | { status: "idle" }
  | { status: "success" | "error"; message: string; at: number };

function sessionEnded(): ActionResult {
  return {
    status: "error",
    message: "Your session ended. Connect Buffer again, then try once more.",
    at: Date.now(),
  };
}

// A refresh within this window reuses the last sync and costs no Buffer request.
const REFRESH_COOLDOWN_MS = 30_000;

const channelIdsSchema = z.array(z.uuid()).max(200);

/** Saves which channels count for the user's challenges. */
export async function saveChannels(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await getCurrentSession();
  if (!session) return sessionEnded();

  const parsed = channelIdsSchema.safeParse(formData.getAll("channelIds"));
  if (!parsed.success) {
    return {
      status: "error",
      message: "That choice could not be read. Reload the page and try again.",
      at: Date.now(),
    };
  }

  try {
    const count = await setSelectedChannels({ db: getDb() }, session.user.id, parsed.data);
    refresh();
    const message =
      count === 0
        ? "Saved. No channels count yet: choose at least one before you join a challenge."
        : `Saved. ${count} ${count === 1 ? "channel counts" : "channels count"} for your challenges.`;
    return { status: "success", message, at: Date.now() };
  } catch (error) {
    console.error("Saving channels failed", error);
    return {
      status: "error",
      message: "Your choice was not saved. It is still on screen, so try again in a moment.",
      at: Date.now(),
    };
  }
}

/** Loads the user's channels from Buffer again (one Buffer request). */
export async function refreshChannels(_previous: ActionResult): Promise<ActionResult> {
  const session = await getCurrentSession();
  if (!session) return sessionEnded();
  const userId = session.user.id;

  const cached = await listChannels({ db: getDb() }, userId);
  const lastSync = Math.max(0, ...cached.map((channel) => channel.syncedAt.getTime()));
  if (Date.now() - lastSync < REFRESH_COOLDOWN_MS) {
    return { status: "success", message: "Already up to date with Buffer.", at: Date.now() };
  }

  try {
    const channels = await syncChannels(getBufferDeps(), userId);
    refresh();
    const found = channels.length === 1 ? "1 channel" : `${channels.length} channels`;
    return { status: "success", message: `Updated from Buffer. Found ${found}.`, at: Date.now() };
  } catch (error) {
    if (error instanceof BufferReconnectRequiredError || error instanceof BufferNotConnectedError) {
      refresh();
      return {
        status: "error",
        message: "Buffer needs you to connect again before your channels can be refreshed.",
        at: Date.now(),
      };
    }
    if (error instanceof BufferRateLimitError) {
      const minutes = Math.max(1, Math.ceil(error.retryAfterSeconds / 60));
      return {
        status: "error",
        message: `Buffer is busy right now. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`,
        at: Date.now(),
      };
    }
    console.error("Refreshing channels failed", error);
    return {
      status: "error",
      message:
        "Buffer could not be reached. Your channels and choices are unchanged. Try again in a moment.",
      at: Date.now(),
    };
  }
}
