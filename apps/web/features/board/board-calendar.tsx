"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@daydeck/ui/components/tooltip";
import { cn } from "@daydeck/ui/lib/utils";
import { ExternalLinkIcon, LightbulbIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { type KeyboardEvent, useMemo, useRef, useState } from "react";
import { UserAvatar } from "@/components/user-avatar";
import { formatDay, formatLongDay } from "@/features/challenges/format";
import { PromptLabel } from "@/features/challenges/prompt-label";
import { NetworkIcon } from "@/features/settings/network-icon";
import { bufferChannelUrl, bufferDraftsUrl, bufferQueueUrl } from "@/lib/buffer-links";
import type { BoardData } from "@/server/board/board";
import { addDays, dateRange, daysByDate, monthsBetween, type PersonDay } from "./calendar";
import { StateMark } from "./state-mark";
import { POSTED, STATE_LABELS } from "./state-words";

const WEEKDAYS = [
  ["Mon", "Monday"],
  ["Tue", "Tuesday"],
  ["Wed", "Wednesday"],
  ["Thu", "Thursday"],
  ["Fri", "Friday"],
  ["Sat", "Saturday"],
  ["Sun", "Sunday"],
] as const;

/** How many people who posted a day show as dots in a date cell, before "+n". */
const MAX_DOTS = 4;

/**
 * The calendar view of the board: the months the challenge covers, with your state on each of
 * your days and a dot for each other person who posted. Choosing a date shows who did what on
 * it, beside the calendar from 1024px and below it on smaller screens.
 */
export function BoardCalendar({ slug, board }: { slug: string; board: BoardData }) {
  const byDate = useMemo(() => daysByDate(board), [board]);
  const range = dateRange(byDate);
  const [selected, setSelected] = useState(() => firstSelected(byDate, board.viewerToday));
  const calendarRef = useRef<HTMLDivElement>(null);
  if (!range) return null;
  const [first, last] = range;
  const months = monthsBetween(first, last);

  const select = (date: string, focus = false) => {
    setSelected(date);
    if (focus) {
      calendarRef.current?.querySelector<HTMLElement>(`[data-date="${date}"]`)?.focus();
    }
  };

  // One tab stop for the calendar: arrows move by a day or a week, Home and End to the ends.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
    let next: string | null = null;
    if (step) next = nextChallengeDate(byDate, selected, step, first, last);
    if (event.key === "Home") next = first;
    if (event.key === "End") next = last;
    if (next) {
      event.preventDefault();
      select(next, true);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: arrow keys move between the date buttons inside */}
      <div
        ref={calendarRef}
        onKeyDown={onKeyDown}
        className="flex flex-col gap-6 rounded-xl border bg-card p-3 sm:p-5"
      >
        {months.map((month) => (
          <table key={month.key} className="w-full table-fixed border-separate border-spacing-0.5">
            <caption className="pb-2 text-left font-semibold">{month.label}</caption>
            <thead>
              <tr>
                {WEEKDAYS.map(([short, long]) => (
                  <th
                    key={short}
                    scope="col"
                    abbr={long}
                    className="h-8 font-normal text-muted-foreground text-xs leading-4"
                  >
                    {short}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {month.weeks.map((week) => (
                <tr key={week.find(Boolean) ?? month.key}>
                  {week.map((date, index) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: a fixed slot per weekday
                    <td key={index} className="p-0 align-top">
                      {date ? (
                        <DateCell
                          date={date}
                          people={byDate.get(date)}
                          isToday={date === board.viewerToday}
                          isSelected={date === selected}
                          onSelect={() => select(date)}
                        />
                      ) : null}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>
      <DayPanel
        slug={slug}
        board={board}
        date={selected}
        people={byDate.get(selected) ?? []}
        onPick={select}
      />
    </div>
  );
}

function DateCell({
  date,
  people,
  isToday,
  isSelected,
  onSelect,
}: {
  date: string;
  people: PersonDay[] | undefined;
  isToday: boolean;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const dayOfMonth = Number(date.slice(8));
  const number = (
    <span
      className={cn(
        "flex size-7 items-center justify-center rounded-full text-sm tabular-nums leading-5",
        isToday && "bg-primary font-semibold text-primary-foreground",
      )}
    >
      {dayOfMonth}
    </span>
  );
  // A date outside the challenge: shown for orientation, not chosen.
  if (!people) {
    return (
      <span className="flex h-16 flex-col items-center pt-1.5 text-muted-foreground sm:h-20">
        {number}
      </span>
    );
  }
  const mine = people.find((person) => person.row.isYou);
  const others = people.filter((person) => !person.row.isYou);
  const posted = others.filter((person) => POSTED.includes(person.state));
  const everyonePosted = people.filter((person) => POSTED.includes(person.state)).length;
  const label = [
    `${formatLongDay(date)}${isToday ? ", today" : ""}`,
    mine
      ? `your day ${mine.dayIndex + 1}, ${STATE_LABELS[mine.state].toLowerCase()}`
      : "not one of your days",
    `${everyonePosted} of ${people.length} posted`,
  ].join(". ");

  const tip = [
    mine ? `Day ${mine.dayIndex + 1} · ${STATE_LABELS[mine.state]}` : "Not one of your days",
    `${everyonePosted} of ${people.length} posted`,
  ].join(" · ");

  return (
    <Tooltip>
      <TooltipTrigger
        delay={300}
        render={
          <button
            type="button"
            data-date={date}
            tabIndex={isSelected ? 0 : -1}
            aria-pressed={isSelected}
            aria-label={label}
            onClick={onSelect}
            className={cn(
              "flex h-16 w-full flex-col items-center gap-1 rounded-lg pt-1.5 outline-none transition-shadow hover:ring-1 hover:ring-foreground/25 hover:ring-inset focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-20 motion-reduce:transition-none",
              isSelected && "font-medium ring-2 ring-foreground/70 ring-inset",
            )}
          >
            {number}
            {mine ? (
              <StateMark state={mine.state} size="sm" />
            ) : (
              <span aria-hidden="true" className="size-[1.125rem]" />
            )}
            <span aria-hidden="true" className="flex h-2.5 items-center gap-0.5">
              {posted.slice(0, MAX_DOTS).map((person) => (
                <span key={person.row.participantId} className="size-2 rounded-full bg-ember" />
              ))}
              {posted.length > MAX_DOTS ? (
                <span className="text-[0.625rem] text-muted-foreground leading-none">
                  +{posted.length - MAX_DOTS}
                </span>
              ) : null}
            </span>
          </button>
        }
      />
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  );
}

/** Who did what on the chosen date, then your scheduled posts. */
function DayPanel({
  slug,
  board,
  date,
  people,
  onPick,
}: {
  slug: string;
  board: BoardData;
  date: string;
  people: PersonDay[];
  onPick: (date: string, focus?: boolean) => void;
}) {
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: board.timeZone,
  });
  const you = board.rows.find((row) => row.isYou);
  const mine = people.find((person) => person.row.isYou);
  const postsOf = (dayIndex: number) =>
    board.yourPosts.filter((post) => post.dayIndex === dayIndex);

  // Posts with a time that are not published yet: scheduled ones, and drafts with a time
  // from the Schedule page, which wait for you to schedule them in Buffer.
  const scheduled = board.yourPosts
    .map((post) => ({
      ...post,
      date: you?.dates[post.dayIndex] ?? "",
    }))
    .filter((post) => post.dueAt && post.status !== "sent" && post.status !== "error")
    .filter((post) => post.date >= board.viewerToday)
    .sort((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? ""));

  return (
    <div className="flex flex-col gap-4">
      <section
        aria-labelledby="day-heading"
        aria-live="polite"
        className="flex flex-col gap-3 rounded-xl border bg-card p-4"
      >
        <div className="flex flex-col gap-1">
          <h2 id="day-heading" className="font-semibold text-lg leading-7">
            {formatLongDay(date)}
            {date === board.viewerToday ? (
              <span className="ml-2 rounded-full bg-accent px-2 py-0.5 align-middle font-medium text-accent-foreground text-xs">
                Today
              </span>
            ) : null}
          </h2>
          {mine ? (
            <span className="flex flex-col gap-0.5">
              <PromptLabel dayNumber={mine.dayIndex + 1} />
              <span className="font-medium text-sm leading-5">
                {board.days[mine.dayIndex]?.title ?? ""}
              </span>
            </span>
          ) : (
            <p className="text-muted-foreground text-sm leading-5">
              {people.length > 0
                ? "Not one of your days."
                : "No one has a challenge day on this date."}
            </p>
          )}
        </div>
        {people.length > 0 ? (
          <ul className="flex flex-col divide-y">
            {people.map((person) => {
              const posts = person.row.isYou ? postsOf(person.dayIndex) : [];
              return (
                <li key={person.row.participantId} className="flex items-start gap-3 py-2.5">
                  <UserAvatar name={person.row.name} src={person.row.avatarUrl} size="sm" />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm leading-5">
                      {person.row.isYou ? "You" : person.row.name}
                      {mine && person.dayIndex !== mine.dayIndex ? (
                        <span className="text-muted-foreground"> · day {person.dayIndex + 1}</span>
                      ) : null}
                    </span>
                    {posts.map((post) => (
                      <PostTimes
                        key={post.channelId}
                        post={post}
                        time={time}
                        showNetwork={posts.length > 1}
                      />
                    ))}
                  </div>
                  <span className="flex shrink-0 items-center gap-1.5 text-sm leading-5">
                    <StateMark state={person.state} size="sm" />
                    {STATE_LABELS[person.state]}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>

      <section
        aria-labelledby="scheduled-heading"
        className="flex flex-col gap-3 rounded-xl border bg-card p-4"
      >
        <h2 id="scheduled-heading" className="font-semibold leading-6">
          Your upcoming posts
        </h2>
        {scheduled.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {scheduled.map((post) => (
              <li key={`${post.dayIndex}:${post.channelId}`}>
                <button
                  type="button"
                  onClick={() => onPick(post.date, true)}
                  className="flex min-h-11 w-full flex-col items-start rounded-lg px-2 py-1.5 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span className="flex items-center gap-1.5 text-sm leading-5">
                    <NetworkIcon service={post.service} />
                    {formatDay(post.date)} ·{" "}
                    {post.status === "draft" ? "Draft for" : "Scheduled for"}{" "}
                    {post.dueAt ? time.format(new Date(post.dueAt)) : ""}
                    <span className="sr-only"> on {post.channelName}</span>
                  </span>
                  <span className="flex items-center gap-1 text-muted-foreground text-xs leading-4">
                    <LightbulbIcon aria-hidden="true" className="size-3 shrink-0 text-primary" />
                    <span className="sr-only">Prompt, </span>
                    Day {post.dayIndex + 1}: {board.days[post.dayIndex]?.title ?? ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm leading-5">
            Nothing scheduled yet.{" "}
            <Link
              href={`/challenges/${slug}/plan` as Route}
              className="text-foreground underline underline-offset-3"
            >
              Schedule
            </Link>{" "}
            gives each of your next days a time from your existing{" "}
            <ScheduleLinks channels={board.yourChannels} />.
          </p>
        )}
      </section>
    </div>
  );
}

/**
 * "Buffer schedule", linked to the channel's schedule page in Buffer. With several channels in
 * the challenge, each channel's name links to its own schedule.
 */
function ScheduleLinks({ channels }: { channels: BoardData["yourChannels"] }) {
  const linkClass = "text-foreground underline underline-offset-3";
  const [only] = channels;
  if (channels.length === 0 || !only) return <>Buffer schedule</>;
  if (channels.length === 1) {
    return (
      <a
        href={bufferChannelUrl(only.id)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Buffer schedule of ${only.name} (opens in a new tab)`}
        className={linkClass}
      >
        Buffer schedule
      </a>
    );
  }
  return (
    <>
      Buffer schedule for{" "}
      {channels.map((channel, index) => (
        <span key={channel.id}>
          {index > 0 ? (index === channels.length - 1 ? " and " : ", ") : null}
          <a
            href={bufferChannelUrl(channel.id)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${channel.name} schedule in Buffer (opens in a new tab)`}
            className={linkClass}
          >
            {channel.name}
          </a>
        </span>
      ))}
    </>
  );
}

/** One of your posts on a day: when it went out or is due, on which network when there are several. */
function PostTimes({
  post,
  time,
  showNetwork,
}: {
  post: BoardData["yourPosts"][number];
  time: Intl.DateTimeFormat;
  showNetwork: boolean;
}) {
  const network = showNetwork ? (
    <>
      <NetworkIcon service={post.service} className="size-3" />
      <span className="sr-only">{post.channelName}: </span>
    </>
  ) : null;
  if (post.status === "sent") {
    return (
      <span className="flex flex-wrap items-center gap-x-1.5 text-muted-foreground text-xs leading-4">
        {network}
        {post.sentAt ? `Published at ${time.format(new Date(post.sentAt))}` : "Published"}
        {post.link ? (
          <a
            href={post.link}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`View your post on ${post.channelName} (opens in a new tab)`}
            className="inline-flex items-center gap-1 text-foreground underline underline-offset-3"
          >
            View post
            <ExternalLinkIcon aria-hidden="true" className="size-3" />
          </a>
        ) : null}
      </span>
    );
  }
  const isDraft = post.status === "draft" || post.status === "error";
  return (
    <span className="flex flex-wrap items-center gap-x-1.5 text-muted-foreground text-xs leading-4">
      {network}
      {isDraft
        ? post.dueAt
          ? `Draft for ${time.format(new Date(post.dueAt))}`
          : "Draft in Buffer"
        : post.dueAt
          ? `Scheduled for ${time.format(new Date(post.dueAt))}`
          : "Scheduled in Buffer"}
      {/* Straight to where it waits in Buffer: the channel's Drafts or Queue tab. */}
      <a
        href={isDraft ? bufferDraftsUrl(post.channelId) : bufferQueueUrl(post.channelId)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${isDraft ? "See drafts" : "See queue"} on ${post.channelName} in Buffer (opens in a new tab)`}
        className="inline-flex items-center gap-1 text-foreground underline underline-offset-3"
      >
        {isDraft ? "See drafts" : "See queue"}
        <ExternalLinkIcon aria-hidden="true" className="size-3" />
      </a>
    </span>
  );
}

/** Today when it is a challenge date; otherwise the next one, or the last one. */
function firstSelected(byDate: Map<string, PersonDay[]>, today: string): string {
  const dates = [...byDate.keys()].sort();
  return dates.find((date) => date >= today) ?? dates.at(-1) ?? today;
}

/** The next date with a challenge day, moving by `step` days; null past the ends. */
function nextChallengeDate(
  byDate: Map<string, PersonDay[]>,
  from: string,
  step: number,
  first: string,
  last: string,
): string | null {
  let date = addDays(from, step);
  while (date >= first && date <= last) {
    if (byDate.has(date)) return date;
    // A week jump lands on the same weekday only; a day step skips gaps such as weekends.
    if (Math.abs(step) === 7) return null;
    date = addDays(date, step);
  }
  return null;
}
