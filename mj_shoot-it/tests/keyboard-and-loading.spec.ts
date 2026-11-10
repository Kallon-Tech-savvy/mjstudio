import { expect, type Page, test } from "@playwright/test";

const preview = {
  url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1600' height='1067'/%3E",
  width: 1600,
  height: 1067,
};
async function reviewWorkspace(page: Page, saveGate?: Promise<void>) {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const ok = (data: unknown) => route.fulfill({ json: { data } });
    if (path === "/api/auth/me")
      return ok({ user: { userId: "owner", studioId: "studio" } });
    if (path.endsWith("/review") && route.request().method() === "PUT") {
      await saveGate;
      return ok({ photoId: "photo-one", status: "approved", note: null });
    }
    if (path.endsWith("/selected-photos"))
      return ok([
        {
          photoId: "photo-one",
          position: 0,
          filename: "one.jpg",
          preview,
          reviewStatus: "pending",
        },
        {
          photoId: "photo-two",
          position: 1,
          filename: "two.jpg",
          preview,
          reviewStatus: "pending",
        },
      ]);
    if (path === "/api/galleries/review")
      return ok({
        id: "review",
        name: "Paul · Portraits",
        publicationStatus: "published",
        selectionStatus: "submitted",
      });
    if (path.endsWith("/delivery"))
      return route.fulfill({
        status: 404,
        json: { error: { message: "No delivery" } },
      });
    return ok([]);
  });
  await page.goto("/photographer/galleries/review");
}

test("photo review supports keyboard opening, focus containment, Escape and return to the opener", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await reviewWorkspace(page);
  const opener = page.getByRole("button", { name: "Inspect photograph 1" });
  await opener.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Review photograph 1" });
  await expect(dialog).toBeVisible();
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await dialog.screenshot({ path: "test-results/review-dialog-mobile.png" });
  for (let index = 0; index < 7; index++) {
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(
        () => document.activeElement?.closest("dialog") !== null,
      ),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test("moving between photographs clears unsaved notes and pending saves block navigation", async ({
  page,
}) => {
  let finishSave!: () => void;
  const saveGate = new Promise<void>((resolve) => {
    finishSave = resolve;
  });
  await reviewWorkspace(page, saveGate);
  await page.getByRole("button", { name: "Inspect photograph 1" }).click();
  await page.getByLabel("Review decision").selectOption("needs_revision");
  await page
    .getByLabel("Revision note")
    .fill("Test note for the first photograph");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Review photograph 2" }),
  ).toBeVisible();
  await expect(page.getByLabel("Revision note")).toHaveCount(0);
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await page.getByRole("button", { name: "Save review" }).click();
  await expect(
    page.getByRole("button", { name: "Next", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Close", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeVisible();
  finishSave();
  await expect(
    page.getByRole("button", { name: "Close", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("an older gallery response cannot replace the gallery reached through navigation", async ({
  page,
}) => {
  let finishOld!: () => void;
  const oldGate = new Promise<void>((resolve) => {
    finishOld = resolve;
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const ok = (data: unknown) => route.fulfill({ json: { data } });
    if (path === "/api/auth/me")
      return ok({ user: { userId: "owner", studioId: "studio" } });
    if (path === "/api/galleries/old") {
      await oldGate;
      return ok({ id: "old", name: "Old gallery" });
    }
    if (path === "/api/galleries/current")
      return ok({ id: "current", name: "Current gallery" });
    if (path.endsWith("/delivery"))
      return route.fulfill({
        status: 404,
        json: { error: { message: "No delivery" } },
      });
    return ok([]);
  });
  const oldRequested = page.waitForRequest(
    (request) => new URL(request.url()).pathname === "/api/galleries/old",
  );
  await page.goto("/photographer/galleries/old");
  await oldRequested;
  await page.evaluate(() => {
    window.history.pushState(null, "", "/photographer/galleries/current");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(
    page.getByRole("heading", { name: "Current gallery", exact: true }),
  ).toBeVisible();
  const oldResponse = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/galleries/old",
  );
  finishOld();
  await oldResponse;
  await expect(
    page.getByRole("heading", { name: "Old gallery", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Current gallery", exact: true }),
  ).toBeVisible();
});
