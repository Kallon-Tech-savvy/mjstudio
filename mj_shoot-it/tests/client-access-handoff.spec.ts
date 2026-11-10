import { expect, test } from "@playwright/test";

for (const fromLink of [true, false]) {
  test(`client access uses the verified gallery and preserves retry input (${fromLink ? "private link" : "manual key"})`, async ({
    page,
  }) => {
    const secret = "synthetic-access-key-for-testing-only";
    const requests: unknown[] = [];
    let reject = true;
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/client/access/verify") {
        requests.push(route.request().postDataJSON());
        if (reject)
          return route.fulfill({
            status: 403,
            json: {
              error: {
                code: "INVALID_GALLERY_ACCESS",
                message: "Access denied",
              },
            },
          });
        return route.fulfill({
          json: {
            data: { authenticated: true, galleryId: "verified-gallery" },
          },
        });
      }
      if (path.endsWith("/photos"))
        return route.fulfill({ json: { data: [], meta: { total: 0 } } });
      if (path.endsWith("/selection"))
        return route.fulfill({
          json: { data: { status: "draft", items: [] } },
        });
      if (path.endsWith("/delivery"))
        return route.fulfill({
          json: { data: { isReleased: false, items: [] } },
        });
      return route.fulfill({
        json: {
          data: {
            id: "verified-gallery",
            name: "Verified portraits",
            permission: "view",
          },
        },
      });
    });
    await page.goto(
      `/client/access?galleryId=wrong-gallery${fromLink ? `#secret=${secret}` : ""}`,
    );
    if (fromLink) {
      await expect(
        page.getByText("Your private gallery link is ready.", { exact: false }),
      ).toBeVisible();
      expect(new URL(page.url()).hash).toBe("");
    } else {
      await page.getByLabel("Private access key").pressSequentially(secret);
      await expect(page.getByLabel("Private access key")).toHaveValue(secret);
    }
    await page.getByLabel("Six-digit gallery PIN").fill("123456");
    await page.getByRole("button", { name: "Open gallery" }).click();
    await expect(page.getByRole("alert")).toContainText("latest gallery link");
    await expect(page.getByLabel("Six-digit gallery PIN")).toHaveValue(
      "123456",
    );
    reject = false;
    await page.getByRole("button", { name: "Open gallery" }).click();
    await expect(page).toHaveURL(/\/client\/gallery\/verified-gallery$/);
    expect(requests).toEqual([
      { secret, pin: "123456" },
      { secret, pin: "123456" },
    ]);
  });
}

test("an incomplete verification response stays on the access form", async ({
  page,
}) => {
  await page.route("**/api/client/access/verify", (route) =>
    route.fulfill({ json: { data: { authenticated: true } } }),
  );
  await page.goto(
    "/client/access?galleryId=unverified#secret=synthetic-access-key-for-testing-only",
  );
  await page.getByLabel("Six-digit gallery PIN").fill("123456");
  await page.getByRole("button", { name: "Open gallery" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Gallery access was not confirmed",
  );
  await expect(page).toHaveURL(/\/client\/access\?galleryId=unverified$/);
});
