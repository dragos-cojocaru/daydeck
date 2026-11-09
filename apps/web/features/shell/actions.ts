"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { HIDE_GETTING_STARTED_COOKIE } from "@/server/onboarding";

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/** Hides the getting-started card. "How Daydeck works" (/guide#checklist) offers to show it again. */
export async function hideGettingStarted(): Promise<void> {
  (await cookies()).set(HIDE_GETTING_STARTED_COOKIE, "1", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
  });
  refresh();
}

export async function showGettingStarted(): Promise<void> {
  (await cookies()).delete(HIDE_GETTING_STARTED_COOKIE);
  refresh();
}
