"use client";

import { Alert, AlertDescription, AlertTitle } from "@daydeck/ui/components/alert";
import { Button, buttonVariants } from "@daydeck/ui/components/button";
import { cn } from "@daydeck/ui/lib/utils";
import {
  CalendarClockIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  ExternalLinkIcon,
  Loader2Icon,
  RadioTowerIcon,
  RefreshCwIcon,
} from "lucide-react";
import Link from "next/link";
import {
  type ReactNode,
  useEffect,
  useId,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { NetworkIcon } from "@/features/settings/network-icon";
import { bufferDraftsUrl, bufferPostingScheduleUrl } from "@/lib/buffer-links";
import type {
  FindSlotsResult,
  PlanChannelView,
  PlanPick,
  PlanRowView,
} from "@/server/challenges/plan";
import { findSlotsAction, type SavePlanState, savePlanAction } from "./actions";
import { formatDay } from "./format";
import { PromptLabel } from "./prompt-label";

/** A day left without a time. */
const SKIP = "skip";
/** A time the person types in, for a day with no free slot or a slot they do not like. */
const CUSTOM = "custom";

/**
 * Keeps what the person chose when fresh times arrive: the same free time if it is still there,
 * their own time or "skip" as they were, and the new suggestion only for days they left alone.
 */
function mergeChoices(
  before: FindSlotsResult,
  chosen: Record<string, string>,
  after: FindSlotsResult,
): Record<string, string> {
  const fresh = choicesFor(after);
  if (before.status !== "ok" || after.status !== "ok") return fresh;
  const suggested = choicesFor(before);
  for (const row of after.rows) {
    const choice = chosen[row.entryId];
    // Untouched days follow the new suggestion.
    if (choice === undefined || choice === suggested[row.entryId]) continue;
    if (choice === SKIP || choice === CUSTOM) {
      fresh[row.entryId] = choice;
      continue;
    }
    const old = before.rows.find((r) => r.entryId === row.entryId)?.options[Number(choice)];
    const index = old
      ? row.options.findIndex((o) => o.channelId === old.channelId && o.dueAt === old.dueAt)
      : -1;
    if (index >= 0) fresh[row.entryId] = String(index);
  }
  return fresh;
}

/** How old a kept copy may be before the page asks Buffer again on its own. */
const FRESH_MS = 60_000;

const subscribeNothing = () => () => {};

function choicesFor(result: FindSlotsResult): Record<string, string> {
  if (result.status !== "ok") return {};
  return Object.fromEntries(
    result.rows.map((row) => [
      row.entryId,
      row.suggestedIndex === null ? SKIP : String(row.suggestedIndex),
    ]),
  );
}

/**
 * The one place where days get a time. Each day of the coming week is a card with a free time
 * from the Buffer posting schedule, a time of your own, or none. Saving makes a timed draft on
 * every channel of the challenge.
 */
export function PlanWeek({ slug, initial }: { slug: string; initial: FindSlotsResult }) {
  const [found, setFound] = useState<FindSlotsResult>(initial);
  const [choices, setChoices] = useState<Record<string, string>>(() => choicesFor(initial));
  const [times, setTimes] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<SavePlanState | null>(null);
  const [checking, startChecking] = useTransition();
  const [saving, startSaving] = useTransition();
  const hintId = useId();

  // A background check only shows the line above the days; a check you ask for also dims them.
  const [asked, setAsked] = useState(false);
  const checkAgain = (quiet = false) =>
    startChecking(async () => {
      setAsked(!quiet);
      if (!quiet) setSaved(null);
      const result = await findSlotsAction(slug);
      // A failed background check keeps the times already shown; a manual one says why.
      if (quiet && result.status === "error") return;
      setChoices((chosen) => mergeChoices(found, chosen, result));
      setFound(result);
    });

  // The page shows the last times Buffer gave at once. When they are over a minute old, it asks
  // Buffer again in the background and swaps in the answer, keeping what you already chose.
  const checkedAt = found.status === "ok" ? Date.parse(found.checkedAt) : Number.NaN;
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once, for the copy shown first
  useEffect(() => {
    if (Date.now() - checkedAt > FRESH_MS) checkAgain(true);
  }, []);
  const mounted = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );

  const rows = found.status === "ok" ? found.rows : [];
  const channels = found.status === "ok" ? found.channels : [];
  const firstChannel = channels[0];
  const picks = rows.flatMap((row): PlanPick[] => {
    const choice = choices[row.entryId] ?? SKIP;
    if (choice === CUSTOM) {
      const time = times[row.entryId];
      return time && firstChannel
        ? [{ entryId: row.entryId, channelId: firstChannel.id, time }]
        : [];
    }
    const option = choice !== SKIP ? row.options[Number(choice)] : undefined;
    return option
      ? [{ entryId: row.entryId, channelId: option.channelId, dueAt: option.dueAt }]
      : [];
  });

  const save = () =>
    startSaving(async () => {
      const result = await savePlanAction(slug, picks);
      setSaved(result);
      if (result.status === "ok" && found.status === "ok") {
        const failedIds = new Set(result.failed.map((failure) => failure.entryId));
        const savedIds = new Set(picks.map((pick) => pick.entryId));
        // Saved days leave the list; the rest stay so they can get a time later.
        const remaining = rows.filter(
          (row) => !savedIds.has(row.entryId) || failedIds.has(row.entryId),
        );
        setFound(
          remaining.length > 0
            ? { ...found, rows: remaining }
            : {
                status: "empty",
                reason: "all-saved",
                message: "Every day of the coming week has a time. Schedule the drafts in Buffer.",
              },
        );
      }
    });

  const list =
    found.status === "ok" ? (
      <>
        {/* Says how fresh the times are; while Buffer is asked again, it says so. */}
        <p
          aria-live="polite"
          className="-mb-1 flex min-h-5 items-center gap-2 text-muted-foreground text-sm"
        >
          {checking ? (
            <>
              <Loader2Icon
                aria-hidden="true"
                className="size-4 animate-spin motion-reduce:animate-none"
              />
              Checking Buffer for changes…
            </>
          ) : mounted && !Number.isNaN(checkedAt) ? (
            `Free times from Buffer, checked at ${new Date(checkedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}.`
          ) : null}
        </p>
        <ol
          className={cn(
            "@container flex flex-col gap-3 transition-opacity",
            checking && asked && "opacity-60",
          )}
        >
          {rows.map((row) => (
            <DayCard
              key={row.entryId}
              row={row}
              channel={firstChannel}
              choice={choices[row.entryId] ?? SKIP}
              time={times[row.entryId] ?? ""}
              onChoice={(value) => setChoices((current) => ({ ...current, [row.entryId]: value }))}
              onTime={(value) => setTimes((current) => ({ ...current, [row.entryId]: value }))}
            />
          ))}
        </ol>
        {/* Stays in view while the list scrolls, so the save is always one step away. */}
        <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-xl border bg-card/95 p-3 shadow-sm backdrop-blur">
          <Button
            type="button"
            className="h-11 px-5"
            onClick={save}
            disabled={saving || checking || picks.length === 0}
            aria-describedby={hintId}
          >
            {saving
              ? "Saving to Buffer…"
              : picks.length <= 1
                ? "Save 1 day to Buffer"
                : `Save ${picks.length} days to Buffer`}
          </Button>
          <p id={hintId} className="text-muted-foreground text-sm">
            {picks.length === 0
              ? "Give at least one day a time to save."
              : `Each day gets a draft with its time on ${channels.length === 1 ? "your challenge channel" : `all ${channels.length} challenge channels`}.`}
          </p>
        </div>
      </>
    ) : found.status === "error" ? (
      <PlanNotice
        tone="error"
        icon={<CircleAlertIcon aria-hidden="true" />}
        title="Buffer could not be checked"
        actions={
          <CheckAgainButton checking={checking} label="Try again" onClick={() => checkAgain()} />
        }
      >
        {found.message}
      </PlanNotice>
    ) : found.reason === "no-channels" ? (
      <PlanNotice
        icon={<RadioTowerIcon aria-hidden="true" />}
        title="Choose your channels first"
        actions={
          <Link href={`/challenges/${slug}`} className={cn(buttonVariants(), "h-11 px-4")}>
            Choose channels
          </Link>
        }
      >
        {found.message} Times are set on the channels that count for this challenge.
      </PlanNotice>
    ) : (
      <PlanNotice
        tone="success"
        icon={<CircleCheckIcon aria-hidden="true" />}
        title={found.reason === "all-saved" ? "Your week has its times" : "Nothing to schedule"}
        actions={
          <Link
            href={`/challenges/${slug}`}
            className={cn(buttonVariants({ variant: "outline" }), "h-11 px-4")}
          >
            Back to the challenge
          </Link>
        }
      >
        {found.message}
      </PlanNotice>
    );

  return (
    <div
      className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start"
      aria-busy={checking}
    >
      <div className="flex min-w-0 flex-col gap-4">
        {list}
        {saved ? (
          <output
            className={cn(
              "flex flex-col gap-3 rounded-xl p-4",
              saved.status === "error" ? "text-destructive" : "bg-accent/50",
            )}
          >
            {saved.status === "error"
              ? saved.message
              : `${saved.saved === 1 ? "1 day is" : `${saved.saved} days are`} in Buffer as drafts with a time. Schedule them there when you are happy with them.${
                  saved.failed.length > 0
                    ? ` ${saved.failed.length} could not be saved: ${saved.failed[0]?.message}`
                    : ""
                }`}
            {saved.status === "ok" && saved.saved > 0 ? (
              <span className="flex flex-wrap gap-2">
                {channels.map((channel) => (
                  <a
                    key={channel.id}
                    href={bufferDraftsUrl(channel.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      buttonVariants({ variant: "outline" }),
                      "h-11 gap-2 px-3 text-foreground",
                    )}
                  >
                    <NetworkIcon service={channel.service} />
                    See drafts in Buffer
                    <span className="sr-only"> on {channel.name} (opens in a new tab)</span>
                    <ExternalLinkIcon aria-hidden="true" />
                  </a>
                ))}
              </span>
            ) : null}
          </output>
        ) : null}
      </div>

      <aside aria-label="About scheduling" className="flex flex-col gap-4">
        <section className="flex flex-col gap-2 rounded-xl border bg-card p-4">
          <h2 className="flex items-center gap-2 font-semibold text-sm">
            <CalendarClockIcon aria-hidden="true" className="size-4 text-primary" />
            How scheduling works
          </h2>
          <p className="text-muted-foreground text-xs leading-5">
            Daydeck suggests a free time from your Buffer posting schedule for each day. Saving
            makes a draft with that time on each challenge channel. Nothing is published until you
            schedule it in Buffer.
          </p>
        </section>
        {channels.length > 0 ? <PostingTimes channels={channels} /> : null}
        <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
          <p className="text-muted-foreground text-xs leading-5">
            Changed your posting times in Buffer? Check again to see the new free times.
          </p>
          <CheckAgainButton checking={checking} disabled={saving} onClick={() => checkAgain()} />
        </section>
      </aside>
    </div>
  );
}

/** One day: its prompt, and the time it gets. */
function DayCard({
  row,
  channel,
  choice,
  time,
  onChoice,
  onTime,
}: {
  row: PlanRowView;
  channel: PlanChannelView | undefined;
  choice: string;
  time: string;
  onChoice: (value: string) => void;
  onTime: (value: string) => void;
}) {
  const selectId = useId();
  const timeId = useId();
  const noteId = useId();
  const noSlot = row.options.length === 0;
  return (
    // Its own address, so "Pick a time…" on the challenge page lands on this day.
    <li
      id={`day-${row.entryId}`}
      className="flex scroll-mt-28 flex-col gap-3 rounded-xl border bg-card p-4 target:border-primary target:ring-3 target:ring-ring/30 @2xl:flex-row @2xl:items-start @2xl:justify-between"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <PromptLabel
          dayNumber={row.dayNumber}
          detail={row.isToday ? "Today" : formatDay(row.date)}
        />
        <label htmlFor={selectId} className="font-medium">
          {`${row.emoji} ${row.title}`.trim()}
        </label>
        {noSlot ? (
          <p id={noteId} className="text-muted-foreground text-sm leading-5">
            No free posting time left {row.isToday ? "today" : "that day"} in your Buffer schedule.
            Pick a time yourself, or{" "}
            {channel ? (
              <a
                href={bufferPostingScheduleUrl(channel.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground underline underline-offset-3"
              >
                add posting times in Buffer
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            ) : (
              "add posting times in Buffer"
            )}
            .
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-2 @2xl:w-72 @2xl:shrink-0">
        <select
          id={selectId}
          value={choice}
          aria-describedby={noSlot ? noteId : undefined}
          onChange={(event) => onChoice(event.target.value)}
          className="h-11 rounded-lg border bg-background px-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {row.options.map((option, index) => (
            <option key={`${option.channelId}-${option.dueAt}`} value={String(index)}>
              {option.label}
            </option>
          ))}
          <option value={CUSTOM}>Pick a time…</option>
          <option value={SKIP}>Skip this day</option>
        </select>
        {choice === CUSTOM ? (
          <div className="flex flex-col gap-1">
            <label htmlFor={timeId} className="text-muted-foreground text-xs">
              Your time{channel ? `, in ${channel.timezone.replace(/_/g, " ")}` : ""}
            </label>
            <input
              id={timeId}
              type="time"
              value={time}
              onChange={(event) => onTime(event.target.value)}
              className="h-11 rounded-lg border bg-background px-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>
        ) : null}
      </div>
    </li>
  );
}

/** The channels' posting schedules in Buffer: where the suggestions come from, and the fix. */
function PostingTimes({ channels }: { channels: PlanChannelView[] }) {
  return (
    <section className="flex flex-col gap-2 rounded-xl border bg-card p-4">
      <h2 className="font-semibold text-sm">Your Buffer posting times</h2>
      <p className="text-muted-foreground text-xs leading-5">
        Suggestions come from these schedules. Add times in Buffer to get more free slots.
      </p>
      <ul className="flex flex-col">
        {channels.map((channel) => (
          <li key={channel.id} className="flex min-h-11 items-center justify-between gap-2 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <NetworkIcon service={channel.service} />
              <span className="truncate">{channel.name}</span>
              {!channel.hasPostingTimes ? (
                <span className="shrink-0 text-muted-foreground text-xs">No times set</span>
              ) : null}
            </span>
            <a
              href={bufferPostingScheduleUrl(channel.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1 rounded-sm text-xs underline underline-offset-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Edit
              <span className="sr-only"> the posting schedule of {channel.name} in Buffer</span>
              <ExternalLinkIcon aria-hidden="true" className="size-3" />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CheckAgainButton({
  checking,
  disabled = false,
  label = "Check Buffer again",
  onClick,
}: {
  checking: boolean;
  disabled?: boolean;
  label?: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className="h-11 w-fit gap-2 px-4"
      onClick={onClick}
      disabled={checking || disabled}
    >
      <RefreshCwIcon aria-hidden="true" className={cn(checking && "motion-safe:animate-spin")} />
      {checking ? "Checking Buffer…" : label}
    </Button>
  );
}

/**
 * A notice in place of the week list: what happened, why, and the next step. The icon and
 * the title carry the meaning, so colour is never the only signal.
 */
function PlanNotice({
  tone = "info",
  icon,
  title,
  actions,
  children,
}: {
  tone?: "info" | "success" | "error";
  icon: ReactNode;
  title: string;
  actions: ReactNode;
  children: ReactNode;
}) {
  return (
    <Alert
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "px-4 py-4 sm:px-5",
        tone === "error"
          ? "border-destructive/40 *:[svg]:text-destructive"
          : "*:[svg]:text-primary",
        tone === "success" && "border-primary/40",
      )}
    >
      {icon}
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p>{children}</p>
      </AlertDescription>
      {/* Outside the description, which underlines every link inside it. */}
      <div className="col-start-2 mt-3 flex flex-wrap gap-2">{actions}</div>
    </Alert>
  );
}
