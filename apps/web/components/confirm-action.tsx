"use client";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@daydeck/ui/components/alert-dialog";
import { Button } from "@daydeck/ui/components/button";
import { type ReactNode, useState, useTransition } from "react";

/**
 * A destructive action behind a confirmation: the dialog says exactly what happens, the
 * confirm button names the action, and Cancel is the quiet choice. Errors show in the dialog.
 */
export function ConfirmAction({
  triggerLabel,
  title,
  description,
  confirmLabel,
  pendingLabel,
  action,
}: {
  triggerLabel: string;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  pendingLabel: string;
  /** Returns an error message to show, or nothing when it worked. */
  action: () => Promise<string | undefined>;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <AlertDialogTrigger
        // A long label wraps on a narrow phone instead of running past the screen.
        render={
          <Button
            variant="destructive"
            className="h-auto min-h-11 w-fit max-w-full whitespace-normal px-4 py-2 text-left"
          />
        }
      >
        {triggerLabel}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription render={<div />}>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel className="h-11 px-4" disabled={pending}>
            Cancel
          </AlertDialogCancel>
          <Button
            variant="destructive"
            className="h-11 px-4"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const message = await action();
                if (message) setError(message);
                else setOpen(false);
              })
            }
          >
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
