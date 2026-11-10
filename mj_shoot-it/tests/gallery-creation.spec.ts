import { expect, type Page, test } from "@playwright/test";

const gallery = {
  id: "gallery-augusta",
  clientId: "client-augusta",
  name: "Augusta · Portraits",
  workflowStatus: "draft",
  publicationStatus: "unpublished",
};
const clients = [
  { id: "client-augusta", name: "Augusta", email: "augusta@example.test" },
];

async function studio(
  page: Page,
  options: {
    galleries?: object[];
    failCreate?: boolean;
    failLoad?: boolean;
  } = {},
) {
  const posts: unknown[] = [];
  let failCreate = options.failCreate;
  let failLoad = options.failLoad;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const respond = (data: unknown, status = 200) =>
      route.fulfill({ status, json: { data } });
    if (path === "/api/auth/me")
      return respond({
        user: { userId: "photographer-test", studioId: "studio-test" },
      });
    if (path === "/api/clients") return respond(clients);
    if (path === "/api/galleries" && route.request().method() === "POST") {
      posts.push(route.request().postDataJSON());
      if (failCreate) {
        failCreate = false;
        return route.fulfill({
          status: 503,
          json: { error: { message: "Studio temporarily unavailable" } },
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 120));
      return respond(gallery, 201);
    }
    if (path === "/api/galleries") {
      if (failLoad) {
        failLoad = false;
        return route.fulfill({
          status: 503,
          json: { error: { message: "Please retry loading" } },
        });
      }
      return respond(options.galleries ?? []);
    }
    if (path === `/api/galleries/${gallery.id}`) return respond(gallery);
    if (path.endsWith("/delivery"))
      return route.fulfill({
        status: 404,
        json: { error: { message: "No delivery" } },
      });
    return respond([]);
  });
  await page.goto("/photographer/galleries");
  return posts;
}

async function nameShoot(page: Page) {
  await expect(page.getByRole("button", { name: "Continue →" })).toBeDisabled();
  await page
    .getByLabel("Gallery name", { exact: true })
    .fill("  Augusta · Portraits  ");
  await page.getByRole("button", { name: "Continue →" }).click();
  await expect(
    page.getByRole("heading", { name: "Who are we creating for?" }),
  ).toBeFocused();
}

async function chooseAugusta(page: Page) {
  await page.getByRole("combobox").fill("Augusta");
  await page.getByRole("combobox").press("ArrowDown");
  await page.getByRole("combobox").press("Enter");
  await page.getByRole("button", { name: "Continue →" }).click();
}

test("existing client: validate, review, edit, create once and open upload workspace", async ({
  page,
}) => {
  const posts = await studio(page);
  await nameShoot(page);
  await expect(page.getByRole("button", { name: "Continue →" })).toBeDisabled();
  await chooseAugusta(page);
  await expect(
    page.getByText("No client access is issued at this step."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit name" }).click();
  await expect(page.getByLabel("Gallery name", { exact: true })).toHaveValue(
    "  Augusta · Portraits  ",
  );
  await page.getByRole("button", { name: "Continue →" }).click();
  await expect(
    page.getByRole("button", { name: "Change", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue →" }).click();
  await page.getByRole("button", { name: "Create gallery →" }).click();
  await expect(
    page.getByRole("button", { name: "Creating gallery…" }),
  ).toBeDisabled();
  await expect(page).toHaveURL(/gallery-augusta\?created=1#photo-upload$/);
  await expect(
    page.getByRole("heading", { name: "Your gallery is created." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Add photographs" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Add photographs" }),
  ).toBeFocused();
  await expect(
    page.getByRole("heading", { name: "Add photographs" }),
  ).toBeInViewport();
  expect(posts).toEqual([
    { clientId: "client-augusta", name: gallery.name, expiresAt: null },
  ]);
});

test("new client: validate email, keep entries on failure, retry successfully", async ({
  page,
}) => {
  const posts = await studio(page, { failCreate: true });
  await nameShoot(page);
  await page.getByRole("combobox").fill("Mohamed");
  await page.getByRole("option", { name: /Create “Mohamed”/ }).click();
  await page.getByLabel("Email (optional)", { exact: true }).fill("invalid");
  await expect(
    page.getByRole("button", { name: "Use this client" }),
  ).toBeDisabled();
  await page.getByLabel("Email (optional)", { exact: true }).fill("");
  await page.getByRole("button", { name: "Use this client" }).click();
  await page.getByRole("button", { name: "Continue →" }).click();
  await page.getByRole("button", { name: "Create gallery →" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Your entries are still here",
  );
  await expect(page.locator(".creation-review")).toContainText("Mohamed");
  await page.getByRole("button", { name: "Create gallery →" }).click();
  await expect(page).toHaveURL(/gallery-augusta\?created=1#photo-upload$/);
  expect(posts).toHaveLength(2);
  expect(posts[1]).toEqual({
    newClient: { name: "Mohamed" },
    name: gallery.name,
    expiresAt: null,
  });
});

test("recent galleries: filter, empty results, and focus the new gallery form", async ({
  page,
}) => {
  await studio(page, { galleries: [{ ...gallery, clientName: "Augusta" }] });
  await expect(
    page.getByRole("link", { name: /Augusta · Portraits/ }),
  ).toBeVisible();
  await page.getByRole("searchbox").fill("Paul");
  await expect(
    page.getByText(
      "No matches on this page. Try another name or browse another page.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "+ New gallery" }).click();
  await expect(page.getByLabel("Gallery name", { exact: true })).toBeFocused();
});

test("loading error can be retried", async ({ page }) => {
  await studio(page, { failLoad: true });
  await expect(page.getByRole("alert")).toContainText("Please retry loading");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByLabel("Gallery name", { exact: true })).toBeVisible();
});

for (const width of [320, 390, 768, 1024, 1440]) {
  test(`layout at ${width}px has no horizontal overflow through all setup steps`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await studio(page);
    const checkWidth = async () =>
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    await checkWidth();
    await nameShoot(page);
    await checkWidth();
    await chooseAugusta(page);
    await expect(page.locator(".creation-stage")).toHaveCSS("opacity", "1");
    await checkWidth();
    if (width !== 768)
      await page.screenshot({
        path: `test-results/gallery-review-${width}.png`,
        fullPage: true,
      });
  });
}
