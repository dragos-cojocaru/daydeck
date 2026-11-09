import type { CellState } from "@/server/board/board";

/** Short labels for each day state, in the order the legend lists them. */
export const STATE_LABELS: Record<CellState, string> = {
  open: "Not saved yet",
  saved: "Saved to Buffer",
  planned: "Scheduled",
  done: "Posted",
  caught_up: "Caught up",
  missed: "Waiting to catch up",
  paused: "Paused",
};

/** The states that count as posted. */
export const POSTED: CellState[] = ["done", "caught_up"];
