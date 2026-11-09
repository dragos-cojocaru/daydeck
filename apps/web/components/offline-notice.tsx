"use client";

import { WifiOffIcon } from "lucide-react";
import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** Shown only while the browser is offline: what still works, and what waits. */
export function OfflineNotice() {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
  if (online) return null;
  return (
    <output className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-center gap-2 border-t bg-card px-4 py-3 text-sm leading-5">
      <WifiOffIcon aria-hidden="true" className="size-4 shrink-0" />
      You are offline. Daydeck shows what it last loaded; saving and checking work again once you
      are back online.
    </output>
  );
}
