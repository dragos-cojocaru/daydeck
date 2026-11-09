"use client";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@daydeck/ui/components/alert-dialog";
import { Button } from "@daydeck/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@daydeck/ui/components/dropdown-menu";
import { Kbd, KbdGroup } from "@daydeck/ui/components/kbd";
import { Popover, PopoverContent, PopoverTrigger } from "@daydeck/ui/components/popover";
import { cn } from "@daydeck/ui/lib/utils";
import {
  ArrowDownIcon,
  CopyIcon,
  CornerUpLeftIcon,
  EllipsisIcon,
  ExternalLinkIcon,
  LinkIcon,
  SendIcon,
  ShieldIcon,
  SmilePlusIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import Link from "next/link";
import {
  type KeyboardEvent,
  type ReactNode,
  startTransition,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useOptimistic,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { TermHint } from "@/components/term-hint";
import { UserAvatar } from "@/components/user-avatar";
import { NetworkIcon } from "@/features/settings/network-icon";
import { serviceName } from "@/features/settings/services";
import { REACTION_EMOJI } from "@/lib/reactions";
import type { Channel, MessageView } from "@/server/community/service";
import {
  deleteMessageAction,
  markReadAction,
  postMessageAction,
  toggleReactionAction,
} from "./actions";
import { useLive } from "./live";
import { useMemberCard } from "./member-card";

/** How often an open channel asks for new messages while its tab is visible. */
const POLL_MS = 5_000;
const SAFETY_POLL_MS = 30_000;
const MAX_LENGTH = 2000;

const EMOJI_NAMES: Record<string, string> = {
  "👍": "thumbs up",
  "❤️": "heart",
  "🔥": "fire",
  "🎉": "party",
  "👏": "clapping",
  "😂": "laughing",
  "💡": "idea",
  "🙌": "raised hands",
};

export interface ShareableDay {
  entryId: string;
  dayNumber: number;
  title: string;
  /** The published post's address, when Buffer has one. */
  url: string | null;
  service: string | null;
}

export interface ChannelData {
  version: number;
  chatEnabled: boolean;
  messages: MessageView[];
  /** When the channel opened: the first message you had not read, for the "New" line. */
  firstUnreadId?: string | null;
}

const subscribeNothing = () => () => {};
/** False while the server renders, true in the browser: times use the reader's own clock. */
function useMounted() {
  return useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
}

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
const dayFormat = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "numeric",
  month: "short",
});

function whenLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  const yesterday = new Date(today.getTime() - 86_400_000).toDateString() === date.toDateString();
  const time = timeFormat.format(date);
  if (sameDay) return `Today ${time}`;
  if (yesterday) return `Yesterday ${time}`;
  return `${dayFormat.format(date)}, ${time}`;
}

function When({ iso }: { iso: string }) {
  const mounted = useMounted();
  return (
    <time dateTime={iso} className="text-muted-foreground text-xs tabular-nums">
      {mounted ? whenLabel(iso) : ""}
    </time>
  );
}

const LINK = /(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])/g;

/** Message text with its links made clickable. Text stays text: nothing is read as HTML. */
function Linkified({ text }: { text: string }) {
  const parts = text.split(LINK);
  return (
    <p className="whitespace-pre-wrap leading-6 wrap-anywhere">
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <a
            // biome-ignore lint/suspicious/noArrayIndexKey: parts of one fixed string
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer nofollow ugc"
            className="text-primary underline underline-offset-3 hover:no-underline"
          >
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </p>
  );
}

/** A shared link as a card: the network's logo and name, then the page's title, text and image. */
function PreviewCard({ preview }: { preview: NonNullable<MessageView["preview"]> }) {
  const network = preview.service ? serviceName(preview.service) : null;
  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer nofollow ugc"
      className="group/preview flex max-w-xl overflow-hidden rounded-lg border bg-card outline-none transition-colors hover:border-foreground/30 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1 p-3">
        <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
          {preview.service ? (
            <NetworkIcon service={preview.service} />
          ) : (
            <LinkIcon aria-hidden="true" className="size-3.5" />
          )}
          <span className="truncate">{network ?? preview.siteName ?? preview.host}</span>
          <ExternalLinkIcon aria-hidden="true" className="ml-auto size-3.5 shrink-0" />
          <span className="sr-only">(opens in a new tab)</span>
        </span>
        <span className="line-clamp-2 font-medium leading-5">
          {preview.title ?? `Open the post on ${network ?? preview.host}`}
        </span>
        {preview.description ? (
          <span className="line-clamp-3 text-muted-foreground text-sm leading-5">
            {preview.description}
          </span>
        ) : null}
      </span>
      {preview.imageUrl ? (
        // biome-ignore lint/performance/noImgElement: an image on another site, shown as it is
        <img
          src={preview.imageUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="hidden w-32 shrink-0 border-l object-cover sm:block"
        />
      ) : null}
    </a>
  );
}

/** The day's prompt in Updates, laid out like a prompt card: day, theme, title, text and steps. */
function PromptPost({
  prompt,
  slug,
}: {
  prompt: NonNullable<MessageView["prompt"]>;
  slug: string;
}) {
  return (
    <article className="flex max-w-2xl flex-col gap-3 overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center justify-between gap-3 bg-primary px-4 py-3 text-primary-foreground">
        <span className="font-semibold text-sm uppercase tracking-wide">
          {prompt.theme || "Today's prompt"}
        </span>
        <span className="rounded-md bg-primary-foreground px-2 py-0.5 font-semibold text-primary text-sm">
          Day {prompt.dayNumber}
        </span>
      </div>
      <div className="flex flex-col gap-3 px-4 pb-4">
        <h3 className="font-semibold text-xl leading-7 tracking-tight">
          {`${prompt.emoji} ${prompt.title}`.trim()}
        </h3>
        {prompt.description ? (
          <p className="text-muted-foreground leading-6">{prompt.description}</p>
        ) : null}
        {prompt.steps.length > 0 ? (
          <ul className="flex list-disc flex-col gap-1 rounded-lg bg-muted py-3 pr-3 pl-8 leading-6">
            {prompt.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        ) : null}
        <Link
          href={`/challenges/${slug}`}
          className="w-fit text-primary text-sm underline underline-offset-3 hover:no-underline"
        >
          Save it to Buffer from the challenge page
        </Link>
      </div>
    </article>
  );
}

function Reactions({
  message,
  onToggle,
}: {
  message: MessageView;
  onToggle: (emoji: string) => void;
}) {
  if (message.reactions.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {message.reactions.map((reaction) => {
        const who = reaction.names.join(", ");
        return (
          <button
            key={reaction.emoji}
            type="button"
            aria-pressed={reaction.mine}
            title={`${who} reacted with ${reaction.emoji}`}
            aria-label={`${EMOJI_NAMES[reaction.emoji] ?? reaction.emoji}, ${reaction.count}: ${who}. ${reaction.mine ? "Press to take yours back." : "Press to add yours."}`}
            onClick={() => onToggle(reaction.emoji)}
            className={cn(
              "inline-flex h-8 items-center gap-1 rounded-full border px-2 text-sm tabular-nums outline-none transition-colors hover:border-foreground/30 focus-visible:ring-3 focus-visible:ring-ring/50",
              reaction.mine && "border-primary bg-accent text-accent-foreground",
            )}
          >
            <span aria-hidden="true">{reaction.emoji}</span>
            <span aria-hidden="true">{reaction.count}</span>
          </button>
        );
      })}
      <Popover>
        <PopoverTrigger className="inline-flex h-8 items-center rounded-full px-2 text-muted-foreground text-xs underline-offset-3 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
          Who reacted
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 gap-2 p-3">
          <ul className="flex flex-col gap-2 text-sm">
            {message.reactions.map((reaction) => (
              <li key={reaction.emoji} className="flex gap-2">
                <span aria-hidden="true" className="w-6 shrink-0 text-base">
                  {reaction.emoji}
                </span>
                <span className="sr-only">{EMOJI_NAMES[reaction.emoji]}: </span>
                <span className="leading-6">{reaction.names.join(", ")}</span>
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function EmojiPicker({ onPick, label }: { onPick: (emoji: string) => void; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={label}
        className="flex size-9 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-popup-open:bg-muted"
      >
        <SmilePlusIcon aria-hidden="true" className="size-4" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-1.5">
        <div className="grid grid-cols-4 gap-1">
          {REACTION_EMOJI.map((emoji) => (
            <button
              key={emoji}
              type="button"
              aria-label={`React with ${EMOJI_NAMES[emoji]}`}
              onClick={() => {
                onPick(emoji);
                setOpen(false);
              }}
              className="flex size-10 items-center justify-center rounded-md text-xl outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function MessageItem({
  message,
  slug,
  isHost,
  newAbove = false,
  onReply,
  onReact,
  onDelete,
  setNotice,
}: {
  message: MessageView;
  /** The first message you had not read: a "New" line goes above it. */
  newAbove?: boolean;
  slug: string;
  isHost: boolean;
  onReply: (message: MessageView) => void;
  /** Turns your reaction on or off; the channel shows it at once. */
  onReact: (emoji: string, on: boolean) => void;
  /** Asks to delete this message; the channel confirms first. */
  onDelete: (message: MessageView) => void;
  setNotice: (text: string) => void;
}) {
  const openMember = useMemberCard();
  const author = message.author;
  // Each click says what it wants (on or off), so it never fights a refresh.
  const react = (emoji: string) =>
    onReact(emoji, !message.reactions.find((reaction) => reaction.emoji === emoji)?.mine);
  const remove = () => onDelete(message);

  return (
    <li
      id={`message-${message.id}`}
      className={cn(
        "group/message relative flex gap-3 rounded-lg px-2 py-2 hover:bg-muted/50 has-focus-visible:bg-muted/50",
        newAbove && "mt-6 scroll-mt-8",
      )}
    >
      {newAbove ? (
        // Like Slack and Discord: one line where your unread messages start.
        <div
          data-new-line
          className="pointer-events-none absolute inset-x-2 -top-4 flex items-center gap-2"
        >
          <hr aria-label="New messages start here" className="m-0 flex-1 border-destructive/60" />
          <span aria-hidden="true" className="font-semibold text-destructive text-xs uppercase">
            New
          </span>
        </div>
      ) : null}
      {author ? (
        <button
          type="button"
          onClick={() => openMember(author.userId)}
          aria-label={`Open ${author.name}'s card`}
          className="h-fit shrink-0 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <UserAvatar name={author.name} src={author.avatarUrl} />
        </button>
      ) : (
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground text-sm"
        >
          D
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-baseline gap-x-2 pr-20">
          {author ? (
            <button
              type="button"
              onClick={() => openMember(author.userId)}
              className="rounded-sm font-medium outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {author.name}
            </button>
          ) : (
            <span className="font-medium">Daydeck</span>
          )}
          {author?.isHost ? (
            <span className="rounded-full bg-accent px-1.5 py-0.5 font-medium text-accent-foreground text-xs">
              Host
            </span>
          ) : null}
          {author && !author.isMember ? (
            <span className="text-muted-foreground text-xs">left the challenge</span>
          ) : null}
          <When iso={message.createdAt} />
          {message.dayNumber ? (
            <span className="rounded-full bg-tile px-1.5 py-0.5 text-muted-foreground text-xs">
              Day {message.dayNumber}
            </span>
          ) : null}
        </div>
        {message.replyTo ? (
          <a
            href={`#message-${message.replyTo.id}`}
            className="flex min-w-0 items-center gap-1.5 border-l-2 pl-2 text-muted-foreground text-sm hover:text-foreground"
          >
            <CornerUpLeftIcon aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="shrink-0 font-medium">{message.replyTo.authorName}</span>
            <span className="truncate">{message.replyTo.snippet}</span>
          </a>
        ) : null}
        {message.prompt ? <PromptPost prompt={message.prompt} slug={slug} /> : null}
        {message.body ? <Linkified text={message.body} /> : null}
        {message.preview ? <PreviewCard preview={message.preview} /> : null}
        <Reactions message={message} onToggle={react} />
      </div>

      {/* Visible, quiet controls: on touch they always show, on a mouse they light up on hover. */}
      <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 rounded-md border bg-background opacity-100 shadow-xs md:opacity-0 md:group-hover/message:opacity-100 md:group-has-focus-visible/message:opacity-100 md:has-data-popup-open:opacity-100">
        <EmojiPicker onPick={react} label={`React to ${author?.name ?? "Daydeck"}'s message`} />
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="More actions"
            className="flex size-9 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-popup-open:bg-muted"
          >
            <EllipsisIcon aria-hidden="true" className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {message.kind !== "prompt" ? (
              <DropdownMenuItem onClick={() => onReply(message)}>
                <CornerUpLeftIcon aria-hidden="true" />
                Reply
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(message.body || message.prompt?.title || "")
                  .then(() => setNotice("Copied."));
              }}
            >
              <CopyIcon aria-hidden="true" />
              Copy text
            </DropdownMenuItem>
            {isHost && author && !author.isYou ? (
              <DropdownMenuItem onClick={() => openMember(author.userId)}>
                <ShieldIcon aria-hidden="true" />
                Manage {author.name}
              </DropdownMenuItem>
            ) : null}
            {message.canDelete ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={remove}>
                  <Trash2Icon aria-hidden="true" />
                  Delete message
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

const PLACEHOLDERS: Record<Channel, string> = {
  updates: "Share news with everyone in the challenge",
  chat: "Ask a question, share a win, or say hello",
  posts: "Paste the link to your post, and add a note if you like",
};

function Composer({
  slug,
  channel,
  replyTo,
  clearReply,
  shareDays,
  onSent,
  touch,
}: {
  slug: string;
  channel: Channel;
  replyTo: MessageView | null;
  clearReply: () => void;
  shareDays: ShareableDay[];
  onSent: () => void;
  /** A phone or tablet: Enter adds a line and the Send button sends, as in mobile chat apps. */
  touch: boolean;
}) {
  const [text, setText] = useState("");
  const [entryId, setEntryId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const textId = useId();
  const dayId = useId();
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (replyTo) textRef.current?.focus();
  }, [replyTo]);

  const send = () => {
    if (pending || !text.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await postMessageAction({
        slug,
        channel,
        body: text,
        replyToId: replyTo?.id ?? null,
        entryId: channel === "posts" && entryId ? entryId : null,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setText("");
      setEntryId("");
      clearReply();
      onSent();
    });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // With a keyboard, Enter sends and Shift+Enter starts a new line, as in most chat apps. On
    // a phone, Enter is the only way to start a new line, so it does that.
    if (touch) return;
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    }
  };
  const published = shareDays.filter((day) => day.url);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
      className="flex flex-col gap-2 border-t bg-background px-3 pt-3 pb-3 sm:px-4"
    >
      {channel === "posts" && published.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-xs">Your published posts:</span>
          {published.map((day) => (
            <button
              key={day.entryId}
              type="button"
              onClick={() => {
                setText((current) =>
                  current.includes(day.url ?? "")
                    ? current
                    : `${current ? `${current}\n` : ""}${day.url}`,
                );
                setEntryId(day.entryId);
                textRef.current?.focus();
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm outline-none hover:border-foreground/30 focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {day.service ? <NetworkIcon service={day.service} /> : null}
              Day {day.dayNumber}
            </button>
          ))}
        </div>
      ) : null}
      {replyTo ? (
        <div className="flex items-center gap-2 rounded-md bg-muted px-2 py-1 text-sm">
          <CornerUpLeftIcon aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            Replying to <span className="font-medium">{replyTo.author?.name ?? "Daydeck"}</span>
          </span>
          <button
            type="button"
            onClick={clearReply}
            aria-label="Stop replying"
            className="flex size-8 items-center justify-center rounded-md outline-none hover:bg-background focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <XIcon aria-hidden="true" className="size-4" />
          </button>
        </div>
      ) : null}
      {/* On narrow screens the button sits at the top, beside the first line you type. */}
      <div className="flex items-start gap-2 sm:items-end">
        <label htmlFor={textId} className="sr-only">
          {channel === "posts" ? "Your post's link and a note" : "Message"}
        </label>
        <textarea
          ref={textRef}
          id={textId}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          maxLength={MAX_LENGTH}
          enterKeyHint={touch ? "enter" : "send"}
          rows={1}
          placeholder={PLACEHOLDERS[channel]}
          aria-describedby={`${textId}-hint ${textId}-error`}
          className="field-sizing-content max-h-48 min-h-11 flex-1 resize-none rounded-lg border bg-background px-3 py-2.5 text-base leading-6 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <Button type="submit" className="h-11 gap-2 px-4" disabled={pending || !text.trim()}>
          <SendIcon aria-hidden="true" />
          <span className="max-sm:sr-only">{pending ? "Sending…" : "Send"}</span>
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p
          id={`${textId}-hint`}
          className="flex flex-wrap items-center gap-x-1 gap-y-1 text-muted-foreground text-xs empty:hidden"
        >
          {/* Key hints only where there is a keyboard: not on phones (by user agent), and not on
              any touch-only screen (by pointer), in case its user agent says nothing. */}
          {touch ? null : (
            <span className="contents pointer-coarse:hidden">
              <Kbd>Enter</Kbd> sends,
              <KbdGroup>
                <Kbd>Shift</Kbd>
                <span>+</span>
                <Kbd>Enter</Kbd>
              </KbdGroup>
              adds a line.
            </span>
          )}
          {text.length > MAX_LENGTH - 200 ? `${MAX_LENGTH - text.length} characters left.` : null}
        </p>
        {channel === "posts" && shareDays.length > 0 ? (
          <span className="flex items-center gap-2 text-xs">
            <label htmlFor={dayId} className="text-muted-foreground">
              For day
            </label>
            <select
              id={dayId}
              value={entryId}
              onChange={(event) => setEntryId(event.target.value)}
              className="h-9 max-w-48 rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="">No day</option>
              {shareDays.map((day) => (
                <option key={day.entryId} value={day.entryId}>
                  Day {day.dayNumber}: {day.title}
                </option>
              ))}
            </select>
          </span>
        ) : null}
      </div>
      {error ? (
        <p id={`${textId}-error`} role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </form>
  );
}

/** A change you just made, shown before the server confirms it. */
type Change =
  | { kind: "react"; messageId: string; emoji: string; on: boolean }
  | { kind: "delete"; messageId: string };

const emojiOrder = (emoji: string) => (REACTION_EMOJI as readonly string[]).indexOf(emoji);

/**
 * Applies one change to the messages. Changes say the end state ("my fire is on"), so applying
 * one to messages that already have it changes nothing: a refresh that lands first is safe.
 */
function applyChange(messages: MessageView[], change: Change): MessageView[] {
  if (change.kind === "delete") return messages.filter((m) => m.id !== change.messageId);
  return messages.map((message) => {
    if (message.id !== change.messageId) return message;
    const existing = message.reactions.find((r) => r.emoji === change.emoji);
    if (Boolean(existing?.mine) === change.on) return message;
    const reactions = change.on
      ? existing
        ? message.reactions.map((r) =>
            r.emoji === change.emoji
              ? { ...r, count: r.count + 1, mine: true, names: ["You", ...r.names] }
              : r,
          )
        : [
            ...message.reactions,
            { emoji: change.emoji, count: 1, mine: true, names: ["You"] },
          ].sort((a, b) => emojiOrder(a.emoji) - emojiOrder(b.emoji))
      : message.reactions.flatMap((r) =>
          r.emoji !== change.emoji
            ? [r]
            : r.count <= 1
              ? []
              : [
                  {
                    ...r,
                    count: r.count - 1,
                    mine: false,
                    names: r.names.filter((name) => name !== "You"),
                  },
                ],
        );
    return { ...message, reactions };
  });
}

const EMPTY: Record<Channel, ReactNode> = {
  updates: (
    <>
      No updates yet. The host's news shows here, and in a challenge where everyone starts together,
      each day's <TermHint hint="A short idea for what to post that day.">prompt</TermHint> too.
    </>
  ),
  chat: "No messages yet. Say hello, or ask the group a question.",
  posts: "No shared posts yet. Published your post today? Paste its link below.",
};

/**
 * One channel: its messages, newest at the bottom, and a box to write in. It asks for news every
 * 5 seconds while the tab is visible, keeps your place when you scroll up, and marks the channel
 * as read while you look at it.
 */
export function ChannelView({
  slug,
  channel,
  initial,
  isHost,
  writeNote,
  shareDays,
  touch = false,
}: {
  slug: string;
  channel: Channel;
  initial: ChannelData;
  isHost: boolean;
  /** A phone or tablet, from the user agent: no key hints, and Enter adds a line. */
  touch?: boolean;
  /** Why you cannot write here, or null when you can. */
  writeNote: string | null;
  shareDays: ShareableDay[];
}) {
  const [data, setData] = useState(initial);
  // What you just did shows at once; the next answer from the server replaces it.
  const [messages, addChange] = useOptimistic(data.messages, applyChange);
  const [, startChange] = useTransition();
  const [deleting, setDeleting] = useState<MessageView | null>(null);
  const [replyTo, setReplyTo] = useState<MessageView | null>(null);
  const [notice, setNotice] = useState("");
  const [below, setBelow] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const version = useRef(initial.version);
  const count = useRef(initial.messages.length);
  const live = useLive();
  const { refresh, streaming } = live;
  const liveVersion = live.data[slug]?.community;
  // The "New" line stays where it was when you opened the channel, until you leave it.
  const [unreadFrom] = useState(initial.firstUnreadId ?? null);

  const nearBottom = useCallback(() => {
    const list = listRef.current;
    return !list || list.scrollHeight - list.scrollTop - list.clientHeight < 120;
  }, []);
  const toBottom = useCallback(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
    setBelow(0);
  }, []);

  const markRead = useCallback(() => {
    if (document.visibilityState !== "visible") return;
    void markReadAction(slug, channel).then(() => refresh());
  }, [slug, channel, refresh]);

  const load = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/community/${encodeURIComponent(slug)}?channel=${channel}&v=${version.current}`,
        { cache: "no-store" },
      );
      if (response.status !== 200) return;
      const next = (await response.json()) as ChannelData;
      version.current = next.version;
      startTransition(() => setData(next));
    } catch {
      // Offline or a server hiccup: the next round tries again.
    }
  }, [slug, channel]);

  // New messages: follow them when you are at the bottom, otherwise count them for the button.
  useLayoutEffect(() => {
    const added = data.messages.length - count.current;
    count.current = data.messages.length;
    if (added <= 0) return;
    if (nearBottom()) toBottom();
    else setBelow((value) => value + added);
    markRead();
  }, [data.messages.length, toBottom, markRead, nearBottom]);

  const react = (messageId: string, emoji: string, on: boolean) =>
    startChange(async () => {
      addChange({ kind: "react", messageId, emoji, on });
      const result = await toggleReactionAction(slug, messageId, emoji, on);
      if (!result.ok) setNotice(result.message);
      // Either way, take the server's version: it keeps a success, and undoes a refusal.
      await load();
    });
  const remove = (message: MessageView) =>
    startChange(async () => {
      addChange({ kind: "delete", messageId: message.id });
      const result = await deleteMessageAction(slug, message.id);
      setNotice(result.ok ? "Message deleted." : result.message);
      await load();
    });

  // The live stream says the community changed: fetch this channel at once.
  useEffect(() => {
    if (liveVersion !== undefined && liveVersion !== version.current) void load();
  }, [liveVersion, load]);

  // On opening: start at the "New" line when there is one, as Slack and Discord do, otherwise
  // at the newest message. Then mark the channel as read.
  useEffect(() => {
    const list = listRef.current;
    const line = list?.querySelector<HTMLElement>("[data-new-line]")?.parentElement;
    if (list && line) list.scrollTop = Math.max(0, line.offsetTop - 32);
    else toBottom();
    markRead();
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void load();
        markRead();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load, markRead, toBottom]);

  // A safety net under the live stream; every 5 seconds when the stream is down.
  useEffect(() => {
    const timer = window.setInterval(
      () => {
        if (document.visibilityState === "visible") void load();
      },
      streaming ? SAFETY_POLL_MS : POLL_MS,
    );
    return () => window.clearInterval(timer);
  }, [load, streaming]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={listRef}
        onScroll={() => {
          if (nearBottom()) setBelow(0);
        }}
        className="relative min-h-0 flex-1 overflow-y-auto px-1 py-3 sm:px-2"
      >
        {messages.length === 0 ? (
          <p className="m-3 rounded-xl border border-dashed p-6 text-center text-muted-foreground">
            {EMPTY[channel]}
          </p>
        ) : (
          <ol aria-label="Messages" className="flex flex-col gap-0.5">
            {messages.map((message) => (
              <MessageItem
                key={message.id}
                message={message}
                slug={slug}
                isHost={isHost}
                newAbove={message.id === unreadFrom}
                onReply={setReplyTo}
                onReact={(emoji, on) => react(message.id, emoji, on)}
                onDelete={setDeleting}
                setNotice={setNotice}
              />
            ))}
          </ol>
        )}
      </div>
      {below > 0 ? (
        <div className="relative">
          <Button
            type="button"
            variant="outline"
            onClick={toBottom}
            className="-top-14 absolute left-1/2 h-10 -translate-x-1/2 gap-2 rounded-full bg-background shadow-md"
          >
            <ArrowDownIcon aria-hidden="true" />
            {below === 1 ? "1 new message" : `${below} new messages`}
          </Button>
        </div>
      ) : null}
      <output aria-live="polite" className="sr-only">
        {notice}
      </output>
      <AlertDialog open={deleting !== null} onOpenChange={(next) => !next && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this message?</AlertDialogTitle>
            <AlertDialogDescription render={<div />} className="flex flex-col gap-3">
              {/* The message itself, set apart from the warning, as the member card shows it. */}
              {deleting ? (
                <blockquote className="flex w-full flex-col gap-0.5 self-stretch rounded-lg border bg-card p-2.5 text-card-foreground text-sm">
                  <span className="text-muted-foreground text-xs">
                    {deleting.author?.name ?? "Someone"} ·{" "}
                    {new Date(deleting.createdAt).toLocaleString(undefined, {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className="line-clamp-3 wrap-anywhere leading-5">{deleting.body}</span>
                </blockquote>
              ) : null}
              <p>It goes away for everyone. This cannot be undone.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11 px-4">Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              className="h-11 px-4"
              onClick={() => {
                if (deleting) remove(deleting);
                setDeleting(null);
              }}
            >
              Delete message
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {writeNote ? (
        <p className="border-t bg-muted/50 px-4 py-3 text-muted-foreground text-sm">{writeNote}</p>
      ) : (
        <Composer
          slug={slug}
          channel={channel}
          replyTo={replyTo}
          clearReply={() => setReplyTo(null)}
          shareDays={shareDays}
          touch={touch}
          onSent={() => {
            void load().then(toBottom);
          }}
        />
      )}
    </div>
  );
}
