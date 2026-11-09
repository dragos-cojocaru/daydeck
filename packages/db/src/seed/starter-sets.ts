// Daydeck's own starter prompt sets, seeded on every deploy (see scripts/migrate.ts).
// This file has no relative imports, so plain Node.js can load it from the migrate script.
import { type SQL, sql } from "drizzle-orm";

export interface StarterPrompt {
  emoji: string;
  title: string;
  /** One or two sentences that explain the prompt. */
  description: string;
  /** The starting text of the draft in Buffer; brackets mark what to fill in. */
  body: string;
}

export interface StarterSet {
  slug: string;
  title: string;
  description: string;
  /** The curated picks, in order: what a new challenge gets until the host swaps some. */
  prompts: StarterPrompt[];
  /**
   * More prompts in the same spirit. With `prompts` they make the pack's pool, which the setup
   * form draws from for "Shuffle all" and "Swap". Only `prompts` is seeded into the database.
   */
  extra: StarterPrompt[];
}

export const STARTER_SETS: StarterSet[] = [
  {
    slug: "starter-five-day-kickstart",
    title: "Five-day kickstart",
    description: "Five short prompts to get anyone posting again, one small story at a time.",
    prompts: [
      {
        emoji: "👋",
        title: "What you do, in one sentence",
        description: "Introduce your work the way you would to a friend, without the job title.",
        body: "I help [who] [do what]. The part I enjoy most is [the part].",
      },
      {
        emoji: "🧰",
        title: "A tool you would be lost without",
        description: "Share one tool, habit or template, and how it fits into your week.",
        body: "One tool I use every day: [tool]. Here is how I use it: [how].",
      },
      {
        emoji: "🪲",
        title: "A mistake that taught you something",
        description: "Tell a short story about something that went wrong, and what changed after.",
        body: "Last [month] I [mistake]. What I do differently now: [lesson].",
      },
      {
        emoji: "🎬",
        title: "Behind the scenes",
        description: "Show a work in progress: a first draft, a sketch or a messy desk.",
        body: "This is what [project] looks like before it is finished: [what you see].",
      },
      {
        emoji: "❓",
        title: "Ask your audience",
        description: "End the week with a question people can answer in one line.",
        body: "Quick question for you: [question]? I will go first: [your answer].",
      },
    ],
    extra: [
      {
        emoji: "🌱",
        title: "Why you started",
        description: "Share the moment you decided to do the work you do now.",
        body: "I started doing [work] when [moment]. I still remember [detail].",
      },
      {
        emoji: "📚",
        title: "A book, video or podcast that helped",
        description: "Recommend one thing that changed how you work, and say why.",
        body: "If you only read one thing about [topic], make it [title]. It taught me [idea].",
      },
      {
        emoji: "☕",
        title: "Your morning in three steps",
        description: "Walk people through how your work day starts.",
        body: "My morning, in three steps: 1. [step] 2. [step] 3. [step].",
      },
      {
        emoji: "💬",
        title: "A question people often ask you",
        description: "Answer a question you hear a lot, in a few lines.",
        body: "People often ask me [question]. My short answer: [answer].",
      },
      {
        emoji: "🎯",
        title: "One goal for this month",
        description: "Say one thing you want to finish this month, so people can cheer you on.",
        body: "This month I want to [goal]. The first step is [step].",
      },
      {
        emoji: "🙌",
        title: "Someone you learn from",
        description: "Name a person whose work you admire, and what you take from it.",
        body: "I learn a lot from [name]. What stands out to me: [what].",
      },
      {
        emoji: "🧭",
        title: "A rule you work by",
        description: "Share one simple rule that keeps your work on track.",
        body: "One rule I keep coming back to: [rule]. It helps because [why].",
      },
      {
        emoji: "🔧",
        title: "A tiny fix that saves you time",
        description: "Share a small change that makes your week easier.",
        body: "A small fix that saves me [time] every week: [fix].",
      },
      {
        emoji: "📸",
        title: "Your workspace today",
        description: "Post a photo of where you work, and one thing in it that matters.",
        body: "Here is where I work today. The one thing I cannot do without: [thing].",
      },
      {
        emoji: "🎉",
        title: "Something that went well this week",
        description: "Celebrate one thing, however small.",
        body: "A good moment from this week: [moment]. It worked because [reason].",
      },
    ],
  },
  {
    slug: "starter-build-in-public-week",
    title: "Build-in-public week",
    description: "Seven days of sharing what you are making, while you are making it.",
    prompts: [
      {
        emoji: "🧱",
        title: "What you are building, and why",
        description: "Name the project and the problem it solves for someone.",
        body: "I am building [project] for [who], because [problem].",
      },
      {
        emoji: "🎯",
        title: "This week's one goal",
        description: "Pick one result you want by Friday, and say it out loud.",
        body: "By the end of this week I want [goal]. The first step is [step].",
      },
      {
        emoji: "📈",
        title: "A small win from today",
        description: "Small progress counts. Share one thing that moved forward.",
        body: "Small win today: [win]. It matters because [reason].",
      },
      {
        emoji: "🧩",
        title: "A problem you are stuck on",
        description: "Describe it plainly. Someone reading may have solved it before.",
        body: "I am stuck on [problem]. I have tried [attempts]. Ideas welcome.",
      },
      {
        emoji: "⚖️",
        title: "A decision and its trade-off",
        description: "Explain one choice you made and what you gave up for it.",
        body: "I chose [option] over [other option]. What I gave up: [trade-off].",
      },
      {
        emoji: "📚",
        title: "What you learned this week",
        description: "One lesson, written so that someone else can use it.",
        body: "This week taught me [lesson]. If you are doing [thing], try [tip].",
      },
      {
        emoji: "🔭",
        title: "What comes next",
        description: "Close the week by saying what you will work on next.",
        body: "Next up: [plan]. I will share how it goes.",
      },
    ],
    extra: [
      {
        emoji: "🧪",
        title: "An experiment you are running",
        description: "Share what you are testing, what you expect, and when you will know.",
        body: "This week I am testing [idea]. I expect [result]. I will know by [date].",
      },
      {
        emoji: "📊",
        title: "A number you are watching",
        description: "Share one number you track and why it matters right now.",
        body: "The number I watch most this week: [number]. It tells me [what].",
      },
      {
        emoji: "🗺️",
        title: "Your plan for the next month",
        description: "Lay out what you want to ship, in three short steps.",
        body: "Next month, in three steps: 1. [step] 2. [step] 3. [step].",
      },
      {
        emoji: "💡",
        title: "Feedback that changed your plan",
        description: "Tell people what someone said, and what you did about it.",
        body: "Someone told me [feedback]. So I changed [what].",
      },
      {
        emoji: "✂️",
        title: "Something you cut",
        description: "Share a feature or idea you dropped, and why.",
        body: "I cut [feature] this week. The reason: [why].",
      },
      {
        emoji: "🛠️",
        title: "What you build with",
        description: "List your tools in one short post.",
        body: "What I build [project] with: [tools]. The one I would pick again: [tool].",
      },
      {
        emoji: "😅",
        title: "Something that did not work",
        description: "Share an attempt that failed and what it taught you.",
        body: "I tried [attempt]. It did not work: [result]. Next I will try [next].",
      },
      {
        emoji: "🙏",
        title: "Ask for help",
        description: "Ask your audience for one specific thing you need.",
        body: "I am looking for [help] for [project]. If you know [who or what], I would love to hear.",
      },
    ],
  },
  {
    slug: "starter-two-week-habit",
    title: "Two-week posting habit",
    description: "Ten prompts that suit a weekdays-only challenge: two working weeks of posting.",
    prompts: [
      {
        emoji: "☕",
        title: "How your work day starts",
        description: "Share the first hour of a normal work day.",
        body: "My work day starts with [routine]. It helps me [reason].",
      },
      {
        emoji: "💡",
        title: "An idea you changed your mind about",
        description: "What did you believe before, and what changed it?",
        body: "I used to think [old view]. Then [what happened], and now I think [new view].",
      },
      {
        emoji: "🙌",
        title: "Thank someone who helped you",
        description: "Name a person and the specific thing they did.",
        body: "Thank you, [name], for [what they did]. It made [difference].",
      },
      {
        emoji: "📖",
        title: "Something that stuck with you",
        description: "A book, talk or post you still think about.",
        body: "I keep coming back to [work] by [author]. The idea that stuck: [idea].",
      },
      {
        emoji: "🔁",
        title: "Before and after",
        description: "Compare how something looked or worked before and after a change.",
        body: "Before: [before]. After: [after]. What made the difference: [change].",
      },
      {
        emoji: "🧪",
        title: "A small experiment",
        description: "Something you are trying out, and how you will know if it works.",
        body: "This week I am testing [experiment]. I will know it works if [signal].",
      },
      {
        emoji: "🗺️",
        title: "How you got here",
        description: "The short version of how you got into your field.",
        body: "I got into [field] because [reason]. The turning point was [moment].",
      },
      {
        emoji: "🧭",
        title: "Advice for your past self",
        description: "One thing you wish you had known when you started.",
        body: "If I could tell my past self one thing about [topic], it would be [advice].",
      },
      {
        emoji: "🎉",
        title: "A milestone, however small",
        description: "Celebrate progress. It does not need to be big.",
        body: "Small milestone: [milestone]. It took [time or effort].",
      },
      {
        emoji: "🔮",
        title: "What you want to post about next",
        description: "Close the challenge by naming the topics you want to keep sharing.",
        body: "Next month I want to post more about [topics]. Which one should I start with?",
      },
    ],
    extra: [
      {
        emoji: "🗓️",
        title: "What your week looks like",
        description: "Share the shape of a normal week for you.",
        body: "A normal week for me: [start of the week], [middle], [Friday].",
      },
      {
        emoji: "🔁",
        title: "Something you do every day",
        description: "Share a small daily habit and what it gives you.",
        body: "Every day I [habit]. It gives me [benefit].",
      },
      {
        emoji: "🤝",
        title: "A small kindness at work",
        description: "Share a moment when someone made your day easier.",
        body: "This week [person] [kind thing]. It made [difference].",
      },
      {
        emoji: "🧠",
        title: "Something you learned recently",
        description: "Share one new thing you learned, in your own words.",
        body: "Something I learned this week: [thing]. The short version: [explain].",
      },
      {
        emoji: "🎧",
        title: "What keeps you focused",
        description: "Share what helps you do your best work.",
        body: "When I need to focus, I [what]. It works because [why].",
      },
      {
        emoji: "🏁",
        title: "Finally finished",
        description: "Share a task you had been putting off, and how you got it done.",
        body: "I finally finished [task]. What helped: [what].",
      },
      {
        emoji: "📝",
        title: "A note to future you",
        description: "Write a short note to yourself, one year from now.",
        body: "Dear me in a year: I hope [hope]. Do not forget [thing].",
      },
      {
        emoji: "🌟",
        title: "Proud of this month",
        description: "Name one thing you are proud of, even if it sounds small.",
        body: "This month I am proud of [thing]. It matters to me because [why].",
      },
    ],
  },
];

interface Executor {
  execute(query: SQL): PromiseLike<unknown>;
}

/** Anything with a Drizzle-style transaction: node-postgres in production, PGlite in tests. */
export interface TransactionalDb {
  transaction<T>(run: (tx: Executor) => Promise<T>): Promise<T>;
}

/**
 * Creates or updates the starter sets. Safe to run on every deploy: each set is matched by
 * its slug and its prompts are replaced. Running challenges are unaffected, because they keep
 * their own copy of their prompts.
 */
export async function seedStarterSets(db: TransactionalDb): Promise<void> {
  for (const set of STARTER_SETS) {
    await db.transaction(async (tx) => {
      const result = (await tx.execute(sql`
        insert into prompt_sets (slug, title, description, source, visibility)
        values (${set.slug}, ${set.title}, ${set.description}, 'starter', 'public')
        on conflict (slug) do update
          set title = excluded.title, description = excluded.description, updated_at = now()
        returning id
      `)) as { rows: { id: string }[] };
      const setId = result.rows[0]?.id;
      if (!setId) throw new Error(`Seeding ${set.slug} returned no id`);

      await tx.execute(sql`delete from prompts where prompt_set_id = ${setId}`);
      for (const [position, prompt] of set.prompts.entries()) {
        await tx.execute(sql`
          insert into prompts (prompt_set_id, position, title, description, body, emoji)
          values (${setId}, ${position}, ${prompt.title}, ${prompt.description}, ${prompt.body}, ${prompt.emoji})
        `);
      }
    });
  }
}
