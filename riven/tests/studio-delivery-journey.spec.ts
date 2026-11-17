import { expect, test } from "@playwright/test";

for (const width of [320, 1280]) {
  test(`review to release with readiness recovery at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    let approved = false,
      prepared = false,
      released = false,
      fail = false;
    const photo = {
      photoId: "photo-a",
      position: 0,
      filename: "portrait.jpg",
      preview: {
        url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20'/%3E",
        width: 20,
        height: 20,
      },
    };
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      const ok = (data: unknown) => route.fulfill({ json: { data } });
      const delivery = () => ({
        id: "delivery-a",
        status: prepared ? "preparing" : "pending",
        canPrepare: approved && !released,
        approvedCount: approved ? 1 : 0,
        totalSelectedCount: 1,
        releasedAt: released ? "2026-11-16T12:00:00Z" : null,
        items: prepared ? [{ id: "item-a", ...photo, status: "ready" }] : [],
      });
      if (path === "/api/auth/me")
        return ok({ user: { userId: "owner", studioId: "studio" } });
      if (path.endsWith("/review")) {
        approved = true;
        fail = true;
        return ok({ photoId: "photo-a", status: "approved", note: null });
      }
      if (path.endsWith("/delivery/prepare")) {
        prepared = true;
        return ok(delivery());
      }
      if (path.endsWith("/delivery/release")) {
        released = true;
        return ok(delivery());
      }
      if (path.endsWith("/delivery")) {
        if (fail) {
          fail = false;
          return route.fulfill({
            status: 503,
            json: { error: { message: "Unavailable" } },
          });
        }
        return ok(delivery());
      }
      if (path.endsWith("/selected-photos"))
        return ok([{ ...photo, reviewStatus: "pending" }]);
      if (path === "/api/galleries/gallery-a")
        return ok({
          id: "gallery-a",
          name: "Portrait session",
          publicationStatus: "published",
          selectionStatus: "submitted",
        });
      if (path.endsWith("/photos"))
        return ok([
          { id: "photo-a", filename: "portrait.jpg", status: "active" },
        ]);
      return ok([]);
    });
    await page.goto("/photographer/galleries/gallery-a");
    await expect(
      page.getByRole("heading", { name: "Review the client’s selection" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Inspect photograph 1" }).click();
    await page.getByRole("button", { name: "Save review" }).click();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("Your review is saved");
    await expect(
      page.getByRole("button", { name: "Prepare final photographs" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Check delivery again" }).click();
    await page
      .getByRole("button", { name: "Prepare final photographs" })
      .click();
    await expect(
      page.getByText("Prepared · private", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Prepare final photographs" }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Release to client", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Photographs released" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Inspect photograph 1" }).click();
    await expect(
      page.getByRole("button", { name: "Save review" }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.screenshot({
      path: testInfo.outputPath("released.png"),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
