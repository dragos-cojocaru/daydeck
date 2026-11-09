import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { BackLink } from "@/components/back-link";
import { PageContents } from "@/components/page-contents";
import { env } from "@/server/env";
import { hosting, recipients } from "@/server/privacy/recipients";

export const metadata: Metadata = { title: "Privacy" };

/** Change this date whenever the text below changes. */
const UPDATED = "9 November 2026";

const STORED: [string, string][] = [
  ["Your Buffer account", "Its ID, your name, your picture and your time zone."],
  [
    "Your Buffer connection",
    "Access tokens, encrypted with AES-256-GCM. They never leave Daydeck's server.",
  ],
  ["Your channels", "Their names, pictures, posting schedules, and which ones count for you."],
  [
    "Challenges you host",
    "Their prompts and settings, such as who can see the recap and whether the challenge is listed on Daydeck's homepage.",
  ],
  [
    "Your challenge posts",
    "Their Buffer IDs, links and status (draft, scheduled, sent). Not their text, with one exception: for a post you wrote outside Daydeck that waits for you to choose its day, its first 100 characters, so you can tell it apart. They are deleted once the post has its day, when the challenge closes, or after 30 days.",
  ],
  [
    "Drafts you share for feedback",
    "The text of a draft you choose to show your group, so they can read it.",
  ],
  ["Feedback you write", "Your replies to other people's drafts."],
  [
    "Community messages",
    "What you write in a challenge's Community, and your reactions. Only people in that challenge see them.",
  ],
  [
    "Link previews",
    "For a link someone shares in Community: the page's title, its first lines and its image address, read once from that page and kept for a week. For a social post, that can be the start of the post.",
  ],
  [
    "What you have read, and what you muted",
    "When you last opened each part of a challenge's Community, to count what is new for the bell, and which places or challenges you muted.",
  ],
  [
    "Bans",
    "If a host bans someone, Daydeck keeps that person's Buffer account ID on the challenge, so the ban holds. Their name goes when they delete their data; the ID goes with the challenge.",
  ],
];

const SECTIONS = [
  { id: "runs-heading", label: "Who runs Daydeck" },
  { id: "stored-heading", label: "What Daydeck stores" },
  { id: "why-heading", label: "Why, and the legal basis" },
  { id: "who-heading", label: "Who sees what" },
  { id: "where-heading", label: "Where your data is" },
  { id: "delete-heading", label: "How long it is kept" },
  { id: "cookies-heading", label: "Cookies and your browser" },
  { id: "rights-heading", label: "Your rights" },
] as const;

const LINK = "underline underline-offset-3 hover:text-foreground";

/**
 * What Daydeck stores, why, who else receives it and where, how long it is kept, and people's
 * rights. The services listed come from this copy's own settings (see server/privacy).
 */
export default function PrivacyPage() {
  const services = recipients();
  const where = hosting();
  const contactName = env.PRIVACY_CONTACT_NAME;
  const contactEmail = env.PRIVACY_CONTACT_EMAIL;
  const abroad = [where.database, where.app].some((place) => place?.includes("United States"));

  return (
    // The shared public frame: the text at a comfortable line length, and from 1024px the
    // sections on the right, as on "How Daydeck works".
    <main
      id="main"
      className="mx-auto grid w-full max-w-6xl flex-1 gap-10 px-4 py-8 sm:px-6 sm:py-10 lg:grid-cols-[minmax(0,1fr)_14rem] lg:items-start"
    >
      <div className="flex min-w-0 flex-col gap-8 [&>*]:max-w-3xl">
        <div className="flex flex-col gap-3">
          <BackLink href="/">Back to home</BackLink>
          <h1 className="font-semibold text-3xl tracking-tight">Privacy</h1>
          <p className="text-lg text-muted-foreground">
            Daydeck keeps only what it needs to track your challenge days, and deletes it when you
            ask or 30 days after a challenge closes.
          </p>
          <p className="text-muted-foreground text-sm">Last updated {UPDATED}.</p>
        </div>

        {/* Below 1024px the sections are listed here, before the text. */}
        <nav aria-label="On this page" className="rounded-xl border p-4 lg:hidden">
          <p className="mb-2 font-medium text-sm">On this page</p>
          <ul className="grid gap-x-6 sm:grid-cols-2">
            {SECTIONS.map(({ id, label }) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className="inline-flex min-h-11 items-center text-muted-foreground text-sm underline-offset-3 hover:text-foreground hover:underline md:min-h-8"
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <Section id="runs-heading" title="Who runs Daydeck">
          <p>
            {contactName ?? "The person or team who runs this copy of Daydeck"} decides how your
            data is used here. In data protection law, that makes them the controller of your data.
          </p>
          {contactEmail ? (
            <p>
              For a question about your data, or to use any of your rights below, write to{" "}
              <a href={`mailto:${contactEmail}`} className={LINK}>
                {contactEmail}
              </a>
              .
            </p>
          ) : (
            <p className="text-muted-foreground">
              Daydeck is open-source software, so each copy has its own owner. For a question about
              your data, contact whoever gave you the link to this copy.
            </p>
          )}
        </Section>

        <Section id="stored-heading" title="What Daydeck stores">
          <Terms rows={STORED} />
          <p className="text-muted-foreground">
            Daydeck never publishes or schedules a post without you, and never sees your Buffer
            password. Your email address is not stored.
          </p>
        </Section>

        <Section id="why-heading" title="Why, and the legal basis">
          <ul className="flex list-disc flex-col gap-2 pl-5">
            <li>
              <strong className="font-medium">To run the challenges you join or host:</strong> your
              days, the board, Community, feedback and the AI's suggestions. This is the service you
              ask for when you connect Buffer and join, so the legal basis is our agreement with you
              (GDPR Article 6(1)(b)).
            </li>
            <li>
              <strong className="font-medium">To keep Daydeck safe and working:</strong> sign-in
              sessions, limits on how often someone can do an action, and error reports. The legal
              basis is a legitimate interest in a secure service that works (Article 6(1)(f)).
            </li>
          </ul>
          <p className="text-muted-foreground">
            Daydeck does not sell your data, show ads, build marketing profiles or follow you on
            other sites.
          </p>
        </Section>

        <Section id="who-heading" title="Who sees what">
          <ul className="flex list-disc flex-col gap-2 pl-5">
            <li>
              People in your challenge see your Buffer name, your picture and which days you posted.
              So does anyone with the challenge's invite link, in its list of who is in.
            </li>
            <li>
              A challenge's recap page shows your name and post links only if you turn that on.
            </li>
            <li>
              A host can list a public challenge under Popular challenges on Daydeck's homepage
              while it is active. Then anyone can open its invite page and recap. They see the
              board, the host's name and picture, and the names of only the people who turned that
              on. Making the recap private, pausing joining or closing the challenge takes it off
              the homepage at once.
            </li>
          </ul>
          <p>
            These services receive data to make Daydeck work. The list shows exactly the ones this
            copy of Daydeck uses.
          </p>
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-[12rem_1fr]">
            {services.map((service) => (
              <div key={service.name} className="contents">
                <dt className="font-medium">{service.name}</dt>
                <dd className="text-muted-foreground">
                  {service.what}
                  {service.where ? ` In: ${service.where}.` : ""}
                </dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section id="where-heading" title="Where your data is">
          {where.database || where.app ? (
            <p>
              {where.database ? `Daydeck's database is in ${where.database}. ` : ""}
              {where.app ? `The app runs in ${where.app}.` : ""}
            </p>
          ) : (
            <p>This copy of Daydeck keeps its data on its own server.</p>
          )}
          {abroad ? (
            <p className="text-muted-foreground">
              If you live in the European Economic Area, the United Kingdom or Switzerland, your
              data goes to the United States. The services above protect it there with the
              safeguards the GDPR asks for, such as the European Commission's standard contractual
              clauses in their data processing agreements.
            </p>
          ) : null}
        </Section>

        <Section id="delete-heading" title="How long it is kept">
          <ul className="flex list-disc flex-col gap-2 pl-5">
            <li>
              <Link href="/settings/data" className={LINK}>
                Your data
              </Link>{" "}
              deletes everything at once and revokes Daydeck's access at Buffer.
            </li>
            <li>Leaving a challenge deletes your days in it.</li>
            <li>
              A challenge, with everything in it, is deleted 30 days after it closes. Each closed
              challenge shows its exact date.
            </li>
            <li>
              A sign-in lasts 30 days. Link previews are kept a week, and request counters a day.
            </li>
            <li>
              For the Buffer Commit contest, everything is deleted after the winners are announced
              on 7 December 2026.
            </li>
          </ul>
        </Section>

        <Section id="cookies-heading" title="Cookies and your browser">
          <p>
            Daydeck sets one cookie to keep you signed in, and a short one while you connect Buffer,
            to check that the answer really comes from Buffer. The app needs both to work, so they
            need no consent. There are no ad, analytics or tracking cookies.
          </p>
          <p className="text-muted-foreground">
            Your theme, your notification sound choice, and what you type into the "Host a
            challenge" form, stay in your own browser until you create the challenge. While a
            Daydeck page is open, it keeps one connection to Daydeck's own server for live updates;
            it sends no extra data about you.
          </p>
        </Section>

        <Section id="rights-heading" title="Your rights">
          <ul className="flex list-disc flex-col gap-2 pl-5">
            <li>
              <strong className="font-medium">See your data and take a copy:</strong>{" "}
              <Link href="/settings/data" className={LINK}>
                Your data
              </Link>{" "}
              shows what Daydeck keeps and downloads all of it as a file.
            </li>
            <li>
              <strong className="font-medium">Correct it:</strong> your name and picture come from
              Buffer. Change them there, then connect Buffer again here.
            </li>
            <li>
              <strong className="font-medium">Delete it:</strong> from Your data, at any time. If
              you cannot connect Buffer any more, write to the contact above instead.
            </li>
            <li>
              <strong className="font-medium">Object to a use, or ask to limit it:</strong> write to
              the contact above.
            </li>
            <li>
              <strong className="font-medium">Complain:</strong> to the data protection authority
              where you live or work, or where you think the problem happened.
            </li>
          </ul>
          <p className="text-muted-foreground">
            When this page changes, the date at the top changes too.
          </p>
        </Section>
      </div>
      <PageContents sections={SECTIONS} />
    </main>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3 leading-relaxed">
      <h2 id={id} className="font-semibold text-xl">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Terms({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-[12rem_1fr]">
      {rows.map(([term, detail]) => (
        <div key={term} className="contents">
          <dt className="font-medium">{term}</dt>
          <dd className="text-muted-foreground">{detail}</dd>
        </div>
      ))}
    </dl>
  );
}
