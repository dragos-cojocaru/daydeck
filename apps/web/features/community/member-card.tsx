"use client";

import { Button } from "@daydeck/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@daydeck/ui/components/dialog";
import { cn } from "@daydeck/ui/lib/utils";
import { BanIcon, CrownIcon, Trash2Icon, UserMinusIcon, UserRoundCheckIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useId,
  useState,
  useTransition,
} from "react";
import { UserAvatar } from "@/components/user-avatar";
import type { ProfileView } from "@/server/community/moderation";
import {
  banMemberAction,
  deleteAllFromAction,
  memberProfileAction,
  removeMemberAction,
} from "./actions";
import { useLive } from "./live";

const CHANNEL_NAMES = { updates: "Updates", chat: "Chat", posts: "Posts" } as const;

const MemberCardContext = createContext<(userId: string) => void>(() => {});

/** Opens a person's card from anywhere inside the community page. */
export function useMemberCard() {
  return useContext(MemberCardContext);
}

type Confirm = "messages" | "remove" | "ban" | null;

/**
 * A person's card, like Discord's: who they are, their days and latest messages. The host also
 * gets the actions: delete all their messages, remove them (they can join again), or ban them
 * (their Buffer account can never join again).
 */
export function MemberCardProvider({
  slug,
  isHost,
  children,
}: {
  slug: string;
  isHost: boolean;
  children: ReactNode;
}) {
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [deleteMessages, setDeleteMessages] = useState(true);
  const [newLink, setNewLink] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { refresh } = useLive();
  const ids = useId();

  const load = useCallback(
    (id: string) => {
      setError(null);
      startTransition(async () => {
        const found = await memberProfileAction(slug, id);
        if (found.ok) setProfile(found.data);
        else setError(found.message);
      });
    },
    [slug],
  );
  const open = useCallback(
    (id: string) => {
      setUserId(id);
      setProfile(null);
      setResult(null);
      setConfirm(null);
      setDeleteMessages(true);
      setNewLink(false);
      load(id);
    },
    [load],
  );

  const run = (
    action: () => Promise<{ ok: true } | { ok: false; message: string }>,
    done: string,
  ) =>
    startTransition(async () => {
      const outcome = await action();
      setConfirm(null);
      if (!outcome.ok) {
        setError(outcome.message);
        return;
      }
      setResult(done);
      router.refresh();
      refresh();
      if (userId) load(userId);
    });

  const name = profile?.name ?? "this person";
  const manageable = isHost && profile && !profile.isYou && profile.role !== "host";

  return (
    <MemberCardContext value={open}>
      {children}
      <Dialog open={userId !== null} onOpenChange={(next) => !next && !pending && setUserId(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader className="flex-row items-center gap-3 text-left">
            {profile ? <UserAvatar name={profile.name} src={profile.avatarUrl} size="lg" /> : null}
            <div className="flex min-w-0 flex-col gap-1">
              <DialogTitle className="truncate">{profile?.name ?? "Loading…"}</DialogTitle>
              <DialogDescription className="flex flex-wrap items-center gap-2">
                {profile?.role === "host" ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-accent-foreground text-xs">
                    <CrownIcon aria-hidden="true" className="size-3.5" />
                    Host
                  </span>
                ) : profile?.isMember ? (
                  <span>Member</span>
                ) : profile ? (
                  <span>Not in the challenge</span>
                ) : null}
                {profile?.banned ? (
                  <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-destructive text-xs">
                    Banned
                  </span>
                ) : null}
              </DialogDescription>
            </div>
          </DialogHeader>

          {profile ? (
            <div className="flex flex-col gap-5">
              <dl className="grid grid-cols-3 gap-2 text-center">
                <Fact label="Days posted" value={`${profile.posted} of ${profile.days}`} />
                <Fact label="Messages" value={String(profile.messageCount)} />
                <Fact
                  label="Joined"
                  value={
                    profile.joinedAt
                      ? new Date(profile.joinedAt).toLocaleDateString(undefined, {
                          day: "numeric",
                          month: "short",
                        })
                      : "Not now"
                  }
                />
              </dl>

              <section aria-labelledby={`${ids}-recent`} className="flex flex-col gap-2">
                <h3 id={`${ids}-recent`} className="font-medium text-sm">
                  Latest messages
                </h3>
                {profile.recent.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No messages in this challenge.</p>
                ) : (
                  <ul className="flex flex-col divide-y rounded-lg border">
                    {profile.recent.map((message) => (
                      <li key={message.id} className="flex flex-col gap-0.5 p-2.5 text-sm">
                        <span className="text-muted-foreground text-xs">
                          {CHANNEL_NAMES[message.channel]} ·{" "}
                          {new Date(message.createdAt).toLocaleString(undefined, {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        <span className="line-clamp-2 wrap-anywhere">{message.body}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {manageable ? (
                <section
                  aria-labelledby={`${ids}-host`}
                  className="flex flex-col gap-2 rounded-lg border p-3"
                >
                  <h3 id={`${ids}-host`} className="font-medium text-sm">
                    Host actions
                  </h3>
                  {confirm === null ? (
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                      <Button
                        variant="outline"
                        className="h-11 justify-start gap-2 px-3 md:h-9"
                        disabled={pending || profile.messageCount === 0}
                        onClick={() => setConfirm("messages")}
                      >
                        <Trash2Icon aria-hidden="true" />
                        Delete all messages
                      </Button>
                      {profile.isMember ? (
                        <Button
                          variant="outline"
                          className="h-11 justify-start gap-2 px-3 md:h-9"
                          disabled={pending}
                          onClick={() => setConfirm("remove")}
                        >
                          <UserMinusIcon aria-hidden="true" />
                          Remove
                        </Button>
                      ) : null}
                      {!profile.banned ? (
                        <Button
                          variant="destructive"
                          className="h-11 justify-start gap-2 px-3 md:h-9"
                          disabled={pending}
                          onClick={() => setConfirm("ban")}
                        >
                          <BanIcon aria-hidden="true" />
                          Ban
                        </Button>
                      ) : null}
                    </div>
                  ) : null}

                  {confirm === "messages" ? (
                    <ConfirmBox
                      text={`Delete all ${profile.messageCount} of ${name}'s messages in this challenge? This cannot be undone.`}
                      action="Delete messages"
                      pending={pending}
                      onCancel={() => setConfirm(null)}
                      onConfirm={() =>
                        run(
                          () => deleteAllFromAction(slug, profile.userId),
                          `${name}'s messages are deleted.`,
                        )
                      }
                    />
                  ) : null}
                  {confirm === "remove" ? (
                    <ConfirmBox
                      text={`Remove ${name} from the challenge? Their days are deleted and they leave the board. Their messages stay. They can join again with the invite link.`}
                      action="Remove"
                      pending={pending}
                      onCancel={() => setConfirm(null)}
                      onConfirm={() =>
                        run(
                          () => removeMemberAction(slug, profile.userId),
                          `${name} is removed from the challenge.`,
                        )
                      }
                    />
                  ) : null}
                  {confirm === "ban" ? (
                    <div className="flex flex-col gap-3">
                      <p className="text-sm leading-6">
                        Ban {name}? They leave the challenge, and their Buffer account can never
                        join it again, even with a new invite link.
                      </p>
                      <label className="flex min-h-11 cursor-pointer items-start gap-2.5 text-sm md:min-h-0">
                        <input
                          type="checkbox"
                          checked={deleteMessages}
                          onChange={(event) => setDeleteMessages(event.target.checked)}
                          className="mt-0.5 size-4 accent-primary"
                        />
                        <span>
                          Also delete their {profile.messageCount}{" "}
                          {profile.messageCount === 1 ? "message" : "messages"}
                          <span className="block text-muted-foreground text-xs">
                            Their latest ones are listed above.
                          </span>
                        </span>
                      </label>
                      <label className="flex min-h-11 cursor-pointer items-start gap-2.5 text-sm md:min-h-0">
                        <input
                          type="checkbox"
                          checked={newLink}
                          onChange={(event) => setNewLink(event.target.checked)}
                          className="mt-0.5 size-4 accent-primary"
                        />
                        <span>
                          Make a new invite link
                          <span className="block text-muted-foreground text-xs">
                            The old link stops working for everyone. Share the new one from Invite.
                          </span>
                        </span>
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="destructive"
                          className="h-11 px-4 md:h-9"
                          disabled={pending}
                          onClick={() =>
                            run(
                              () =>
                                banMemberAction(slug, profile.userId, {
                                  deleteMessages,
                                  newInviteLink: newLink,
                                }),
                              `${name} is banned.${newLink ? " The invite link is new." : ""}`,
                            )
                          }
                        >
                          {pending ? "Banning…" : `Ban ${name}`}
                        </Button>
                        <Button
                          variant="outline"
                          className="h-11 px-4 md:h-9"
                          disabled={pending}
                          onClick={() => setConfirm(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </section>
              ) : null}
              {isHost && profile.banned ? (
                <p className="flex items-center gap-2 text-muted-foreground text-sm">
                  <UserRoundCheckIcon aria-hidden="true" className="size-4" />
                  To let them back, unban them under Community settings.
                </p>
              ) : null}
            </div>
          ) : null}

          <output
            aria-live="polite"
            className={cn(
              "block text-sm",
              error && "text-destructive",
              !error && !result && "sr-only",
            )}
          >
            {error ?? result ?? ""}
          </output>
        </DialogContent>
      </Dialog>
    </MemberCardContext>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg bg-muted p-2">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function ConfirmBox({
  text,
  action,
  pending,
  onCancel,
  onConfirm,
}: {
  text: string;
  action: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm leading-6">{text}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="destructive"
          className="h-11 px-4 md:h-9"
          disabled={pending}
          onClick={onConfirm}
        >
          {pending ? "Working…" : action}
        </Button>
        <Button
          variant="outline"
          className="h-11 px-4 md:h-9"
          disabled={pending}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
