"use client";

import { Button } from "@daydeck/ui/components/button";
import { cn } from "@daydeck/ui/lib/utils";
import { GlobeIcon, LockIcon, UserRoundCheckIcon } from "lucide-react";
import { useActionState } from "react";
import { CopyLink } from "@/components/copy-link";
import { type RecapSettingState, setRecapOptInAction, setRecapVisibilityAction } from "./actions";

const CARD = "flex flex-col gap-3 rounded-xl border bg-card p-4";

function Result({ state }: { state: RecapSettingState }) {
  return (
    <output
      className={cn(
        "block text-sm empty:sr-only",
        state.status === "error" ? "text-destructive" : "text-muted-foreground",
      )}
    >
      {state.status === "idle" ? "" : state.message}
    </output>
  );
}

/**
 * The host's choice of who can open the recap. It says plainly what each choice shows, and
 * that names and links appear only for people who turn them on.
 */
export function RecapVisibility({ slug, isPublic }: { slug: string; isPublic: boolean }) {
  const [state, action, pending] = useActionState(setRecapVisibilityAction.bind(null, slug), {
    status: "idle",
  } as RecapSettingState);
  const options = [
    {
      value: "private",
      title: "Only people in the challenge",
      description: "Members open the recap from the challenge. Nobody else can.",
      Icon: LockIcon,
    },
    {
      value: "public",
      title: "Anyone with the link",
      description:
        "Share the recap anywhere. Visitors see everyone's days; names and post links show only for people who turn them on.",
      Icon: GlobeIcon,
    },
  ] as const;
  return (
    <form action={action} className={CARD}>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 flex items-center gap-2 font-semibold text-sm">
          <GlobeIcon aria-hidden="true" className="size-4 text-primary" />
          Who can see the recap
        </legend>
        <p className="text-muted-foreground text-xs leading-5">
          Only you, the host, can change this.
        </p>
        {options.map((option) => (
          <label
            key={option.value}
            className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-checked:border-primary has-checked:bg-accent/50 has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
          >
            <input
              type="radio"
              name="visibility"
              value={option.value}
              defaultChecked={(option.value === "public") === isPublic}
              className="mt-0.5 size-4 accent-primary"
            />
            <span className="flex flex-col gap-0.5">
              <span className="flex items-center gap-1.5 font-medium text-sm">
                <option.Icon aria-hidden="true" className="size-3.5" />
                {option.title}
              </span>
              <span className="text-muted-foreground text-xs leading-5">{option.description}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <Button type="submit" variant="outline" className="h-11 w-fit px-4" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
      <Result state={state} />
      {isPublic ? <CopyLink path={`/recap/${slug}`} label="Recap link" /> : null}
    </form>
  );
}

/** For members when the recap is public: its link, ready to copy and share. */
export function RecapShareLink({ slug }: { slug: string }) {
  return (
    <section aria-label="Share the recap" className={CARD}>
      <p className="text-muted-foreground text-xs leading-5">
        This recap is public. Anyone with its link can open it.
      </p>
      <CopyLink path={`/recap/${slug}`} label="Recap link" />
    </section>
  );
}

/** Each person's own choice: their name and post links on the recap, or an unnamed row. */
export function RecapOptIn({
  slug,
  optIn,
  isPublic,
}: {
  slug: string;
  optIn: boolean;
  isPublic: boolean;
}) {
  const [state, action, pending] = useActionState(setRecapOptInAction.bind(null, slug), {
    status: "idle",
  } as RecapSettingState);
  return (
    <form action={action} className={CARD}>
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          name="optIn"
          defaultChecked={optIn}
          className="mt-0.5 size-4 accent-primary"
        />
        <span className="flex flex-col gap-1">
          <span className="flex items-center gap-2 font-semibold text-sm">
            <UserRoundCheckIcon aria-hidden="true" className="size-4 text-primary" />
            Show my name and post links
          </span>
          <span className="text-muted-foreground text-xs leading-5">
            Off by default: you show as an unnamed row.{" "}
            {isPublic
              ? "This recap is public, so anyone with its link sees what you share."
              : "Right now only people in the challenge can open this recap. If the host makes it public, anyone with its link sees what you share."}
          </span>
        </span>
      </label>
      <Button type="submit" variant="outline" className="h-11 w-fit px-4" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
      <Result state={state} />
    </form>
  );
}
