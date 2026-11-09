"use client";

import { Button } from "@daydeck/ui/components/button";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useId, useState } from "react";

/**
 * A link to share, in a read-only field with a copy button: the invite link, the recap link.
 * `path` is on this site; the field shows the full address.
 */
export function CopyLink({ path, label }: { path: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const id = useId();
  const url = typeof window === "undefined" ? path : `${window.location.origin}${path}`;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="font-medium text-sm">
        {label}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id={id}
          readOnly
          value={url}
          suppressHydrationWarning
          onFocus={(event) => event.currentTarget.select()}
          className="h-11 w-full min-w-0 rounded-lg border bg-muted px-3 font-mono text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <Button
          type="button"
          variant="outline"
          className="h-11 shrink-0 px-4"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
            } catch {
              (document.getElementById(id) as HTMLInputElement | null)?.select();
            }
          }}
        >
          {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
          {copied ? "Copied" : "Copy link"}
        </Button>
      </div>
      <output className="sr-only">{copied ? `${label} copied` : ""}</output>
    </div>
  );
}
