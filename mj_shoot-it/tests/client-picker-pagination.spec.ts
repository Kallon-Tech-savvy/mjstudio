import { expect, test } from "@playwright/test";

test("an older client can be loaded after failure and selected without creating a duplicate", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let fail = true;
  const posts: Record<string, unknown>[] = [];
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/auth/me")
      return route.fulfill({
        json: { data: { user: { userId: "owner", studioId: "studio" } } },
      });
    if (url.pathname === "/api/clients") {
      if (url.searchParams.get("page") === "2") {
        if (fail)
          return route.fulfill({
            status: 503,
            json: { error: { message: "Client list unavailable." } },
          });
        return route.fulfill({
          json: {
            data: [{ id: "older-client", name: "Mohamed" }],
            meta: { total: 101 },
          },
        });
      }
      return route.fulfill({
        json: {
          data: Array.from({ length: 100 }, (_, i) => ({
            id: `client-${i}`,
            name: `Client ${i}`,
          })),
          meta: { total: 101 },
        },
      });
    }
    if (
      url.pathname === "/api/galleries" &&
      route.request().method() === "POST"
    ) {
      posts.push(route.request().postDataJSON());
      return route.fulfill({
        json: {
          data: { id: "created", name: "Portraits", clientId: "older-client" },
        },
      });
    }
    if (url.pathname === "/api/galleries")
      return route.fulfill({ json: { data: [] } });
    if (url.pathname === "/api/galleries/created")
      return route.fulfill({
        json: {
          data: {
            id: "created",
            name: "Portraits",
            publicationStatus: "unpublished",
          },
        },
      });
    return route.fulfill({ json: { data: [] } });
  });
  await page.goto("/photographer/galleries");
  await page.getByLabel("Gallery name", { exact: true }).fill("Portraits");
  await page.getByRole("button", { name: "Continue →" }).click();
  await page.getByRole("combobox").fill("Client 0");
  await page.getByRole("option", { name: "Client 0", exact: true }).click();
  await expect(
    page.getByText("Searching 100 of 101 clients.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Load more clients" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Your current choice is still here",
  );
  await expect(page.getByRole("button", { name: "Continue →" })).toBeEnabled();
  fail = false;
  await page.getByRole("button", { name: "Retry loading clients" }).click();
  await expect(
    page.getByRole("button", { name: "Load more clients" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Change", exact: true }).click();
  await page.getByRole("combobox").fill("Mohamed");
  await page.getByRole("option", { name: "Mohamed", exact: true }).click();
  await page.getByRole("button", { name: "Continue →" }).click();
  await expect(page.locator(".creation-review")).toContainText("Mohamed");
  await page.getByRole("button", { name: "Create gallery →" }).click();
  await expect(page).toHaveURL(/galleries\/created\?created=1#photo-upload$/);
  expect(posts[0].clientId).toBe("older-client");
  expect(posts[0]).not.toHaveProperty("newClient");
});
