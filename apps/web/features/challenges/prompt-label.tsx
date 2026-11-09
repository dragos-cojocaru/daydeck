import { cn } from "@daydeck/ui/lib/utils";
import { LightbulbIcon } from "lucide-react";

/**
 * The label above a prompt, the same on every page: a light bulb, "Prompt · Day 3", and an
 * optional detail such as the date. It makes a prompt recognisable wherever it appears.
 */
export function PromptLabel({
  dayNumber,
  detail,
  className,
}: {
  dayNumber: number;
  detail?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex flex-wrap items-center gap-x-1.5 font-semibold text-primary text-xs uppercase leading-4 tracking-wide",
        className,
      )}
    >
      <LightbulbIcon aria-hidden="true" className="size-3.5 shrink-0" />
      Prompt · Day {dayNumber}
      {detail ? (
        <span className="font-medium text-muted-foreground normal-case tracking-normal">
          · {detail}
        </span>
      ) : null}
    </span>
  );
}

/** A prompt's emoji and title. */
export function promptText(prompt: { emoji?: string | null; title: string }): string {
  return `${prompt.emoji ?? ""} ${prompt.title}`.trim();
}
