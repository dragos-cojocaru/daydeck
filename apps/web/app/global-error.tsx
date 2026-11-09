"use client";

import { ErrorState } from "@/components/error-state";

// Errors in the root layout itself replace the whole document, so this renders html and body.
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <ErrorState error={error} retry={retry} />
      </body>
    </html>
  );
}
