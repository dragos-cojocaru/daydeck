import AxeBuilder from "@axe-core/playwright";
import { type BrowserContextOptions, expect, type Page, test } from "@playwright/test";

// Phases 4 and 5 end to end, against the mock Buffer server, with two people: the board fills
// in, the recap and badge work, and a participant leaves, then deletes their data.
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

test.describe("board, recap and data controls", () => {
  test.skip(!mockUrl, "Set E2E_MOCK_BUFFER_URL to run against the mock Buffer server");
  test.describe.configure({ mode: "serial" });

  test("two people share a board, a recap and a badge; one leaves and deletes their data", async ({
    page,
    browser,
  }, testInfo) => {
    const title = `E2E social ${testInfo.project.name}`;

    // Ana hosts.
    await page.goto("/connect");
    await page.getByRole("main").getByRole("link", { name: "Connect Buffer" }).click();
    await approveAs(page, "ana");
    await page.goto("/challenges/new");
    await page.getByLabel("Challenge name").fill(title);
    await page.getByRole("button", { name: "Next: Prompts" }).click();
    await page.getByRole("button", { name: "Next: Schedule" }).click();
    await page.getByRole("button", { name: "Next: Rules" }).click();
    await page.getByRole("radio", { name: /Anyone with the link/ }).check();
    await page.getByRole("button", { name: "Next: Review" }).click();
    await page.getByRole("button", { name: "Create challenge" }).click();
    await expect(page).toHaveURL(/\?created=1$/);
    const challengePath = new URL(page.url()).pathname;
    await page.getByRole("button", { name: "Invite" }).click();
    const inviteUrl = await page.getByLabel("Invite link").inputValue();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Invite people" })).toBeHidden();

    // Ben joins and agrees to appear on the recap.
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
    await ben.getByLabel(/Show my name and post links/).check();
    await ben.getByRole("button", { name: "Join challenge" }).click();
    await expect(ben).toHaveURL(/\?joined=1/);

    // Ben saves today's prompt; Buffer sends it; "Check Buffer now" sees it.
    await ben.getByRole("button", { name: "Save as a draft" }).click();
    await expect(ben.getByText(/Saved as a draft on/)).toBeVisible();

    // Ben asks the group for feedback on his draft; Ana replies; Ben sees the reply.
    await ben.getByRole("button", { name: "Ask the group for feedback" }).click();
    await ben.getByRole("button", { name: "Share my draft" }).click();
    await expect(ben.getByText(/Shared with the group/)).toBeVisible();
    // Feedback on drafts lives in the challenge's Community.
    await page.goto(`${challengePath}/community?place=feedback`);
    const forGroup = page.getByRole("region", { name: "Feedback for the group" });
    await forGroup.getByLabel("Your reply").fill("Lead with the result, then the story.");
    await forGroup.getByRole("button", { name: "Send feedback" }).click();
    await ben.goto(`${challengePath}/community?place=feedback`);
    const mine = ben.getByRole("region", { name: "Your feedback requests" });
    await expect(mine.getByText("Lead with the result, then the story.")).toBeVisible();
    // Buffer Notes are off in tests, so the reply offers a copy into Buffer.
    await expect(mine.getByRole("button", { name: "Copy into Buffer" })).toBeVisible();
    const state = (await (await ben.request.get(`${mockUrl}/__control`)).json()) as {
      accounts: { ben: { posts: { id: string }[] } };
    };
    const draft = state.accounts.ben.posts.at(-1);
    await ben.request.post(`${mockUrl}/__control`, {
      data: {
        action: "set-post",
        account: "ben",
        postId: draft?.id,
        post: {
          status: "sent",
          sentAt: new Date().toISOString(),
          externalLink: "https://example.com/p/1",
        },
      },
    });
    await ben.goto(challengePath);
    await ben.getByRole("button", { name: "Check Buffer now" }).click();
    await expect(ben.getByText(/^Posted · on /)).toBeVisible();

    // Ana's board: Ben's day 1 is posted, every cell has a full label, arrows move focus.
    await page.goto(`${challengePath}/board`);
    // The calendar opens first: today's date lists Ben as posted.
    await expect(page.getByRole("heading", { name: /^\w+day \d+ \w+/ })).toBeVisible();
    await expect(page.getByRole("main").getByText("Ben Ionescu")).toBeVisible();
    await expectNoAxeViolations(page);
    await page.getByRole("button", { name: "People" }).click();
    const grid = page.getByRole("grid", { name: `Board of ${title}` });
    await expect(grid.getByRole("gridcell", { name: /^Ben Ionescu, day 1, posted/ })).toBeVisible();
    const first = grid.locator("td[tabindex='0']");
    await first.focus();
    const before = await first.getAttribute("aria-label");
    await page.keyboard.press("ArrowRight");
    const after = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
    expect(after).not.toBe(before);
    await expectNoAxeViolations(page);

    // The public recap names Ben (he opted in) and links his post; the badge is an image.
    await page.goto(challengePath.replace("/challenges/", "/recap/"));
    await expect(page.getByRole("link", { name: /^Day 1/ })).toHaveAttribute(
      "href",
      "https://example.com/p/1",
    );
    const badge = await page.request.get(
      (await page.getByRole("img", { name: /Your Daydeck badge/ }).getAttribute("src")) ?? "",
    );
    expect(badge.headers()["content-type"]).toContain("image/png");
    await expectNoAxeViolations(page);

    // Ben leaves the challenge, then deletes all his data.
    await ben.goto(challengePath);
    await ben.getByRole("button", { name: "Leave this challenge" }).click();
    await ben.getByRole("button", { name: "Leave the challenge" }).click();
    await expect(ben).toHaveURL(/\/challenges$/);
    await ben.goto("/settings/data");
    await ben.getByRole("button", { name: "Disconnect Buffer and delete my data" }).click();
    await expect(ben.getByRole("alertdialog")).toContainText("This cannot be undone");
    await ben.getByRole("button", { name: "Delete my data" }).click();
    await expect(ben).toHaveURL(/\/goodbye\?/);
    await expect(ben.getByRole("heading", { name: "Your data is deleted" })).toBeVisible();
    await expect(ben.getByText("Buffer confirmed that Daydeck's access is revoked.")).toBeVisible();
    await ben.goto("/challenges");
    await expect(ben).toHaveURL(/\/connect\?next=/);
    await benContext.close();
  });
});
