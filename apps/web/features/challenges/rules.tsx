import { cn } from "@daydeck/ui/lib/utils";
import {
  CalendarDaysIcon,
  EyeIcon,
  GlobeIcon,
  type LucideIcon,
  MessagesSquareIcon,
  RepeatIcon,
  ShareIcon,
} from "lucide-react";
import { serviceName } from "@/features/settings/services";
import { formatDay } from "./format";

// A challenge's settings in plain words: when it starts, which days have a prompt, its time
// zone, who can see the board and recap, and which networks count. The setup form's last step
// and the Settings card on a challenge's page both show them, so they always read the same.

/** True when posts on this Buffer service count for the challenge. An empty list means all. */
export function countsOnNetwork(allowed: string[], service: string): boolean {
  return allowed.length === 0 || allowed.includes(service);
}

/** "Any network", or the networks by name: "LinkedIn", "LinkedIn and X", "LinkedIn, X and Threads". */
export function networksText(allowed: string[]): string {
  if (allowed.length === 0) return "Any network";
  const names = allowed.map(serviceName);
  if (names.length === 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

export interface ChallengeRulesInput {
  startMode: "rolling" | "fixed";
  /** The fixed start date, for "fixed" challenges. */
  startDate: string;
  cadence: "daily" | "weekdays";
  timezone: string;
  visibility: "private" | "public";
  allowedServices: string[];
  /** Group chat and shared posts. */
  chatEnabled?: boolean;
  /** Listed under "Popular challenges" on the homepage while active. Only with a public recap. */
  showOnHome?: boolean;
}

export function ruleRows(
  input: ChallengeRulesInput,
): { Icon: LucideIcon; term: string; value: string }[] {
  return [
    {
      Icon: CalendarDaysIcon,
      term: "Start",
      value:
        input.startMode === "fixed"
          ? `Everyone together, on ${formatDay(input.startDate)}`
          : "Each person on the day they join",
    },
    {
      Icon: RepeatIcon,
      term: "Prompt days",
      value: input.cadence === "daily" ? "Every day" : "Monday to Friday",
    },
    {
      Icon: GlobeIcon,
      term: "Time zone",
      value:
        input.startMode === "fixed"
          ? `${input.timezone.replaceAll("_", " ")}, for everyone`
          : "Each person's own Buffer time zone",
    },
    {
      Icon: EyeIcon,
      term: "Board and recap",
      value:
        input.visibility !== "public"
          ? "Only people in the challenge"
          : input.showOnHome
            ? "Anyone with the link, and on Daydeck's homepage while active"
            : "Anyone with the link",
    },
    { Icon: ShareIcon, term: "Networks that count", value: networksText(input.allowedServices) },
    {
      Icon: MessagesSquareIcon,
      term: "Group chat",
      value:
        input.chatEnabled === false
          ? "Off: only updates and feedback on drafts"
          : "On: chat, shared posts and reactions",
    },
  ];
}

/** Setting rows as a list. The icon sits in the term, so each row stays a plain dt and dd. */
export function RuleList({
  rows,
  className,
}: {
  rows: ReturnType<typeof ruleRows>;
  className?: string;
}) {
  return (
    <dl className={cn("flex flex-col gap-3 text-sm", className)}>
      {rows.map(({ Icon, term, value }) => (
        <div key={term} className="relative flex flex-col pl-7">
          <dt className="text-muted-foreground text-xs">
            <Icon
              aria-hidden="true"
              className="absolute top-0.5 left-0 size-4 text-muted-foreground"
            />
            {term}
          </dt>
          <dd className="font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** All of a challenge's settings as a short list with icons. */
export function ChallengeRules({
  rules,
  className,
}: {
  rules: ChallengeRulesInput;
  className?: string;
}) {
  return <RuleList rows={ruleRows(rules)} className={className} />;
}
