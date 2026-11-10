import { expect, test } from "@playwright/test";
const photo = {
  photoId: "photo-1",
  position: 0,
  thumbnail: { url: "/photo.svg", width: 80, height: 80 },
};
test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const data = path.endsWith("/photos")
      ? [photo]
      : path.endsWith("/selection")
        ? { status: "draft", items: [] }
        : path.endsWith("/delivery")
          ? { isReleased: false, items: [] }
          : { name: "Portrait session", permission: "view_download" };
    return route.fulfill({ json: { data } });
  });
});
test("shows loading without false empty counts or controls on a phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let resume!: () => void;
  const pending = new Promise<void>((resolve) => {
    resume = resolve;
  });
  await page.route("**/api/client/galleries/test/photos?**", async (route) => {
    await pending;
    await route.fulfill({ json: { data: [photo] } });
  });
  await page.goto("/client/gallery/test");
  try {
    await expect(page.getByRole("status")).toContainText(
      "Loading your photographs",
    );
    await expect(page.getByText("Your gallery is taking shape.")).toHaveCount(
      0,
    );
    await expect(page.getByText("0 photographs", { exact: true })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("button", { name: "Leave a note for your photographer" }),
    ).toHaveCount(0);
  } finally {
    resume();
  }
  await expect(
    page.getByRole("button", { name: "Open photograph 1", exact: true }),
  ).toBeVisible();
});
test("retries an incomplete load and restores the submitted selection", async ({
  page,
}) => {
  let failed = true;
  await page.route("**/api/client/galleries/test/selection", (route) =>
    failed
      ? route.fulfill({
          status: 503,
          json: { error: { message: "Temporarily unavailable" } },
        })
      : route.fulfill({
          json: {
            data: {
              status: "submitted",
              items: [{ photoId: "photo-1", selected: true }],
            },
          },
        }),
  );
  await page.goto("/client/gallery/test");
  await expect(
    page.getByRole("button", { name: "Try again", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Open photograph/ }),
  ).toHaveCount(0);
  await expect(page.getByText("Your gallery is taking shape.")).toHaveCount(0);
  failed = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Portrait session" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Selected", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Try again", exact: true }),
  ).toHaveCount(0);
});
test("shows empty only after a successful empty response", async ({ page }) => {
  await page.route("**/api/client/galleries/test/photos?**", (route) =>
    route.fulfill({ json: { data: [] } }),
  );
  await page.goto("/client/gallery/test");
  await expect(page.getByText("Your gallery is taking shape.")).toBeVisible();
  await expect(page.getByText("0 photographs", { exact: true })).toBeVisible();
});
test("retries delivery independently without resetting a saved choice", async ({
  page,
}) => {
  let failed = true;
  let photoLoads = 0;
  await page.route("**/api/client/galleries/test/photos?**", (route) => {
    photoLoads++;
    return route.fulfill({ json: { data: [photo] } });
  });
  await page.route("**/api/client/galleries/test/delivery", (route) =>
    failed
      ? route.fulfill({
          status: 503,
          json: { error: { message: "Delivery temporarily unavailable" } },
        })
      : route.fulfill({
          json: { data: { isReleased: true, items: [{ photoId: "photo-1" }] } },
        }),
  );
  await page.goto("/client/gallery/test");
  await expect(
    page.getByRole("button", { name: "Check delivery again" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Selected", exact: true }),
  ).toBeEnabled();
  await expect(page.getByText("Your choices are saved.")).toBeVisible();
  const before = photoLoads;
  failed = false;
  await page.getByRole("button", { name: "Check delivery again" }).click();
  await expect(
    page.getByRole("link", { name: "Download final photos" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Selected", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(photoLoads).toBe(before);
});
