// Shared by the carousel and its loading placeholder, so both take exactly the same space.

/**
 * The scrolling row. It reaches to the page edge on phones so the next card peeks in, and keeps
 * a little room above and below for the keyboard focus ring.
 */
export const POPULAR_LIST =
  "-mx-4 sm:-mx-6 -my-1 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto overscroll-x-contain px-4 py-1 [scrollbar-width:none] sm:scroll-px-6 sm:px-6 [&::-webkit-scrollbar]:hidden";

/** One card's width: most of a phone screen, half a tablet, a third of a wide screen. */
export const POPULAR_ITEM =
  "flex shrink-0 basis-[85%] snap-start sm:basis-[calc((100%-1rem)/2)] lg:basis-[calc((100%-2rem)/3)]";
