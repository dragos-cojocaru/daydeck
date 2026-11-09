import { buttonVariants } from "@daydeck/ui/components/button";
import { cn } from "@daydeck/ui/lib/utils";
import { ExternalLinkIcon } from "lucide-react";
import { BUFFER_CHANNEL_SETTINGS_URL } from "@/lib/buffer-links";
import { RefreshChannelsButton } from "./refresh-channels-button";

/**
 * The empty state when the person's Buffer account has no channels. The next step happens in
 * Buffer, so it gets the main button; refreshing is the step after.
 */
export function NoChannelsNotice({ refreshBlocked }: { refreshBlocked?: string }) {
  return (
    <div className="flex flex-col items-start gap-4 rounded-xl border border-dashed p-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold text-lg">No channels here yet</h2>
        <p className="text-muted-foreground">
          Daydeck saves drafts to the social accounts you connect in Buffer, such as LinkedIn, X or
          Bluesky. Connect one in Buffer, then come back and refresh.
        </p>
      </div>
      <div className="flex flex-col items-start gap-3 sm:flex-row">
        <a
          href={BUFFER_CHANNEL_SETTINGS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants(), "h-11 px-4")}
        >
          Connect a channel in Buffer
          <ExternalLinkIcon aria-hidden="true" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
        <RefreshChannelsButton disabledReason={refreshBlocked} />
      </div>
    </div>
  );
}
