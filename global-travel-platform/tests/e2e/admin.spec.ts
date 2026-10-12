import { expect, test } from "@playwright/test";

const EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@example.com";
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "";

test("admin API rejects anonymous access", async ({ request }) => {
  for (const path of ["overview", "searches", "referrals", "commissions"]) {
    const res = await request.get(`/api/v1/admin/${path}`);
    expect(res.status(), path).toBe(401);
  }
});

test("admin dashboard redirects to login when signed out", async ({ page }) => {
  await page.goto("/en/admin");
  await expect(page).toHaveURL(/\/en\/admin\/login/);
});

test("wrong password shows a generic error", async ({ page }) => {
  await page.goto("/en/admin/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill("definitely-wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  // Filter: Next.js also renders an (empty) role="alert" route announcer.
  await expect(page.getByRole("alert").filter({ hasText: "Invalid" })).toHaveText(
    "Invalid email or password.",
  );
});

test("admin signs in and sees metrics from stored events", async ({ page, request }) => {
  test.skip(!PASSWORD, "E2E_ADMIN_PASSWORD not set");

  // Record a search so the dashboard has at least one stored event.
  const depart = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  const search = await request.post("/api/v1/flights/search", {
    data: {
      origin: "YQB",
      destination: "LHR",
      trip_type: "one_way",
      depart_date: depart,
      return_date: null,
      adults: 1,
      children: 0,
      infants: 0,
      cabin: "economy",
      currency: "CAD",
      locale: "en",
    },
  });
  expect(search.ok()).toBeTruthy();

  await page.goto("/en/admin/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/admin$/);
  await expect(page.getByRole("heading", { name: "Admin dashboard" })).toBeVisible();

  const searchesKpi = page.locator("p", { hasText: "Total searches" }).locator("xpath=..");
  await expect(searchesKpi).toBeVisible();
  const value = Number((await searchesKpi.locator("p").nth(1).innerText()).replace(/\D/g, ""));
  expect(value).toBeGreaterThanOrEqual(1);
  await expect(page.getByText("No commissions have been reported.")).toBeVisible();

  await page.getByRole("tab", { name: "Searches" }).click();
  await expect(page.getByRole("cell", { name: "YQB → LHR" }).first()).toBeVisible();

  // Session cookie must be HttpOnly (not readable from JS).
  const jsCookies = await page.evaluate(() => document.cookie);
  expect(jsCookies).not.toContain("gtp_admin_session");

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/en\/admin\/login/);
});
