import { expect, test } from "@playwright/test";

for (const width of [360, 1440]) {
  test(`gallery explains saving, note context and submission constraints at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    let submitted = false;
    await page.route("**/api/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      const data = path.endsWith("/photos")
        ? []
        : path.endsWith("/selection")
          ? { status: submitted ? "submitted" : "draft", items: [] }
          : path.endsWith("/delivery")
            ? { isReleased: false, items: [] }
            : { id: "journey", name: "Test gallery" };
      return route.fulfill({ json: { data } });
    });
    await page.goto("/client/gallery/journey");
    await expect(
      page
        .getByRole("navigation", { name: "Your gallery journey" })
        .locator('[aria-current="step"]'),
    ).toHaveText("1Choose favourites");
    await expect(
      page.getByText("Choices save as you go.", { exact: false }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Leave a note for your photographer" })
      .click();
    await expect(
      page.getByRole("textbox", { name: "Note for your photographer" }),
    ).toBeFocused();
    await expect(
      page.getByText("This note is about the gallery.", { exact: false }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Leave a note for your photographer" }),
    ).toBeFocused();
    submitted = true;
    await page.reload();
    await expect(
      page.getByText("Selections are locked after sending.", { exact: false }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}
