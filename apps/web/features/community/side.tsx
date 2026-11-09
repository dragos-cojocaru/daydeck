"use client";

import { Button } from "@daydeck/ui/components/button";
import { Switch } from "@daydeck/ui/components/switch";
import { cn } from "@daydeck/ui/lib/utils";
import { CrownIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { LinkIcon } from "@/components/link-icon";
import { UserAvatar } from "@/components/user-avatar";
import type { BanView, MemberListItem } from "@/server/community/moderation";
import type { Place } from "@/server/community/service";
import { setChatEnabledAction, unbanAction } from "./actions";
import { UnreadBadge, useLive } from "./live";
import { useMemberCard } from "./member-card";
import { PLACES } from "./places";

/** The community's places with their unread counts: a column on wide screens, a row on phones. */
export function PlaceNav({
  slug,
  current,
  chatEnabled,
}: {
  slug: string;
  current: Place;
  chatEnabled: boolean;
}) {
  const unread = useLive().data[slug]?.unread;
  const places = PLACES.filter(
    (item) => chatEnabled || (item.place !== "chat" && item.place !== "posts"),
  );
  return (
    <nav aria-label="Community" className="md:w-52 md:shrink-0">
      <ul className="flex gap-1 overflow-x-auto p-2 md:flex-col md:overflow-visible">
        {places.map(({ place, label, Icon }) => {
          const active = place === current;
          return (
            <li key={place} className="shrink-0">
              <Link
                href={`/challenges/${slug}/community?place=${place}` as Route}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-11 items-center gap-2 rounded-md px-3 text-muted-foreground text-sm outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 md:h-9",
                  active && "bg-muted font-medium text-foreground",
                )}
              >
                <LinkIcon>
                  <Icon aria-hidden="true" className="size-4 shrink-0" />
                </LinkIcon>
                <span className="flex-1">{label}</span>
                {active ? null : <UnreadBadge count={unread?.[place] ?? 0} />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** From this many members, the list gets a search field. */
const SEARCH_FROM = 8;

/**
 * Everyone in the challenge, host first. The list keeps a fixed height and scrolls on its own,
 * so a big group never pushes the settings away; from 8 people a search field narrows it. A
 * name opens that person's card, where the host can remove or ban them.
 */
export function MemberList({ members, isHost }: { members: MemberListItem[]; isHost: boolean }) {
  const openMember = useMemberCard();
  const headingId = useId();
  const searchId = useId();
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? members.filter((member) => member.name.toLowerCase().includes(needle))
    : members;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5 px-2">
        <h2 id={headingId} className="font-semibold text-muted-foreground text-xs uppercase">
          Members · {members.length}
        </h2>
        {isHost ? (
          <p className="text-muted-foreground text-xs leading-5">
            Select a name to see their days and messages, or to remove or ban them.
          </p>
        ) : null}
      </div>
      {members.length >= SEARCH_FROM ? (
        <div className="px-1">
          <label htmlFor={searchId} className="sr-only">
            Find a member
          </label>
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a member"
            className="h-11 w-full rounded-md border bg-background px-3 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:h-9 md:text-sm"
          />
        </div>
      ) : null}
      <ul
        aria-labelledby={headingId}
        className="flex max-h-[min(22rem,45dvh)] flex-col overflow-y-auto rounded-md"
      >
        {shown.map((member) => (
          <li key={member.userId}>
            <button
              type="button"
              onClick={() => openMember(member.userId)}
              className="flex h-11 w-full items-center gap-2 rounded-md px-2 text-left text-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
            >
              <UserAvatar name={member.name} src={member.avatarUrl} size="sm" />
              <span className="min-w-0 flex-1 truncate">{member.name}</span>
              {member.isYou ? (
                <span className="shrink-0 text-muted-foreground text-xs">you</span>
              ) : null}
              {member.isHost ? (
                <CrownIcon aria-label="Host" className="size-3.5 shrink-0 text-primary" />
              ) : null}
              <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
                {member.posted} posted
              </span>
            </button>
          </li>
        ))}
      </ul>
      {needle && shown.length === 0 ? (
        <p className="px-2 text-muted-foreground text-sm">Nobody by that name.</p>
      ) : null}
      <output aria-live="polite" className="sr-only">
        {needle ? `${shown.length} of ${members.length} members` : ""}
      </output>
    </section>
  );
}

/** The host's community settings: chat on or off, and the banned list with Unban. */
export function CommunitySettings({
  slug,
  chatEnabled,
  bans,
}: {
  slug: string;
  chatEnabled: boolean;
  bans: BanView[];
}) {
  const [enabled, setEnabled] = useState(chatEnabled);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const switchId = useId();
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-3 rounded-xl border bg-card p-3"
    >
      <h2 id={headingId} className="font-semibold text-sm">
        Community settings
      </h2>
      <div className="flex items-start gap-3">
        <Switch
          id={switchId}
          checked={enabled}
          disabled={pending}
          onCheckedChange={(next) => {
            setEnabled(next);
            startTransition(async () => {
              const result = await setChatEnabledAction(slug, next);
              if (!result.ok) {
                setEnabled(!next);
                setMessage(result.message);
              } else {
                setMessage(next ? "Chat and Posts are on." : "Chat and Posts are off.");
              }
            });
          }}
          aria-labelledby={`${switchId}-label`}
          aria-describedby={`${switchId}-hint`}
          className="mt-0.5"
        />
        <label htmlFor={switchId} className="flex flex-col text-sm">
          <span id={`${switchId}-label`}>Chat and shared posts</span>
          <span id={`${switchId}-hint`} className="text-muted-foreground text-xs leading-5">
            Off hides Chat and Posts. Updates and feedback on drafts stay.
          </span>
        </label>
      </div>
      <div className="flex flex-col gap-1.5 border-t pt-3">
        <h3 className="font-medium text-sm">Banned · {bans.length}</h3>
        {bans.length === 0 ? (
          <p className="text-muted-foreground text-xs leading-5">
            Nobody. Ban someone from their card: select their name.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {bans.map((ban) => (
              <li key={ban.bufferAccountId} className="flex items-center justify-between gap-2">
                <span className="truncate text-sm">{ban.name}</span>
                <Button
                  variant="outline"
                  className="h-11 px-3 md:h-8"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await unbanAction(slug, ban.bufferAccountId);
                      setMessage(
                        result.ok
                          ? `${ban.name} can join again with the invite link.`
                          : result.message,
                      );
                    })
                  }
                >
                  Unban
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <output
        aria-live="polite"
        className={cn("text-muted-foreground text-xs", !message && "sr-only")}
      >
        {message}
      </output>
    </section>
  );
}
