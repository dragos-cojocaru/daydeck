"use client";

import { useEffect, useRef, useState } from "react";
import { useLive } from "@/features/community/live";
import type { BoardData, CellState } from "@/server/board/board";

/** How often the board asks anyway, under the live stream that tells it about changes. */
const POLL_MS = 20_000;
const FINISHED: CellState[] = ["done", "caught_up"];

const NEWS: Partial<Record<CellState, string>> = {
  done: "posted",
  caught_up: "caught up on",
  planned: "scheduled",
};

function storageKey(slug: string) {
  return `daydeck:board-seen:${slug}`;
}

/** "participantId:dayIndex" for every finished cell. */
function finishedKeys(board: BoardData): string[] {
  return board.rows.flatMap((row) =>
    row.cells.flatMap((cell, index) =>
      FINISHED.includes(cell.state) ? [`${row.participantId}:${index}`] : [],
    ),
  );
}

/** One sentence for a list of changes, short enough to read out: "Ana posted day 3, and 2 more." */
function summarize(changes: string[]): string {
  if (changes.length === 0) return "";
  if (changes.length <= 3) return `${changes.join(", ")}.`;
  return `${changes.slice(0, 3).join(", ")}, and ${changes.length - 3} more.`;
}

/** Lights the given cells once; the animation class goes away after it has played. */
function lightUp(setIgnite: (keys: Set<string>) => void, keys: string[]) {
  if (keys.length === 0) return;
  setIgnite(new Set(keys));
  window.setTimeout(() => setIgnite(new Set()), 1200);
}

/**
 * The board's live data, shared by the calendar and the people view. It says what changed since
 * the last visit, asks for changes every 20 seconds while the tab is visible, and lights up
 * cells that just finished.
 */
export function useLiveBoard(slug: string, initial: BoardData) {
  const [board, setBoard] = useState(initial);
  const [ignite, setIgnite] = useState<Set<string>>(new Set());
  const [announcement, setAnnouncement] = useState("");
  const [sinceLastVisit, setSinceLastVisit] = useState("");
  const cursor = useRef(initial.cursor);
  const pollNow = useRef<() => Promise<void>>(async () => {});
  // The live stream says someone's days changed: ask for the board at once.
  const liveBoard = useLive().data[slug]?.board;
  const seenBoard = useRef(liveBoard);
  useEffect(() => {
    if (liveBoard === undefined) return;
    if (seenBoard.current !== undefined && seenBoard.current !== liveBoard) void pollNow.current();
    seenBoard.current = liveBoard;
  }, [liveBoard]);

  // On the first visit, remember what is finished; on later visits, say what changed.
  // biome-ignore lint/correctness/useExhaustiveDependencies: compares with the last visit once
  useEffect(() => {
    const now = finishedKeys(initial);
    try {
      const saved = localStorage.getItem(storageKey(slug));
      if (saved) {
        const before = new Set(JSON.parse(saved) as string[]);
        const fresh = now.filter((key) => !before.has(key));
        const names = fresh.map((key) => {
          const [participantId, day] = key.split(":");
          const row = initial.rows.find((r) => r.participantId === participantId);
          return `${row?.isYou ? "You" : (row?.name ?? "Someone")} posted day ${Number(day) + 1}`;
        });
        setSinceLastVisit(names.length > 0 ? `Since your last visit: ${summarize(names)}` : "");
        lightUp(setIgnite, fresh);
      }
      localStorage.setItem(storageKey(slug), JSON.stringify(now));
    } catch {}
  }, []);

  // Live updates: right away when the live stream reports a change, every 20 seconds as a safety
  // net while the tab is visible, and when it becomes visible again. An unchanged board answers
  // with no content.
  useEffect(() => {
    let active = true;
    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch(
          `/api/board/${encodeURIComponent(slug)}?cursor=${encodeURIComponent(cursor.current)}`,
          { cache: "no-store" },
        );
        if (!active || response.status !== 200) return;
        const next = (await response.json()) as BoardData;
        cursor.current = next.cursor;
        setBoard((previous) => {
          const changes: string[] = [];
          const lit: string[] = [];
          for (const row of next.rows) {
            const old = previous.rows.find((r) => r.participantId === row.participantId);
            row.cells.forEach((cell, index) => {
              const before = old?.cells[index]?.state;
              if (before === cell.state) return;
              const verb = NEWS[cell.state];
              if (verb) changes.push(`${row.isYou ? "You" : row.name} ${verb} day ${index + 1}`);
              if (FINISHED.includes(cell.state)) lit.push(`${row.participantId}:${index}`);
            });
          }
          // One polite message for the whole batch, not one per cell.
          if (changes.length > 0) setAnnouncement(summarize(changes));
          lightUp(setIgnite, lit);
          try {
            localStorage.setItem(storageKey(slug), JSON.stringify(finishedKeys(next)));
          } catch {}
          return next;
        });
      } catch {
        // Offline or a server hiccup: the next poll tries again.
      }
    };
    pollNow.current = poll;
    const timer = window.setInterval(poll, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [slug]);

  return { board, ignite, announcement, sinceLastVisit };
}
