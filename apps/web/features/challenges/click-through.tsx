"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Sits above a card's stretched link (so tooltips inside work on hover), yet a click still
 * opens the card's page. Mouse only: keyboard and screen reader users have the card's link.
 */
export function ClickThrough({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the card's own link is the keyboard path
    // biome-ignore lint/a11y/useKeyWithClickEvents: the card's own link is the keyboard path
    <div className={className} onClick={() => router.push(href as Route)}>
      {children}
    </div>
  );
}
