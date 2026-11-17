import { expect, type Page, test } from "@playwright/test";

async function publicationWorkspace(
  page: Page,
  options: { broken?: () => boolean } = {},
) {
  let access = false;
  let attempts = 0;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    const ok = (data: unknown) => route.fulfill({ json: { data } });
    if (path === "/api/auth/me")
      return ok({ user: { userId: "owner", studioId: "studio" } });
    if (path.endsWith("/delivery"))
      return route.fulfill({
        status: 404,
        json: { error: { message: "No delivery" } },
      });
    if (path.endsWith("/publish")) {
      attempts += 1;
      if (attempts === 1)
        return route.fulfill({
          status: 409,
          json: {
            error: {
              message:
                "A photograph is still processing. Try again when ready.",
            },
          },
        });
      return ok({
        id: "publication-gallery",
        publicationStatus: "published",
        workflowStatus: "reviewing",
      });
    }
    if (path.endsWith("/access")) {
      if (method === "POST") {
        access = true;
        return ok({
          id: "fixture-access",
          secretToken: "fixture-not-a-real-credential",
          pin: "fixture-pin",
          permission: "view",
          expiresAt: null,
        });
      }
      return ok(
        access
          ? [{ id: "fixture-access", expiresAt: null, revokedAt: null }]
          : [],
      );
    }
    if (path.endsWith("/photos"))
      return ok([
        { id: "ready-photo", filename: "portrait.jpg", status: "active" },
      ]);
    if (path === "/api/galleries/publication-gallery") {
      if (options.broken?.())
        return route.fulfill({
          status: 503,
          json: { error: { message: "Unable to reach this gallery" } },
        });
      return ok({
        id: "publication-gallery",
        name: "Augusta · Portraits",
        publicationStatus: "unpublished",
        workflowStatus: "draft",
      });
    }
    return ok([]);
  });
  await page.goto("/photographer/galleries/publication-gallery");
}

test("prepare access, recover from publication failure, then open for client review", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await publicationWorkspace(page);
  const publish = page.getByRole("button", {
    name: "Publish for client review",
  });
  await expect(publish).toBeDisabled();
  await page.getByLabel("What the client can do").selectOption("view");
  await page.getByRole("button", { name: "Issue access link" }).click();
  await expect(
    page.getByLabel("Client access link", { exact: true }),
  ).toBeVisible();
  await expect(publish).toBeEnabled();
  await publish.click();
  await expect(page.getByRole("alert")).toContainText(
    "A photograph is still processing",
  );
  await expect(
    page.getByLabel("Client access link", { exact: true }),
  ).toBeVisible();
  await publish.click();
  await expect(
    page.getByRole("heading", { name: "Open for client review" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Augusta · Portraits" }),
  ).toBeVisible();
  await expect(publish).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .locator(".gallery-publication-panel")
    .screenshot({ path: "test-results/publication-mobile.png" });
});

test("workspace load failure offers recovery before allowing uploads or publication", async ({
  page,
}) => {
  let broken = true;
  await publicationWorkspace(page, { broken: () => broken });
  await expect(page.getByRole("alert")).toContainText(
    "Unable to reach this gallery",
  );
  await expect(page.getByLabel("Select photos to upload")).toHaveCount(0);
  broken = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByLabel("Select photos to upload")).toBeEnabled();
});
