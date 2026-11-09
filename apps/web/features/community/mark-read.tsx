"use client";

import { useEffect } from "react";
import type { Place } from "@/server/community/service";
import { markReadAction } from "./actions";
import { useLive } from "./live";

/** Marks a place as read when it is shown, then updates the unread counts. */
export function MarkPlaceRead({ slug, place }: { slug: string; place: Place }) {
  const { refresh } = useLive();
  useEffect(() => {
    void markReadAction(slug, place).then(() => refresh());
  }, [slug, place, refresh]);
  return null;
}
