import { Alert, AlertDescription, AlertTitle } from "@daydeck/ui/components/alert";
import { buttonVariants } from "@daydeck/ui/components/button";
import { cn } from "@daydeck/ui/lib/utils";
import { CircleCheckIcon, ExternalLinkIcon, PlugZapIcon, RefreshCwIcon } from "lucide-react";
import { BUFFER_CHANNEL_SETTINGS_URL } from "@/lib/buffer-links";
import { getConnectionSummary, requireUser } from "@/server/auth/current-user";
import { listChannels } from "@/server/buffer/channels";
import type { ReconnectReason } from "@/server/buffer/errors";
import { getDb } from "@/server/db";
import { ChannelPicker, type PickerChannel } from "./channel-picker";
import { NoChannelsNotice } from "./no-channels";
import { RefreshChannelsButton } from "./refresh-channels-button";

const RETURN_TO = "/settings/channels";

const RECONNECT_REASONS: Record<ReconnectReason, string> = {
  invalid_grant:
    "Buffer ended Daydeck's access, for example because the app was removed in Buffer's settings or a year has passed.",
  insufficient_scope: "Daydeck needs a permission that Buffer has not granted yet.",
  unauthorized: "Buffer stopped accepting Daydeck's access.",
};

/** The channel list for the signed-in user, with its notices. Costs no Buffer request. */
export async function ChannelsSection({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser(RETURN_TO);
  const [connection, rows, params] = await Promise.all([
    getConnectionSummary(user.id),
    listChannels({ db: getDb() }, user.id),
    searchParams,
  ]);
  const needsReconnect = connection?.status !== "active";
  const justConnected = params.connected === "1" && !needsReconnect;

  const channels: PickerChannel[] = rows
    .map((row) => ({
      id: row.id,
      name: row.displayName || row.name,
      service: row.service,
      avatarUrl: row.avatarUrl,
      isDisconnected: row.isDisconnected,
      isLocked: row.isLocked,
      isQueuePaused: row.isQueuePaused,
      selected: row.selected,
    }))
    // Sorted by the name people see, not Buffer's handle.
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  const lastSync = rows.length > 0 ? Math.max(...rows.map((row) => row.syncedAt.getTime())) : null;
  const refreshBlocked = needsReconnect
    ? "Connect Buffer again to refresh your channels."
    : undefined;

  return (
    <div className="flex flex-col gap-6">
      {justConnected ? (
        <Alert role="status" className="px-4 py-3">
          <CircleCheckIcon aria-hidden="true" className="text-primary" />
          <AlertTitle>Connected to Buffer as {user.name ?? "your account"}</AlertTitle>
          <AlertDescription>
            Next, choose the channels that count for your challenges and save.
          </AlertDescription>
        </Alert>
      ) : null}

      {needsReconnect ? <ReconnectNotice reason={connection?.reconnectReason ?? null} /> : null}

      {channels.length === 0 ? (
        <NoChannelsNotice refreshBlocked={refreshBlocked} />
      ) : (
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
          <ChannelPicker channels={channels} />
          <aside aria-label="About your channels" className="flex flex-col gap-4">
            <section
              aria-labelledby="refresh-heading"
              className="flex flex-col gap-3 rounded-xl border bg-card p-4"
            >
              <div className="flex flex-col gap-1">
                <h2 id="refresh-heading" className="flex items-center gap-2 font-semibold text-sm">
                  <RefreshCwIcon aria-hidden="true" className="size-4 text-primary" />
                  Updates from Buffer
                </h2>
                <p className="text-sm">{lastSyncLabel(lastSync)}</p>
                <p className="text-muted-foreground text-xs leading-5">
                  This list comes from Buffer. Daydeck copies it when you connect Buffer, and again
                  once a day. Added, renamed or reconnected an account in Buffer? Refresh to see it
                  here now. Refreshing only reads your channels; it never posts.
                </p>
              </div>
              <RefreshChannelsButton disabledReason={refreshBlocked} />
            </section>
            <a
              href={BUFFER_CHANNEL_SETTINGS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col gap-1 rounded-xl border bg-card p-4 outline-none transition-colors hover:border-foreground/30 focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="flex items-center gap-2 font-semibold text-sm">
                <ExternalLinkIcon aria-hidden="true" className="size-4 text-primary" />
                Manage channels in Buffer
                <span className="sr-only">(opens in a new tab)</span>
              </span>
              <span className="text-muted-foreground text-xs leading-5">
                Connect a new social account, or reconnect one, in Buffer. Then refresh here.
              </span>
            </a>
          </aside>
        </div>
      )}
    </div>
  );
}

function ReconnectNotice({ reason }: { reason: ReconnectReason | null }) {
  return (
    <Alert className="border-destructive/40 px-4 py-3">
      <PlugZapIcon aria-hidden="true" className="text-destructive" />
      <AlertTitle>Buffer needs you to connect again</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3">
        <p>
          {reason ? RECONNECT_REASONS[reason] : "Daydeck is not connected to Buffer."} Your
          challenge progress is safe, but nothing reaches Buffer until you reconnect.
        </p>
        <a
          href={`/api/auth/buffer/start?next=${encodeURIComponent(RETURN_TO)}`}
          className={cn(buttonVariants(), "h-11 px-4 no-underline!")}
        >
          Reconnect Buffer
        </a>
      </AlertDescription>
    </Alert>
  );
}

/** "Last updated 3 hours ago": when the channel list was last copied from Buffer. */
function lastSyncLabel(at: number | null): string {
  if (!at) return "Not updated yet.";
  const minutes = Math.round((Date.now() - at) / 60_000);
  const format = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const ago =
    minutes < 60
      ? format.format(-minutes, "minute")
      : minutes < 48 * 60
        ? format.format(-Math.round(minutes / 60), "hour")
        : format.format(-Math.round(minutes / 1440), "day");
  return `Last updated ${ago}.`;
}
