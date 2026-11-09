import * as Sentry from "@sentry/nextjs";
import { dataCollection, scrubEvent } from "./lib/sentry-scrub";

// Browser-side Sentry. The DSN is public by design; it only allows sending events.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development",
    tracesSampleRate: 0.1,
    dataCollection,
    beforeSend: scrubEvent,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
