import { expect, type Page, test } from "@playwright/test";

async function fixture(page: Page) {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const ok = (data: unknown) => route.fulfill({ json: { data } });
    if (path.endsWith("/selection")) return ok({ status: "draft", items: [] });
    if (path.endsWith("/delivery")) return ok({ isReleased: false, items: [] });
    if (path.endsWith("/photos"))
      return ok(
        [0, 1].map((i) => ({
          photoId: `photo-${i}`,
          position: i,
          thumbnail: { url: "/photo.svg", width: 80, height: 80 },
        })),
      );
    if (/\/photos\/photo-/.test(path))
      return ok({
        position: path.endsWith("1") ? 1 : 0,
        preview: { url: "/photo.svg", width: 80, height: 80 },
      });
    return ok({ name: "Review gallery", permission: "view" });
  });
  await page.route("**/photo.svg", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"/>',
    }),
  );
  await page.goto("/client/gallery/old");
}
test("client viewer focuses inside the modal", async ({ page }) => {
  await fixture(page);
  await page
    .getByRole("button", { name: "Open photograph 1", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(
    await page
      .getByRole("dialog")
      .evaluate((el) => el.contains(document.activeElement)),
  ).toBe(true);
});
test("client note drafts belong to their photograph and survive navigation", async ({
  page,
}) => {
  await fixture(page);
  await page
    .getByRole("button", { name: "Open photograph 1", exact: true })
    .click();
  await page.getByRole("button", { name: "Leave a note", exact: true }).click();
  await page
    .getByLabel("Note about this photograph")
    .fill("A note intended only for photograph one");
  await page
    .getByRole("button", { name: "Next photograph", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("img")).toHaveAttribute(
    "alt",
    "Photograph 2 from this gallery",
  );
  await expect(page.getByLabel("Note about this photograph")).toHaveValue("");
  await page
    .getByRole("button", { name: "Previous photograph", exact: true })
    .click();
  await expect(page.getByLabel("Note about this photograph")).toHaveValue(
    "A note intended only for photograph one",
  );
});
test("delayed client responses cannot replace a different gallery", async ({
  page,
}) => {
  await fixture(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/client/galleries/old", async (route) => {
    await gate;
    await route.fulfill({ json: { data: { name: "Old gallery" } } });
  });
  await page.route("**/api/client/galleries/current", (route) =>
    route.fulfill({ json: { data: { name: "Current gallery" } } }),
  );
  const pending = page.waitForRequest(
    (r) => new URL(r.url()).pathname === "/api/client/galleries/old",
  );
  await page.reload();
  await pending;
  await page.evaluate(() => {
    history.pushState(null, "", "/client/gallery/current");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(
    page.getByRole("heading", { name: "Current gallery", exact: true }),
  ).toBeVisible();
  const response = page.waitForResponse(
    (r) => new URL(r.url()).pathname === "/api/client/galleries/old",
  );
  release();
  await response;
  await expect(
    page.getByRole("heading", { name: "Old gallery", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Current gallery", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/client\/gallery\/current$/);
});
test("an upload completing after navigation cannot replace the new gallery library", async ({
  page,
}) => {
  let release!: () => void;
  let uploaded = false;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    const ok = (data: unknown, meta?: object) =>
      route.fulfill({ json: { data, ...(meta ? { meta } : {}) } });
    if (path === "/api/auth/me")
      return ok({ user: { userId: "owner", studioId: "studio" } });
    if (path.endsWith("/delivery"))
      return route.fulfill({
        status: 404,
        json: { error: { message: "No delivery" } },
      });
    if (path.endsWith("/photos") && method === "POST")
      return ok({
        photo: { id: "old-photo" },
        upload: { method: "PUT", url: "http://127.0.0.1:3100/review-upload" },
      });
    if (path === "/api/photos/old-photo") return ok({ status: "active" });
    if (path.endsWith("/upload-complete")) return ok({ status: "active" });
    if (path === "/api/galleries/old/photos")
      return ok(
        uploaded
          ? [
              {
                id: "old-photo",
                filename: "old-gallery-photo.jpg",
                status: "active",
              },
            ]
          : [],
        { total: uploaded ? 1 : 0 },
      );
    if (path === "/api/galleries/current/photos")
      return ok(
        [
          {
            id: "current-photo",
            filename: "current-gallery-photo.jpg",
            status: "active",
          },
        ],
        { total: 1 },
      );
    if (path === "/api/galleries/old") return ok({ name: "Old gallery" });
    if (path === "/api/galleries/current")
      return ok({ name: "Current gallery" });
    return ok([]);
  });
  await page.route("**/review-upload", async (route) => {
    await gate;
    uploaded = true;
    await route.fulfill({ status: 204 });
  });
  await page.goto("/photographer/galleries/old");
  const pending = page.waitForRequest((r) =>
    r.url().endsWith("/review-upload"),
  );
  await page.getByLabel("Select photos to upload").setInputFiles({
    name: "old-gallery-photo.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from("fixture"),
  });
  await pending;
  await page.evaluate(() => {
    history.pushState(null, "", "/photographer/galleries/current");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(
    page.getByText("current-gallery-photo.jpg", { exact: true }),
  ).toBeVisible();
  const completed = page.waitForResponse((r) =>
    r.url().includes("/api/galleries/old/photos?page=1&limit=20"),
  );
  release();
  await completed;
  await expect(
    page.getByText("old-gallery-photo.jpg", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("current-gallery-photo.jpg", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Current gallery", exact: true }),
  ).toBeVisible();
});

test("client note keyboard editing stays on the photograph and failed sending preserves its draft", async ({
  page,
}) => {
  await fixture(page);
  let attempts = 0;
  const targets: string[] = [];
  await page.route(
    "**/api/client/galleries/old/photos/*/feedback",
    async (route) => {
      targets.push(new URL(route.request().url()).pathname);
      attempts += 1;
      await route.fulfill(
        attempts === 1
          ? { status: 503, json: { error: { message: "Note was not sent" } } }
          : { json: { data: { id: "feedback" } } },
      );
    },
  );
  await page
    .getByRole("button", { name: "Open photograph 1", exact: true })
    .click();
  await page.getByRole("button", { name: "Leave a note", exact: true }).click();
  await page
    .getByLabel("Note about this photograph")
    .fill("Please soften the shadows");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("dialog").getByRole("img")).toHaveAttribute(
    "alt",
    "Photograph 1 from this gallery",
  );
  await page.getByRole("button", { name: "Send note", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Note was not sent");
  await expect(page.getByLabel("Note about this photograph")).toHaveValue(
    "Please soften the shadows",
  );
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page
    .getByRole("button", { name: "Open photograph 1", exact: true })
    .click();
  await page.getByRole("button", { name: "Leave a note", exact: true }).click();
  await expect(page.getByLabel("Note about this photograph")).toHaveValue(
    "Please soften the shadows",
  );
  await page.getByRole("button", { name: "Send note", exact: true }).click();
  await expect(
    page.getByText("Your note was sent to the photographer."),
  ).toBeVisible();
  expect(targets).toEqual([
    "/api/client/galleries/old/photos/photo-0/feedback",
    "/api/client/galleries/old/photos/photo-0/feedback",
  ]);
});

test("a pending note send blocks navigation and closing until it finishes", async ({
  page,
}) => {
  await fixture(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    "**/api/client/galleries/old/photos/*/feedback",
    async (route) => {
      await gate;
      await route.fulfill({ json: { data: { id: "feedback" } } });
    },
  );
  await page
    .getByRole("button", { name: "Open photograph 1", exact: true })
    .click();
  await page.getByRole("button", { name: "Leave a note", exact: true }).click();
  await page
    .getByLabel("Note about this photograph")
    .fill("Keep this note on the first photo");
  await page.getByRole("button", { name: "Send note", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Next photograph", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Close", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeVisible();
  release();
  await expect(
    page.getByRole("button", { name: "Close", exact: true }),
  ).toBeEnabled();
});

test("client modal contains keyboard focus and restores its opener on a phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page);
  const opener = page.getByRole("button", {
    name: "Open photograph 1",
    exact: true,
  });
  await opener.click();
  const dialog = page.getByRole("dialog");
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    expect(
      await dialog.evaluate((el) => el.contains(document.activeElement)),
    ).toBe(true);
  }
  await page.keyboard.press("Shift+Tab");
  expect(
    await dialog.evaluate((el) => el.contains(document.activeElement)),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Leave a note", exact: true }).click();
  await page
    .getByLabel("Note about this photograph")
    .fill("Please keep this note with photograph one.");
  await expect(
    page.getByRole("button", { name: "Send note", exact: true }),
  ).toBeInViewport();
  await dialog.screenshot({ path: "test-results/client-note-mobile.png" });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});
