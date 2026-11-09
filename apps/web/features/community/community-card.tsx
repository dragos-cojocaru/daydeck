"use client";

import { MessagesSquareIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { UnreadBadge, useLive } from "./live";
import { PLACES } from "./places";

/** The community on the challenge page: each place with its unread count, one tap away. */
export function CommunityCard({ slug, chatEnabled }: { slug: string; chatEnabled: boolean }) {
  const unread = useLive().data[slug]?.unread;
  const places = PLACES.filter(
    (item) => chatEnabled || (item.place !== "chat" && item.place !== "posts"),
  );
  return (
    <section
      aria-labelledby="community-card-heading"
      className="flex flex-col gap-2 rounded-xl border bg-card p-4"
    >
      <h2 id="community-card-heading" className="flex items-center gap-2 font-semibold text-sm">
        <MessagesSquareIcon aria-hidden="true" className="size-4 text-primary" />
        Community
      </h2>
      <p className="text-muted-foreground text-xs leading-5">
        Talk with the group, share your post of the day, and give feedback on drafts.
      </p>
      <ul className="-mx-1.5 flex flex-col">
        {places.map(({ place, label, Icon }) => (
          <li key={place}>
            <Link
              href={`/challenges/${slug}/community?place=${place}` as Route}
              className="flex h-11 items-center gap-2 rounded-md px-1.5 text-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 md:h-9"
            >
              <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
              <span className="flex-1">{label}</span>
              <UnreadBadge count={unread?.[place] ?? 0} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
