import "server-only";
import vercelConfig from "@/vercel.json";
import { env } from "../env";

// Who receives people's data in this copy of Daydeck. The privacy page lists exactly these, and
// each one comes from the same setting that turns the service on, so the page cannot list a
// service that is off or miss one that is on (GDPR Article 13(1)(e) and (f)).

export interface Recipient {
  name: string;
  /** What it receives and why, in one plain sentence. */
  what: string;
  /** Where it handles the data, when this copy's settings say so. */
  where?: string;
}

const AI_TEXT =
  "The text of a post you wrote outside Daydeck, and the titles, explanations and steps of the challenge's open prompts, to work out which day the post is for. Daydeck does not store the full post text, and the AI only suggests a day: you confirm or change it.";

// Cloud regions by their code, for the places a reader would recognise.
const REGIONS: Record<string, string> = {
  "us-east-1": "Virginia, United States",
  "us-east-2": "Ohio, United States",
  "us-west-2": "Oregon, United States",
  "eu-central-1": "Frankfurt, Germany",
  "eu-west-2": "London, United Kingdom",
  "ap-southeast-1": "Singapore",
  "ap-southeast-2": "Sydney, Australia",
  "sa-east-1": "São Paulo, Brazil",
  iad1: "Washington, D.C., United States",
  cle1: "Cleveland, United States",
  sfo1: "San Francisco, United States",
  pdx1: "Portland, United States",
  fra1: "Frankfurt, Germany",
  cdg1: "Paris, France",
  dub1: "Dublin, Ireland",
  lhr1: "London, United Kingdom",
  arn1: "Stockholm, Sweden",
  sin1: "Singapore",
  syd1: "Sydney, Australia",
  hnd1: "Tokyo, Japan",
  gru1: "São Paulo, Brazil",
};

function place(code: string | undefined): string | undefined {
  return code ? (REGIONS[code] ?? code) : undefined;
}

/** The database's region, read from its host name, such as "ep-x.us-east-1.aws.neon.tech". */
function neonRegion(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const host = new URL(url).hostname;
    if (!host.endsWith(".neon.tech")) return undefined;
    return host.split(".").find((part) => /^[a-z]{2}-[a-z]+-\d$/.test(part)) ?? "";
  } catch {
    return undefined;
  }
}

/** Sentry keeps EU data in Germany when the address says "de", and in the US otherwise. */
function sentryPlace(dsn: string): string {
  try {
    return new URL(dsn).hostname.includes(".de.") ? "Germany" : "United States";
  } catch {
    return "United States";
  }
}

/** Where the database and the app itself run, when this copy's settings say so. */
export function hosting(): { database?: string; app?: string } {
  const region = neonRegion(env.DATABASE_URL);
  return {
    database: region === undefined ? undefined : (place(region) ?? "the region Neon reports"),
    app: process.env.VERCEL ? place(vercelConfig.regions?.[0]) : undefined,
  };
}

/** Every service that receives people's data in this copy of Daydeck, in a fixed order. */
export function recipients(): Recipient[] {
  const where = hosting();
  const list: Recipient[] = [
    {
      name: "Buffer",
      what: "Your posts and channels, read and written with your permission.",
      where: "United States",
    },
  ];
  if (env.MATCHER_PROVIDER === "jev" && env.JEV_API_KEY) {
    list.push({
      name: "TypeSafe AI, Inc. (Jev), an AI service",
      what: `${AI_TEXT} Its data processing agreement lets it use the text only to give Daydeck the answer, and protects transfers from the EU with the EU's standard contractual clauses.`,
    });
  }
  if (env.MATCHER_PROVIDER === "llm" && env.ANTHROPIC_API_KEY) {
    list.push({ name: "Anthropic (Claude), an AI service", what: AI_TEXT, where: "United States" });
  }
  list.push({
    name: "The sites behind shared links",
    what: "When someone shares a link in Community, Daydeck's server opens that page once to read its title, first lines and image.",
  });
  const sentry = env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (sentry) {
    list.push({
      name: "Sentry",
      what: "Error reports when something breaks, with tokens and personal fields removed.",
      where: sentryPlace(sentry),
    });
  }
  if (where.app) {
    list.push({ name: "Vercel", what: "Hosts and runs the app.", where: where.app });
  }
  if (where.database) {
    list.push({ name: "Neon", what: "Hosts the database.", where: where.database });
  }
  if (env.INNGEST_EVENT_KEY || env.INNGEST_SIGNING_KEY) {
    list.push({
      name: "Inngest",
      what: "Runs the background jobs, such as the checks and the daily cleanup. The jobs carry IDs, not your posts.",
      where: "United States",
    });
  }
  return list;
}
