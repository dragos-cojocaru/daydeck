import AxeBuilder from "@axe-core/playwright";
import { type BrowserContextOptions, expect, type Page, test } from "@playwright/test";

// Phase 2 end to end, against the mock Buffer server: a host creates a challenge, a second
// person joins through the invite link, saves today's prompt as a draft and plans one more day.
const mockUrl = process.env.E2E_MOCK_BUFFER_URL;

/** On phones the sidebar is a sheet behind the top bar's button; wider screens always show it. */
async function openSidebar(page: Page, phone: boolean) {
  if (phone) await page.getByRole("banner").getByRole("button", { name: "Toggle Sidebar" }).click();
}

/** The sidebar link marked as the current page. Earlier test runs leave same-named challenges. */
function currentSidebarLink(page: Page) {
  return page.getByRole("navigation", { name: "Main" }).locator('a[aria-current="page"]');
}

interface MockState {
  accounts: Record<
    string,
    {
      posts: {
        channelId: string;
        status: string;
        dueAt: string | null;
        tagIds: string[];
        text: string;
      }[];
      tags: { id: string; name: string }[];
    }
  >;
}

test.describe("challenges", () => {
  test.skip(!mockUrl, "Set E2E_MOCK_BUFFER_URL to run against the mock Buffer server");
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({ request }) => {
    await request.post(`${mockUrl}/__control`, { data: { action: "reset" } });
  });

  async function expectNoAxeViolations(page: Page) {
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
      .exclude("nextjs-portal")
      .analyze();
    expect(results.violations).toEqual([]);
  }

  async function approveAs(page: Page, account: "ana" | "ben") {
    await expect(page.getByRole("heading", { name: /Allow this app/ })).toBeVisible();
    await page.locator(`input[name=account][value=${account}]`).check();
    await page.getByRole("button", { name: "Allow" }).click();
  }

  test("a host creates a challenge, a second person joins and saves today's prompt as a draft", async ({
    page,
    browser,
    request,
  }, testInfo) => {
    const title = `E2E kickstart ${testInfo.project.name}`;

    // The host connects and runs the setup wizard.
    await page.goto("/connect");
    await page.getByRole("main").getByRole("link", { name: "Connect Buffer" }).click();
    await approveAs(page, "ana");
    await expect(page).toHaveURL(/\/settings\/channels/);

    await page.goto("/challenges/new");
    await page.getByRole("button", { name: "Next: Prompts" }).click();
    await expect(page.getByText("Use at least 3 characters.")).toBeVisible();
    await page.getByLabel("Challenge name").fill(title);
    await page.getByRole("button", { name: "Next: Prompts" }).click();
    await expect(page.getByRole("heading", { name: "Choose the prompts" })).toBeVisible();
    await expect(page.getByText("Step 2 of 5")).toBeVisible();
    await expect(page.getByRole("radio", { name: /Five-day kickstart/ })).toBeChecked();
    await expectNoAxeViolations(page);
    await page.getByRole("button", { name: "Next: Schedule" }).click();
    await expect(page.getByRole("radio", { name: /On the day they join/ })).toBeChecked();
    // A shared start date comes from a calendar; only today or later can be picked.
    await page.getByRole("radio", { name: /Everyone on the same date/ }).check();
    await page.getByLabel("Start date").click();
    await expect(page.getByRole("grid")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByLabel("Time zone")).toBeVisible();
    await page.getByRole("radio", { name: /On the day they join/ }).check();
    await page.getByRole("button", { name: "Next: Rules" }).click();
    await expect(page.getByRole("radio", { name: /Any network/ })).toBeChecked();
    await page.getByRole("button", { name: "Next: Review" }).click();
    // The review lists every prompt, not just the first few.
    await expect(page.getByRole("heading", { name: "Prompts · 5 days" })).toBeVisible();
    await expectNoAxeViolations(page);
    await page.getByRole("button", { name: "Create challenge" }).click();

    // The new challenge opens with its invite link, and the sidebar lists it.
    await expect(page).toHaveURL(/\/challenges\/[^/?]+\?created=1$/);
    const challengePath = new URL(page.url()).pathname;
    await expect(page.getByText("Your challenge is ready")).toBeVisible();
    await page.getByRole("button", { name: "Invite" }).click();
    const inviteUrl = await page.getByLabel("Invite link").inputValue();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Invite people" })).toBeHidden();
    expect(inviteUrl).toMatch(/\/c\/[A-Za-z0-9_-]{22}$/);
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
    await expect(page.getByRole("main").getByText("Host", { exact: true })).toBeVisible();
    await expectNoAxeViolations(page);
    const phone = testInfo.project.name === "phone";
    await openSidebar(page, phone);
    // The row also shows the days left, such as "5d left", after the name.
    await expect(currentSidebarLink(page)).toHaveText(new RegExp(`^${title}`));

    // "Host a challenge" opens a blank form again, not the last answers.
    await page.getByRole("link", { name: "Host a challenge" }).first().click();
    await expect(page.getByLabel("Challenge name")).toHaveValue("");
    await page.goto(challengePath);

    // A second person, in a separate browser session, follows the invite link.
    const use = testInfo.project.use;
    const options: BrowserContextOptions = {
      baseURL: use.baseURL,
      ignoreHTTPSErrors: use.ignoreHTTPSErrors,
      viewport: use.viewport,
      isMobile: use.isMobile,
      hasTouch: use.hasTouch,
      userAgent: use.userAgent,
      deviceScaleFactor: use.deviceScaleFactor,
    };
    const ben = await browser.newContext(options);
    const guest = await ben.newPage();
    await guest.goto(inviteUrl);
    await expect(guest.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(guest.getByText("Ana Popescu invites you to")).toBeVisible();
    await expectNoAxeViolations(guest);

    await guest.getByRole("link", { name: "Connect Buffer and join" }).click();
    await approveAs(guest, "ben");
    await expect(guest).toHaveURL(/\/c\//);
    await expect(guest.getByRole("checkbox", { name: /Ben on Mastodon/ })).toBeChecked();
    await expectNoAxeViolations(guest);
    await guest.getByLabel("I understand what joining shares").check();
    await guest.getByRole("button", { name: "Join challenge" }).click();

    await expect(guest).toHaveURL(/\/challenges\/[^/]+\?joined=1/);
    await expect(guest.getByText(`You joined ${title}`)).toBeVisible();
    await openSidebar(guest, phone);
    await expect(currentSidebarLink(guest)).toHaveText(new RegExp(`^${title}`));
    if (phone) await guest.keyboard.press("Escape");
    // The draft goes to every channel of the challenge, shown as ticked logo chips.
    await expect(guest.getByRole("checkbox", { name: /Ben on Mastodon/ })).toBeChecked();
    // The participant edits the draft before it goes to Buffer.
    await guest.getByRole("button", { name: "Edit the draft" }).click();
    await guest.getByLabel("Your draft").fill("My own first line for day one.");
    await guest.getByRole("button", { name: "Done editing" }).click();
    await expect(guest.getByText("Your draft starts with (edited)")).toBeVisible();
    await guest.getByRole("button", { name: "Save as a draft" }).click();
    await expect(guest.getByText("Saved as a draft on Ben on Mastodon.")).toBeVisible();
    const draftsUrl = "https://publish.buffer.com/channels/ch-ben-masto/schedule?tab=drafts";
    await expect(guest.getByRole("link", { name: /See drafts in Buffer/ })).toHaveAttribute(
      "href",
      draftsUrl,
    );
    await expectNoAxeViolations(guest);

    // Schedule opens with suggestions already loaded from Buffer.
    await guest
      .getByRole("navigation", { name: "Challenge pages" })
      .getByRole("link", { name: "Schedule" })
      .click();
    const rows = guest.getByRole("combobox");
    await expect(rows.first()).toBeVisible();
    await expect(guest.getByRole("button", { name: "Check Buffer again" })).toBeVisible();

    // Reloading within a minute is served from the cache: no new Buffer requests.
    const graphqlCalls = async () =>
      ((await (await request.get(`${mockUrl}/__control`)).json()) as { graphqlCalls: number })
        .graphqlCalls;
    const before = await graphqlCalls();
    await guest.reload();
    await expect(rows.first()).toBeVisible();
    expect(await graphqlCalls()).toBe(before);

    // One more day goes into a free posting slot as a timed draft.
    const count = await rows.count();
    for (let index = 1; index < count; index++)
      await rows.nth(index).selectOption({ label: "Skip this day" });
    await guest.getByRole("button", { name: "Save 1 day to Buffer" }).click();
    await expect(guest.getByText(/1 day is in Buffer as drafts with a time/)).toBeVisible();
    await expect(guest.getByRole("link", { name: /See drafts in Buffer/ })).toHaveAttribute(
      "href",
      draftsUrl,
    );
    await expectNoAxeViolations(guest);

    // Buffer received two drafts with the challenge tag, one of them with a time.
    const state = (await (await request.get(`${mockUrl}/__control`)).json()) as MockState;
    const benInBuffer = state.accounts.ben;
    expect(benInBuffer?.tags.map((tag) => tag.name)).toEqual([`Daydeck: ${title}`]);
    expect(
      benInBuffer?.posts.map((post) => [post.channelId, post.status, Boolean(post.dueAt)]),
    ).toEqual([
      ["ch-ben-masto", "draft", false],
      ["ch-ben-masto", "draft", true],
    ]);
    expect(benInBuffer?.posts[0]?.text).toBe("My own first line for day one.");
    expect(benInBuffer?.posts.every((post) => post.tagIds[0] === benInBuffer.tags[0]?.id)).toBe(
      true,
    );

    // The host sees the group grow.
    await page.reload();
    await expect(page.getByRole("main").getByText("2 people", { exact: true })).toBeVisible();
    await ben.close();
  });
});
