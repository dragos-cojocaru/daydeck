import type { EntryState } from "@daydeck/db";
import { cn } from "@daydeck/ui/lib/utils";
import {
  CalendarClockIcon,
  ClockIcon,
  CrownIcon,
  FlagIcon,
  FlameIcon,
  HourglassIcon,
  type LucideIcon,
  MoonIcon,
  PauseIcon,
  PencilIcon,
  SendIcon,
  UserIcon,
  UsersIcon,
} from "lucide-react";
import { StateTip } from "@/features/board/state-tip";
import { STATE_LABELS } from "@/features/board/state-words";
import type { DayPosition } from "@/lib/day-engine";
import { deletionPhrase } from "@/lib/deletion-words";
import { formatDay } from "./format";

// The chips and the day strip that describe a challenge, shared by the cards on "Your
// challenges" and the header of a challenge's page, so both read the same way.

export interface ChipSource {
  status: "open" | "closed";
  position: DayPosition;
  todayState: EntryState | null;
  /** For a closed challenge: how many days until Daydeck deletes it. */
  deletesInDays?: number | null;
}

interface Chip {
  label: string;
  Icon: LucideIcon;
  className: string;
}

const QUIET = "bg-tile text-muted-foreground";

/** Where today stands for this challenge, as one chip. Only "Post today" asks for action. */
export function todayChip({ status, position, todayState, deletesInDays }: ChipSource): Chip {
  if (status === "closed") {
    // A closed challenge counts down to its deletion, so nobody is surprised when it goes.
    return deletesInDays === undefined || deletesInDays === null
      ? { label: "Closed", Icon: FlagIcon, className: QUIET }
      : {
          label: `Deleted ${deletionPhrase(deletesInDays)}`,
          Icon: HourglassIcon,
          className: "bg-destructive/10 text-destructive",
        };
  }
  if (position.kind === "rest")
    return { label: "No prompt today", Icon: MoonIcon, className: QUIET };
  if (position.kind === "before") {
    return {
      label: `Starts ${formatDay(position.startsOn)}`,
      Icon: CalendarClockIcon,
      className: QUIET,
    };
  }
  if (position.kind === "after") return { label: "Finished", Icon: FlagIcon, className: QUIET };
  switch (todayState) {
    case "saved":
      return {
        label: "Saved to Buffer",
        Icon: PencilIcon,
        className: "bg-accent text-accent-foreground",
      };
    case "planned":
      return { label: "Scheduled", Icon: ClockIcon, className: "bg-planned-tint text-planned-ink" };
    case "done":
    case "caught_up":
      return {
        label: "Posted today",
        Icon: FlameIcon,
        className: "bg-accent text-accent-foreground",
      };
    case "paused":
      return { label: "Paused today", Icon: PauseIcon, className: QUIET };
    default:
      return {
        label: "Post today",
        Icon: SendIcon,
        className: "bg-primary text-primary-foreground",
      };
  }
}

/** Today's chip, your role, and how many people take part. */
export function ChallengeChips({
  source,
  role,
  memberCount,
  className,
}: {
  source: ChipSource;
  role: "host" | "participant";
  memberCount: number;
  className?: string;
}) {
  const chip = todayChip(source);
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <span
        className={cn(
          "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 font-medium text-xs",
          chip.className,
        )}
      >
        <chip.Icon aria-hidden="true" className="size-3.5" />
        {chip.label}
      </span>
      <span className="inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-muted-foreground text-xs">
        {role === "host" ? (
          <CrownIcon aria-hidden="true" className="size-3.5" />
        ) : (
          <UserIcon aria-hidden="true" className="size-3.5" />
        )}
        {role === "host" ? "Host" : "Member"}
      </span>
      <span className="inline-flex h-7 items-center gap-1 px-1 text-muted-foreground text-xs">
        <UsersIcon aria-hidden="true" className="size-3.5" />
        {memberCount === 1 ? "1 person" : `${memberCount} people`}
      </span>
    </div>
  );
}

/** Your days as small tiles, with "2 of 5 days in Buffer". */
export function DayStrip({
  states,
  saved,
  size = "xs",
}: {
  states: EntryState[];
  saved: number;
  size?: "xs" | "sm";
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span
        role="img"
        aria-label={`Your days: ${saved} of ${states.length} in Buffer`}
        className="flex flex-wrap gap-1"
      >
        {states.map((state, day) => (
          <StateTip
            // biome-ignore lint/suspicious/noArrayIndexKey: one tile per day, in order
            key={day}
            state={state}
            size={size}
            label={`Day ${day + 1} · ${STATE_LABELS[state]}`}
          />
        ))}
      </span>
      <span className="text-muted-foreground text-xs">
        {saved} of {states.length} days in Buffer
      </span>
    </div>
  );
}
