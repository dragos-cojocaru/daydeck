import "server-only";
import { z } from "zod";

// Server-only environment. Nothing here reaches the browser.
// Most values are optional until the phase that uses them; read them through requireEnv().
const schema = z.object({
  BUFFER_CLIENT_ID: z.string().min(1).optional(),
  BUFFER_CLIENT_SECRET: z.string().min(1).optional(),
  BUFFER_REDIRECT_URI: z.url().optional(),
  // Override Buffer's endpoints, only to point local runs and end-to-end tests at a mock.
  BUFFER_AUTH_URL: z.url().default("https://auth.buffer.com"),
  BUFFER_API_URL: z.url().default("https://api.buffer.com"),
  // Space-separated scopes to request at connect. Leave empty to request the full set.
  BUFFER_SCOPES: z.string().optional(),
  // Offer Buffer's Creator Camp prompts as a ready-made set, credited to Buffer. Buffer confirmed
  // in November 2026 that third-party apps may offer them.
  FEATURE_CREATOR_CAMP: z.enum(["true", "false"]).default("true"),
  // Save feedback replies as Notes on the draft in Buffer (an experimental Buffer API).
  // Off: replies stay in Daydeck and the person who asked copies them into Buffer.
  FEATURE_BUFFER_NOTES: z.enum(["true", "false"]).default("false"),
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .refine((value) => Buffer.from(value, "base64").length === 32, "must be 32 bytes, base64")
    .optional(),
  DATABASE_URL: z.url().optional(),
  INNGEST_EVENT_KEY: z.string().min(1).optional(),
  INNGEST_SIGNING_KEY: z.string().min(1).optional(),
  // jev (TypeSafe), llm (Claude) or keyword (word overlap, no key: local runs and tests).
  MATCHER_PROVIDER: z.enum(["jev", "llm", "keyword"]).default("jev"),
  JEV_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  // The invite code of the public demo challenge the homepage lists first, for Buffer's judges.
  DEMO_INVITE_CODE: z.string().min(10).max(64).optional(),
  // The last day (YYYY-MM-DD, UTC) the homepage lists the demo challenge. Empty: no end.
  DEMO_UNTIL: z.iso.date().optional(),
  SENTRY_DSN: z.url().optional(),
  // Who runs this copy of Daydeck, for the privacy page: the law asks for a name and a contact.
  PRIVACY_CONTACT_NAME: z.string().min(1).optional(),
  PRIVACY_CONTACT_EMAIL: z.email().optional(),
});

export type ServerEnv = z.infer<typeof schema>;

// Empty strings, as left by a copied .env.example, count as "not set".
const provided = Object.fromEntries(
  Object.entries(process.env).filter(([, value]) => value !== undefined && value !== ""),
);

export const env: ServerEnv = schema.parse(provided);

/** Returns a variable that the calling feature cannot work without, or throws a clear error. */
export function requireEnv<K extends keyof ServerEnv>(name: K): NonNullable<ServerEnv[K]> {
  const value = env[name];
  if (value === undefined || value === null || value === "") {
    throw new MissingEnvError(name);
  }
  return value as NonNullable<ServerEnv[K]>;
}

export class MissingEnvError extends Error {
  override name = "MissingEnvError";
  constructor(readonly variable: string) {
    super(`Missing environment variable ${variable}. See .env.example.`);
  }
}
