"use client";

import { Loader2Icon } from "lucide-react";
import { useLinkStatus } from "next/link";
import type { ReactNode } from "react";

/**
 * Goes inside a <Link>, around its icon: while the link's page is loading, a small spinner takes
 * the icon's place, so a click shows it was heard before the new page is there.
 */
export function LinkIcon({ children }: { children: ReactNode }) {
  const { pending } = useLinkStatus();
  return pending ? (
    <Loader2Icon aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
  ) : (
    children
  );
}
