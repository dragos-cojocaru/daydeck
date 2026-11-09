import { cn } from "@daydeck/ui/lib/utils";

// Buffer's own favicon (buffer.com/icons/favicon.svg), unchanged: the mark is #231F20 on light
// backgrounds and white on dark, as Buffer's file sets it. It follows Daydeck's theme here.
const MARK_PATH =
  "M38.2083 122.6L257.471 9.02081L479.098 122.6L257.471 236.577L38.2083 122.6ZM107.884 222.354L257.471 295.917L408.634 222.354L479.098 256.684L257.471 364.577L38.2083 256.684L107.884 222.354ZM107.884 350.354L257.471 431.474L408.634 350.354L479.098 388.016L257.471 506.799L38.2083 388.016L107.884 350.354Z";

function BufferMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      aria-hidden="true"
      focusable="false"
      className={cn("fill-[#231F20] dark:fill-white", className)}
    >
      <path fillRule="evenodd" clipRule="evenodd" d={MARK_PATH} />
    </svg>
  );
}

/**
 * "Buffer" with its icon, linking to buffer.com in a new tab, for use inside a sentence. The
 * icon sits on the baseline at cap height, with a word space and a little more before it, and a
 * small gap before the word, so the icon reads as part of "Buffer". It takes the
 * sentence's colour and weight; hover and keyboard focus add the underline.
 */
export function BufferLink({ className }: { className?: string }) {
  return (
    <a
      href="https://buffer.com"
      // The new-tab warning lives in the accessible name, not hidden text, so copying the
      // sentence gives just "Buffer". The name starts with the visible word (WCAG 2.5.3).
      aria-label="Buffer (opens in a new tab)"
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "whitespace-nowrap rounded-sm text-inherit no-underline underline-offset-3 outline-none hover:underline focus-visible:underline focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
    >
      <BufferMark className="ml-[0.15em] mr-[0.1em] inline-block size-[0.72em] align-baseline" />
      Buffer
    </a>
  );
}
