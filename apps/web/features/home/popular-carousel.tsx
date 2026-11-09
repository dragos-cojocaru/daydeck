"use client";

import { Button } from "@daydeck/ui/components/button";
import { cn } from "@daydeck/ui/lib/utils";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { POPULAR_LIST } from "./popular-layout";

// A row of cards that scrolls sideways: swipe on touch screens, Previous and Next buttons
// everywhere it overflows. Cards snap into place. It never moves by itself (no auto-play),
// and the buttons scroll without animation when the person asks for reduced motion.

export function PopularCarousel({
  header,
  children,
  listClassName,
}: {
  header: ReactNode;
  children: ReactNode;
  /** Extra classes for the row, such as a wider reach to match a page with more side padding. */
  listClassName?: string;
}) {
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  // Both edges reached means everything fits, so the buttons stay hidden. Same on the server.
  const [edges, setEdges] = useState({ atStart: true, atEnd: true });

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const max = list.scrollWidth - list.clientWidth;
        setEdges({ atStart: list.scrollLeft <= 1, atEnd: list.scrollLeft >= max - 1 });
      });
    };
    update();
    list.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(list);
    return () => {
      cancelAnimationFrame(frame);
      list.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  /** Moves by as many whole cards as are in view, so no card is skipped. */
  function scrollPage(direction: 1 | -1) {
    const list = listRef.current;
    const card = list?.querySelector("li");
    if (!list || !card) return;
    const gap = Number.parseFloat(getComputedStyle(list).columnGap) || 0;
    const step = card.getBoundingClientRect().width + gap;
    const inView = Math.max(1, Math.floor((list.clientWidth + gap) / step));
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    list.scrollBy({ left: direction * inView * step, behavior: still ? "auto" : "smooth" });
  }

  const overflows = !(edges.atStart && edges.atEnd);
  return (
    <>
      <div className="flex items-end justify-between gap-4">
        {header}
        {/* Phones swipe, and the next card peeking in shows there is more. */}
        {overflows ? (
          <div className="hidden shrink-0 gap-2 sm:flex">
            <Button
              variant="outline"
              className="size-11 rounded-full"
              aria-label="Previous challenges"
              aria-controls={listId}
              disabled={edges.atStart}
              onClick={() => scrollPage(-1)}
            >
              <ChevronLeftIcon className="size-5" />
            </Button>
            <Button
              variant="outline"
              className="size-11 rounded-full"
              aria-label="Next challenges"
              aria-controls={listId}
              disabled={edges.atEnd}
              onClick={() => scrollPage(1)}
            >
              <ChevronRightIcon className="size-5" />
            </Button>
          </div>
        ) : null}
      </div>
      <ul id={listId} ref={listRef} className={cn(POPULAR_LIST, listClassName)}>
        {children}
      </ul>
    </>
  );
}
