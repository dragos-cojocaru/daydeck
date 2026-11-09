import type { MatchCandidate } from "../src/types";

// Labelled examples for the matcher evaluation (src/evaluation.test.ts). The candidates copy
// the starter prompt sets in packages/db/src/seed/starter-sets.ts. They are copied, not
// imported, so that a change to the starter sets cannot quietly change the labels below.
// All posts are invented.

export interface MatchFixture {
  /** A short unique name, shown in the evaluation report. */
  name: string;
  postText: string;
  candidates: MatchCandidate[];
  /** The candidate ID the post answers, or null when it answers none of them. */
  expected: string | null;
  /** Why the example is tricky, when it is. */
  note?: string;
}

export const KICKSTART: MatchCandidate[] = [
  {
    id: "kickstart:what-you-do",
    title: "What you do, in one sentence",
    description: "Introduce your work the way you would to a friend, without the job title.",
  },
  {
    id: "kickstart:tool",
    title: "A tool you would be lost without",
    description: "Share one tool, habit or template, and how it fits into your week.",
  },
  {
    id: "kickstart:mistake",
    title: "A mistake that taught you something",
    description: "Tell a short story about something that went wrong, and what changed after.",
  },
  {
    id: "kickstart:behind-the-scenes",
    title: "Behind the scenes",
    description: "Show a work in progress: a first draft, a sketch or a messy desk.",
  },
  {
    id: "kickstart:ask",
    title: "Ask your audience",
    description: "End the week with a question people can answer in one line.",
  },
];

export const BUILD_IN_PUBLIC: MatchCandidate[] = [
  {
    id: "build:what-and-why",
    title: "What you are building, and why",
    description: "Name the project and the problem it solves for someone.",
  },
  {
    id: "build:goal",
    title: "This week's one goal",
    description: "Pick one result you want by Friday, and say it out loud.",
  },
  {
    id: "build:small-win",
    title: "A small win from today",
    description: "Small progress counts. Share one thing that moved forward.",
  },
  {
    id: "build:stuck",
    title: "A problem you are stuck on",
    description: "Describe it plainly. Someone reading may have solved it before.",
  },
  {
    id: "build:trade-off",
    title: "A decision and its trade-off",
    description: "Explain one choice you made and what you gave up for it.",
  },
  {
    id: "build:learned",
    title: "What you learned this week",
    description: "One lesson, written so that someone else can use it.",
  },
  {
    id: "build:next",
    title: "What comes next",
    description: "Close the week by saying what you will work on next.",
  },
];

export const TWO_WEEK_HABIT: MatchCandidate[] = [
  {
    id: "habit:day-start",
    title: "How your work day starts",
    description: "Share the first hour of a normal work day.",
  },
  {
    id: "habit:changed-mind",
    title: "An idea you changed your mind about",
    description: "What did you believe before, and what changed it?",
  },
  {
    id: "habit:thanks",
    title: "Thank someone who helped you",
    description: "Name a person and the specific thing they did.",
  },
  {
    id: "habit:stuck-with-you",
    title: "Something that stuck with you",
    description: "A book, talk or post you still think about.",
  },
  {
    id: "habit:before-after",
    title: "Before and after",
    description: "Compare how something looked or worked before and after a change.",
  },
  {
    id: "habit:experiment",
    title: "A small experiment",
    description: "Something you are trying out, and how you will know if it works.",
  },
  {
    id: "habit:how-you-got-here",
    title: "How you got here",
    description: "The short version of how you got into your field.",
  },
  {
    id: "habit:advice",
    title: "Advice for your past self",
    description: "One thing you wish you had known when you started.",
  },
  {
    id: "habit:milestone",
    title: "A milestone, however small",
    description: "Celebrate progress. It does not need to be big.",
  },
  {
    id: "habit:next-topics",
    title: "What you want to post about next",
    description: "Close the challenge by naming the topics you want to keep sharing.",
  },
];

/** Only the first days of a challenge, for posts that answer a prompt not yet offered. */
const KICKSTART_FIRST_THREE = KICKSTART.slice(0, 3);
const HABIT_FIRST_THREE = TWO_WEEK_HABIT.slice(0, 3);

export const FIXTURES: MatchFixture[] = [
  // Five-day kickstart
  {
    name: "kickstart: what you do, plain",
    candidates: KICKSTART,
    expected: "kickstart:what-you-do",
    postText:
      "I help small bakeries sell more online without hiring a marketing agency. The part I " +
      "enjoy most is the first week, when the owner sees orders from people they have never met.",
  },
  {
    name: "kickstart: what you do, in other words",
    candidates: KICKSTART,
    expected: "kickstart:what-you-do",
    postText:
      "If my grandmother asked what I do: I fix the spreadsheets that run small charities, so " +
      "the volunteers can stop fighting Excel and get back to helping people.",
  },
  {
    name: "kickstart: what you do, in Spanish",
    candidates: KICKSTART,
    expected: "kickstart:what-you-do",
    note: "Another language.",
    postText:
      "Ayudo a pequeños hoteles a llenar sus habitaciones en temporada baja. Lo que más me " +
      "gusta es ver la cara del dueño cuando el calendario de reservas se llena.",
  },
  {
    name: "kickstart: tool, plain",
    candidates: KICKSTART,
    expected: "kickstart:tool",
    postText:
      "One tool I use every day: a plain paper notebook. Every morning I write the three things " +
      "I must finish, and I cross them off by hand. Nothing beats that feeling.",
  },
  {
    name: "kickstart: tool, as a template",
    candidates: KICKSTART,
    expected: "kickstart:tool",
    postText:
      "Confession: my whole week runs on a single Notion template. On Monday every task goes " +
      "in, on Friday I review what moved. Without it I would forget half my clients.",
  },
  {
    name: "kickstart: mistake, plain",
    candidates: KICKSTART,
    expected: "kickstart:mistake",
    postText:
      "Last March I sent a client's invoice to the wrong email address. Twice. Now every " +
      "invoice goes through a short checklist and a second pair of eyes before it leaves.",
  },
  {
    name: "kickstart: mistake that involves a tool",
    candidates: KICKSTART,
    expected: "kickstart:mistake",
    note: "Names a tool, but the story is about what went wrong.",
    postText:
      "I trusted our scheduling app blindly, and it published a launch post a day early with " +
      "a typo in the price. Lesson learned: I now preview every scheduled post the evening before.",
  },
  {
    name: "kickstart: behind the scenes, plain",
    candidates: KICKSTART,
    expected: "kickstart:behind-the-scenes",
    postText:
      "This is what our new website looks like before it is finished: sticky notes on the " +
      "wall, three colours of marker, and a homepage sketch that changed four times today.",
  },
  {
    name: "kickstart: behind the scenes, messy desk",
    candidates: KICKSTART,
    expected: "kickstart:behind-the-scenes",
    postText:
      "Messy desk Monday 📸 Coffee rings, cables, and the first draft of chapter two. Nobody " +
      "sees this part of writing a book, so here it is.",
  },
  {
    name: "kickstart: ask, about apps",
    candidates: KICKSTART,
    expected: "kickstart:ask",
    note: "Talks about apps, but it is a question for the audience, not a tool story.",
    postText:
      "Quick question for you: what is one app you deleted this year and never missed? I will " +
      "go first: the news app. 👇",
  },
  {
    name: "kickstart: ask, as a poll",
    candidates: KICKSTART,
    expected: "kickstart:ask",
    postText:
      "Help me settle a debate in our office: should meeting notes be written during the " +
      "meeting or after it? Reply with one word, during or after.",
  },
  {
    name: "kickstart: none, a sale",
    candidates: KICKSTART,
    expected: null,
    postText:
      "Our spring sale starts tomorrow! 20% off every course until Sunday. Link in the comments.",
  },
  {
    name: "kickstart: none, congratulations",
    candidates: KICKSTART,
    expected: null,
    postText:
      "Congratulations to the whole team on closing our Series A! Proud to be part of this " +
      "journey. #funding #startups",
  },
  {
    name: "kickstart: none, uses the prompt's words",
    candidates: KICKSTART,
    expected: null,
    note: "Says 'behind the scenes' but is an advert for a podcast episode.",
    postText:
      "Behind the Scenes, our podcast, is back! Episode 12 is live on all platforms. Listen " +
      "now and leave us a review.",
  },
  {
    name: "kickstart: none, the matching day is not offered",
    candidates: KICKSTART_FIRST_THREE,
    expected: null,
    note: "Answers 'Ask your audience', which is not among the candidates.",
    postText:
      "Curious: how many of you still print your boarding passes? Tell me in the comments, I " +
      "will share the results on Friday.",
  },

  // Build-in-public week
  {
    name: "build: what and why, plain",
    candidates: BUILD_IN_PUBLIC,
    expected: "build:what-and-why",
    postText:
      "I am building Shelfie, a tiny app for libraries in small towns, because their " +
      "catalogues still live in paper boxes and nobody can find a book from home.",
  },
  {
    name: "build: what and why, in Romanian",
    candidates: BUILD_IN_PUBLIC,
    expected: "build:what-and-why",
    note: "Another language.",
    postText:
      "Construiesc o aplicație pentru asociațiile de proprietari, pentru că administratorii " +
      "încă țin evidența plăților în caiete și nimeni nu știe cine a plătit întreținerea.",
  },
  {
    name: "build: goal, plain",
    candidates: BUILD_IN_PUBLIC,
    expected: "build:goal",
    postText:
      "By the end of this week I want the sign-up page live and ten real people on the " +
      "waiting list. The first step: write the copy today, and stop polishing the logo.",
  },
  {
    name: "build: goal, phrased as a plan",
    candidates: BUILD_IN_PUBLIC,
    expected: "build:goal",
    note: "Sounds like 'What comes next', but it is one goal for this week.",
    postText:
      "Plan for this week: the export feature is done by Friday. Step one is writing the CSV " +
      "parser today.",
  },
  {
    name: "build: small win, plain",
    candidates: BUILD_IN_PUBLIC,
    expected: "build:small-win",
    postText:
      "Small win today: the import that took 40 minutes now finishes in 90 seconds. It " +
      "matters because our first customer imports every night.",
  },
  {
    name: "build: small win, a goal reached",
    candidates: BUILD_IN_PUBLIC,
    expected: "build:small-win",
    note: "Mentions a goal, but reports progress instead of setting one.",
    postText:
      "Hit the goal I set on Monday: the beta is in the hands of five testers. Feels good to " +
      "tick that box today.",
  },
  {
    name: "build: stuck, plain",
    candidates: BUILD_IN_PUBLIC,
    expected: "build:stuck",
    postText:
      "I am stuck on getting push notifications to work on iOS in our React Native app. I " +
      "tried three libraries and two tutorials. Has anyone solved this? Ideas welcome.",
  },
  {
    name: "build: trade-off, plain",
    candidates: BUILD_IN_PUBLIC,
    expected: "build:trade-off",
    postText:
      "We chose Postgres over a document database for the first version. What we gave up: " +
      "some freedom when the data shape changes. What we got: one less thing to learn.",
  },
  {
    name: "build: learned, plain",
    candidates: BUILD_IN_PUBLIC,
    expected: "build:learned",
    postText:
      "This week taught me that users never read onboarding screens. If you are building a " +
      "first-run flow, put the one important action on the first screen and skip the tour.",
  },
  {
    name: "build: learned, from a mistake",
    candidates: BUILD_IN_PUBLIC,
    expected: "build:learned",
    note: "Starts as a story about something going wrong; the point is the lesson.",
    postText:
      "I shipped on Friday at 6 pm and spent the weekend fixing it. Lesson for anyone " +
      "shipping alone: release on a Tuesday morning, when you have the energy to fix things.",
  },
  {
    name: "build: what comes next, plain",
    candidates: BUILD_IN_PUBLIC,
    expected: "build:next",
    postText:
      "Next up: payments. A Stripe integration, a pricing page, and the first paid plan. I " +
      "will share how it goes next Friday.",
  },
  {
    name: "build: none, hiring",
    candidates: BUILD_IN_PUBLIC,
    expected: null,
    postText:
      "We are hiring! Looking for a senior backend engineer, remote in Europe. Send me a " +
      "message if you are interested.",
  },
  {
    name: "build: none, Monday mood",
    candidates: BUILD_IN_PUBLIC,
    expected: null,
    postText: "Monday mood: coffee, more coffee, and pretending my inbox does not exist ☕️😅",
  },

  // Two-week posting habit
  {
    name: "habit: day start, plain",
    candidates: TWO_WEEK_HABIT,
    expected: "habit:day-start",
    postText:
      "My work day starts with a 20-minute walk without my phone, then one hour of writing " +
      "before I open email. It helps me think before everyone starts asking questions.",
  },
  {
    name: "habit: changed mind, plain",
    candidates: TWO_WEEK_HABIT,
    expected: "habit:changed-mind",
    postText:
      "I used to think cold emails were spam. Then a short, honest cold email brought me my " +
      "biggest client, and now I think a good one is just a polite introduction.",
  },
  {
    name: "habit: changed mind, sounds like advice",
    candidates: TWO_WEEK_HABIT,
    expected: "habit:changed-mind",
    note: "Could read as advice for a past self; it describes an old belief and a new one.",
    postText:
      "Ten years ago I believed you had to say yes to every project to survive. I don't " +
      "anymore: the projects I turned down made room for the ones that built my business.",
  },
  {
    name: "habit: thanks, plain",
    candidates: TWO_WEEK_HABIT,
    expected: "habit:thanks",
    postText:
      "Thank you, Ana, for spending an hour of your Saturday on my portfolio. Your notes on " +
      "the case studies made them twice as clear, and I got the interview.",
  },
  {
    name: "habit: stuck with you, a book",
    candidates: TWO_WEEK_HABIT,
    expected: "habit:stuck-with-you",
    postText:
      "I keep coming back to Atomic Habits by James Clear. The idea that stuck: you do not " +
      "rise to the level of your goals, you fall to the level of your systems.",
  },
  {
    name: "habit: stuck with you, a talk",
    candidates: TWO_WEEK_HABIT,
    expected: "habit:stuck-with-you",
    note: "Names a person, but does not thank anyone.",
    postText:
      "A nurse at a local meetup said every process should be designed for the most tired " +
      "person on the night shift. I think about it every time I write a checklist.",
  },
  {
    name: "habit: before and after, plain",
    candidates: TWO_WEEK_HABIT,
    expected: "habit:before-after",
    postText:
      "Before: our support inbox had 300 open tickets. After: 12. What made the difference " +
      "was a simple FAQ page and answering the top five questions once, properly.",
  },
  {
    name: "habit: experiment, plain",
    candidates: TWO_WEEK_HABIT,
    expected: "habit:experiment",
    postText:
      "This week I am testing posting at 7 am instead of noon. I will know it works if the " +
      "morning posts get more comments than last week's average.",
  },
  {
    name: "habit: how you got here, plain",
    candidates: TWO_WEEK_HABIT,
    expected: "habit:how-you-got-here",
    postText:
      "I got into UX design because I kept rewriting confusing forms at my old bank job. The " +
      "turning point was a manager who let me redesign the loan form, and complaints halved.",
  },
  {
    name: "habit: advice, plain",
    candidates: TWO_WEEK_HABIT,
    expected: "habit:advice",
    postText:
      "If I could tell my 22-year-old self one thing about freelancing: raise your prices " +
      "before you feel ready. Every time I did, the work got better, not worse.",
  },
  {
    name: "habit: milestone, with a thank you",
    candidates: TWO_WEEK_HABIT,
    expected: "habit:milestone",
    note: "Says thank you, but to all readers; the post celebrates a milestone.",
    postText:
      "Small milestone: 100 subscribers to the newsletter. It took 14 months and 52 issues. " +
      "Thank you for reading 🎉",
  },
  {
    name: "habit: next topics, ends with a question",
    candidates: TWO_WEEK_HABIT,
    expected: "habit:next-topics",
    postText:
      "Next month I want to post more about pricing, client onboarding and saying no to " +
      "projects. Which one should I start with?",
  },
  {
    name: "habit: none, webinar",
    candidates: TWO_WEEK_HABIT,
    expected: null,
    postText:
      "Join us on Thursday at 6 pm for a free webinar on remote team rituals. Registration " +
      "link below.",
  },
  {
    name: "habit: none, industry news",
    candidates: TWO_WEEK_HABIT,
    expected: null,
    postText:
      "Big news today: two of the largest design tools announced a merger. Curious what it " +
      "means for pricing.",
  },
  {
    name: "habit: none, the matching day is not offered",
    candidates: HABIT_FIRST_THREE,
    expected: null,
    note: "Celebrates a milestone, which is not among the candidates.",
    postText:
      "We just shipped the 1,000th order from our online shop! It took two years of " +
      "weekends. 🎉",
  },
];
