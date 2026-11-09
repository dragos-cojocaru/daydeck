import { cn } from "@daydeck/ui/lib/utils";
import {
  CircleDashedIcon,
  ClockIcon,
  FlameIcon,
  HourglassIcon,
  type LucideIcon,
  PauseIcon,
  PencilIcon,
} from "lucide-react";
import type { CellState } from "@/server/board/board";

// Every state is a filled tile with its own icon, never an empty outline or a tick, so a day
// never looks like a checkbox. A posted day "lights up" with a flame, as in streak apps. Each
// icon keeps at least 3:1 against its tile in both themes (WCAG 1.4.11).
const STYLE: Record<CellState, { tile: string; Icon: LucideIcon }> = {
  open: { tile: "bg-tile text-cell-line", Icon: CircleDashedIcon },
  saved: { tile: "bg-accent text-primary", Icon: PencilIcon },
  planned: { tile: "bg-planned-tint text-planned-ink", Icon: ClockIcon },
  done: { tile: "bg-ember text-ember-ink", Icon: FlameIcon },
  // Posted later than its day: the same flame, with a dot in the corner.
  caught_up: {
    tile: "relative bg-ember text-ember-ink after:absolute after:top-[12%] after:right-[12%] after:size-[22%] after:rounded-full after:bg-ember-ink",
    Icon: FlameIcon,
  },
  missed: { tile: "bg-tile text-cell-line", Icon: HourglassIcon },
  paused: { tile: "bg-tile text-cell-line", Icon: PauseIcon },
};

const SIZE = {
  xs: "size-4 rounded-[3px] [&_svg]:size-2.5",
  sm: "size-[1.125rem] rounded-[4px] [&_svg]:size-3",
  md: "size-5 rounded-[4px] [&_svg]:size-3.5",
  lg: "size-7 rounded-[6px] [&_svg]:size-4",
};

/** A day's tile colours without the icon, for boards too small for icons (the homepage cards). */
export function stateTileClass(state: CellState): string {
  const lit = state === "done" || state === "caught_up";
  return cn(STYLE[state].tile, lit && "shadow-[0_0_6px_-2px_var(--color-ember-glow)]");
}

/** One day's state as a tile with an icon. Decorative: the label beside it, or the cell's own label, says it in words. */
export function StateMark({
  state,
  size = "md",
  className,
}: {
  state: CellState;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  const { tile, Icon } = STYLE[state];
  const lit = state === "done" || state === "caught_up";
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center",
        SIZE[size],
        tile,
        lit && "shadow-[0_0_10px_-3px_var(--color-ember-glow)]",
        className,
      )}
    >
      <Icon strokeWidth={2} absoluteStrokeWidth />
    </span>
  );
}
