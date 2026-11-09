"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@daydeck/ui/components/tooltip";
import type { ComponentProps } from "react";
import { StateMark } from "./state-mark";

/**
 * A day's icon with the same tooltip as the board: "Day 3 · Saved to Buffer". For rows of
 * icons without words next to them; the row's own label still says the total for screen readers.
 */
export function StateTip({ label, ...mark }: ComponentProps<typeof StateMark> & { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger delay={300} render={<span className="inline-flex" />}>
        <StateMark {...mark} />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
