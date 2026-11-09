// The top bar's shared classes. A plain module, so server components can use them too.

/**
 * As tall as the sidebar's "Daydeck" row (48px from 768px), so their bottom borders form one
 * line; on phones it matches the 56px header above it.
 */
export const TOP_BAR_CLASS =
  "flex h-14 items-center gap-2 border-b bg-background px-2 sm:px-4 md:sticky md:top-0 md:z-10 md:h-12 lg:px-6";

/** One height for every control in the bar: 44px for touch, 32px from 768px. */
export const crumbClass =
  "inline-flex h-11 min-w-0 items-center gap-1 rounded-md px-2 text-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 md:h-8";
