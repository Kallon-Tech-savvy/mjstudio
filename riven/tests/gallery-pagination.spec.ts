import { expect, test } from "@playwright/test";

for (const width of [390, 1280]) {
  test(`gallery pages preserve results on failure and recover after removal at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    let fail = true;
    let total = 21;
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/auth/me")
        return route.fulfill({
          json: {
            data: { user: { userId: "photographer", studioId: "studio" } },
          },
        });
      if (url.pathname === "/api/clients")
        return route.fulfill({ json: { data: [] } });
      if (url.pathname === "/api/galleries") {
        const number = Number(url.searchParams.get("page"));
        if (number === 2 && fail)
          return route.fulfill({
            status: 503,
            json: { error: { message: "Unable to load this page." } },
          });
        const data =
          number === 1
            ? Array.from({ length: 20 }, (_, i) => ({
                id: `gallery-${i}`,
                name: `Portrait session ${i}`,
                workflowStatus: "draft",
              }))
            : total === 21
              ? [
                  {
                    id: "older",
                    name: "Older wedding",
                    workflowStatus: "draft",
                  },
                ]
              : [];
        return route.fulfill({ json: { data, meta: { total } } });
      }
      return route.fulfill({ json: { data: [] } });
    });
    await page.goto("/photographer/galleries");
    await expect(page.getByText("Page 1 of 2 · 21 galleries")).toBeVisible();
    await page.getByLabel("Find on this page").fill("missing");
    await expect(
      page.getByText("No matches on this page.", { exact: false }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Next page" }).click();
    await expect(page.getByRole("alert")).toContainText(
      "Unable to load this page.",
    );
    await page.getByLabel("Find on this page").fill("");
    await expect(
      page.getByRole("link", { name: /Portrait session 0 / }),
    ).toBeVisible();
    fail = false;
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(
      page.getByRole("link", { name: /Older wedding/ }),
    ).toBeVisible();
    await expect(page.getByText("Page 2 of 2 · 21 galleries")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Next page" }),
    ).toBeDisabled();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    total = 20;
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(page.getByText("Page 1 of 1 · 20 galleries")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Previous page" }),
    ).toBeDisabled();
  });
}
