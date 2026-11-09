import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

// "Popular challenges": the homepage section, and the host's choice to list a challenge there,
// which turns off and locks when the challenge stops being public and joinable.
const mockUrl = process.env.E2E_MOCK_BUFFER_URL;

async function expectNoAxeViolations(page: Page) {
  // Panels fade in on load; check contrast once they are fully shown.
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState === "finished"),
  );
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
    .exclude("nextjs-portal")
    .analyze();
  expect(results.violations).toEqual([]);
}

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`${colorScheme} theme`, () => {
    test.use({ colorScheme });

    test("the homepage shows Popular challenges, with a way to get listed", async ({ page }) => {
      await page.goto("/");
      const section = page.getByRole("region", { name: "Popular challenges" });
      await expect(section.getByRole("heading", { name: "Popular challenges" })).toBeVisible();
      await expect(
        section.getByRole("heading", { name: /Your challenge here|Yours could be the first here/ }),
      ).toBeVisible();
      await expect(section.getByRole("link", { name: "Host a challenge" })).toBeVisible();
      // The row scrolls sideways; the page itself never does.
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const width = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(width);
      await expectNoAxeViolations(page);
    });
  });
}

test.describe("listing a challenge", () => {
  test.skip(!mockUrl, "Set E2E_MOCK_BUFFER_URL to run against the mock Buffer server");

  test("the host's homepage switch turns off and locks when joining is paused or the recap is private", async ({
    page,
  }, testInfo) => {
    await page.goto("/connect");
    await page.getByRole("main").getByRole("link", { name: "Connect Buffer" }).click();
    await page.locator("input[name=account][value=ana]").check();
    await page.getByRole("button", { name: "Allow" }).click();
    await expect(page).toHaveURL(/\/settings\/channels/);

    // The setup form offers the homepage only for a public challenge.
    await page.goto("/challenges/new");
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await page.getByLabel("Challenge name").fill(`E2E homepage ${testInfo.project.name}`);
    for (const step of ["Next: Prompts", "Next: Schedule", "Next: Rules"]) {
      await page.getByRole("button", { name: step }).click();
    }
    const listIt = page.getByRole("checkbox", { name: /Also show it under Popular challenges/ });
    await expect(listIt).toHaveCount(0);
    await page.getByRole("radio", { name: /Anyone with the link/ }).check();
    await listIt.check();
    await page.getByRole("button", { name: "Next: Review" }).click();
    await expect(
      page.getByText("Anyone with the link, and on Daydeck's homepage while active"),
    ).toBeVisible();
    await page.getByRole("button", { name: "Create challenge" }).click();
    await expect(page).toHaveURL(/\/challenges\/[^/?]+\?created=1$/);

    const homepage = page.getByRole("switch", { name: "Show it under Popular challenges" });
    await expect(homepage).toBeChecked();

    // Pausing joining takes it off the homepage and locks the switch, with the reason.
    await page.getByRole("button", { name: "Invite" }).click();
    await page.getByRole("switch", { name: "Pause joining" }).click();
    await expect(page.getByText("Joining is paused.", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(homepage).not.toBeChecked();
    await expect(homepage).toBeDisabled();
    await expect(page.getByText(/Turn off “Pause joining” under Invite first/)).toBeVisible();

    // Opening joining again leaves it off until the host chooses it again.
    await page.getByRole("button", { name: "Invite" }).click();
    await page.getByRole("switch", { name: "Pause joining" }).click();
    await expect(page.getByText("Joining is open again.")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(homepage).toBeEnabled();
    await expect(homepage).not.toBeChecked();
    await homepage.click();
    await expect(homepage).toBeChecked();
    await expect(
      page.getByText("Saved. It shows on the homepage while it is active."),
    ).toBeVisible();

    // A private recap takes it off too.
    await page.getByRole("radio", { name: /Only people in the challenge/ }).check();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(homepage).toBeDisabled();
    await expect(homepage).not.toBeChecked();
    await expect(
      page.getByText(/Set “Who can see the recap” to “Anyone with the link” first/),
    ).toBeVisible();
    await expectNoAxeViolations(page);
  });
});
