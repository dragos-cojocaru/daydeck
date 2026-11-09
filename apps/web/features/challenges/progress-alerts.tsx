import { Alert, AlertDescription, AlertTitle } from "@daydeck/ui/components/alert";
import { Button, buttonVariants } from "@daydeck/ui/components/button";
import { cn } from "@daydeck/ui/lib/utils";
import { CircleAlertIcon, ExternalLinkIcon, PauseCircleIcon, UnplugIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { BUFFER_CHANNEL_SETTINGS_URL, BUFFER_HOME_URL, bufferChannelUrl } from "@/lib/buffer-links";
import type { ProgressView } from "@/server/progress/view";
import { dismissAlertAction } from "./progress-actions";

type AlertRow = ProgressView["alerts"][number];

function ExternalButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(buttonVariants({ variant: "outline" }), "h-11 gap-2 px-4")}
    >
      {children}
      <ExternalLinkIcon aria-hidden="true" />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

/** Plain words and one fix for each alert kind. */
function content(alert: AlertRow): {
  icon: ReactNode;
  title: string;
  text: string;
  fix: ReactNode;
} {
  const channel = alert.channelName ?? "A channel";
  switch (alert.kind) {
    case "failed_post":
      return {
        icon: <CircleAlertIcon aria-hidden="true" />,
        title: `A challenge post failed on ${alert.channelName ?? "Buffer"}`,
        text: alert.message
          ? `Buffer says: ${alert.message}`
          : "Buffer could not publish it. Open it in Buffer to see why.",
        fix: (
          <>
            <ExternalButton
              href={alert.channelId ? bufferChannelUrl(alert.channelId) : BUFFER_HOME_URL}
            >
              Open in Buffer
            </ExternalButton>
            {alert.supportUrl ? (
              <ExternalButton href={alert.supportUrl}>How to fix it</ExternalButton>
            ) : null}
          </>
        ),
      };
    case "channel_disconnected":
      return {
        icon: <UnplugIcon aria-hidden="true" />,
        title: `${channel} is disconnected in Buffer`,
        text: "Posts on it will not be published until you connect it again in Buffer.",
        fix: (
          <ExternalButton href={BUFFER_CHANNEL_SETTINGS_URL}>Reconnect in Buffer</ExternalButton>
        ),
      };
    case "queue_paused":
      return {
        icon: <PauseCircleIcon aria-hidden="true" />,
        title: `${channel}'s queue is paused in Buffer`,
        text: "Scheduled posts on it wait until you resume the queue.",
        fix: (
          <ExternalButton
            href={alert.channelId ? bufferChannelUrl(alert.channelId) : BUFFER_HOME_URL}
          >
            Resume in Buffer
          </ExternalButton>
        ),
      };
    default:
      return {
        icon: <UnplugIcon aria-hidden="true" />,
        title: "Connect Buffer again",
        text: "Daydeck cannot follow your posts until you do. It takes one click.",
        fix: (
          <Link href="/connect" className={cn(buttonVariants(), "h-11 px-4")}>
            Connect Buffer
          </Link>
        ),
      };
  }
}

/** Problems found by the progress checks, newest first. Each can be dismissed. */
export function ProgressAlerts({ alerts }: { alerts: AlertRow[] }) {
  if (alerts.length === 0) return null;
  return (
    <section aria-label="Alerts" className="flex flex-col gap-3">
      {alerts.map((alert) => {
        const { icon, title, text, fix } = content(alert);
        return (
          <Alert
            key={alert.id}
            className="border-destructive/40 px-4 py-4 *:[svg]:text-destructive sm:px-5"
          >
            {icon}
            <AlertTitle>{title}</AlertTitle>
            <AlertDescription>
              <p>{text}</p>
            </AlertDescription>
            <div className="col-start-2 mt-3 flex flex-wrap gap-2">
              {fix}
              <form action={dismissAlertAction.bind(null, alert.id)}>
                <Button type="submit" variant="ghost" className="h-11 px-4">
                  Dismiss
                </Button>
              </form>
            </div>
          </Alert>
        );
      })}
    </section>
  );
}
