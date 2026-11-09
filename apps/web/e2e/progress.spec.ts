import { expect, type Page, test } from "@playwright/test";

// Phase 3 end to end, against the mock Buffer server: "Check Buffer now" follows a saved draft until
// it is sent, a post written in Buffer gets a day by hand, and a failed post raises an alert.
const mockUrl = process.env.E2E_MOCK_BUFFER_URL;

interface MockPost {
  id: string;
  text: string;
  status: string;
  tagIds: string[];
}

async function control(page: Page, data: Record<string, unknown>) {
  const response = await page.request.post(`${mockUrl}/__control`, { data });
  expect(response.ok()).toBe(true);
}

async function anaPosts(page: Page): Promise<MockPost[]> {
  const state = (await (await page.request.get(`${mockUrl}/__control`)).json()) as {
    accounts: { ana: { posts: MockPost[] } };
  };
  return state.accounts.ana.posts;
}

test.describe("progress checks", () => {
  test.skip(!mockUrl, "Set E2E_MOCK_BUFFER_URL to run against the mock Buffer server");
  test.describe.configure({ mode: "serial" });

  test("Check Buffer now follows posts in Buffer, matches by hand and raises alerts", async ({
    page,
  }, testInfo) => {
    const title = `E2E progress ${testInfo.project.name}`;
    // Unique per run: the mock keeps posts from earlier runs.
    const nativeText = `A tool I could not work without: my notebook (${title}, ${Date.now()}).`;

    await page.goto("/connect");
    await page.getByRole("main").getByRole("link", { name: "Connect Buffer" }).click();
    await page.locator("input[name=account][value=ana]").check();
    await page.getByRole("button", { name: "Allow" }).click();
    await expect(page).toHaveURL(/\/settings\/channels/);
    const linkedIn = page.getByRole("checkbox", { name: "Ana Popescu LinkedIn" });
    if (!(await linkedIn.isChecked())) {
      await linkedIn.check();
      await page.getByRole("button", { name: "Save channels" }).click();
      await expect(page.getByText(/saved/i).first()).toBeVisible();
    }

    await page.goto("/challenges/new");
    await page.getByLabel("Challenge name").fill(title);
    await page.getByRole("button", { name: "Next: Prompts" }).click();
    await page.getByRole("button", { name: "Next: Schedule" }).click();
    await page.getByRole("button", { name: "Next: Rules" }).click();
    await page.getByRole("button", { name: "Next: Review" }).click();
    await page.getByRole("button", { name: "Create challenge" }).click();
    await expect(page).toHaveURL(/\?created=1$/);

    // Today's prompt goes to Buffer as a draft; then Buffer sends it.
    await page.getByRole("button", { name: "Save as a draft" }).click();
    await expect(page.getByText(/Saved as a draft on/)).toBeVisible();
    const draft = (await anaPosts(page)).at(-1);
    if (!draft) throw new Error("no draft in the mock");
    await control(page, {
      action: "set-post",
      postId: draft.id,
      post: { status: "sent", sentAt: new Date().toISOString() },
    });
    await page.getByRole("button", { name: "Check Buffer now" }).click();
    await expect(page.getByText(/Checked Buffer\. 1 day updated\./)).toBeVisible();
    await expect(page.getByText(/^Posted · on /)).toBeVisible();

    // A post written in Buffer itself waits under "Other posts" until it gets a day.
    await control(page, {
      action: "add-post",
      post: { channelId: "ch-ana-li", text: nativeText },
    });
    await page.getByRole("button", { name: "Check Buffer now" }).click();
    const other = page.getByRole("region", { name: "Other posts" });
    await expect(other.getByText(/Your post on Ana Popescu/)).toBeVisible();
    // Its first words show, so it can be told apart from other posts.
    await expect(other.getByText(`“${nativeText}”`)).toBeVisible();
    await other.getByLabel("Day this post is for").selectOption({ index: 0 });
    await other.getByRole("button", { name: "Count it" }).click();
    // The post leaves "Other posts" and its day shows the post's state.
    await expect(page.getByRole("region", { name: "Other posts" })).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Coming up" }).getByText("Scheduled"),
    ).toBeVisible();

    // The next check tags it with the challenge tag; then Buffer fails to publish it.
    await page.getByRole("button", { name: "Check Buffer now" }).click();
    await expect
      .poll(async () => {
        const post = (await anaPosts(page)).find((p) => p.text === nativeText);
        return post?.tagIds.length;
      })
      .toBe(1);
    await expect(page.getByRole("button", { name: "Check Buffer now" })).toBeEnabled();
    const native = (await anaPosts(page)).find((post) => post.text === nativeText);
    await control(page, {
      action: "set-post",
      postId: native?.id,
      post: { status: "error", error: { message: "The link preview failed", supportUrl: null } },
    });
    await page.getByRole("button", { name: "Check Buffer now" }).click();
    const alerts = page.getByRole("region", { name: "Alerts" });
    await expect(alerts.getByText("Buffer says: The link preview failed")).toBeVisible();
    await alerts.getByRole("button", { name: "Dismiss" }).click();
    await expect(page.getByRole("region", { name: "Alerts" })).toHaveCount(0);
  });
});
