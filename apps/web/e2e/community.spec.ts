import AxeBuilder from "@axe-core/playwright";
import { type BrowserContextOptions, expect, type Page, test } from "@playwright/test";

// A challenge's Community end to end, with two people against the mock Buffer server: the day's
// prompt in Updates, host news, chat, a shared post, reactions, unread counts, and the host's
// invite and moderation controls (pause, new link, ban).
const mockUrl = process.env.E2E_MOCK_BUFFER_URL;

async function approveAs(page: Page, account: "ana" | "ben") {
  await expect(page.getByRole("heading", { name: /Allow this app/ })).toBeVisible();
  await page.locator(`input[name=account][value=${account}]`).check();
  await page.getByRole("button", { name: "Allow" }).click();
}

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
    .exclude("nextjs-portal")
    .analyze();
  expect(results.violations).toEqual([]);
}

// Taps Send: on phones Enter adds a line, so the button is the one way that works everywhere.
async function send(page: Page, text: string) {
  const box = page.getByRole("textbox", { name: /Message|link and a note/ });
  await box.fill(text);
  await page.getByRole("button", { name: /Send/ }).click();
  await expect(box).toHaveValue("");
}

test.describe("community", () => {
  test.skip(!mockUrl, "Set E2E_MOCK_BUFFER_URL to run against the mock Buffer server");
  test.describe.configure({ mode: "serial" });

  test("the group talks, shares posts and reacts; the host pauses, renews the link and bans", async ({
    page,
    browser,
  }, testInfo) => {
    const title = `E2E community ${testInfo.project.name}`;

    // Ana hosts a challenge where everyone starts today, so Updates has today's prompt.
    await page.goto("/connect");
    await page.getByRole("main").getByRole("link", { name: "Connect Buffer" }).click();
    await approveAs(page, "ana");
    await page.goto("/challenges/new");
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await page.getByLabel("Challenge name").fill(title);
    await page.getByRole("button", { name: "Next: Prompts" }).click();
    await page.getByRole("button", { name: "Next: Schedule" }).click();
    await page.getByRole("radio", { name: /Everyone on the same date/ }).check();
    await page.getByRole("button", { name: "Next: Rules" }).click();
    await expect(page.getByRole("radio", { name: /^Chat on/ })).toBeChecked();
    await page.getByRole("button", { name: "Next: Review" }).click();
    await expect(page.getByText("On: chat, shared posts and reactions")).toBeVisible();
    await page.getByRole("button", { name: "Create challenge" }).click();
    await expect(page).toHaveURL(/\?created=1$/);
    const challengePath = new URL(page.url()).pathname;
    const community = `${challengePath}/community`;

    // Updates: today's prompt is there, and Ana posts news.
    await page.goto(`${community}?place=updates`);
    await expect(page.getByRole("heading", { name: /What you do, in one sentence/ })).toBeVisible();
    await send(page, "Happy hour on Thursday at 10:00. Sign up: https://example.com/form");
    await expect(page.getByText(/Happy hour on Thursday/)).toBeVisible();
    await expectNoAxeViolations(page);

    await page.getByRole("button", { name: "Invite" }).click();
    const inviteUrl = await page.getByLabel("Invite link").inputValue();
    await page.keyboard.press("Escape");

    // Ben joins.
    const use = testInfo.project.use;
    const options: BrowserContextOptions = {
      baseURL: use.baseURL,
      viewport: use.viewport,
      isMobile: use.isMobile,
      hasTouch: use.hasTouch,
      userAgent: use.userAgent,
      deviceScaleFactor: use.deviceScaleFactor,
    };
    const benContext = await browser.newContext(options);
    const ben = await benContext.newPage();
    await ben.goto(inviteUrl);
    await ben.getByRole("link", { name: "Connect Buffer and join" }).click();
    await approveAs(ben, "ben");
    await ben.getByLabel("I understand what joining shares").check();
    await ben.getByRole("button", { name: "Join challenge" }).click();
    await expect(ben).toHaveURL(/\?joined=1/);

    // Ben reads Updates, cannot write there, and reacts to Ana's news.
    await ben.goto(`${community}?place=updates`);
    await expect(
      ben.getByText("Only the host posts here.", { exact: false }).filter({ visible: true }),
    ).toBeVisible();
    const news = ben.getByRole("listitem").filter({ hasText: "Happy hour on Thursday" });
    await news.hover();
    await news.getByRole("button", { name: /React to Ana Popescu's message/ }).click();
    await ben.getByRole("button", { name: "React with fire" }).click();
    await expect(news.getByRole("button", { name: /fire, 1: You/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // Ben says hello in Chat and shares a post in Posts.
    await ben.goto(`${community}?place=chat`);
    await send(ben, "Hello everyone, excited for day 1!");
    await ben.goto(`${community}?place=posts`);
    await send(ben, "My day 1 post https://www.linkedin.com/posts/ben-day-1");
    const shared = ben.getByRole("link", { name: /LinkedIn/ }).first();
    await expect(shared).toHaveAttribute("href", "https://www.linkedin.com/posts/ben-day-1");
    await expectNoAxeViolations(ben);

    // Ana sees the unread chat on the Community tab, and the message once she opens Chat.
    await page.goto(challengePath);
    await expect(
      page.getByRole("navigation", { name: "Challenge pages" }).getByRole("link", {
        name: /Community.*unread/,
      }),
    ).toBeVisible({ timeout: 40_000 });
    await page.goto(`${community}?place=chat`);
    const messages = page.getByRole("list", { name: "Messages" });
    await expect(messages.getByText("Hello everyone, excited for day 1!")).toBeVisible();

    // Ana pauses joining: the invite link shows a notice.
    await page.getByRole("button", { name: "Invite" }).click();
    await page.getByRole("switch", { name: /Pause joining/ }).click();
    await expect(page.getByText("Joining is paused.")).toBeVisible();
    await page.keyboard.press("Escape");
    const visitor = await browser.newContext(options);
    const visitorPage = await visitor.newPage();
    await visitorPage.goto(inviteUrl);
    await expect(visitorPage.getByText(/The host has paused joining/)).toBeVisible();

    // Ana bans Ben from his card, deleting his messages and renewing the link.
    await page.getByRole("button", { name: "Ben Ionescu", exact: true }).first().click();
    const card = page.getByRole("dialog", { name: "Ben Ionescu" });
    await expect(card.getByText("Hello everyone, excited for day 1!")).toBeVisible();
    await card.getByRole("button", { name: "Ban" }).click();
    await card.getByLabel(/Also delete their 2 messages/).check();
    await card.getByLabel(/Make a new invite link/).check();
    await card.getByRole("button", { name: "Ban Ben Ionescu" }).click();
    await expect(card.getByText(/Ben Ionescu is banned/)).toBeVisible();
    await page.keyboard.press("Escape");
    await page.reload();
    await expect(page.getByRole("list", { name: "Messages" })).toBeHidden();
    await expect(page.getByText(/No messages yet/).filter({ visible: true })).toBeVisible();

    // The old link no longer works, and the new one refuses Ben.
    await visitorPage.goto(inviteUrl);
    await expect(
      visitorPage.getByRole("heading", { name: "This invite link does not work" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Invite" }).click();
    await page.getByRole("switch", { name: /Pause joining/ }).click();
    await expect(page.getByText("Joining is open again.")).toBeVisible();
    const newInvite = await page.getByLabel("Invite link").inputValue();
    expect(newInvite).not.toBe(inviteUrl);
    await ben.goto(newInvite);
    await expect(ben.getByText("You cannot join this challenge.")).toBeVisible();
    await ben.goto(`${community}?place=chat`);
    await expect(
      ben.getByText(/You are not in this challenge/).filter({ visible: true }),
    ).toBeVisible();

    await visitor.close();
    await benContext.close();
  });
});
