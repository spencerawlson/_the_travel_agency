import { expect, test, type Page } from "@playwright/test";

async function pickAirport(page: Page, label: string, query: string, option: RegExp) {
  const box = page.getByRole("combobox", { name: label, exact: true });
  await box.fill(query);
  await page.getByRole("option", { name: option }).first().click();
}

test("API health endpoint reports ok and demo mode", async ({ request }) => {
  const res = await request.get("/api/v1/health");
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.status).toBe("ok");
  expect(body.demo_mode).toBe(true);
  expect(body.referrals_live_enabled).toBe(false);
});

test("root redirects to a locale and shows the demo banner @mobile", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/(en|fr)$/);
  await expect(page.getByRole("note").first()).toContainText(/demo|démo/i);
  await expect(
    page.getByRole("button", { name: /search flights|rechercher des vols/i }),
  ).toBeVisible();
});

test("language switch to French and back", async ({ page }) => {
  await page.goto("/en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.getByRole("link", { name: /Language: Français/ }).click();
  await expect(page).toHaveURL(/\/fr$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.getByRole("button", { name: "Rechercher des vols" })).toBeVisible();
  await page.getByRole("link", { name: /Langue : English|Langue: English/ }).click();
  await expect(page).toHaveURL(/\/en$/);
});

test("form validation blocks an empty search", async ({ page }) => {
  await page.goto("/en");
  await page.getByRole("button", { name: "Search flights" }).click();
  await expect(page.getByText("Choose a departure airport from the list.")).toBeVisible();
  await expect(page).toHaveURL(/\/en$/);
});

test("search flow: autocomplete -> demo results -> referral to demo partner page", async ({
  page,
}) => {
  await page.goto("/en");
  await pickAirport(page, "From", "montreal", /Montr[ée]al.*YUL/);
  await pickAirport(page, "To", "paris", /Paris.*CDG/);
  await page.getByRole("button", { name: "Search flights" }).click();

  await expect(page).toHaveURL(/\/en\/flights\?/);
  await expect(page.getByText(/\d+ offers/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Demo data").first()).toBeVisible();
  await expect(page.getByText(/demo fares generated for testing/i)).toBeVisible();

  await page.getByRole("button", { name: "View deal" }).first().click();
  await expect(page).toHaveURL(/\/en\/demo\/partner\?offer=/);
  await expect(page.getByRole("heading", { name: "Demo partner page" })).toBeVisible();
});

test("destinations and legal pages render in both languages", async ({ page }) => {
  await page.goto("/fr/destinations/london");
  await expect(page.getByRole("heading", { level: 1, name: "Londres" })).toBeVisible();
  await page.goto("/en/legal/privacy");
  await expect(page.getByText(/DRAFT: This text is a working draft/)).toBeVisible();
  await page.goto("/fr/legal/affiliate-disclosure");
  await expect(
    page.getByRole("heading", { level: 1, name: "Divulgation d'affiliation" }),
  ).toBeVisible();
});

test("homepage has no horizontal overflow on mobile @mobile", async ({ page }) => {
  await page.goto("/en");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
