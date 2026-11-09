"use client";

import { Alert, AlertDescription, AlertTitle } from "@daydeck/ui/components/alert";
import { Button } from "@daydeck/ui/components/button";
import { Skeleton } from "@daydeck/ui/components/skeleton";
import { cn } from "@daydeck/ui/lib/utils";
import {
  CheckIcon,
  LockIcon,
  LockOpenIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  ShuffleIcon,
  Trash2Icon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { TermHint } from "@/components/term-hint";
import { CREATOR_CAMP_CREDIT, isCreatorCampTemplate } from "@/lib/creator-camp";
import { firstPromptDay, localDateOf, promptDates } from "@/lib/day-engine";
import { fuzzySearch } from "@/lib/fuzzy-search";
import { VERY_ACTIVE_WORDS } from "@/lib/home-listing";
import { zoneNowSentence } from "@/lib/time-zones";
import { createChallengeAction, type LibraryResult, loadLibraryAction } from "../actions";
import { formatDay } from "../format";
import { type ChallengeRulesInput, RuleList, ruleRows } from "../rules";
import { NetworkChips, StartDateField, TimeZoneField } from "./fields";

export interface PromptDraft {
  title: string;
  description: string;
  body: string;
  emoji: string;
  /** A short label over the day, such as the week's theme. */
  theme: string;
  /** What to do, as short steps. */
  steps: string[];
  bufferTemplateId: string | null;
}

export interface StarterSetView {
  slug: string;
  title: string;
  description: string;
  /** The curated picks, in order: what the pack gives until the host swaps some. */
  prompts: PromptDraft[];
  /** Every prompt in the pack, the curated ones first. "Shuffle all" and "Swap" draw from it. */
  pool: PromptDraft[];
}

type Source =
  | { kind: "starter"; slug: string }
  | { kind: "surprise" }
  | { kind: "library" }
  | { kind: "creator-camp" }
  | { kind: "own" };

/** One host-written prompt: a card in "Write your own". `key` only tells cards apart. */
interface OwnPrompt {
  key: string;
  title: string;
  description: string;
  body: string;
  theme: string;
  /** One step per line, as typed. */
  steps: string;
}

function newOwnPrompt(): OwnPrompt {
  return {
    key: crypto.randomUUID(),
    title: "",
    description: "",
    body: "",
    theme: "",
    steps: "",
  };
}

interface Answers {
  title: string;
  source: Source;
  pickedTemplateIds: string[];
  /** For a pack or "Surprise me": the chosen prompts, as "pack slug#position in its pool". */
  picks: string[];
  /** How many days "Surprise me" draws. */
  surpriseDays: number;
  /** Picks the host locked with "Keep": "Shuffle" and "Swap" leave them as they are. */
  kept: string[];
  ownPrompts: OwnPrompt[];
  startMode: "rolling" | "fixed";
  cadence: "daily" | "weekdays";
  startDate: string;
  timezone: string;
  visibility: "private" | "public";
  /** List it under "Popular challenges" on the homepage while active. Only with "public". */
  showOnHome: boolean;
  networkMode: "any" | "some";
  chatEnabled: boolean;
  allowedServices: string[];
}

type Template = Extract<LibraryResult, { ok: true }>["templates"][number];

const STEPS = ["Name", "Prompts", "Schedule", "Rules", "Review"] as const;
const STORAGE_KEY = "daydeck:new-challenge";
const MAX_PROMPTS = 30;

// The words the app uses everywhere, explained where they first appear in the form.
const HINTS = {
  prompt: "A short idea for what to post that day.",
  board: "A page where everyone in the challenge sees each other's days.",
  recap: "One page with the whole challenge, and a badge for each person to share.",
  draft: "A post saved in Buffer that is not published yet.",
  invite: "The link that lets someone join. Anyone who has it can join.",
  community:
    "The challenge's own space: updates from the host, a group chat, shared posts and feedback on drafts.",
} as const;

/** Today's date and the time zones, read in the browser once the page is there. */
interface Clock {
  today: string;
  zone: string;
  timeZones: string[];
}

function readClock(): Clock {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const timeZones = Intl.supportedValuesOf("timeZone");
  if (!timeZones.includes(zone)) timeZones.unshift(zone);
  if (!timeZones.includes("UTC")) timeZones.push("UTC");
  return { today: localDateOf(new Date(), zone), zone, timeZones };
}

/** An empty form. Today's date and the time zone fill in once the browser has said them. */
function blankAnswers(starterSets: StarterSetView[], clock: Clock | null): Answers {
  return {
    title: "",
    source: { kind: "starter", slug: starterSets[0]?.slug ?? "" },
    pickedTemplateIds: [],
    picks: [],
    surpriseDays: 7,
    kept: [],
    ownPrompts: [],
    startMode: "rolling",
    cadence: "daily",
    startDate: clock?.today ?? "",
    timezone: clock?.zone ?? "",
    visibility: "private",
    showOnHome: false,
    networkMode: "any",
    allowedServices: [],
    chatEnabled: true,
  };
}

/** True when the form holds something the person would not want to lose. */
function hasDraft(answers: Pick<Answers, "title">, step: number): boolean {
  return step > 0 || answers.title.trim() !== "";
}

/** The settings in the shape the shared rules list reads. */
function rulesOf(answers: Answers): ChallengeRulesInput {
  return {
    startMode: answers.startMode,
    startDate: answers.startDate,
    cadence: answers.cadence,
    timezone: answers.timezone,
    visibility: answers.visibility,
    allowedServices: answers.networkMode === "some" ? answers.allowedServices : [],
    chatEnabled: answers.chatEnabled,
    showOnHome: answers.visibility === "public" && answers.showOnHome,
  };
}

/**
 * The setup form. It needs no server data beyond the starter sets, so the page shows it at once;
 * the date and the suggested time zone come from the browser.
 */
export function ChallengeWizard({
  starterSets,
  creatorCamp,
}: {
  starterSets: StarterSetView[];
  creatorCamp: boolean;
}) {
  const [clock, setClock] = useState<Clock | null>(null);
  const today = clock?.today ?? "";
  const timeZones = clock?.timeZones ?? [];
  const [answers, setAnswers] = useState<Answers>(() => blankAnswers(starterSets, null));
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const router = useRouter();
  const [library, setLibrary] = useState<Template[] | null>(null);
  const [libraryState, setLibraryState] = useState<{ loading: boolean; error: string | null }>({
    loading: false,
    error: null,
  });
  const [creating, startCreating] = useTransition();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const restored = useRef(false);
  // After "Create challenge" the form stays on Review until the challenge's page shows.
  const [opening, setOpening] = useState(false);
  const created = useRef(false);
  // A notice over the form: answers came back from earlier, or "Start over" just emptied it.
  const [draft, setDraft] = useState<"restored" | "cleared" | null>(null);
  const beforeStartOver = useRef<{ answers: Answers; step: number } | null>(null);
  const latest = useRef({ answers, step });
  const shown = useRef(false);

  // On mount: read the browser's date and time zone, and bring back answers kept across a
  // reload of this tab.
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const now = readClock();
    setClock(now);
    // Fill in only the date and zone: anything typed already stays.
    setAnswers((current) => ({
      ...current,
      startDate: current.startDate || now.today,
      timezone: current.timezone || now.zone,
    }));
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as {
          answers: Partial<Answers> & { ownText?: string };
          step: number;
        };
        const { ownText, ...kept } = parsed.answers;
        const ownPrompts =
          kept.ownPrompts ??
          (ownText ?? "")
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .map((title) => ({ ...newOwnPrompt(), title }));
        setAnswers((current) => ({ ...current, ...kept, ownPrompts }));
        setStep(Math.min(Math.max(parsed.step, 0), STEPS.length - 1));
        if (hasDraft({ title: kept.title ?? "" }, parsed.step)) setDraft("restored");
      }
    } catch {
      // Storage can be unavailable; the form still works without it.
    }
  }, []);
  useEffect(() => {
    latest.current = { answers, step };
    if (!restored.current) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ answers, step }));
    } catch {}
  }, [answers, step]);
  // Next.js keeps this page in memory while you are on other pages, and runs layout effects
  // again, before drawing, when you come back. After a create the form starts empty; after
  // leaving halfway, a notice says the answers are still here.
  useLayoutEffect(() => {
    if (!shown.current) {
      shown.current = true;
      return;
    }
    if (created.current) {
      created.current = false;
      setAnswers(blankAnswers(starterSets, readClock()));
      setStep(0);
      setErrors({});
      setOpening(false);
      setDraft(null);
    } else if (hasDraft(latest.current.answers, latest.current.step)) {
      setDraft("restored");
    }
  }, [starterSets]);

  const update = (patch: Partial<Answers>) => {
    setAnswers((current) => ({ ...current, ...patch }));
    setDraft((current) => (current === "cleared" ? null : current));
  };

  const startOver = () => {
    beforeStartOver.current = { answers, step };
    setAnswers(blankAnswers(starterSets, clock));
    setStep(0);
    setErrors({});
    setFormMessage(null);
    setDraft("cleared");
  };
  const undoStartOver = () => {
    const before = beforeStartOver.current;
    beforeStartOver.current = null;
    if (before) {
      setAnswers(before.answers);
      setStep(before.step);
    }
    setDraft(null);
  };

  const loadLibrary = async () => {
    if (library || libraryState.loading) return;
    setLibraryState({ loading: true, error: null });
    const result = await loadLibraryAction();
    if (result.ok) {
      setLibrary(result.templates);
      setLibraryState({ loading: false, error: null });
    } else {
      setLibraryState({ loading: false, error: result.message });
    }
  };
  // A restored "library" or "Creator Camp" choice needs the library again.
  useEffect(() => {
    const needsLibrary =
      answers.source.kind === "library" || answers.source.kind === "creator-camp";
    // After a failed load, wait for the person to choose the option again.
    if (needsLibrary && !libraryState.error) {
      void loadLibrary();
    }
  });

  const prompts = useMemo(
    () => promptsFor(answers, starterSets, library),
    [answers, starterSets, library],
  );
  // The dates of the prompts: fixed for a shared start, or for someone who joins today.
  const firstDay =
    answers.startMode === "fixed" && answers.startDate
      ? answers.startDate
      : today
        ? firstPromptDay(today, answers.cadence)
        : "";
  const dates = firstDay ? promptDates(firstDay, answers.cadence, prompts.length) : [];

  const goTo = (next: number) => {
    setStep(next);
    setFormMessage(null);
    setDraft(null);
    requestAnimationFrame(() => headingRef.current?.focus());
  };

  const validate = (index: number): Record<string, string> => {
    const found: Record<string, string> = {};
    if (index === 0) {
      const title = answers.title.trim();
      if (title.length < 3) found.title = "Use at least 3 characters.";
      if (title.length > 80) found.title = "Use 80 characters or fewer.";
    }
    if (index === 1) {
      const untitled =
        answers.source.kind === "own"
          ? answers.ownPrompts.findIndex(
              (card) => !card.title.trim() && (card.description.trim() || card.body.trim()),
            )
          : -1;
      if (untitled >= 0) {
        found.prompts = `Every prompt needs a title. Fill in day ${untitled + 1} or remove it.`;
      } else if (prompts.length === 0) {
        found.prompts =
          answers.source.kind === "own"
            ? "Write at least one prompt."
            : "Choose at least one prompt.";
      }
      if (prompts.length > MAX_PROMPTS)
        found.prompts = `Keep it to ${MAX_PROMPTS} prompts or fewer.`;
    }
    if (index === 2) {
      if (answers.startMode === "fixed" && answers.startDate < today) {
        found.startDate = "Choose today or a later date.";
      }
      if (answers.startMode === "fixed" && !timeZones.includes(answers.timezone))
        found.timezone = "Choose a time zone from the list.";
    }
    if (index === 3 && answers.networkMode === "some" && answers.allowedServices.length === 0) {
      found.allowedServices = 'Choose at least one network, or choose "Any network".';
    }
    return found;
  };

  const next = () => {
    const found = validate(step);
    setErrors(found);
    if (Object.keys(found).length === 0) goTo(step + 1);
  };

  const create = () => {
    setFormMessage(null);
    startCreating(async () => {
      const result = await createChallengeAction({
        title: answers.title,
        prompts,
        cadence: answers.cadence,
        startMode: answers.startMode,
        startDate: answers.startDate,
        timezone: answers.timezone,
        visibility: answers.visibility,
        showOnHome: rulesOf(answers).showOnHome,
        allowedServices: rulesOf(answers).allowedServices,
        chatEnabled: answers.chatEnabled,
      });
      if (result.ok) {
        // Keep Review on screen while the challenge's page loads. The form empties when
        // someone comes back to this page (see the layout effect above), never before.
        created.current = true;
        setOpening(true);
        try {
          sessionStorage.removeItem(STORAGE_KEY);
        } catch {}
        router.push(`/challenges/${result.slug}?created=1`);
        return;
      }
      setFormMessage(result.message);
      const fieldErrors = result.fieldErrors ?? {};
      setErrors(fieldErrors);
      const firstField = Object.keys(fieldErrors)[0];
      if (firstField === "title") goTo(0);
      else if (firstField === "prompts") goTo(1);
      else if (firstField === "visibility" || firstField === "allowedServices") goTo(3);
      else if (firstField) goTo(2);
    });
  };

  const isReview = step === STEPS.length - 1;

  return (
    <div className="flex flex-col gap-8">
      <Stepper step={step} onGoTo={goTo} />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-8">
          {draft ? (
            <DraftNotice
              draft={draft}
              onStartOver={startOver}
              onUndo={undoStartOver}
              onDismiss={() => setDraft(null)}
            />
          ) : null}
          <section aria-labelledby="wizard-step-heading" className="flex flex-col gap-6">
            <div className="flex flex-col gap-1">
              <p className="text-muted-foreground text-sm">
                Step {step + 1} of {STEPS.length}
              </p>
              <h2
                id="wizard-step-heading"
                ref={headingRef}
                tabIndex={-1}
                className="font-semibold text-2xl tracking-tight outline-none"
              >
                {STEP_HEADINGS[step]}
              </h2>
              <p className="max-w-2xl text-muted-foreground">{STEP_HINTS[step]}</p>
            </div>

            {step === 0 ? (
              <NameStep
                value={answers.title}
                error={errors.title}
                onChange={(title) => update({ title })}
              />
            ) : null}
            {step === 1 ? (
              <PromptsStep
                answers={answers}
                update={update}
                starterSets={starterSets}
                creatorCamp={creatorCamp}
                library={library}
                libraryState={libraryState}
                loadLibrary={loadLibrary}
                error={errors.prompts}
              />
            ) : null}
            {step === 2 ? (
              <ScheduleStep
                answers={answers}
                update={update}
                today={today}
                timeZones={timeZones}
                suggestedZone={clock?.zone ?? "UTC"}
                dates={dates}
                errors={errors}
              />
            ) : null}
            {step === 3 ? <RulesStep answers={answers} update={update} errors={errors} /> : null}
            {isReview ? (
              <ReviewStep answers={answers} prompts={prompts} dates={dates} onGoTo={goTo} />
            ) : null}
          </section>

          {formMessage ? (
            <Alert className="border-destructive/40 px-4 py-3">
              <AlertTitle>{formMessage}</AlertTitle>
            </Alert>
          ) : null}

          <div className="flex flex-col-reverse gap-3 border-t pt-6 sm:flex-row sm:justify-between">
            {step > 0 ? (
              <Button
                type="button"
                variant="outline"
                className="h-11 px-5"
                disabled={creating || opening}
                onClick={() => goTo(step - 1)}
              >
                Back
              </Button>
            ) : (
              <span />
            )}
            {!isReview ? (
              <Button type="button" className="h-11 px-5" onClick={next}>
                Next: {STEPS[step + 1]}
              </Button>
            ) : (
              <Button
                type="button"
                className="h-11 px-5"
                onClick={create}
                disabled={creating || opening}
              >
                {opening ? "Opening your challenge…" : creating ? "Creating…" : "Create challenge"}
              </Button>
            )}
          </div>
        </div>

        {/* The challenge as it is so far, on the right from 1024px and below the form on phones. */}
        {isReview ? (
          <WhatHappensNext />
        ) : (
          <Summary answers={answers} prompts={prompts} dates={dates} step={step} />
        )}
      </div>
    </div>
  );
}

/** Says the answers are from earlier, with a way to start over, and a way to undo that. */
function DraftNotice({
  draft,
  onStartOver,
  onUndo,
  onDismiss,
}: {
  draft: "restored" | "cleared";
  onStartOver: () => void;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg border bg-muted/40 py-1 pr-1 pl-4 text-sm">
      <output aria-live="polite">
        {draft === "restored"
          ? "Your answers from earlier in this tab are still here."
          : "The form is empty again."}
      </output>
      <span className="flex items-center gap-1">
        {draft === "restored" ? (
          <>
            <Button
              type="button"
              variant="ghost"
              className="h-11 px-3 md:h-8"
              onClick={onStartOver}
            >
              Start over
            </Button>
            <Button type="button" variant="ghost" className="h-11 px-3 md:h-8" onClick={onDismiss}>
              Keep going
            </Button>
          </>
        ) : (
          <Button type="button" variant="ghost" className="h-11 px-3 md:h-8" onClick={onUndo}>
            Undo
          </Button>
        )}
      </span>
    </div>
  );
}

const STEP_HEADINGS = [
  "Name your challenge",
  "Choose the prompts",
  "Choose when it runs",
  "Choose who sees it and what counts",
  "Check and create",
] as const;

// One plain sentence per step, for people who have never run a challenge.
const STEP_HINTS: ReactNode[] = [
  "Pick a name people will recognize when you send them the invite link.",
  <>
    Each day of the challenge gets one <TermHint hint={HINTS.prompt}>prompt</TermHint>. Pick a
    ready-made set, choose from Buffer's templates, or write your own.
  </>,
  "Decide when people start and which days have a prompt.",
  <>
    Decide who can see the <TermHint hint={HINTS.board}>board</TermHint> and the{" "}
    <TermHint hint={HINTS.recap}>recap</TermHint>, and which networks count.
  </>,
  <>
    Check everything below. After you create the challenge, you get an{" "}
    <TermHint hint={HINTS.invite}>invite link</TermHint> to share.
  </>,
];

/** Numbered steps. Steps already done are buttons, so you can go back to any of them. */
function Stepper({ step, onGoTo }: { step: number; onGoTo: (index: number) => void }) {
  return (
    <nav aria-label="Setup steps">
      <ol className="flex items-center gap-2">
        {STEPS.map((name, index) => {
          const done = index < step;
          const current = index === step;
          const mark = (
            <span
              aria-hidden="true"
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full font-medium text-xs",
                done && "bg-primary text-primary-foreground",
                current && "bg-accent text-accent-foreground ring-2 ring-primary",
                !done && !current && "bg-tile text-muted-foreground",
              )}
            >
              {done ? <CheckIcon className="size-3.5" /> : index + 1}
            </span>
          );
          // Below 768px only the current step has its name, and below 640px none do (the
          // heading right below says it), so five steps fit even a 320px screen.
          const label = (
            <span className={cn("text-sm", current ? "max-sm:sr-only" : "max-md:sr-only")}>
              {done ? <span className="sr-only">Done: </span> : null}
              {name}
            </span>
          );
          return (
            <li
              key={name}
              aria-current={current ? "step" : undefined}
              className={cn("flex items-center gap-2", index < STEPS.length - 1 && "flex-1")}
            >
              {done ? (
                <button
                  type="button"
                  onClick={() => onGoTo(index)}
                  className="-mx-1.5 flex min-h-11 items-center gap-2 rounded-md px-1.5 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {mark}
                  {label}
                </button>
              ) : (
                <span
                  className={cn(
                    "flex min-h-11 items-center gap-2",
                    current ? "font-medium text-foreground" : "text-muted-foreground",
                  )}
                >
                  {mark}
                  {label}
                </span>
              )}
              {index < STEPS.length - 1 ? (
                <span
                  aria-hidden="true"
                  className={cn("h-px min-w-3 flex-1", done ? "bg-primary" : "bg-border")}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** One prompt of a pack's pool, with the key the form stores for it. */
interface PoolItem {
  key: string;
  prompt: PromptDraft;
}

/** The prompts to draw from: one pack's pool, or every pack's for "Surprise me". */
function poolFor(sets: StarterSetView[], slug: string | null): PoolItem[] {
  return sets
    .filter((set) => slug === null || set.slug === slug)
    .flatMap((set) => set.pool.map((prompt, index) => ({ key: `${set.slug}#${index}`, prompt })));
}

function poolItem(sets: StarterSetView[], key: string): PoolItem | undefined {
  const [slug, index] = key.split("#");
  const prompt = sets.find((set) => set.slug === slug)?.pool[Number(index)];
  return prompt ? { key, prompt } : undefined;
}

/** `count` different items at random (a partial Fisher-Yates shuffle). */
function sample<T>(items: T[], count: number): T[] {
  const copy = [...items];
  for (let i = 0; i < Math.min(count, copy.length); i++) {
    const j = i + Math.floor(Math.random() * (copy.length - i));
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy.slice(0, count);
}

/** The curated days of a pack, as keys. */
function defaultPicks(set: StarterSetView): string[] {
  return set.prompts.map((_, index) => `${set.slug}#${index}`);
}

const SURPRISE_LENGTHS = [5, 7, 10, 14, 20] as const;

function promptsFor(
  answers: Answers,
  sets: StarterSetView[],
  library: Template[] | null,
): PromptDraft[] {
  const fromTemplate = (template: Template): PromptDraft => ({
    title: template.title,
    description: template.description,
    body: template.body,
    emoji: template.emoji,
    theme: "",
    steps: [],
    bufferTemplateId: template.id,
  });
  switch (answers.source.kind) {
    case "starter": {
      const slug = answers.source.slug;
      const set = sets.find((s) => s.slug === slug);
      if (!set) return [];
      // The host's swaps, when they are all from this pack; otherwise the curated days.
      const picked = answers.picks.flatMap((key) => {
        const item = poolItem(sets, key);
        return item && key.startsWith(`${slug}#`) ? [item.prompt] : [];
      });
      return picked.length === set.prompts.length ? picked : set.prompts;
    }
    case "surprise":
      return answers.picks.flatMap((key) => {
        const item = poolItem(sets, key);
        return item ? [item.prompt] : [];
      });
    case "library": {
      const byId = new Map((library ?? []).map((template) => [template.id, template]));
      return answers.pickedTemplateIds.flatMap((id) => {
        const template = byId.get(id);
        return template ? [fromTemplate(template)] : [];
      });
    }
    case "creator-camp":
      return (library ?? []).filter((t) => isCreatorCampTemplate(t.id)).map(fromTemplate);
    case "own":
      // Cards left completely empty are ignored; validation catches a card with no title.
      return answers.ownPrompts
        .filter((card) => card.title.trim())
        .map((card) => ({
          title: card.title.trim(),
          description: card.description.trim(),
          body: card.body.trim(),
          emoji: "",
          theme: card.theme.trim(),
          steps: (card.steps ?? "")
            .split("\n")
            .map((step) => step.replace(/^[-•*]\s*/, "").trim())
            .filter(Boolean)
            .slice(0, 8),
          bufferTemplateId: null,
        }));
  }
}

/** "Day 3 · Wed 11 Nov" for a shared start; just "Day 3" when each person starts on joining. */
function dayLabel(index: number, dates: string[], fixed: boolean): string {
  const date = dates[index];
  return fixed && date ? `Day ${index + 1} · ${formatDay(date)}` : `Day ${index + 1}`;
}

/** The challenge so far, beside the form: its name, every prompt by day, and its settings. */
function Summary({
  answers,
  prompts,
  dates,
  step,
}: {
  answers: Answers;
  prompts: PromptDraft[];
  dates: string[];
  step: number;
}) {
  const fixed = answers.startMode === "fixed";
  return (
    <aside
      aria-labelledby="summary-heading"
      className="flex flex-col gap-4 rounded-xl border bg-card p-4 lg:sticky lg:top-16"
    >
      <div className="flex flex-col gap-1">
        <h2 id="summary-heading" className="font-semibold text-sm">
          Your challenge
        </h2>
        <p className={cn("text-lg", !answers.title.trim() && "text-muted-foreground")}>
          {answers.title.trim() || "No name yet"}
        </p>
      </div>

      {/* Before the Prompts step nothing is chosen yet, even though a set is preselected. */}
      {step === 0 ? (
        <p className="border-t pt-4 text-muted-foreground text-sm">
          You choose the prompts in the next step.
        </p>
      ) : (
        <section aria-labelledby="summary-prompts" className="flex flex-col gap-2 border-t pt-4">
          <h3 id="summary-prompts" className="font-medium text-sm">
            {prompts.length === 0
              ? "No prompts yet"
              : `${prompts.length} ${prompts.length === 1 ? "prompt" : "prompts"}, one per day`}
          </h3>
          {prompts.length > 0 ? (
            <ol className="-mx-1 flex max-h-80 flex-col overflow-y-auto px-1">
              {prompts.map((prompt, index) => (
                <li
                  key={`${index}-${prompt.title}`}
                  className="flex flex-col border-b py-2 text-sm last:border-b-0"
                >
                  <span className="text-muted-foreground text-xs">
                    {dayLabel(index, dates, fixed)}
                  </span>
                  <span>{`${prompt.emoji} ${prompt.title}`.trim()}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-muted-foreground text-sm">The prompts you choose show here.</p>
          )}
          {prompts.length > 0 && !fixed ? (
            <p className="text-muted-foreground text-xs">Day 1 is the day each person joins.</p>
          ) : null}
        </section>
      )}

      {step >= 2 ? (
        <section aria-labelledby="summary-rules" className="flex flex-col gap-3 border-t pt-4">
          <h3 id="summary-rules" className="font-medium text-sm">
            Settings
          </h3>
          <RuleList rows={ruleRows(rulesOf(answers)).slice(0, step >= 3 ? undefined : 3)} />
        </section>
      ) : null}
    </aside>
  );
}

/** Beside the review: what creating the challenge does, so the last click holds no surprise. */
function WhatHappensNext() {
  const items = [
    "Your challenge opens, with you as its host and first member.",
    "You get an invite link to send to your team, community or class.",
    "Each day, everyone saves that day's prompt to Buffer as a draft and posts it from there.",
    "The board fills in as people post. When it ends, the recap shows the whole challenge.",
  ];
  return (
    <aside
      aria-labelledby="next-heading"
      className="flex flex-col gap-3 rounded-xl border bg-card p-4 lg:sticky lg:top-16"
    >
      <h2 id="next-heading" className="font-semibold text-sm">
        What happens next
      </h2>
      <ol className="flex flex-col gap-3">
        {items.map((item, index) => (
          <li key={item} className="flex gap-3 text-sm leading-6">
            <span
              aria-hidden="true"
              className="flex size-6 shrink-0 items-center justify-center rounded-full bg-tile font-medium text-muted-foreground text-xs"
            >
              {index + 1}
            </span>
            {item}
          </li>
        ))}
      </ol>
    </aside>
  );
}

/**
 * "Write your own": one card per day. Only the prompt is required; the explanation and the
 * draft text are optional. Adding a card moves focus to its prompt field; removing one moves
 * focus to the card that takes its place, or to the add button.
 */
function OwnPromptsEditor({
  prompts,
  onChange,
  untitledIndex,
}: {
  prompts: OwnPrompt[];
  onChange: (prompts: OwnPrompt[]) => void;
  untitledIndex: number;
}) {
  const baseId = useId();
  const addRef = useRef<HTMLButtonElement>(null);
  const fieldId = (key: string, field: string) => `${baseId}-${key}-${field}`;
  const focusPrompt = (key: string | undefined) =>
    requestAnimationFrame(() =>
      key ? document.getElementById(fieldId(key, "title"))?.focus() : addRef.current?.focus(),
    );
  const edit = (index: number, patch: Partial<OwnPrompt>) =>
    onChange(prompts.map((card, i) => (i === index ? { ...card, ...patch } : card)));
  const add = () => {
    const card = newOwnPrompt();
    onChange([...prompts, card]);
    focusPrompt(card.key);
  };
  const remove = (index: number) => {
    const next = prompts.filter((_, i) => i !== index);
    onChange(next);
    focusPrompt((next[index] ?? next[index - 1])?.key);
  };
  const fieldClass =
    "rounded-lg border bg-background px-3 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
  // Grows with its text and placeholder; never shorter than its lines plus equal top and
  // bottom padding (1lh is one line at the textarea's own line height).
  const textareaClass = "field-sizing-content resize-y py-2.5 leading-6";

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">
        Each card is one day, in this order. Only the prompt is needed.
      </p>
      {prompts.length === 0 ? (
        <p className="rounded-xl border border-dashed p-4 text-muted-foreground">
          No prompts yet. Add the first one.
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {prompts.map((card, index) => (
            <li key={card.key} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
              <div className="-my-1.5 flex items-center justify-between gap-2">
                <span className="font-medium text-sm">Day {index + 1}</span>
                <Button
                  type="button"
                  variant="ghost"
                  className="-mr-2 size-11 text-muted-foreground hover:text-destructive"
                  aria-label={`Remove day ${index + 1}`}
                  onClick={() => remove(index)}
                >
                  <Trash2Icon aria-hidden="true" />
                </Button>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor={fieldId(card.key, "title")} className="font-medium text-sm">
                  Prompt
                </label>
                <input
                  id={fieldId(card.key, "title")}
                  value={card.title}
                  maxLength={200}
                  onChange={(event) => edit(index, { title: event.target.value })}
                  placeholder="Share a tool you use every day"
                  aria-invalid={index === untitledIndex || undefined}
                  aria-describedby={index === untitledIndex ? "prompts-error" : undefined}
                  className={cn(fieldClass, "h-11 aria-invalid:border-destructive")}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor={fieldId(card.key, "description")} className="font-medium text-sm">
                  Explanation <span className="font-normal text-muted-foreground">(optional)</span>
                </label>
                <textarea
                  id={fieldId(card.key, "description")}
                  value={card.description}
                  maxLength={600}
                  rows={2}
                  onChange={(event) => edit(index, { description: event.target.value })}
                  placeholder="One or two sentences on what to post about."
                  className={cn(fieldClass, textareaClass, "min-h-[calc(2lh+1.25rem+2px)]")}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor={fieldId(card.key, "steps")} className="font-medium text-sm">
                  Steps <span className="font-normal text-muted-foreground">(optional)</span>
                </label>
                <textarea
                  id={fieldId(card.key, "steps")}
                  value={card.steps ?? ""}
                  rows={2}
                  onChange={(event) => edit(index, { steps: event.target.value })}
                  aria-describedby={fieldId(card.key, "steps-hint")}
                  placeholder={
                    "Think of a moment that gave you that feeling.\nShare what it helped you realize."
                  }
                  className={cn(fieldClass, textareaClass, "min-h-[calc(2lh+1.25rem+2px)]")}
                />
                <p id={fieldId(card.key, "steps-hint")} className="text-muted-foreground text-sm">
                  One step per line, up to 8. They show as a short list under the prompt.
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor={fieldId(card.key, "theme")} className="font-medium text-sm">
                  Theme <span className="font-normal text-muted-foreground">(optional)</span>
                </label>
                <input
                  id={fieldId(card.key, "theme")}
                  value={card.theme ?? ""}
                  maxLength={40}
                  onChange={(event) => edit(index, { theme: event.target.value })}
                  aria-describedby={fieldId(card.key, "theme-hint")}
                  placeholder="Consistency"
                  className={cn(fieldClass, "h-11 sm:max-w-xs")}
                />
                <p id={fieldId(card.key, "theme-hint")} className="text-muted-foreground text-sm">
                  A short label over the day, such as the week's theme.
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor={fieldId(card.key, "body")} className="font-medium text-sm">
                  Draft text <span className="font-normal text-muted-foreground">(optional)</span>
                </label>
                <textarea
                  id={fieldId(card.key, "body")}
                  value={card.body}
                  maxLength={2000}
                  rows={3}
                  onChange={(event) => edit(index, { body: event.target.value })}
                  aria-describedby={fieldId(card.key, "body-hint")}
                  placeholder="The tool I open first every morning is [tool], because…"
                  className={cn(fieldClass, textareaClass, "min-h-[calc(3lh+1.25rem+2px)]")}
                />
                <p id={fieldId(card.key, "body-hint")} className="text-muted-foreground text-sm">
                  The words each person's draft in Buffer starts with. Empty means the draft starts
                  with the prompt.
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
      <Button
        ref={addRef}
        type="button"
        variant="outline"
        className="h-11 w-fit gap-2 px-4"
        onClick={add}
        disabled={prompts.length >= MAX_PROMPTS}
      >
        <PlusIcon aria-hidden="true" />
        Add a prompt
      </Button>
      {prompts.length >= MAX_PROMPTS ? (
        <p className="text-muted-foreground text-sm">
          A challenge can have up to {MAX_PROMPTS} prompts.
        </p>
      ) : null}
    </div>
  );
}

function FieldError({ id, message }: { id: string; message: string | undefined }) {
  if (!message) return null;
  return (
    <p id={id} className="text-destructive text-sm">
      {message}
    </p>
  );
}

function NameStep({
  value,
  error,
  onChange,
}: {
  value: string;
  error: string | undefined;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="flex max-w-2xl flex-col gap-2">
      <label htmlFor={id} className="font-medium">
        Challenge name
      </label>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={80}
        autoComplete="off"
        placeholder="Five days of building in public"
        aria-invalid={Boolean(error)}
        aria-describedby={`${id}-hint ${id}-error`}
        className="h-11 rounded-lg border bg-background px-3 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive"
      />
      <p id={`${id}-hint`} className="text-muted-foreground text-sm">
        People see it on the invite page. In Buffer, each{" "}
        <TermHint hint={HINTS.draft}>draft</TermHint> from this challenge gets the tag "Daydeck:{" "}
        {value.trim() || "your challenge name"}", so you can find them later.
      </p>
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

function OptionCard({
  name,
  checked,
  onSelect,
  title,
  description,
  badge,
}: {
  name: string;
  checked: boolean;
  onSelect: () => void;
  title: string;
  description: ReactNode;
  badge?: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer gap-3 rounded-xl border bg-card p-4 transition-colors",
        "has-focus-visible:ring-3 has-focus-visible:ring-ring/50 hover:border-foreground/30",
        "has-checked:border-primary has-checked:bg-accent/50",
      )}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onSelect}
        className="mt-1 size-4 shrink-0 accent-primary"
      />
      <span className="flex flex-col gap-1">
        {/* The chip wraps as a whole onto its own line, never splitting its words. */}
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
          {title}
          {badge ? (
            <span className="whitespace-nowrap rounded-full bg-secondary px-2 py-0.5 font-normal text-secondary-foreground text-xs">
              {badge}
            </span>
          ) : null}
        </span>
        <span className="text-muted-foreground text-sm">{description}</span>
      </span>
    </label>
  );
}

/**
 * The days a pack or "Surprise me" gives. "Keep" locks a day, "Swap" draws another prompt for one
 * day, and "Shuffle" draws new prompts for every day that is not kept. The days stay in order,
 * so people do not lose track: only what they change changes.
 */
function PickedDays({
  answers,
  update,
  starterSets,
}: {
  answers: Answers;
  update: (patch: Partial<Answers>) => void;
  starterSets: StarterSetView[];
}) {
  const [said, setSaid] = useState("");
  const headingId = useId();
  const surprise = answers.source.kind === "surprise";
  const set =
    answers.source.kind === "starter"
      ? starterSets.find((s) => s.slug === (answers.source as { slug: string }).slug)
      : undefined;
  const pool = poolFor(starterSets, set ? set.slug : null);
  const prompts = promptsFor(answers, starterSets, null);
  // Keys of the days shown: the host's picks, or the pack's curated days before any swap.
  const keys =
    set && prompts === set.prompts
      ? defaultPicks(set)
      : answers.picks.filter((key) => poolItem(starterSets, key));
  const kept = answers.kept.filter((key) => keys.includes(key));
  const open = keys.length - kept.length;

  const shuffle = () => {
    const keptSet = new Set(kept);
    const replaced = keys.filter((key) => !keptSet.has(key));
    // New prompts first; the ones on screen come back only when the pool runs out.
    const fresh = sample(
      pool.filter((item) => !keys.includes(item.key)),
      replaced.length,
    ).map((item) => item.key);
    const draw = [...fresh, ...sample(replaced, replaced.length - fresh.length)];
    const next = keys.map((key) => (keptSet.has(key) ? key : (draw.shift() ?? key)));
    update({ picks: next });
    setSaid(
      kept.length > 0
        ? `New prompts for ${replaced.length} days. Your ${kept.length} kept days stay.`
        : "New prompts for every day.",
    );
  };
  const swap = (index: number) => {
    const unused = pool.filter((item) => !keys.includes(item.key));
    const [choice] = sample(unused, 1);
    if (!choice) return;
    const next = [...keys];
    next[index] = choice.key;
    update({ picks: next });
    setSaid(`Day ${index + 1} is now: ${choice.prompt.title}.`);
  };
  const toggleKeep = (index: number) => {
    const key = keys[index];
    if (!key) return;
    const on = !kept.includes(key);
    // Store the picks too, so a pack's curated days stay put once one is kept.
    update({ picks: keys, kept: on ? [...kept, key] : kept.filter((k) => k !== key) });
    setSaid(on ? `Day ${index + 1} is kept.` : `Day ${index + 1} can change again.`);
  };
  const setDays = (days: number) => {
    // Kept days survive a shorter challenge: they take the place of days that are not kept.
    const next = keys.slice(0, days);
    for (const key of kept.slice().reverse()) {
      if (next.includes(key)) continue;
      const free = next.findLastIndex((k) => !kept.includes(k));
      if (free !== -1) next[free] = key;
    }
    const extra = sample(
      pool.filter((item) => !next.includes(item.key)),
      days - next.length,
    ).map((item) => item.key);
    const picks = [...next, ...extra];
    update({ surpriseDays: days, picks, kept: kept.filter((key) => picks.includes(key)) });
  };

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-3 rounded-xl border bg-card p-4"
    >
      {surprise ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-medium text-sm">How many days?</legend>
          <div className="flex flex-wrap gap-2">
            {SURPRISE_LENGTHS.map((days) => (
              <label
                key={days}
                className="flex h-11 min-w-14 cursor-pointer items-center justify-center rounded-lg border px-3 text-sm has-checked:border-primary has-checked:bg-accent has-checked:font-medium has-checked:text-accent-foreground has-focus-visible:ring-3 has-focus-visible:ring-ring/50 md:h-9"
              >
                <input
                  type="radio"
                  name="surprise-days"
                  className="sr-only"
                  checked={answers.surpriseDays === days}
                  onChange={() => setDays(days)}
                />
                {days}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col">
          <h3 id={headingId} className="font-medium">
            Your {prompts.length} days
          </h3>
          <p className="text-muted-foreground text-sm">
            {surprise
              ? `Mixed from every pack (${pool.length} prompts). Keep the days you like, then shuffle the rest.`
              : `From this pack (${pool.length} prompts). Keep the days you like, then shuffle the rest.`}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-11 gap-2 px-3 md:h-9"
          disabled={open === 0}
          onClick={shuffle}
        >
          <ShuffleIcon aria-hidden="true" />
          {kept.length > 0 ? "Shuffle the rest" : "Shuffle all"}
        </Button>
      </div>
      <ol className="flex flex-col divide-y">
        {prompts.map((prompt, index) => {
          const key = keys[index];
          const isKept = key !== undefined && kept.includes(key);
          const label = `day ${index + 1}: ${prompt.title}`;
          return (
            <li
              key={key ?? index}
              className="grid grid-cols-[1fr_auto] gap-x-3 py-2.5 [grid-template-areas:'day_actions'_'text_text'] sm:grid-cols-[3rem_1fr_auto] sm:[grid-template-areas:'day_text_actions']"
            >
              <span className="self-center text-muted-foreground text-sm [grid-area:day] sm:self-start sm:pt-0.5">
                Day {index + 1}
              </span>
              <span className="flex min-w-0 flex-col [grid-area:text]">
                <span className="font-medium">{`${prompt.emoji} ${prompt.title}`.trim()}</span>
                {prompt.description ? (
                  <span className="text-muted-foreground text-sm leading-6">
                    {prompt.description}
                  </span>
                ) : null}
              </span>
              <span className="flex items-start gap-1 [grid-area:actions]">
                <Button
                  type="button"
                  variant="ghost"
                  className={cn(
                    "h-11 shrink-0 gap-1.5 px-2.5 text-muted-foreground md:h-8",
                    isKept &&
                      "bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent",
                  )}
                  aria-pressed={isKept}
                  aria-label={`Keep ${label}`}
                  onClick={() => toggleKeep(index)}
                >
                  {isKept ? <LockIcon aria-hidden="true" /> : <LockOpenIcon aria-hidden="true" />}
                  Keep
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 shrink-0 gap-1.5 px-2.5 text-muted-foreground md:h-8"
                  disabled={isKept || pool.length <= keys.length}
                  aria-label={`Swap ${label}`}
                  onClick={() => swap(index)}
                >
                  <RefreshCwIcon aria-hidden="true" />
                  Swap
                </Button>
              </span>
            </li>
          );
        })}
      </ol>
      <output aria-live="polite" className="sr-only">
        {said}
      </output>
    </section>
  );
}

function PromptsStep({
  answers,
  update,
  starterSets,
  creatorCamp,
  library,
  libraryState,
  loadLibrary,
  error,
}: {
  answers: Answers;
  update: (patch: Partial<Answers>) => void;
  starterSets: StarterSetView[];
  creatorCamp: boolean;
  library: Template[] | null;
  libraryState: { loading: boolean; error: string | null };
  loadLibrary: () => Promise<void>;
  error: string | undefined;
}) {
  const [search, setSearch] = useState("");
  const searchId = useId();
  const source = answers.source;

  // Forgiving search: words in any order, small typos and accents are fine. Best match first.
  const visibleTemplates = fuzzySearch(library ?? [], search, (template) => [
    template.title,
    template.description,
  ]);

  return (
    <div className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-medium">Where the prompts come from</legend>
        <div className="grid gap-3 md:grid-cols-2">
          {starterSets.map((set, index) => (
            <OptionCard
              key={set.slug}
              name="prompt-source"
              checked={source.kind === "starter" && source.slug === set.slug}
              onSelect={() =>
                update({
                  source: { kind: "starter", slug: set.slug },
                  picks: defaultPicks(set),
                  kept: [],
                })
              }
              title={`${set.title} · ${set.prompts.length} days`}
              description={set.description}
              badge={index === 0 ? "Good first challenge" : undefined}
            />
          ))}
          <OptionCard
            name="prompt-source"
            checked={source.kind === "surprise"}
            onSelect={() =>
              update({
                source: { kind: "surprise" },
                picks: sample(poolFor(starterSets, null), answers.surpriseDays).map((i) => i.key),
                kept: [],
              })
            }
            title="Surprise me"
            description="Choose how many days, and Daydeck mixes prompts from every pack. Swap any you do not like."
          />
          {creatorCamp ? (
            <OptionCard
              name="prompt-source"
              checked={source.kind === "creator-camp"}
              onSelect={() => {
                update({ source: { kind: "creator-camp" } });
                void loadLibrary();
              }}
              title={CREATOR_CAMP_CREDIT}
              description="Buffer's public Creator Camp prompts, read from its template library, one per day. Daydeck is not made by Buffer."
            />
          ) : null}
          <OptionCard
            name="prompt-source"
            checked={source.kind === "library"}
            onSelect={() => {
              update({ source: { kind: "library" } });
              void loadLibrary();
            }}
            title="Pick from Buffer's templates"
            description="Choose prompts one by one from Buffer's public template library."
          />
          <OptionCard
            name="prompt-source"
            checked={source.kind === "own"}
            onSelect={() =>
              update({
                source: { kind: "own" },
                ownPrompts: answers.ownPrompts.length > 0 ? answers.ownPrompts : [newOwnPrompt()],
              })
            }
            title="Write your own"
            description="One card per day: the prompt, and if you like an explanation and the draft text."
          />
        </div>
      </fieldset>

      {source.kind === "starter" || source.kind === "surprise" ? (
        <PickedDays answers={answers} update={update} starterSets={starterSets} />
      ) : null}

      {source.kind === "own" ? (
        <OwnPromptsEditor
          prompts={answers.ownPrompts}
          onChange={(ownPrompts) => update({ ownPrompts })}
          // After a failed "Next", mark the card whose prompt is missing.
          untitledIndex={
            error
              ? answers.ownPrompts.findIndex(
                  (card) => !card.title.trim() && (card.description.trim() || card.body.trim()),
                )
              : -1
          }
        />
      ) : null}

      {(source.kind === "library" || source.kind === "creator-camp") && libraryState.loading ? (
        // The same shape as the list that replaces it, so nothing jumps when it arrives.
        <div aria-busy="true" className="flex flex-col gap-3">
          <output className="sr-only">Loading Buffer's template library…</output>
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-11 w-full rounded-lg" />
          <Skeleton className="h-5 w-64" />
          <ul aria-hidden="true" className="flex flex-col gap-2 rounded-xl border p-2">
            {[0, 1, 2, 3, 4, 5].map((row) => (
              <li key={row} className="flex items-start gap-3 p-2">
                <Skeleton className="mt-1 size-4 shrink-0 rounded-sm" />
                <span className="flex flex-1 flex-col gap-2">
                  <Skeleton className={cn("h-4", row % 2 === 0 ? "w-2/3" : "w-1/2")} />
                  <Skeleton className={cn("h-3.5", row % 3 === 0 ? "w-5/6" : "w-3/4")} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {(source.kind === "library" || source.kind === "creator-camp") && libraryState.error ? (
        <Alert className="border-destructive/40 px-4 py-3">
          <AlertTitle>The template library could not be loaded</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3">
            <p>{libraryState.error}</p>
          </AlertDescription>
        </Alert>
      ) : null}

      {source.kind === "creator-camp" &&
      library &&
      promptsFor(answers, starterSets, library).length === 0 ? (
        // Buffer adds and retires Creator Camp prompts; none found is a state, not an error.
        <Alert className="px-4 py-3">
          <AlertTitle>Creator Camp's prompts are not in Buffer's library right now</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3">
            <p>
              Buffer changes them from time to time. You can pick from all of Buffer's templates.
            </p>
            <Button
              type="button"
              variant="outline"
              className="h-11 px-4 md:h-9"
              onClick={() => update({ source: { kind: "library" } })}
            >
              Pick from Buffer's templates
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {source.kind === "library" && library ? (
        <div className="flex flex-col gap-3">
          <label htmlFor={searchId} className="font-medium">
            Search {library.length} templates
          </label>
          <input
            id={searchId}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-11 rounded-lg border bg-background px-3 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <p className="text-muted-foreground text-sm" aria-live="polite">
            {search.trim() ? `${visibleTemplates.length} of ${library.length} match. ` : ""}
            {answers.pickedTemplateIds.length} chosen. They run in the order you pick them.
          </p>
          {visibleTemplates.length === 0 ? (
            <p className="rounded-xl border border-dashed p-4 text-muted-foreground">
              No template matches "{search.trim()}". Try fewer or shorter words.
            </p>
          ) : null}
          <ul
            className={cn(
              "flex max-h-96 flex-col gap-2 overflow-y-auto rounded-xl border p-2",
              visibleTemplates.length === 0 && "hidden",
            )}
          >
            {visibleTemplates.map((template) => {
              const position = answers.pickedTemplateIds.indexOf(template.id);
              return (
                <li key={template.id}>
                  <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg p-2 hover:bg-muted has-focus-visible:ring-3 has-focus-visible:ring-ring/50">
                    <input
                      type="checkbox"
                      checked={position >= 0}
                      onChange={(event) =>
                        update({
                          pickedTemplateIds: event.target.checked
                            ? [...answers.pickedTemplateIds, template.id]
                            : answers.pickedTemplateIds.filter((id) => id !== template.id),
                        })
                      }
                      className="mt-1 size-4 accent-primary"
                    />
                    <span className="flex flex-col">
                      <span className="font-medium">
                        {`${template.emoji} ${template.title}`.trim()}
                        {position >= 0 ? (
                          <span className="ml-2 text-primary text-sm">Day {position + 1}</span>
                        ) : null}
                      </span>
                      <span className="text-muted-foreground text-sm">{template.description}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <FieldError id="prompts-error" message={error} />
    </div>
  );
}

function ScheduleStep({
  answers,
  update,
  today,
  timeZones,
  suggestedZone,
  dates,
  errors,
}: {
  answers: Answers;
  update: (patch: Partial<Answers>) => void;
  today: string;
  timeZones: string[];
  suggestedZone: string;
  dates: string[];
  errors: Record<string, string>;
}) {
  const dateId = useId();
  const zoneId = useId();
  // The time and day in the chosen zone; the clock moves on every minute.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const fixed = answers.startMode === "fixed";
  const first = dates[0];
  const last = dates.at(-1);

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-medium">When does each person start?</legend>
        <OptionCard
          name="start-mode"
          checked={!fixed}
          onSelect={() => update({ startMode: "rolling" })}
          title="On the day they join"
          description="People join any time and get day 1 straight away. Good for an open, ongoing challenge."
        />
        <OptionCard
          name="start-mode"
          checked={fixed}
          onSelect={() => update({ startMode: "fixed" })}
          title="Everyone on the same date"
          description="The group starts together and moves through the prompts day by day."
        />
      </fieldset>

      {fixed ? (
        <div className="flex flex-col gap-6 rounded-xl border bg-card p-4">
          <div className="flex flex-col gap-2">
            <label htmlFor={dateId} className="font-medium">
              Start date
            </label>
            <StartDateField
              id={dateId}
              value={answers.startDate}
              min={today}
              weekdaysOnly={answers.cadence === "weekdays"}
              invalid={Boolean(errors.startDate)}
              describedBy={`${dateId}-hint ${dateId}-error`}
              onChange={(startDate) => update({ startDate })}
            />
            <p id={`${dateId}-hint`} className="text-muted-foreground text-sm">
              Only a date: each challenge day runs from midnight to midnight, and people post at any
              time of day that suits them.
            </p>
            <FieldError id={`${dateId}-error`} message={errors.startDate} />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor={zoneId} className="font-medium">
              Time zone
            </label>
            <TimeZoneField
              id={zoneId}
              value={answers.timezone}
              timeZones={timeZones}
              suggested={suggestedZone}
              invalid={Boolean(errors.timezone)}
              describedBy={`${zoneId}-now ${zoneId}-hint ${zoneId}-error`}
              onChange={(timezone) => update({ timezone })}
            />
            {answers.timezone ? (
              <p id={`${zoneId}-now`} className="text-sm">
                {zoneNowSentence(answers.timezone, now)}
              </p>
            ) : null}
            <p id={`${zoneId}-hint`} className="text-muted-foreground text-sm">
              Days start and end at midnight in this time zone, for everyone in the group.
            </p>
            <FieldError id={`${zoneId}-error`} message={errors.timezone} />
          </div>
        </div>
      ) : null}

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-medium">Which days have a prompt?</legend>
        <OptionCard
          name="cadence"
          checked={answers.cadence === "daily"}
          onSelect={() => update({ cadence: "daily" })}
          title="Every day"
          description="One prompt each day, weekends included."
        />
        <OptionCard
          name="cadence"
          checked={answers.cadence === "weekdays"}
          onSelect={() => update({ cadence: "weekdays" })}
          title="Monday to Friday"
          description="No prompts on Saturday and Sunday."
        />
      </fieldset>

      {first && last ? (
        <p className="rounded-lg bg-muted p-3 text-sm">
          {fixed ? "The group gets day 1 on " : "Someone who joins today gets day 1 on "}
          {formatDay(first)}
          {dates.length > 1 ? ` and the last day on ${formatDay(last)}.` : "."}
          {fixed ? null : " Each person's days follow the time zone of their own Buffer account."}
        </p>
      ) : null}
    </div>
  );
}

function RulesStep({
  answers,
  update,
  errors,
}: {
  answers: Answers;
  update: (patch: Partial<Answers>) => void;
  errors: Record<string, string>;
}) {
  const networksId = useId();
  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-medium">
          Who can see the <TermHint hint={HINTS.board}>board</TermHint> and the{" "}
          <TermHint hint={HINTS.recap}>recap</TermHint>?
        </legend>
        <OptionCard
          name="visibility"
          checked={answers.visibility === "private"}
          onSelect={() => update({ visibility: "private", showOnHome: false })}
          title="Only people in the challenge"
          description="Joining needs the invite link. Nobody else sees anyone's days."
        />
        <OptionCard
          name="visibility"
          checked={answers.visibility === "public"}
          onSelect={() => update({ visibility: "public" })}
          title="Anyone with the link"
          description="Visitors see everyone's days. Links to posts show only for people who choose to share them."
        />
        {answers.visibility === "public" ? (
          // Belongs to "Anyone with the link", so it sits right under it. Off unless chosen.
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border bg-card p-4 has-focus-visible:ring-3 has-focus-visible:ring-ring/50 sm:ml-8">
            <input
              type="checkbox"
              checked={answers.showOnHome}
              onChange={(event) => update({ showOnHome: event.target.checked })}
              className="mt-0.5 size-4 shrink-0 accent-primary"
            />
            <span className="flex flex-col gap-1">
              <span className="font-medium text-sm leading-5">
                Also show it under Popular challenges on Daydeck's homepage
              </span>
              <span className="text-muted-foreground text-xs leading-5">
                Anyone on the homepage can then find it and join. It shows only while it is active:{" "}
                {VERY_ACTIVE_WORDS}.
              </span>
            </span>
          </label>
        ) : null}
        <p className="text-muted-foreground text-sm">You can change this later.</p>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-medium">Which networks count?</legend>
        <OptionCard
          name="network-mode"
          checked={answers.networkMode === "any"}
          onSelect={() => update({ networkMode: "any" })}
          title="Any network"
          badge="Recommended"
          description="Each person picks the channels they use. More people can take part."
        />
        <OptionCard
          name="network-mode"
          checked={answers.networkMode === "some"}
          onSelect={() => update({ networkMode: "some" })}
          title="Only the networks I choose"
          description="For example, a LinkedIn challenge. People can only pick channels on these networks."
        />
        {answers.networkMode === "some" ? (
          <div className="flex flex-col gap-2 rounded-xl border bg-card p-4">
            <p id={networksId} className="font-medium text-sm">
              Posts on these networks count
            </p>
            <NetworkChips
              value={answers.allowedServices}
              describedBy={`${networksId} ${networksId}-error`}
              onChange={(allowedServices) => update({ allowedServices })}
            />
            <FieldError id={`${networksId}-error`} message={errors.allowedServices} />
          </div>
        ) : null}
        <p className="text-muted-foreground text-sm">
          This cannot change after you create the challenge, so everyone plays by the same rules.
        </p>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-medium">
          Group chat in <TermHint hint={HINTS.community}>Community</TermHint>?
        </legend>
        <OptionCard
          name="chat"
          checked={answers.chatEnabled}
          onSelect={() => update({ chatEnabled: true })}
          title="Chat on"
          badge="Recommended"
          description="Everyone can chat and share their post of the day, with reactions and replies. Like a Discord server, inside the challenge."
        />
        <OptionCard
          name="chat"
          checked={!answers.chatEnabled}
          onSelect={() => update({ chatEnabled: false })}
          title="Chat off"
          description="For groups that already talk somewhere else. Updates from you and feedback on drafts stay on."
        />
        <p className="text-muted-foreground text-sm">You can change this later.</p>
      </fieldset>
    </div>
  );
}

/** Everything the challenge will be, with a way back to each part. */
function ReviewStep({
  answers,
  prompts,
  dates,
  onGoTo,
}: {
  answers: Answers;
  prompts: PromptDraft[];
  dates: string[];
  onGoTo: (step: number) => void;
}) {
  const fixed = answers.startMode === "fixed";
  const rows = ruleRows(rulesOf(answers));
  return (
    <div className="flex flex-col gap-4">
      <ReviewCard title="Name" step={0} onGoTo={onGoTo}>
        <p className="text-lg">{answers.title.trim()}</p>
      </ReviewCard>

      <ReviewCard
        title={`Prompts · ${prompts.length} ${prompts.length === 1 ? "day" : "days"}`}
        step={1}
        onGoTo={onGoTo}
      >
        <ol className="flex flex-col divide-y">
          {prompts.map((prompt, index) => (
            <li
              key={`${index}-${prompt.title}`}
              className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:gap-4"
            >
              <span className="w-32 shrink-0 text-muted-foreground text-sm">
                {dayLabel(index, dates, fixed)}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2 font-medium">
                  {`${prompt.emoji} ${prompt.title}`.trim()}
                  {prompt.theme ? (
                    <span className="rounded-full bg-accent px-2 py-0.5 font-normal text-accent-foreground text-xs">
                      {prompt.theme}
                    </span>
                  ) : null}
                </span>
                {prompt.description ? (
                  <span className="text-muted-foreground text-sm leading-6">
                    {prompt.description}
                  </span>
                ) : null}
                {prompt.steps.length > 0 ? (
                  <ul className="list-disc pl-5 text-muted-foreground text-sm leading-6">
                    {prompt.steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ul>
                ) : null}
                {/* What each person's draft in Buffer starts with, as they will see it. */}
                <span className="mt-1 flex flex-col gap-1 rounded-md bg-muted px-3 py-2 text-sm">
                  <span className="text-muted-foreground text-xs">Draft in Buffer starts with</span>
                  <span className="whitespace-pre-line leading-6 wrap-anywhere">
                    {prompt.body.trim() || prompt.title.trim()}
                  </span>
                </span>
              </span>
            </li>
          ))}
        </ol>
        {!fixed ? (
          <p className="text-muted-foreground text-sm">Day 1 is the day each person joins.</p>
        ) : null}
      </ReviewCard>

      <div className="grid gap-4 md:grid-cols-2">
        <ReviewCard title="When it runs" step={2} onGoTo={onGoTo}>
          <RuleList rows={rows.slice(0, 3)} />
        </ReviewCard>
        <ReviewCard title="Who sees it and what counts" step={3} onGoTo={onGoTo}>
          <RuleList rows={rows.slice(3)} />
        </ReviewCard>
      </div>
    </div>
  );
}

function ReviewCard({
  title,
  step,
  onGoTo,
  children,
}: {
  title: string;
  step: number;
  onGoTo: (step: number) => void;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="-my-1 flex items-center justify-between gap-3">
        <h3 className="font-semibold text-sm">{title}</h3>
        <Button
          type="button"
          variant="ghost"
          className="-mr-2 h-11 gap-1.5 px-3 text-muted-foreground md:h-8"
          onClick={() => onGoTo(step)}
        >
          <PencilIcon aria-hidden="true" />
          Change<span className="sr-only"> {title.split(" · ")[0]?.toLowerCase()}</span>
        </Button>
      </div>
      {children}
    </section>
  );
}
