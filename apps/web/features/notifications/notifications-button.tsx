"use client";

import { Button } from "@daydeck/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@daydeck/ui/components/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@daydeck/ui/components/popover";
import { Skeleton } from "@daydeck/ui/components/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@daydeck/ui/components/tooltip";
import { cn } from "@daydeck/ui/lib/utils";
import {
  ArrowLeftIcon,
  BellIcon,
  BellOffIcon,
  MoreHorizontalIcon,
  SettingsIcon,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import { notifiedPlaces, notifiedTotal, useLive } from "@/features/community/live";
import { PLACES } from "@/features/community/places";
import { relativeTime } from "@/lib/relative-time";
import type { Mutable, NotificationRow, NotificationSetting } from "@/server/community/live";
import type { Place } from "@/server/community/service";
import { markAllReadAction, setMutedAction } from "./actions";
import { setSoundOn, useSoundOn } from "./sound";

type Feed = { rows: NotificationRow[]; settings: NotificationSetting[] };
type MuteChange = { slug: string; what: Mutable; muted: boolean };

/** The feed as it looks once a mute has gone through: what the panel shows while it is sent. */
function applyMute(feed: Feed | null, change: MuteChange): Feed | null {
  if (!feed) return feed;
  const { slug, what, muted } = change;
  return {
    rows: muted
      ? feed.rows.filter((row) => row.slug !== slug || (what !== "all" && row.place !== what))
      : feed.rows,
    settings: feed.settings.map((item) =>
      item.slug !== slug
        ? item
        : {
            ...item,
            muted: muted
              ? [...new Set([...item.muted, what])]
              : item.muted.filter((value) => value !== what),
          },
    ),
  };
}
type Notice = { text: string; undo?: () => void } | null;

const PLACE_OF = new Map(PLACES.map((item) => [item.place, item]));

/** What each place's notifications are about, for the settings' tooltips. */
const WHAT: Record<Place, string> = {
  updates: "the host's updates",
  chat: "new chat messages",
  posts: "newly shared posts",
  feedback: "drafts asking for feedback, and replies to yours",
};

function placeWord(place: Place, count: number): string {
  if (place === "feedback") return "new in Feedback";
  if (place === "updates") return count === 1 ? "new update" : "new updates";
  if (place === "posts") return count === 1 ? "new shared post" : "new shared posts";
  return count === 1 ? "new message in Chat" : "new messages in Chat";
}

function ago(iso: string): string {
  return relativeTime(Date.parse(iso), Date.now(), "short");
}

/**
 * The bell at the top right of every app page: how many new things wait in the Community of
 * your challenges, a panel listing them, and a way to turn any place or challenge off.
 */
export function NotificationsButton({ className }: { className?: string }) {
  const { data, refresh } = useLive();
  const count = useMemo(
    () => Object.values(data).reduce((sum, entry) => sum + notifiedTotal(entry), 0),
    [data],
  );
  // The rows the list will have, known from the live counts before it loads: the placeholder
  // shows exactly that many, so the panel does not change size when the list arrives.
  const expectedRows = useMemo(
    () => Object.values(data).reduce((sum, entry) => sum + notifiedPlaces(entry), 0),
    [data],
  );
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"list" | "settings">("list");
  const [feed, setFeed] = useState<Feed | null>(null);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [said, setSaid] = useState("");
  const [, startAction] = useTransition();
  const titleId = useId();

  // Screen readers hear when the count goes up while the page is open (WCAG 4.1.3).
  const lastCount = useRef(count);
  useEffect(() => {
    if (count > lastCount.current) {
      setSaid(count === 1 ? "1 new notification" : `${count} new notifications`);
    }
    lastCount.current = count;
  }, [count]);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      if (response.status !== 200) throw new Error(String(response.status));
      setFeed((await response.json()) as Feed);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);
  // While the panel is open, it follows the live stream.
  const stamp = JSON.stringify(data);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reloads when the live data changes
  useEffect(() => {
    if (open) void load();
  }, [open, stamp, load]);

  // The panel shows a mute at once (optimistic). When the action ends, it shows the server's
  // feed again, reloaded either way: a change that went through stays, a refused one goes back.
  const [shown, addMute] = useOptimistic(feed, applyMute);
  const mute = (slug: string, what: Mutable, muted: boolean, text?: string) =>
    startAction(async () => {
      addMute({ slug, what, muted });
      const result = await setMutedAction({ slug, what, muted });
      if (!result.ok) setNotice({ text: result.message });
      else if (text) setNotice({ text, undo: () => mute(slug, what, !muted) });
      else setNotice(null);
      refresh();
      await load();
    });
  const markAll = () =>
    startAction(async () => {
      const result = await markAllReadAction();
      setNotice(result.ok ? { text: "Everything is marked as read." } : { text: result.message });
      refresh();
      await load();
    });

  return (
    <div className={cn("shrink-0", className)}>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setView("list");
            setNotice(null);
          }
        }}
      >
        <PopoverTrigger
          render={
            <Button
              variant="ghost"
              className="relative size-11 p-0 md:size-8"
              aria-label={count > 0 ? `Notifications, ${count} unread` : "Notifications"}
            />
          }
        >
          <BellIcon aria-hidden="true" />
          {count > 0 ? (
            <span
              aria-hidden="true"
              className="absolute top-1 right-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-medium text-[10px] text-primary-foreground tabular-nums leading-none ring-2 ring-background md:-top-1 md:-right-1"
            >
              {count > 99 ? "99+" : count}
            </span>
          ) : null}
        </PopoverTrigger>
        <PopoverContent
          align="end"
          aria-labelledby={titleId}
          className="w-[min(24rem,calc(100vw-2rem))] gap-0 p-0"
        >
          {view === "list" ? (
            <ListView
              titleId={titleId}
              feed={shown}
              failed={failed}
              count={count}
              expectedRows={expectedRows}
              notice={notice}
              onRetry={load}
              onClose={() => setOpen(false)}
              onMute={mute}
              onMarkAll={markAll}
              onSettings={() => {
                setView("settings");
                setNotice(null);
              }}
            />
          ) : (
            <SettingsView
              titleId={titleId}
              settings={shown?.settings ?? null}
              notice={notice}
              onBack={() => setView("list")}
              onMute={(slug, what, muted) => mute(slug, what, muted)}
            />
          )}
        </PopoverContent>
      </Popover>
      <output aria-live="polite" className="sr-only">
        {said}
      </output>
    </div>
  );
}

function NoticeBar({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return (
    <div className="flex items-center justify-between gap-2 border-b bg-muted/50 px-4 py-1.5 text-sm">
      <output aria-live="polite">{notice.text}</output>
      {notice.undo ? (
        <Button variant="ghost" className="h-11 px-2 md:h-8" onClick={notice.undo}>
          Undo
        </Button>
      ) : null}
    </div>
  );
}

function ListView({
  titleId,
  feed,
  failed,
  count,
  expectedRows,
  notice,
  onRetry,
  onClose,
  onMute,
  onMarkAll,
  onSettings,
}: {
  titleId: string;
  feed: Feed | null;
  failed: boolean;
  count: number;
  /** How many rows the list will show, from the live counts. */
  expectedRows: number;
  notice: Notice;
  onRetry: () => void;
  onClose: () => void;
  onMute: (slug: string, what: Mutable, muted: boolean, text?: string) => void;
  onMarkAll: () => void;
  onSettings: () => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
        <h2 id={titleId} className="font-semibold text-base">
          Notifications
        </h2>
        <Button
          variant="ghost"
          className="h-11 px-2 text-muted-foreground md:h-8"
          disabled={count === 0}
          onClick={onMarkAll}
        >
          Mark all as read
        </Button>
      </div>
      <NoticeBar notice={notice} />
      <div className="max-h-[min(28rem,60dvh)] overflow-y-auto overscroll-contain">
        {failed && !feed ? (
          <div className="flex flex-col items-start gap-2 p-4">
            <p>The notifications could not be loaded.</p>
            <Button variant="outline" className="h-11 md:h-8" onClick={onRetry}>
              Try again
            </Button>
          </div>
        ) : !feed && expectedRows > 0 ? (
          // Exactly as many rows as are coming, each the height of a real one.
          <ul
            aria-busy="true"
            aria-label="Loading notifications"
            className="flex flex-col divide-y"
          >
            {Array.from({ length: Math.min(expectedRows, 4) }, (_, row) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: placeholder rows never reorder
              <li key={row} className="flex gap-3 px-4 py-3">
                <Skeleton className="size-8 shrink-0 rounded-full" />
                <span className="flex flex-1 flex-col gap-0.5">
                  <span className="flex h-5 items-center">
                    <Skeleton className="h-3.5 w-2/3" />
                  </span>
                  <span className="flex h-5 items-center">
                    <Skeleton className="h-3 w-1/2" />
                  </span>
                  <span className="flex h-10 flex-col justify-center gap-1.5">
                    <Skeleton className="h-3.5 w-full" />
                    <Skeleton className="h-3.5 w-4/5" />
                  </span>
                </span>
                <span aria-hidden="true" className="size-11 shrink-0 md:size-8" />
              </li>
            ))}
          </ul>
        ) : !feed || feed.rows.length === 0 ? (
          // Nothing new by the live counts: no placeholder to swap out.
          <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
            <BellIcon aria-hidden="true" className="size-5 text-muted-foreground" />
            <p className="font-medium">You are all caught up</p>
            <p className="text-muted-foreground text-sm">
              New updates, messages, shared posts and feedback in your challenges show here.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col divide-y">
            {feed.rows.map((row) => (
              <NotificationItem
                key={`${row.slug}#${row.place}`}
                row={row}
                onClose={onClose}
                onMute={onMute}
              />
            ))}
          </ul>
        )}
      </div>
      <div className="flex justify-end border-t px-2 py-1">
        <Button variant="ghost" className="h-11 gap-1.5 px-2 md:h-8" onClick={onSettings}>
          <SettingsIcon aria-hidden="true" />
          Settings
        </Button>
      </div>
    </>
  );
}

function NotificationItem({
  row,
  onClose,
  onMute,
}: {
  row: NotificationRow;
  onClose: () => void;
  onMute: (slug: string, what: Mutable, muted: boolean, text?: string) => void;
}) {
  const place = PLACE_OF.get(row.place);
  const Icon = place?.Icon ?? BellIcon;
  const label = place?.label ?? row.place;
  return (
    <li className="relative flex gap-3 px-4 py-3 hover:bg-muted/50 has-[a:focus-visible]:bg-muted/50">
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground"
      >
        <Icon className="size-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Link
          href={`/challenges/${row.slug}/community?place=${row.place}` as Route}
          onClick={onClose}
          className="font-medium leading-5 outline-none after:absolute after:inset-0"
        >
          {row.count} {placeWord(row.place, row.count)}
        </Link>
        <span className="truncate text-muted-foreground text-xs leading-5">
          {row.title}
          {row.latest ? ` · ${ago(row.latest.at)}` : ""}
        </span>
        {row.latest ? (
          // Two lines kept for every preview, so each row is as tall as its placeholder.
          <span className="line-clamp-2 min-h-10 text-sm leading-5">
            <span className="font-medium">{row.latest.author}:</span> {row.latest.text}
          </span>
        ) : null}
      </span>
      {/* Above the row's stretched link, so it opens its own menu. */}
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Options for ${label} in ${row.title}`}
          className="relative z-10 inline-flex size-11 shrink-0 items-center justify-center self-start rounded-md text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 md:size-8"
        >
          <MoreHorizontalIcon aria-hidden="true" className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto min-w-56">
          <DropdownMenuItem
            className="min-h-11 gap-2 md:min-h-9"
            onClick={() => onMute(row.slug, row.place, true, `${label} in ${row.title} is muted.`)}
          >
            <BellOffIcon aria-hidden="true" />
            Mute {label} here
          </DropdownMenuItem>
          <DropdownMenuItem
            className="min-h-11 gap-2 md:min-h-9"
            onClick={() => onMute(row.slug, "all", true, `${row.title} is muted.`)}
          >
            <BellOffIcon aria-hidden="true" />
            Mute all of {row.title}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

function SettingsView({
  titleId,
  settings,
  notice,
  onBack,
  onMute,
}: {
  titleId: string;
  settings: NotificationSetting[] | null;
  notice: Notice;
  onBack: () => void;
  onMute: (slug: string, what: Mutable, muted: boolean) => void;
}) {
  const [search, setSearch] = useState("");
  const searchId = useId();
  const idBase = useId();
  const shown = (settings ?? []).filter((item) =>
    item.title.toLowerCase().includes(search.trim().toLowerCase()),
  );
  return (
    <>
      <div className="flex items-center gap-1 border-b px-2 py-2">
        <Button
          variant="ghost"
          className="size-11 p-0 md:size-8"
          aria-label="Back to notifications"
          onClick={onBack}
        >
          <ArrowLeftIcon aria-hidden="true" />
        </Button>
        <h2 id={titleId} className="font-semibold text-base">
          Notification settings
        </h2>
      </div>
      <NoticeBar notice={notice} />
      <SoundSetting />
      <p className="px-4 pt-3 text-muted-foreground text-sm">
        Choose what each challenge notifies you about. Muted, it leaves the bell, the sidebar and
        the sound; the challenge's own Community still shows it.
      </p>
      {(settings?.length ?? 0) > 8 ? (
        <div className="flex flex-col gap-1 px-4 pt-3">
          <label htmlFor={searchId} className="font-medium text-sm">
            Find a challenge
          </label>
          <input
            id={searchId}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-11 rounded-lg border bg-background px-3 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:h-9 md:text-sm"
          />
        </div>
      ) : null}
      <div className="max-h-[min(26rem,55dvh)] overflow-y-auto overscroll-contain p-2">
        {!settings ? (
          <div className="flex flex-col gap-2 p-2">
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : shown.length === 0 ? (
          <p className="p-3 text-muted-foreground text-sm">
            {settings.length === 0 ? "You are not in a challenge yet." : "No challenge matches."}
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {shown.map((item) => {
              const allOff = item.muted.includes("all");
              return (
                <li key={item.slug}>
                  <fieldset className="flex flex-col gap-1 rounded-lg p-2">
                    <legend className="sr-only">{item.title}</legend>
                    <Tooltip>
                      <TooltipTrigger
                        delay={700}
                        render={
                          // biome-ignore lint/a11y/noLabelWithoutControl: its text and checkbox arrive as the trigger's children
                          <label
                            htmlFor={`${idBase}-${item.slug}-all`}
                            className="flex min-h-11 cursor-pointer items-center justify-between gap-3 md:min-h-9"
                          />
                        }
                      >
                        <span className="min-w-0 truncate font-medium">{item.title}</span>
                        <input
                          id={`${idBase}-${item.slug}-all`}
                          type="checkbox"
                          checked={!allOff}
                          onChange={(event) => onMute(item.slug, "all", !event.target.checked)}
                          className="size-4 shrink-0 accent-primary"
                          aria-label={`Notifications from ${item.title}`}
                        />
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-64">
                        {allOff
                          ? `Muted: nothing from ${item.title} counts in the bell or the sidebar, or plays the sound. Check it to unmute.`
                          : `Uncheck to mute everything from ${item.title}: no count in the bell or the sidebar, and no sound.`}
                      </TooltipContent>
                    </Tooltip>
                    <div className="flex flex-wrap gap-x-4 gap-y-0 pl-1">
                      {PLACES.map(({ place, label }) => {
                        const on = !allOff && !item.muted.includes(place);
                        return (
                          <Tooltip key={place}>
                            <TooltipTrigger
                              delay={700}
                              render={
                                // biome-ignore lint/a11y/noLabelWithoutControl: its text and checkbox arrive as the trigger's children
                                <label
                                  htmlFor={`${idBase}-${item.slug}-${place}`}
                                  className={cn(
                                    "flex min-h-11 cursor-pointer items-center gap-2 text-sm md:min-h-8",
                                    allOff && "cursor-not-allowed text-muted-foreground",
                                  )}
                                />
                              }
                            >
                              <input
                                id={`${idBase}-${item.slug}-${place}`}
                                type="checkbox"
                                disabled={allOff}
                                checked={on}
                                onChange={(event) =>
                                  onMute(item.slug, place, !event.target.checked)
                                }
                                className="size-4 accent-primary"
                              />
                              {label}
                            </TooltipTrigger>
                            <TooltipContent className="max-w-64">
                              {allOff
                                ? `All of ${item.title} is muted. Check the challenge first to choose ${label} on its own.`
                                : on
                                  ? `Uncheck to mute ${WHAT[place]}: no count in the bell or the sidebar, and no sound. You still see them in the challenge's Community.`
                                  : `Muted: ${WHAT[place]} do not count in the bell or the sidebar, or play the sound. Check it to unmute.`}
                            </TooltipContent>
                          </Tooltip>
                        );
                      })}
                    </div>
                  </fieldset>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}

/** The device's sound switch, at the top of the settings. */
function SoundSetting() {
  const on = useSoundOn();
  const id = useId();
  return (
    <div className="border-b px-4 py-2">
      <Tooltip>
        <TooltipTrigger
          delay={700}
          render={
            // biome-ignore lint/a11y/noLabelWithoutControl: its text and checkbox arrive as the trigger's children
            <label
              htmlFor={id}
              className="flex min-h-11 cursor-pointer items-center justify-between gap-3 md:min-h-9"
            />
          }
        >
          <span className="flex flex-col">
            <span className="font-medium">Notification sound</span>
            <span className="text-muted-foreground text-xs">
              On this device, for what you did not mute
            </span>
          </span>
          <input
            id={id}
            type="checkbox"
            checked={on}
            onChange={(event) => setSoundOn(event.target.checked)}
            className="size-4 shrink-0 accent-primary"
          />
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-64">
          {on
            ? "Uncheck to mute all sounds on this device. The bell still counts what is new."
            : "Sounds are muted on this device. Check it to hear a short chime for new things you did not mute."}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
