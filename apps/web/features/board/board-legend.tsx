import type { CellState } from "@/server/board/board";
import { StateMark } from "./state-mark";
import { STATE_LABELS } from "./state-words";

const ORDER = Object.entries(STATE_LABELS) as [CellState, string][];

/** What each day tile means. Each has its own icon, not only its own colour. */
export function BoardLegend() {
  return (
    <ul aria-label="What the cells mean" className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
      {ORDER.map(([state, label]) => (
        <li key={state} className="flex items-center gap-2">
          <StateMark state={state} size="md" />
          {label}
        </li>
      ))}
    </ul>
  );
}
