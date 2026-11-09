import { randomBytes } from "node:crypto";

/** 128 random bits: knowing the code is what lets someone join a challenge. */
export function generateInviteCode(): string {
  return randomBytes(16).toString("base64url");
}

/** A readable, unique URL slug: "five-day-kickstart-k3f9x2". */
export function slugFor(title: string): string {
  const base = title
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  const suffix = randomBytes(4)
    .toString("base64url")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "x");
  return `${base || "challenge"}-${suffix}`;
}

/**
 * The tag every challenge post gets in Buffer. Short, so it fits Buffer's tag list, and named
 * after the app so people recognize where it came from.
 */
export function tagNameFor(title: string): string {
  const name = `Daydeck: ${title.trim()}`;
  return name.length <= 40 ? name : `${name.slice(0, 39).trimEnd()}…`;
}
