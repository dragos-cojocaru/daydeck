"use client";

import { useEffect, useState } from "react";
import { lastCheckedText } from "@/lib/last-checked";

/**
 * "Last updated 5 minutes ago.", kept current while the page stays open. The first frame uses
 * the server's clock, so it matches the server's HTML; then it follows the browser's clock.
 */
export function LastChecked({ at, renderedAt }: { at: string | null; renderedAt: string }) {
  const [now, setNow] = useState(() => new Date(renderedAt));
  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return <>{lastCheckedText(at ? new Date(at) : null, now)}</>;
}
