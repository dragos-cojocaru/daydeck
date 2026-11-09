"use client";

import { buttonVariants } from "@daydeck/ui/components/button";
import { cn } from "@daydeck/ui/lib/utils";
import { DownloadIcon, SparklesIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { streakText } from "@/lib/streak";

const OPTIONS = [
  { key: "name", label: "My name" },
  { key: "count", label: "Days posted" },
  { key: "streak", label: "My best streak" },
] as const;

type Choice = Record<(typeof OPTIONS)[number]["key"], boolean>;

/**
 * Your badge: a picture made from your days, with tick boxes for what it shows. The preview and
 * the download use the same address, so what you see is what you download.
 */
export function BadgeCard({
  slug,
  participantId,
  alt,
  streak,
}: {
  slug: string;
  participantId: string;
  alt: string;
  /** Your longest run of posted days; the streak option needs at least one. */
  streak: number;
}) {
  const [choice, setChoice] = useState<Choice>({ name: true, count: true, streak: false });
  const query = new URLSearchParams();
  if (!choice.name) query.set("name", "0");
  if (!choice.count) query.set("count", "0");
  if (choice.streak && streak > 0) query.set("streak", "1");
  const src = `/recap/${slug}/badge/${participantId}${query.size > 0 ? `?${query}` : ""}`;
  const download = `${src}${query.size > 0 ? "&" : "?"}download=1`;
  // The address of the last image that finished loading; any other address is still loading.
  const [loaded, setLoaded] = useState<string | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const loading = loaded !== src;
  // The first image can finish before the page is interactive, so check once on arrival.
  useEffect(() => {
    if (imageRef.current?.complete) setLoaded(imageRef.current.getAttribute("src"));
  }, []);

  return (
    <section
      aria-labelledby="badge-heading"
      className="flex flex-col gap-3 rounded-xl border bg-card p-4"
    >
      <h2 id="badge-heading" className="flex items-center gap-2 font-semibold text-sm">
        <SparklesIcon aria-hidden="true" className="size-4 text-primary" />
        Your badge
      </h2>
      <div className="relative overflow-hidden rounded-lg border" aria-busy={loading}>
        {/* biome-ignore lint/performance/noImgElement: a generated image, not a static asset */}
        <img
          ref={imageRef}
          src={src}
          alt={alt}
          width={1200}
          height={630}
          onLoad={() => setLoaded(src)}
          onError={() => setLoaded(src)}
          className="block h-auto w-full"
        />
        {/* While a new badge is drawn: the old one dims and a band of light sweeps across. */}
        {loading ? (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-background/40">
            <div className="absolute inset-0 animate-shimmer bg-linear-to-r from-transparent via-foreground/15 to-transparent motion-reduce:hidden" />
          </div>
        ) : null}
      </div>
      <output aria-live="polite" className="sr-only">
        {loading ? "Updating the badge…" : ""}
      </output>
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-muted-foreground text-xs">Show on the badge</legend>
        {OPTIONS.map((option) => {
          // A streak needs at least one posted day; until then the option says why it is off.
          const off = option.key === "streak" && streak === 0;
          return (
            <label
              key={option.key}
              className={cn(
                "-mx-1.5 flex min-h-11 items-center gap-2.5 rounded-md px-1.5 text-sm md:min-h-9",
                off
                  ? "cursor-not-allowed text-muted-foreground"
                  : "cursor-pointer hover:bg-muted has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
              )}
            >
              <input
                type="checkbox"
                checked={!off && choice[option.key]}
                disabled={off}
                onChange={(event) =>
                  setChoice((current) => ({ ...current, [option.key]: event.target.checked }))
                }
                className="size-4 accent-primary"
              />
              <span className="flex flex-col">
                {option.label}
                {option.key === "streak" ? (
                  <span className="text-muted-foreground text-xs">
                    {off ? "Shows once you have posted a day." : streakText(streak)}
                  </span>
                ) : null}
              </span>
            </label>
          );
        })}
      </fieldset>
      <p className="text-muted-foreground text-xs leading-5">
        Made from your days. Download it and share it wherever you like.
      </p>
      <a
        href={download}
        download={`daydeck-badge-${slug}.png`}
        className={cn(buttonVariants(), "h-11 w-fit gap-2 px-4")}
      >
        <DownloadIcon aria-hidden="true" />
        Download the badge
      </a>
    </section>
  );
}
