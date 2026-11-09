"use client";

import { cn } from "@daydeck/ui/lib/utils";
import { useRouter } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { LiveEntry, LiveSnapshot } from "@/server/community/live";

export type { LiveEntry };

/** How often to ask instead, when the live stream cannot stay open. */
const POLL_MS = 30_000;
/** After this many stream errors in a row, poll instead of streaming. */
const STREAM_TRIES = 3;

type LiveData = LiveSnapshot;

const LiveContext = createContext<{ data: LiveData; refresh: () => void; streaming: boolean }>({
  data: {},
  refresh: () => {},
  streaming: false,
});

/**
 * Keeps every challenge's unread counts, change counters, last checks and mutes current. While
 * the tab is visible it listens to a live stream (/api/live), so new messages, reactions,
 * removals, days and checks show within about a second. If streams fail, it asks every 30
 * seconds instead. Pages call `refresh` for an at-once update, for example after reading.
 */
export function LiveProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<LiveData>({});
  const [streaming, setStreaming] = useState(false);
  const load = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    try {
      const response = await fetch("/api/unread", { cache: "no-store" });
      if (response.status === 200) setData((await response.json()) as LiveData);
    } catch {
      // Offline or a server hiccup: the next round tries again.
    }
  }, []);
  useEffect(() => {
    let source: EventSource | null = null;
    let timer: number | null = null;
    let failures = 0;
    const poll = () => {
      if (timer !== null) return;
      void load();
      timer = window.setInterval(load, POLL_MS);
    };
    const stopPolling = () => {
      if (timer !== null) window.clearInterval(timer);
      timer = null;
    };
    const open = () => {
      if (source || document.visibilityState !== "visible") return;
      if (typeof EventSource === "undefined" || failures >= STREAM_TRIES) {
        poll();
        return;
      }
      source = new EventSource("/api/live");
      source.onmessage = (event) => {
        failures = 0;
        stopPolling();
        setStreaming(true);
        try {
          setData(JSON.parse(event.data) as LiveData);
        } catch {}
      };
      source.onerror = () => {
        // The browser reconnects by itself when a stream ends; give up only on repeated errors.
        failures += 1;
        setStreaming(false);
        if (failures >= STREAM_TRIES || source?.readyState === EventSource.CLOSED) {
          source?.close();
          source = null;
          poll();
        }
      };
    };
    const close = () => {
      source?.close();
      source = null;
      stopPolling();
      setStreaming(false);
    };
    // A hidden tab holds no connection; it catches up the moment it is visible again.
    const onVisible = () => (document.visibilityState === "visible" ? open() : close());
    open();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      close();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);
  return <LiveContext value={{ data, refresh: load, streaming }}>{children}</LiveContext>;
}

const NO_DATA: LiveData = {};
const subscribeNothing = () => () => {};

/**
 * The live data. While React hydrates a part of the page (also one that streams in after the
 * stream already sent counts), it returns what the server rendered, no counts, so the HTML
 * matches; right after, it renders again with the real counts.
 */
export function useLive() {
  const live = useContext(LiveContext);
  const hydrated = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
  return hydrated ? live : { ...live, data: NO_DATA };
}

/** Unread items you get notified about: what the bell and the sidebar count. */
export function notifiedTotal(entry: LiveEntry | undefined): number {
  if (!entry || entry.muted.includes("all")) return 0;
  return (["updates", "chat", "posts", "feedback"] as const)
    .filter((place) => !entry.muted.includes(place))
    .reduce((sum, place) => sum + entry.unread[place], 0);
}

export function unreadTotal(entry: LiveEntry | undefined): number {
  if (!entry) return 0;
  const { updates, chat, posts, feedback } = entry.unread;
  return updates + chat + posts + feedback;
}

/** A small count of unread items. Screen readers hear "3 unread". Hidden at zero. */
export function UnreadBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 font-medium text-primary-foreground text-xs tabular-nums",
        className,
      )}
    >
      <span aria-hidden="true">{count > 99 ? "99+" : count}</span>
      <span className="sr-only">, {count} unread</span>
    </span>
  );
}

/**
 * Reloads the page's server data when someone's days or the community change, so a page left
 * open stays current without a manual reload. Typed text in forms stays where it is.
 */
export function AutoRefresh({
  slug,
  watch,
}: {
  slug: string;
  watch: ("board" | "community" | "checked")[];
}) {
  const router = useRouter();
  const entry = useLive().data[slug];
  const seen = useRef<string | null>(null);
  const key = entry ? watch.map((name) => entry[name]).join(":") : null;
  useEffect(() => {
    if (key === null) return;
    if (seen.current !== null && seen.current !== key) router.refresh();
    seen.current = key;
  }, [key, router]);
  return null;
}
