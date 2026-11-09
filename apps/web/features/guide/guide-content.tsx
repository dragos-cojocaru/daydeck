import {
  BookOpenIcon,
  CalendarClockIcon,
  CheckIcon,
  FlameIcon,
  HashIcon,
  type LucideIcon,
  MegaphoneIcon,
  MessageSquareTextIcon,
  MessagesSquareIcon,
  PlugIcon,
  RadioTowerIcon,
  SendIcon,
  Share2Icon,
  ShieldCheckIcon,
  SparklesIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import Link from "next/link";
import { PageContents } from "@/components/page-contents";
import { StateMark } from "@/features/board/state-mark";
import { STATE_LABELS } from "@/features/board/state-words";
import { VERY_ACTIVE_WORDS } from "@/lib/home-listing";

// What Daydeck is and how it works, in plain words. Written once and shown on two pages:
// /how-it-works for visitors, /guide inside the app. The section IDs stay the same, because
// other pages link to them (the AI matching card links to #ai-heading).

const SECTIONS = [
  { id: "steps-heading", label: "The steps" },
  { id: "words-heading", label: "Words you will see" },
  { id: "ai-heading", label: "Posts you write in Buffer" },
  { id: "community-heading", label: "Community" },
  { id: "faq-heading", label: "Questions" },
  { id: "buffer-heading", label: "What Daydeck does in Buffer" },
  { id: "data-heading", label: "Your data" },
] as const;

const STEPS: { title: string; text: string; Icon: LucideIcon }[] = [
  {
    title: "Connect Buffer",
    text: "You approve access on Buffer's own site. Daydeck never publishes anything for you.",
    Icon: PlugIcon,
  },
  {
    title: "Choose your channels",
    text: "Pick the social accounts in your Buffer whose posts count, such as your LinkedIn or X.",
    Icon: RadioTowerIcon,
  },
  {
    title: "Host or join a challenge",
    text: "A host picks the prompts, the dates and the rules, then shares an invite link. Everyone else opens that link to join, or picks an active public challenge under Popular challenges.",
    Icon: UsersIcon,
  },
  {
    title: "Save each day's prompt to Buffer",
    text: "It arrives in Buffer as a draft on your channels. Give it a time on the Schedule page, or write and schedule it in Buffer as you always do.",
    Icon: CalendarClockIcon,
  },
  {
    title: "Publish, and the day is checked off",
    text: "Once the post is published, Daydeck marks the day as posted on the board. Missed a day? Post it later and it counts as caught up.",
    Icon: FlameIcon,
  },
  {
    title: "Cheer each other on",
    text: "In the challenge's Community you read the host's updates, chat, share your post of the day and give feedback on drafts.",
    Icon: MessagesSquareIcon,
  },
];

const WORDS: [string, string][] = [
  ["Challenge", "A shared posting goal: a start, a number of days and one prompt for each day."],
  [
    "Prompt",
    'A short idea for what to post that day, such as "Share a tool you use every day". It can have an explanation, steps and a theme. You write the post yourself.',
  ],
  ["Host", "The person who sets up a challenge and invites others. Hosts take part too."],
  [
    "Channel",
    "One social account in your Buffer, such as your LinkedIn profile or your X account.",
  ],
  [
    "Draft",
    "A post saved in Buffer that is not published yet. Nothing goes out until you schedule or publish it.",
  ],
  [
    "Schedule",
    "The page that gives each of your next seven days a time, from your Buffer posting schedule or a time you pick. The days stay drafts until you schedule them in Buffer.",
  ],
  [
    "Board",
    "A page where everyone in the challenge sees each other's days, as a calendar or as one row per person.",
  ],
  [
    "Recap",
    "One page with the whole challenge at a glance, and a badge for each person to download and share.",
  ],
  [
    "Community",
    "The challenge's own space: updates from the host, a chat, shared posts and feedback on drafts.",
  ],
  ["Catch up", "A past day without a post. There is no penalty: post it when you can."],
  ["Invite link", "The link that lets someone join a challenge. Anyone who has it can join."],
];

/** The day states, in the order the board's legend lists them. */
const STATES = ["open", "saved", "planned", "done", "caught_up", "missed", "paused"] as const;

const AI_CASES: [string, string][] = [
  [
    "When it is sure",
    "Daydeck gives the post that day. The day is checked off once the post is published.",
  ],
  [
    "When it is not sure",
    "A “Check this post” box appears on the challenge's page. Answer yes, no, or choose another day.",
  ],
  ["When no prompt fits", "The post shows under “Other posts”. You can still give it a day there."],
];

const PLACES: { label: string; text: string; Icon: LucideIcon }[] = [
  {
    label: "Updates",
    text: "News from the host. When everyone starts on the same date, each day's prompt appears here too. Everyone can react.",
    Icon: MegaphoneIcon,
  },
  {
    label: "Chat",
    text: "Questions, wins and anything about the challenge, with replies and reactions.",
    Icon: HashIcon,
  },
  {
    label: "Posts",
    text: "Share the link to your published post. It shows as a card with the network's logo, so others can open it, react and reply.",
    Icon: Share2Icon,
  },
  {
    label: "Feedback",
    text: "Drafts people asked about before posting. Replies are also saved as Notes on that draft in Buffer.",
    Icon: MessageSquareTextIcon,
  },
];

const FAQ: [string, string][] = [
  [
    "Do drafts and scheduled posts count?",
    "They show your day as saved or scheduled. A day is checked off only once a post is published.",
  ],
  [
    "Can one day go out on several networks?",
    "Yes. Choose several channels when you save a prompt. Daydeck makes one draft on each, and the day counts once, as soon as the first one is published.",
  ],
  [
    "Can one post count in two challenges?",
    "No. If two of your challenges use the same channel, the challenge that records the post first keeps it. The other shows it under “Other posts”, marked with the challenge it counts for, so a post is never counted twice.",
  ],
  [
    "Can a host choose which networks count?",
    "Yes. When setting up a challenge, the host keeps “Any network” or chooses networks, such as LinkedIn only. People then pick channels on those networks when they join. This cannot change after the challenge is created.",
  ],
  [
    "What does “Check Buffer now” do?",
    "Daydeck reads your posts in Buffer on its own, about every hour during the day. “Check Buffer now” reads them straight away, for a post you just published. Each post goes to AI at most once, and again only if you change its text.",
  ],
  [
    "What if I miss a day?",
    "Nothing bad happens. The day shows under “Past days”, and you can still post it later; it then counts as caught up.",
  ],
  [
    "What can a host do about people?",
    "From a person's card in Community, the host can delete their messages, remove them (they can join again with the invite link) or ban them (their Buffer account can never join that challenge again). The host can also pause joining or make a new invite link.",
  ],
  [
    "How does a challenge get under Popular challenges?",
    `Its host turns on “Show it under Popular challenges”, when creating it or later on the challenge's page, and its recap is set to “Anyone with the link”. It then shows on Daydeck's homepage while it is active: ${VERY_ACTIVE_WORDS}. Making the recap private, pausing joining, making a new invite link or closing the challenge takes it off at once.`,
  ],
  [
    "What do visitors see of a challenge on the homepage?",
    "Its title, the host's name and picture, and the board. Names show only for people who turned on “Show my name and post links”; everyone else is an unnamed row, on the card, the invite page and the recap.",
  ],
  [
    "What happens when a challenge ends?",
    "It stays in your sidebar for three more days, so you can catch up and open the recap. Then it moves to the Finished tab on “Your challenges”. Its data is deleted 30 days after it closes.",
  ],
];

const DOES = [
  "Read your channels, the posts on the channels you choose, and whether the ideas it saved for you are still there.",
  "Create drafts and ideas from the prompts you save, with a time when you use Schedule.",
  "Tag those drafts with the challenge's name, so you can find them in Buffer.",
  "Add the group's replies as Notes on a draft you asked feedback for.",
];

const NEVER = [
  "Publish or schedule a post for you. You do that in Buffer.",
  "See your Buffer password. You approve access on Buffer's own site.",
  "Change or delete your posts in Buffer.",
];

function SectionHeading({ id, title, lead }: { id: string; title: string; lead?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 id={id} className="scroll-mt-20 font-semibold text-xl tracking-tight">
        {title}
      </h2>
      {lead ? <p className="max-w-3xl text-muted-foreground leading-relaxed">{lead}</p> : null}
    </div>
  );
}

/** The guide's text, from its heading to the end. Each page adds its own frame around it. */
export function GuideContent() {
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_14rem] lg:items-start">
      <div className="flex min-w-0 flex-col gap-12">
        <header className="flex flex-col gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <BookOpenIcon aria-hidden="true" className="size-5" />
          </span>
          <h1 className="font-semibold text-3xl tracking-tight">How Daydeck works</h1>
          <p className="max-w-3xl text-lg text-muted-foreground leading-relaxed">
            Daydeck helps a group post on social media every day for a set number of days, using
            Buffer. It is made for teams, communities and classes that want to build a posting habit
            together.
          </p>
        </header>

        <section aria-labelledby="steps-heading" className="flex flex-col gap-4">
          <SectionHeading id="steps-heading" title="The steps, in order" />
          <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {STEPS.map(({ title, text, Icon }, index) => (
              <li key={title} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="flex size-7 items-center justify-center rounded-full bg-accent font-semibold text-accent-foreground text-xs"
                  >
                    {index + 1}
                  </span>
                  <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
                </span>
                <span className="flex flex-col gap-1">
                  <span className="font-medium">{title}</span>
                  <span className="text-muted-foreground text-sm leading-6">{text}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="words-heading" className="flex flex-col gap-4">
          <SectionHeading id="words-heading" title="Words you will see" />
          <dl className="grid gap-3 sm:grid-cols-2">
            {WORDS.map(([term, meaning]) => (
              <div key={term} className="flex flex-col gap-1 rounded-xl border bg-card p-4">
                <dt className="font-medium">{term}</dt>
                <dd className="text-muted-foreground text-sm leading-6">{meaning}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
            <h3 className="font-medium">What a day's icon means</h3>
            <ul className="grid gap-2 text-sm sm:grid-cols-2">
              {STATES.map((state) => (
                <li key={state} className="flex items-center gap-2">
                  <StateMark state={state} size="md" />
                  {STATE_LABELS[state]}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="ai-heading" className="flex flex-col gap-4">
          <SectionHeading
            id="ai-heading"
            title="Posts you write straight in Buffer"
            lead="You do not have to start from a Daydeck draft. When you write a post straight in Buffer on one of your challenge channels, Daydeck uses AI to find the day it is for."
          />
          <div className="grid gap-3 sm:grid-cols-3">
            {AI_CASES.map(([title, text]) => (
              <div key={title} className="flex flex-col gap-1 rounded-xl border bg-card p-4">
                <span className="flex items-center gap-2 font-medium">
                  <SparklesIcon aria-hidden="true" className="size-4 text-primary" />
                  {title}
                </span>
                <span className="text-muted-foreground text-sm leading-6">{text}</span>
              </div>
            ))}
          </div>
          <p className="max-w-3xl text-muted-foreground text-sm leading-6">
            The AI reads only the post's text and the challenge's prompts: their titles,
            explanations and steps. Daydeck keeps no copy of the post's text.
          </p>
        </section>

        <section aria-labelledby="community-heading" className="flex flex-col gap-4">
          <SectionHeading
            id="community-heading"
            title="Community"
            lead="Each challenge has its own space for the group, under the Community tab. New messages show as a number in the sidebar and on the tab."
          />
          <ul className="grid gap-3 sm:grid-cols-2">
            {PLACES.map(({ label, text, Icon }) => (
              <li key={label} className="flex gap-3 rounded-xl border bg-card p-4">
                <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span className="flex flex-col gap-1">
                  <span className="font-medium">{label}</span>
                  <span className="text-muted-foreground text-sm leading-6">{text}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="max-w-3xl text-muted-foreground text-sm leading-6">
            Only people in the challenge see its Community. A host can turn chat and shared posts
            off; updates and feedback on drafts stay. New messages show within a second, and the
            bell at the top right counts what is new in all your challenges. From its menu you can
            mute one place or a whole challenge, and turn the notification sound off.
          </p>
        </section>

        <section aria-labelledby="faq-heading" className="flex flex-col gap-4">
          <SectionHeading id="faq-heading" title="Questions people ask" />
          <div className="flex flex-col divide-y rounded-xl border bg-card">
            {FAQ.map(([question, answer]) => (
              <details key={question} className="group px-4">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-3 font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
                  {question}
                  <span
                    aria-hidden="true"
                    className="shrink-0 text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none"
                  >
                    ›
                  </span>
                </summary>
                <p className="pb-4 text-muted-foreground leading-relaxed">{answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section aria-labelledby="buffer-heading" className="flex flex-col gap-4">
          <SectionHeading id="buffer-heading" title="What Daydeck does in your Buffer" />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
              <h3 className="font-medium">It does</h3>
              <ul className="flex flex-col gap-2 text-sm leading-6">
                {DOES.map((item) => (
                  <li key={item} className="flex gap-2">
                    <CheckIcon aria-hidden="true" className="mt-1 size-4 shrink-0 text-primary" />
                    <span className="text-muted-foreground">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
              <h3 className="font-medium">It never does</h3>
              <ul className="flex flex-col gap-2 text-sm leading-6">
                {NEVER.map((item) => (
                  <li key={item} className="flex gap-2">
                    <XIcon
                      aria-hidden="true"
                      className="mt-1 size-4 shrink-0 text-muted-foreground"
                    />
                    <span className="text-muted-foreground">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section aria-labelledby="data-heading" className="flex flex-col gap-4">
          <SectionHeading id="data-heading" title="Your data" />
          <div className="flex gap-3 rounded-xl border bg-card p-4">
            <ShieldCheckIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
            <p className="text-muted-foreground text-sm leading-6">
              Daydeck keeps the IDs, links and status of your challenge posts, not their text. The
              text it keeps is what you choose to share: a draft you ask feedback for, and what you
              write in Community. The{" "}
              <Link
                href="/privacy"
                className="text-primary underline underline-offset-3 hover:no-underline"
              >
                privacy page
              </Link>{" "}
              lists everything, and you can delete it all at any time from "Your data".
            </p>
          </div>
        </section>
      </div>

      {/* On wide screens the sections stay one click away while you read. */}
      <PageContents
        sections={SECTIONS}
        footer={
          <p className="mt-4 flex items-center gap-2 px-3 text-muted-foreground text-xs">
            <SendIcon aria-hidden="true" className="size-3.5" />
            Daydeck never posts for you.
          </p>
        }
      />
    </div>
  );
}
