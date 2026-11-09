"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@daydeck/ui/components/popover";
import type { ReactNode } from "react";

/**
 * A word with a wavy underline that explains itself: a short note opens on hover, and on tap
 * or Enter for touch and keyboard, because a plain tooltip never opens on a phone.
 */
export function TermHint({ children, hint }: { children: ReactNode; hint: string }) {
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={100}
        closeDelay={150}
        className="cursor-help rounded-sm text-inherit underline decoration-primary decoration-wavy underline-offset-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {children}
      </PopoverTrigger>
      <PopoverContent side="top" className="w-auto max-w-64 px-3 py-2 leading-5">
        {hint}
      </PopoverContent>
    </Popover>
  );
}
