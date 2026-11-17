import { expect, type Page, test } from "@playwright/test";

const galleryId = "gallery-integrity";
const photo = (id: string, position = 0) => ({
  photoId: id,
  position,
  thumbnail: {
    url: `/fixture-${id}.svg`,
    width: 80,
    height: 80,
    mimeType: "image/svg+xml",
    expiresAt: "2099-01-01T00:00:00Z",
  },
});
const photos = [photo("photo-a"), photo("photo-b", 1)];

async function clientFixture(
  page: Page,
  options: {
    deliveryError?: () => boolean;
    removeGate?: Promise<void>;
    removeFails?: boolean;
  } = {},
) {
  let submitted = false;
  let selected = ["photo-a", "photo-b"];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    const ok = (data: unknown, meta?: object) =>
      route.fulfill({ json: { data, ...(meta ? { meta } : {}) } });
    if (path.endsWith("/selection/submit")) {
      submitted = true;
      return ok({ status: "submitted", selectedCount: selected.length });
    }
    if (method === "PUT" && path.includes("/selection")) {
      await options.removeGate;
      if (options.removeFails)
        return route.fulfill({
          status: 503,
          json: { error: { message: "Selection could not be saved" } },
        });
      selected = selected.filter((id) => !path.includes(id));
      return ok({ selected: false });
    }
    if (path.endsWith("/selection"))
      return ok({
        status: submitted ? "submitted" : "draft",
        items: selected.map((photoId) => ({ photoId, selected: true })),
      });
    if (path.endsWith("/delivery")) {
      if (options.deliveryError?.())
        return route.fulfill({
          status: 503,
          json: { error: { message: "Cannot reach your delivery" } },
        });
      return ok({
        isReleased: true,
        releasedAt: "2026-11-01T00:00:00Z",
        items: photos.map((p) => ({
          id: p.photoId,
          photoId: p.photoId,
          position: p.position,
          filename: `${p.photoId}.jpg`,
        })),
      });
    }
    if (path.endsWith("/photos")) {
      const pageNumber = new URL(route.request().url()).searchParams.get(
        "page",
      );
      return ok(pageNumber === "2" ? [photos[1]] : [photos[0]], { total: 2 });
    }
    return ok({
      id: galleryId,
      name: "Mohamed · Portraits",
      permission: "view_download",
    });
  });
  await page.route("**/fixture-*.svg", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#345846"/></svg>',
    }),
  );
}

test("sending a selection reaches the confirmation page without a runtime error", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await clientFixture(page);
  await page.goto(`/client/gallery/${galleryId}/selection`);
  await page.getByRole("button", { name: "Send to photographer" }).click();
  await expect(page).toHaveURL(new RegExp(`${galleryId}/complete$`));
  await expect(
    page.getByRole("heading", { name: "You're all set." }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("a pending removal blocks other edits and submission, then restores failed choices", async ({
  page,
}) => {
  let release!: () => void;
  const removeGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await clientFixture(page, { removeGate, removeFails: true });
  await page.goto(`/client/gallery/${galleryId}/selection`);
  await page
    .getByRole("button", { name: "Remove photograph 1 from your selection" })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Remove photograph 2 from your selection",
    }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Send to photographer" }),
  ).toBeDisabled();
  release();
  await expect(page.getByRole("alert")).toContainText(
    "Selection could not be saved",
  );
  await expect(
    page.getByRole("button", {
      name: "Remove photograph 1 from your selection",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Send to photographer" }),
  ).toBeEnabled();
});

test("released delivery uses API thumbnails including photographs on later pages", async ({
  page,
}) => {
  await clientFixture(page);
  await page.goto(`/client/gallery/${galleryId}/delivery`);
  await expect(page.getByRole("img", { name: "photo-a.jpg" })).toHaveAttribute(
    "src",
    "/fixture-photo-a.svg",
  );
  await expect(page.getByRole("img", { name: "photo-b.jpg" })).toHaveAttribute(
    "src",
    "/fixture-photo-b.svg",
  );
});

test("delivery network failure is a recoverable error rather than a false preparation status", async ({
  page,
}) => {
  let fail = true;
  await clientFixture(page, { deliveryError: () => fail });
  await page.goto(`/client/gallery/${galleryId}/delivery`);
  await expect(page.getByRole("alert")).toContainText(
    "Cannot reach your delivery",
  );
  await expect(
    page.getByRole("heading", { name: "Your photographs are being prepared" }),
  ).toHaveCount(0);
  fail = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(
    page.getByRole("heading", { name: "Your Final Photographs" }),
  ).toBeVisible();
});

async function interruptedUpload(
  page: Page,
  getStatus: () => string,
  options: {
    transferFails?: boolean;
    completionSucceeds?: boolean;
    removeFails?: boolean;
  } = {},
) {
  const deleted: string[] = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    const ok = (data: unknown) => route.fulfill({ json: { data } });
    if (method === "DELETE") {
      deleted.push(path);
      if (options.removeFails)
        return route.fulfill({
          status: 503,
          json: { error: { message: "Could not remove upload" } },
        });
      return ok({});
    }
    if (path === "/api/auth/me")
      return ok({ user: { userId: "owner", studioId: "studio" } });
    if (path.endsWith("/upload-complete"))
      return options.completionSucceeds
        ? ok({ status: "processing" })
        : route.abort("failed");
    if (path === "/api/photos/photo-new") return ok({ status: getStatus() });
    if (path.endsWith("/photos") && method === "POST")
      return ok({
        photo: { id: "photo-new" },
        upload: { method: "PUT", url: "http://127.0.0.1:3100/storage-test" },
      });
    if (path === `/api/galleries/${galleryId}`)
      return ok({ id: galleryId, name: "Upload recovery" });
    if (path.endsWith("/delivery"))
      return route.fulfill({
        status: 404,
        json: { error: { message: "No delivery" } },
      });
    return ok([]);
  });
  await page.route("**/storage-test", (route) =>
    options.transferFails
      ? route.abort("failed")
      : route.fulfill({ status: 204 }),
  );
  await page.goto(`/photographer/galleries/${galleryId}`);
  await page.getByLabel("Select photos to upload").setInputFiles({
    name: "portrait.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from("fixture"),
  });
  return deleted;
}

test("an interrupted upload confirmation never deletes an accepted photograph", async ({
  page,
}) => {
  const deleted = await interruptedUpload(page, () => "active");
  await expect(page.locator(".photo-upload-status")).toHaveText("Complete");
  expect(deleted).toEqual([]);
});

test("unconfirmed processing shows an honest status and can be checked without re-uploading", async ({
  page,
}) => {
  let status = "processing";
  const deleted = await interruptedUpload(page, () => status);
  await expect(
    page.getByText(/Upload confirmation was interrupted/),
  ).toBeVisible();
  await expect(page.locator(".photo-upload-status")).toHaveText("Processing");
  status = "active";
  await page.getByRole("button", { name: "Check upload" }).click();
  await expect(page.locator(".photo-upload-status")).toHaveText("Complete");
  expect(deleted).toEqual([]);
});

test("a lost transfer response keeps the photo available for confirmation", async ({
  page,
}) => {
  let status = "pending";
  const deleted = await interruptedUpload(page, () => status, {
    transferFails: true,
  });
  await expect(
    page.getByRole("button", { name: "Check upload" }),
  ).toBeVisible();
  expect(deleted).toEqual([]);
  await expect(page.locator(".photo-upload-status")).toHaveText("Needs check");
  status = "active";
  await page.getByRole("button", { name: "Check upload" }).click();
  await expect(page.locator(".photo-upload-status")).toHaveText("Complete");
  expect(deleted).toEqual([]);
});

test("failed processing retains the original until the photographer removes it", async ({
  page,
}) => {
  const deleted = await interruptedUpload(page, () => "failed", {
    completionSucceeds: true,
  });
  await expect(page.getByText(/original has been kept/)).toBeVisible();
  expect(deleted).toEqual([]);
  await page.getByRole("button", { name: "Remove incomplete upload" }).click();
  await expect(page.getByText(/Upload removed/)).toBeVisible();
  expect(deleted).toEqual(["/api/photos/photo-new"]);
});

test("a failed explicit removal keeps the original recovery action available", async ({
  page,
}) => {
  await interruptedUpload(page, () => "failed", {
    completionSucceeds: true,
    removeFails: true,
  });
  await page.getByRole("button", { name: "Remove incomplete upload" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Could not remove upload",
  );
  await expect(
    page.getByRole("button", { name: "Remove incomplete upload" }),
  ).toBeEnabled();
  await expect(page.getByText(/original has been kept/)).toBeVisible();
});

test("upload recovery stays usable on a narrow phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 });
  await interruptedUpload(page, () => "failed", { completionSucceeds: true });
  await expect(
    page.getByRole("button", { name: "Remove incomplete upload" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const details = page.locator(".photo-upload-details");
  expect((await details.boundingBox())?.width).toBeGreaterThan(120);
});

test("starting another batch preserves unresolved uploads", async ({
  page,
}) => {
  await interruptedUpload(page, () => "processing");
  await expect(
    page.getByRole("button", { name: "Check upload" }),
  ).toBeVisible();
  await page.getByLabel("Select photos to upload").setInputFiles({
    name: "second.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from("fixture"),
  });
  await expect(page.locator(".photo-upload-details strong")).toHaveText([
    "portrait.jpg",
    "second.jpg",
  ]);
  await expect(page.getByRole("button", { name: "Check upload" })).toHaveCount(
    2,
  );
});

test("missing selected photographs produce a bounded retry state rather than a misleading empty shortlist", async ({
  page,
}) => {
  await clientFixture(page);
  await page.route("**/api/client/galleries/*/photos?*", (route) =>
    route.fulfill({ json: { data: [], meta: { total: 2 } } }),
  );
  await page.goto(`/client/gallery/${galleryId}/selection`);
  await expect(page.getByRole("alert")).toContainText(
    "Some photographs could not be loaded",
  );
  await expect(
    page.getByRole("button", { name: "Send to photographer" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("studio sign-in does not ship pre-filled credentials", async ({
  page,
}) => {
  await page.goto("/photographer/login");
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
});
