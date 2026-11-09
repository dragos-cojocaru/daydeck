import { Alert, AlertDescription, AlertTitle } from "@daydeck/ui/components/alert";
import { CircleAlertIcon, CircleCheckIcon } from "lucide-react";
import Link from "next/link";
import { getCurrentSessionOrNull } from "@/server/auth/current-user";

// What each callback error means for the person, and what to do next.
const ERRORS: Record<string, { title: string; description: string }> = {
  too_many: {
    title: "Too many tries in a short time",
    description: "Wait a few minutes, then connect again.",
  },
  denied: {
    title: "You chose not to connect",
    description:
      "Daydeck needs Buffer to send your prompts and check off your days. Connect whenever you are ready.",
  },
  expired: {
    title: "That sign-in expired",
    description:
      "Buffer's approval link only works for a few minutes. Start again below; it takes a moment.",
  },
  mismatch: {
    title: "We could not confirm this sign-in",
    description:
      "The answer from Buffer did not match the request from this browser. Start again from this page.",
  },
  missing_scope: {
    title: "Some permissions are missing",
    description:
      "Daydeck needs every permission on Buffer's screen to work. Connect again and approve all of them.",
  },
  no_organization: {
    title: "Your Buffer account is not set up yet",
    description:
      "Buffer has no organization for this account. Open Buffer once to finish setting it up, then connect again.",
  },
  busy: {
    title: "Buffer is busy right now",
    description: "Too many requests reached Buffer at once. Try again in a few minutes.",
  },
  buffer_error: {
    title: "Buffer could not finish connecting",
    description: "Nothing was saved. Try again; if it keeps happening, try again later.",
  },
  not_configured: {
    title: "Connecting is not set up on this server",
    description:
      "The server is missing a setting it needs, such as the Buffer app client, the encryption key or the database address. The server log names it; see .env.example.",
  },
  unexpected: {
    title: "Something went wrong on our side",
    description:
      "Nothing was saved. Try again; if it keeps happening, let your challenge host know.",
  },
};

/** The result of the last connect attempt, or who is connected already. */
export async function ConnectNotice({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { error } = await searchParams;
  const known = typeof error === "string" ? (ERRORS[error] ?? ERRORS.unexpected) : null;

  if (known) {
    return (
      <Alert className="border-destructive/40 px-4 py-3">
        <CircleAlertIcon aria-hidden="true" className="text-destructive" />
        <AlertTitle>{known.title}</AlertTitle>
        <AlertDescription>{known.description}</AlertDescription>
      </Alert>
    );
  }

  const session = await getCurrentSessionOrNull();
  if (!session) return null;
  return (
    <Alert role="status" className="px-4 py-3">
      <CircleCheckIcon aria-hidden="true" />
      <AlertTitle>You are connected as {session.user.name ?? "your Buffer account"}</AlertTitle>
      <AlertDescription>
        <Link href="/settings/channels">Go to your channels</Link>, or connect again below to switch
        accounts or renew access.
      </AlertDescription>
    </Alert>
  );
}
