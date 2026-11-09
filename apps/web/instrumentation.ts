import * as Sentry from "@sentry/nextjs";
import { dataCollection, scrubEvent } from "./lib/sentry-scrub";

// Runs once when a server instance starts. Sentry stays off until SENTRY_DSN is set.
export function register() {
  if (!process.env.SENTRY_DSN) return;
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.VERCEL_ENV ?? "development",
    tracesSampleRate: 0.1,
    dataCollection,
    beforeSend: scrubEvent,
  });
}

export const onRequestError = Sentry.captureRequestError;
