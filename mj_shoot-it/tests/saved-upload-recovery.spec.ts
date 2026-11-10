import { expect, type Page, test } from "@playwright/test";

async function savedWorkspace(
  page: Page,
  options: { removeFails?: boolean; pageFails?: () => boolean } = {},
) {
  let status = "processing";
  let removed = false;
  const deleted: string[] = [];
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const ok = (data: unknown, meta?: object) =>
      route.fulfill({ json: { data, ...(meta ? { meta } : {}) } });
    if (path === "/api/auth/me")
      return ok({ user: { userId: "owner", studioId: "studio" } });
    if (path.endsWith("/delivery"))
      return route.fulfill({
        status: 404,
        json: { error: { message: "No delivery" } },
      });
    if (path === "/api/galleries/saved-gallery")
      return ok({ id: "saved-gallery", name: "Paul · Portraits" });
    if (path.endsWith("/photos")) {
      if (url.searchParams.get("page") === "2") {
        if (options.pageFails?.())
          return route.fulfill({
            status: 503,
            json: { error: { message: "Could not load photographs" } },
          });
        return ok(
          removed
            ? []
            : [{ id: "unfinished", filename: "last-portrait.jpg", status }],
          { total: removed ? 20 : 21 },
        );
      }
      return ok(
        Array.from({ length: 20 }, (_, i) => ({
          id: `ready-${i}`,
          filename: `portrait-${i}.jpg`,
          status: "active",
        })),
        { total: removed ? 20 : 21 },
      );
    }
    if (
      path === "/api/photos/unfinished" &&
      route.request().method() === "DELETE"
    ) {
      deleted.push(path);
      if (options.removeFails)
        return route.fulfill({
          status: 503,
          json: { error: { message: "Could not remove photograph" } },
        });
      removed = true;
      return route.fulfill({ status: 204 });
    }
    if (path.endsWith("/upload-complete")) {
      if (options.confirmationFails) {
        status = "failed";
        return route.fulfill({
          status: 409,
          json: { error: { message: "Uploaded object could not be verified" } },
        });
      }
      status = "active";
      return ok({ status });
    }
    if (path === "/api/photos/unfinished") return ok({ status });
    return ok([]);
  });
  await page.goto("/photographer/galleries/saved-gallery");
  return {
    deleted,
    fail: () => {
      status = "failed";
    },
  };
}

test("saved uploads remain recoverable on later pages after reopening the gallery", async ({
  page,
}) => {
  const fixture = await savedWorkspace(page);
  await page.reload();
  await page.getByRole("button", { name: "Next photographs" }).click();
  const row = page
    .getByRole("listitem")
    .filter({ hasText: "last-portrait.jpg" });
  await expect(row).toContainText("Preparing photograph");
  await row.getByRole("button", { name: "Check upload" }).click();
  await expect(row).toContainText("Ready");
  expect(fixture.deleted).toEqual([]);
});

test("saved failure removal is explicit and returns to a valid page", async ({
  page,
}) => {
  const fixture = await savedWorkspace(page);
  fixture.fail();
  await page.getByRole("button", { name: "Next photographs" }).click();
  await expect(page.getByText("last-portrait.jpg")).toBeVisible();
  expect(fixture.deleted).toEqual([]);
  await page.getByRole("button", { name: "Remove incomplete upload" }).click();
  await expect(page.getByText("Page 1 of 1")).toBeVisible();
  await expect(page.getByText("last-portrait.jpg")).toHaveCount(0);
  expect(fixture.deleted).toEqual(["/api/photos/unfinished"]);
});

test("failed page loads preserve the current photographs and allow retry", async ({
  page,
}) => {
  let fail = true;
  await savedWorkspace(page, { pageFails: () => fail });
  await page.getByRole("button", { name: "Next photographs" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Could not load photographs",
  );
  await expect(page.getByText("portrait-0.jpg", { exact: true })).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Next photographs" }).click();
  await expect(page.getByText("last-portrait.jpg")).toBeVisible();
});

test("failed saved removal keeps the action available on a phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 760 });
  const fixture = await savedWorkspace(page, { removeFails: true });
  fixture.fail();
  await page.getByRole("button", { name: "Next photographs" }).click();
  await page.getByRole("button", { name: "Remove incomplete upload" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Could not remove photograph",
  );
  await expect(
    page.getByRole("button", { name: "Remove incomplete upload" }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("a failed confirmation refreshes the saved status without deleting the record", async ({
  page,
}) => {
  const fixture = await savedWorkspace(page, { confirmationFails: true });
  await page.getByRole("button", { name: "Next photographs" }).click();
  await page.getByRole("button", { name: "Check upload" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Uploaded object could not be verified",
  );
  await expect(
    page.getByRole("button", { name: "Remove incomplete upload" }),
  ).toBeVisible();
  expect(fixture.deleted).toEqual([]);
});

test("a delayed photo page cannot overwrite another gallery or leave it locked", async ({
  page,
}) => {
  await savedWorkspace(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    "**/api/galleries/saved-gallery/photos?page=2*",
    async (route) => {
      await gate;
      await route.fulfill({
        json: {
          data: [{ id: "stale", filename: "stale.jpg", status: "active" }],
          meta: { total: 21 },
        },
      });
    },
  );
  const requested = page.waitForRequest((request) =>
    request.url().includes("photos?page=2"),
  );
  await page.getByRole("button", { name: "Next photographs" }).click();
  await requested;
  await page.route("**/api/galleries/new-gallery", (route) =>
    route.fulfill({
      json: { data: { id: "new-gallery", name: "Current gallery" } },
    }),
  );
  await page.evaluate(() => {
    history.pushState(null, "", "/photographer/galleries/new-gallery");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(
    page.getByRole("heading", { name: "Current gallery", exact: true }),
  ).toBeVisible();
  const responded = page.waitForResponse((response) =>
    response.url().includes("saved-gallery/photos?page=2"),
  );
  release();
  await responded;
  await expect(page.getByText("stale.jpg")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Refresh photographs" }),
  ).toBeEnabled();
});
