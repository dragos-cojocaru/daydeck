import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

// The connect flow against the mock Buffer server (e2e/mock-buffer/server.ts). The app under
// test must use BUFFER_AUTH_URL and BUFFER_API_URL that point at the mock, and
// E2E_MOCK_BUFFER_URL must point at the mock too. Without it, these tests are skipped.
const mockUrl = process.env.E2E_MOCK_BUFFER_URL;

test.describe("connect Buffer", () => {
  test.skip(!mockUrl, "Set E2E_MOCK_BUFFER_URL to run against the mock Buffer server");
  // The tests share one mock server and one database.
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({ request }) => {
    await request.post(`${mockUrl}/__control`, { data: { action: "reset" } });
  });

  async function expectNoAxeViolations(page: Page) {
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
      // The Next.js development overlay is not part of the app.
      .exclude("nextjs-portal")
      .analyze();
    expect(results.violations).toEqual([]);
  }

  async function connectAs(page: Page, account: "ana" | "ben" | "cara") {
    await page.goto("/connect");
    await page.getByRole("main").getByRole("link", { name: "Connect Buffer" }).click();
    await expect(page.getByRole("heading", { name: /Allow this app/ })).toBeVisible();
    await page.locator(`input[name=account][value=${account}]`).check();
    await page.getByRole("button", { name: "Allow" }).click();
  }

  test("a refusal on Buffer's screen explains itself and offers to try again", async ({ page }) => {
    await page.goto("/connect");
    await page.getByRole("main").getByRole("link", { name: "Connect Buffer" }).click();
    await page.getByRole("button", { name: "Deny" }).click();

    await expect(page).toHaveURL(/\/connect\?error=denied/);
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "You chose not to connect",
    );
    await expect(
      page.getByRole("main").getByRole("link", { name: "Connect Buffer" }),
    ).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("connecting lands on the channel picker, and choices are saved", async ({ page }) => {
    await connectAs(page, "ana");

    await expect(page).toHaveURL(/\/settings\/channels\?connected=1/);
    // Scoped to the page: React briefly keeps a hidden copy of streamed parts outside <main>.
    await expect(
      page.getByRole("main").getByText("Connected to Buffer as Ana Popescu"),
    ).toBeVisible();

    const linkedIn = page.getByRole("checkbox", { name: "Ana Popescu LinkedIn" });
    const bluesky = page.getByRole("checkbox", { name: "ana.bsky.social Bluesky" });
    const instagram = page.getByRole("checkbox", { name: "ana.makes Instagram" });
    await expect(instagram).toBeDisabled();
    await expect(page.getByRole("main").getByText("Disconnected in Buffer.")).toBeVisible();
    await expect(page.getByRole("main").getByText("Queue paused in Buffer.")).toBeVisible();
    await expectNoAxeViolations(page);

    // A tap is an unsaved change until it is undone. (Earlier runs may have saved choices.)
    const unsaved = page.getByText("You have changes that are not saved yet.");
    await bluesky.click();
    await expect(unsaved).toBeVisible();
    await bluesky.click();
    await expect(unsaved).toBeHidden();

    await linkedIn.check();
    await bluesky.uncheck();
    await page.getByRole("button", { name: "Save channels" }).click();
    await expect(page.getByText("Saved. 1 channel counts for your challenges.")).toBeVisible();

    await page.reload();
    await expect(linkedIn).toBeChecked();
    await expect(bluesky).not.toBeChecked();
  });

  test("an account without channels gets a next step, not a dead end", async ({ page }) => {
    await connectAs(page, "cara");
    await expect(page.getByRole("heading", { name: "No channels here yet" })).toBeVisible();
    const buffer = page.getByRole("link", { name: /Connect a channel in Buffer/ });
    await expect(buffer).toHaveAttribute("href", "https://publish.buffer.com/settings/channels");
    await expect(buffer).toHaveAttribute("target", "_blank");
    await expect(page.getByRole("button", { name: "Refresh from Buffer" })).toBeEnabled();
    await expectNoAxeViolations(page);
  });

  test("signing out ends the session and protects the settings page", async ({
    page,
  }, testInfo) => {
    await connectAs(page, "ana");
    await expect(page).toHaveURL(/\/settings\/channels/);

    // Sign out is in the account menu at the foot of the sidebar; on phones the sidebar is a sheet.
    if (testInfo.project.name === "phone")
      await page.getByRole("banner").getByRole("button", { name: "Toggle Sidebar" }).click();
    await page.getByRole("button", { name: "Ana Popescu" }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL("/");
    await expect(
      page.getByRole("banner").getByRole("link", { name: "Connect Buffer" }),
    ).toBeVisible();

    await page.goto("/settings/channels");
    await expect(page).toHaveURL(/\/connect\?next=%2Fsettings%2Fchannels/);
  });
});
