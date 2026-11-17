import { expect, type Page, test } from "@playwright/test";

const representation = (url: string) => ({
  url,
  width: 80,
  height: 80,
  mimeType: "image/svg+xml",
  expiresAt: "2020-01-01T00:00:00Z",
});
async function fixture(page: Page, expiredThumbnail = false) {
  await page.route("**/images/**", (route) =>
    route.request().url().includes("expired")
      ? route.fulfill({ status: 403, body: "Expired" })
      : route.fulfill({
          contentType: "image/svg+xml",
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"/>',
        }),
  );
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const data = path.endsWith("/photos")
      ? [0, 1].map((i) => ({
          photoId: `photo-${i}`,
          position: i,
          thumbnail: representation(
            expiredThumbnail && i === 0
              ? "/images/expired-thumb.svg"
              : "/images/thumb.svg",
          ),
        }))
      : path.endsWith("/selection")
        ? { status: "draft", items: [] }
        : path.endsWith("/delivery")
          ? { isReleased: false, items: [] }
          : path.includes("/photos/photo-")
            ? {
                photoId: path.split("/").pop(),
                position: path.endsWith("1") ? 1 : 0,
                preview: representation("/images/preview.svg"),
                thumbnail: representation("/images/fresh-thumb.svg"),
              }
            : { name: "Portrait session", permission: "view" };
    return route.fulfill({ json: { data } });
  });
}

test("refreshes an expired thumbnail through the authenticated photo endpoint", async ({
  page,
}) => {
  await fixture(page, true);
  await page.goto("/client/gallery/test");
  const image = page
    .getByRole("button", { name: "Open photograph 1", exact: true })
    .getByRole("img");
  await expect(image).toHaveAttribute("src", "/images/fresh-thumb.svg");
  expect(
    await image.evaluate((el) => (el as HTMLImageElement).naturalWidth),
  ).toBeGreaterThan(0);
});

test("stops after one failed automatic refresh and allows an explicit retry", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page);
  let calls = 0;
  let initialCalls = 0;
  await page.route("**/images/expired-*.svg", (route) => {
    if (!initialCalls) initialCalls = calls;
    return route.fulfill({ status: 403, body: "Expired" });
  });
  let available = false;
  await page.route("**/api/client/galleries/test/photos/photo-0", (route) => {
    calls++;
    return route.fulfill({
      json: {
        data: {
          photoId: "photo-0",
          position: 0,
          preview: representation(
            available ? "/images/fresh.svg" : `/images/expired-${calls}.svg`,
          ),
        },
      },
    });
  });
  await page.goto("/client/gallery/test");
  await page
    .getByRole("button", { name: "Open photograph 1", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: "Retry photograph" }),
  ).toBeVisible();
  expect(calls).toBe(initialCalls + 1);
  await expect(
    dialog.getByRole("button", { name: "Retry photograph" }),
  ).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: "test-results/client-image-retry-mobile.png" });
  available = true;
  await dialog.getByRole("button", { name: "Retry photograph" }).click();
  await expect(dialog.getByRole("img")).toHaveAttribute(
    "src",
    "/images/fresh.svg",
  );
  expect(calls).toBe(initialCalls + 2);
});

for (const status of [403, 503]) {
  test(`preserves notes and choices when refresh returns ${status}`, async ({
    page,
  }) => {
    await fixture(page);
    await page.goto("/client/gallery/test");
    await page
      .getByRole("button", { name: "Select", exact: true })
      .first()
      .click();
    await page
      .getByRole("button", { name: "Open photograph 1, selected", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("img")).toBeVisible();
    await dialog
      .getByRole("button", { name: "Leave a note", exact: true })
      .click();
    await page
      .getByLabel("Note about this photograph")
      .fill("Keep the natural colour.");
    let calls = 0;
    await page.route("**/api/client/galleries/test/photos/photo-0", (route) => {
      calls++;
      return route.fulfill({
        status,
        json: { error: { message: "Unavailable" } },
      });
    });
    await dialog.getByRole("img").dispatchEvent("error");
    await expect(
      dialog.getByRole("button", { name: "Retry photograph" }),
    ).toBeVisible();
    expect(calls).toBe(1);
    await expect(page.getByLabel("Note about this photograph")).toHaveValue(
      "Keep the natural colour.",
    );
    await expect(
      dialog.getByRole("button", { name: "Selected", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
  });
}

test("ignores a refreshed preview after navigating to another photo", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/client/gallery/test");
  await page
    .getByRole("button", { name: "Open photograph 1", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("img")).toBeVisible();
  let resume!: () => void;
  const pending = new Promise<void>((resolve) => {
    resume = resolve;
  });
  await page.route(
    "**/api/client/galleries/test/photos/photo-0",
    async (route) => {
      await pending;
      await route.fulfill({
        json: {
          data: {
            photoId: "photo-0",
            position: 0,
            preview: representation("/images/stale.svg"),
          },
        },
      });
    },
  );
  const refresh = page.waitForRequest(
    "**/api/client/galleries/test/photos/photo-0",
  );
  await dialog.getByRole("img").dispatchEvent("error");
  await refresh;
  try {
    await dialog
      .getByRole("button", { name: "Next photograph", exact: true })
      .click();
    await expect(dialog.getByRole("img")).toHaveAttribute(
      "alt",
      "Photograph 2 from this gallery",
    );
    const done = page.waitForResponse(
      "**/api/client/galleries/test/photos/photo-0",
    );
    resume();
    await done;
    await expect(dialog.getByRole("img")).toHaveAttribute(
      "src",
      "/images/preview.svg",
    );
    await expect(dialog.getByRole("img")).toHaveAttribute(
      "alt",
      "Photograph 2 from this gallery",
    );
  } finally {
    resume();
  }
});
