import type { EntryState } from "@daydeck/db";

/** The longest run of posted days in a row (on time or caught up). */
export function bestStreak(states: EntryState[]): number {
  let best = 0;
  let run = 0;
  for (const state of states) {
    run = state === "done" || state === "caught_up" ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

/** "Best streak: 1 day" or "Best streak: 4 days in a row". */
export function streakText(streak: number): string {
  return streak === 1 ? "Best streak: 1 day" : `Best streak: ${streak} days in a row`;
}
