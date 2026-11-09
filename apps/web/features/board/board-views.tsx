"use client";

import { cn } from "@daydeck/ui/lib/utils";
import { CalendarDaysIcon, UsersIcon } from "lucide-react";
import { useState } from "react";
import type { BoardData } from "@/server/board/board";
import { BoardCalendar } from "./board-calendar";
import { BoardGrid } from "./board-grid";
import { useLiveBoard } from "./use-live-board";

const VIEWS = [
  { id: "calendar", label: "Calendar", Icon: CalendarDaysIcon },
  { id: "people", label: "People", Icon: UsersIcon },
] as const;

type View = (typeof VIEWS)[number]["id"];

/**
 * The board in two views over the same live data: a calendar of the challenge's dates, and
 * everyone side by side day by day. Updates arrive in both while the page is open.
 */
export function BoardViews({ slug, initial }: { slug: string; initial: BoardData }) {
  const { board, ignite, announcement, sinceLastVisit } = useLiveBoard(slug, initial);
  const [view, setView] = useState<View>("calendar");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <fieldset className="inline-flex min-w-0 rounded-lg border-0 bg-muted p-0.5">
          <legend className="sr-only">Board view</legend>
          {VIEWS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={view === id}
              onClick={() => setView(id)}
              className={cn(
                "inline-flex h-10 items-center gap-1.5 rounded-md px-3 text-muted-foreground text-sm outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 md:h-8",
                view === id && "bg-background font-medium text-foreground shadow-sm",
              )}
            >
              <Icon aria-hidden="true" className="size-4" />
              {label}
            </button>
          ))}
        </fieldset>
        {sinceLastVisit ? <p className="text-sm">{sinceLastVisit}</p> : null}
      </div>
      <output aria-live="polite" className="sr-only">
        {announcement}
      </output>
      {view === "calendar" ? (
        <BoardCalendar slug={slug} board={board} />
      ) : (
        <BoardGrid board={board} ignite={ignite} />
      )}
    </div>
  );
}
