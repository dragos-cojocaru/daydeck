"use client";

import { useEffect, useRef } from "react";
import { useLive } from "@/features/community/live";
import { PLACE_KEYS } from "./places";
import { playChime, unlockSound } from "./sound";

/**
 * Plays the notification sound when something you get notified about arrives: a count goes up
 * in a place you did not mute, and you are not looking at that place. Mounted once, in the
 * app's shell. The first live data after a page load never plays it.
 */
export function NotificationSound() {
  const { data } = useLive();
  const last = useRef<Map<string, number> | null>(null);

  // Browsers start audio only after a click or key press on the page.
  useEffect(() => {
    const unlock = () => unlockSound();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    const counts = new Map<string, number>();
    for (const [slug, entry] of Object.entries(data)) {
      if (entry.muted.includes("all")) continue;
      for (const place of PLACE_KEYS) {
        if (!entry.muted.includes(place)) counts.set(`${slug}#${place}`, entry.unread[place]);
      }
    }
    const before = last.current;
    last.current = counts;
    if (!before || Object.keys(data).length === 0) return;
    const url = new URL(window.location.href);
    const open = url.pathname.match(/^\/challenges\/([^/]+)\/community$/);
    const openKey = open ? `${open[1]}#${url.searchParams.get("place") ?? "updates"}` : null;
    for (const [key, count] of counts) {
      if (key !== openKey && count > (before.get(key) ?? 0)) {
        playChime();
        return;
      }
    }
  }, [data]);

  return null;
}
