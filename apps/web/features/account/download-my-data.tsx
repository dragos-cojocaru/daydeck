"use client";

import { Button } from "@daydeck/ui/components/button";
import { cn } from "@daydeck/ui/lib/utils";
import { DownloadIcon, Loader2Icon } from "lucide-react";
import { useState } from "react";

type State = { status: "idle" | "busy" | "done" | "error"; message: string };

/**
 * "Download my data": fetches the JSON file, then saves it. Fetching first (instead of a plain
 * link) lets the button show that it is working, and keeps an error on this page.
 */
export function DownloadMyData() {
  const [state, setState] = useState<State>({ status: "idle", message: "" });
  const busy = state.status === "busy";

  const download = async () => {
    setState({ status: "busy", message: "" });
    try {
      const response = await fetch("/api/account/export", { cache: "no-store" });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        setState({
          status: "error",
          message: body?.message ?? "The file did not download. Try again in a moment.",
        });
        return;
      }
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "daydeck-data.json";
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setState({ status: "done", message: `Downloaded ${name}.` });
    } catch {
      setState({
        status: "error",
        message: "The file did not download. Check your connection and try again.",
      });
    }
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        variant="outline"
        className="h-11 gap-2 px-4"
        disabled={busy}
        onClick={download}
      >
        {busy ? (
          <Loader2Icon aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
        ) : (
          <DownloadIcon aria-hidden="true" />
        )}
        {busy ? "Preparing your file…" : "Download my data"}
      </Button>
      <output
        aria-live="polite"
        className={cn(
          "text-sm leading-6",
          state.status === "error" ? "text-destructive" : "text-muted-foreground",
          !state.message && "sr-only",
        )}
      >
        {state.message}
      </output>
    </div>
  );
}
