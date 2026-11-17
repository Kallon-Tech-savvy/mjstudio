import { expect, test } from "@playwright/test";

test("photographer checks a submitted response without losing access credentials", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 850 });
  let submitted = false;
  let access = false;
  let fail = false;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const ok = (data: unknown) => route.fulfill({ json: { data } });
    if (path === "/api/auth/me")
      return ok({ user: { userId: "owner", studioId: "studio" } });
    if (path.endsWith("/access")) {
      if (route.request().method() === "POST") {
        access = true;
        return ok({
          id: "access",
          secretToken: "fixture-only",
          pin: "fixture-pin",
          permission: "view",
          expiresAt: null,
        });
      }
      return ok(
        access ? [{ id: "access", revokedAt: null, expiresAt: null }] : [],
      );
    }
    if (path.endsWith("/feedback") && fail)
      return route.fulfill({
        status: 503,
        json: { error: { message: "Unavailable" } },
      });
    if (path.endsWith("/delivery"))
      return ok({
        approvedCount: 0,
        totalSelectedCount: submitted ? 1 : 0,
        canPrepare: false,
        items: [],
        status: "pending",
      });
    if (path.endsWith("/selected-photos"))
      return ok(
        submitted
          ? [
              {
                photoId: "photo-a",
                filename: "portrait.jpg",
                position: 0,
                reviewStatus: "pending",
                preview: {
                  url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E",
                  width: 20,
                  height: 20,
                },
              },
            ]
          : [],
      );
    if (path.endsWith("/photos"))
      return ok([
        { id: "photo-a", filename: "portrait.jpg", status: "active" },
      ]);
    if (path === "/api/galleries/response-test")
      return ok({
        name: "Augusta portraits",
        publicationStatus: "published",
        selectionStatus: submitted ? "submitted" : "draft",
      });
    return ok([]);
  });
  await page.goto("/photographer/galleries/response-test");
  await expect(
    page.getByRole("heading", { name: "Check client access" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Issue access link" }).click();
  const credentials = page.getByLabel("Client access link", { exact: true });
  const link = await credentials.inputValue();
  await expect(
    page.getByRole("heading", { name: "Waiting for the client’s selection" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Check client response", exact: true })
    .click();
  await expect(
    page.getByText("Checked just now. No submitted selection yet.", {
      exact: true,
    }),
  ).toContainText("No submitted selection yet");
  submitted = true;
  fail = true;
  await page
    .getByRole("button", { name: "Check client response", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Could not check");
  await expect(credentials).toHaveValue(link);
  await expect(
    page.getByRole("button", { name: "Inspect photograph 1" }),
  ).toHaveCount(0);
  fail = false;
  await page
    .getByRole("button", { name: "Check client response", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review the client’s selection" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Inspect photograph 1" }),
  ).toBeVisible();
  await expect(credentials).toHaveValue(link);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
