"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@daydeck/ui/components/tooltip";
import { cn } from "@daydeck/ui/lib/utils";
import { type KeyboardEvent, useRef, useState } from "react";
import { UserAvatar } from "@/components/user-avatar";
import { formatLongDay } from "@/features/challenges/format";
import type { BoardData } from "@/server/board/board";
import { StateMark } from "./state-mark";

const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" });

/** The people view: everyone in rows, the days in columns, as an ARIA grid. */
export function BoardGrid({ board, ignite }: { board: BoardData; ignite: Set<string> }) {
  const [focus, setFocus] = useState({ row: 0, col: Math.max(board.viewerTodayIndex ?? 0, 0) });
  const gridRef = useRef<HTMLTableElement>(null);
  const columns = board.days.length;
  const yourDates = board.rows.find((row) => row.isYou)?.dates ?? [];

  // One tab stop for the whole grid; arrow keys, Home and End move between cells.
  const move = (row: number, col: number) => {
    const next = {
      row: Math.min(Math.max(row, 0), board.rows.length - 1),
      col: Math.min(Math.max(col, 0), columns - 1),
    };
    setFocus(next);
    gridRef.current?.querySelector<HTMLElement>(`[data-cell="${next.row}:${next.col}"]`)?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTableElement>) => {
    const { row, col } = focus;
    const keys: Record<string, () => void> = {
      ArrowRight: () => move(row, col + 1),
      ArrowLeft: () => move(row, col - 1),
      ArrowDown: () => move(row + 1, col),
      ArrowUp: () => move(row - 1, col),
      Home: () => (event.ctrlKey ? move(0, 0) : move(row, 0)),
      End: () =>
        event.ctrlKey ? move(board.rows.length - 1, columns - 1) : move(row, columns - 1),
    };
    const action = keys[event.key];
    if (action) {
      event.preventDefault();
      action();
    }
  };

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      {/* A table with role="grid", as in the ARIA grid pattern: one tab stop, arrow keys. */}
      <table
        ref={gridRef}
        // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: the ARIA grid pattern on a native table
        role="grid"
        aria-label={`Board of ${board.title}`}
        onKeyDown={onKeyDown}
        className="w-max border-separate border-spacing-0 py-2"
      >
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky left-0 z-10 h-9 w-36 bg-card px-3 text-left font-normal text-muted-foreground text-xs leading-4 sm:w-44"
            >
              Person
            </th>
            {board.days.map((day, index) => (
              <th
                key={day.number}
                scope="col"
                aria-label={`Day ${day.number}${yourDates[index] ? `, ${formatLongDay(yourDates[index])}` : ""}: ${day.title}${index === board.viewerTodayIndex ? ", your today" : ""}`}
                className={cn(
                  "relative h-12 w-11 p-0 text-center font-normal text-muted-foreground text-xs leading-4",
                  index === board.viewerTodayIndex && "font-semibold text-foreground",
                )}
              >
                {index === board.viewerTodayIndex ? (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-1 inset-y-0.5 rounded-md bg-accent motion-safe:animate-today-pulse"
                  />
                ) : null}
                {/* The weekday of your own day: in a rolling challenge, others' dates differ. */}
                <span className="relative flex flex-col items-center">
                  {yourDates[index] ? (
                    <span className="text-[0.6875rem] leading-4">
                      {weekday.format(new Date(`${yourDates[index]}T00:00:00Z`))}
                    </span>
                  ) : null}
                  <span>{day.number}</span>
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {board.rows.map((row, rowIndex) => (
            <tr key={row.participantId}>
              <th
                scope="row"
                className="sticky left-0 z-10 h-11 w-36 bg-card px-3 text-left font-normal sm:w-44"
              >
                <span className="flex items-center gap-2">
                  <UserAvatar name={row.name} src={row.avatarUrl} size="sm" />
                  <span className="min-w-0 max-w-28 truncate text-sm leading-5 sm:max-w-32">
                    {/* "You" for the viewer: a long name would hide "(you)" on a phone. */}
                    {row.isYou ? "You" : row.name}
                  </span>
                </span>
              </th>
              {row.cells.map((cell, col) => {
                const key = `${row.participantId}:${col}`;
                const focused = focus.row === rowIndex && focus.col === col;
                return (
                  // The same tooltip as the calendar: it opens on hover and on keyboard focus.
                  <Tooltip key={key}>
                    <TooltipTrigger
                      delay={300}
                      render={
                        <td
                          tabIndex={focused ? 0 : -1}
                          data-cell={`${rowIndex}:${col}`}
                          aria-label={cell.label}
                          onFocus={() => setFocus({ row: rowIndex, col })}
                          className={cn(
                            "size-11 rounded-md p-0 text-center align-middle outline-none hover:ring-1 hover:ring-foreground/25 hover:ring-inset focus-visible:ring-3 focus-visible:ring-ring/50",
                            col === board.viewerTodayIndex && "bg-accent/40",
                          )}
                        />
                      }
                    >
                      <StateMark
                        state={cell.state}
                        size="lg"
                        className={cn(
                          "align-middle",
                          ignite.has(key) &&
                            "motion-safe:animate-ignite motion-reduce:animate-ignite-fade",
                        )}
                      />
                    </TooltipTrigger>
                    <TooltipContent>{cell.label}</TooltipContent>
                  </Tooltip>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
