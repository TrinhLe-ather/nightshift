/**
 * Theme E2E Tests
 *
 * End-to-end tests for theme switching functionality.
 */

import { test, expect } from "@playwright/test";

test.describe("Theme Switching", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/settings");
    // Wait for the page to load
    await page.waitForSelector("text=Appearance");
  });

  test("should display theme selector on settings page", async ({ page }) => {
    // Find the theme selector
    const themeLabel = page.getByText("Theme");
    await expect(themeLabel).toBeVisible();

    // Find the dropdown
    const themeDropdown = page.locator('button:has-text("Dark")');
    await expect(themeDropdown).toBeVisible();
  });

  test("should switch to light theme", async ({ page }) => {
    // Open theme dropdown
    await page.getByRole("combobox").first().click();

    // Select Light theme
    await page.getByRole("option", { name: "Light" }).click();

    // Verify class is applied to html
    await expect(page.locator("html")).toHaveClass(/light/);
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });

  test("should switch to solarized-dark theme", async ({ page }) => {
    // Open theme dropdown
    await page.getByRole("combobox").first().click();

    // Select Solarized Dark theme
    await page.getByRole("option", { name: "Solarized Dark" }).click();

    // Verify class is applied to html
    await expect(page.locator("html")).toHaveClass(/solarized-dark/);
  });

  test("should switch to solarized-light theme", async ({ page }) => {
    // Open theme dropdown
    await page.getByRole("combobox").first().click();

    // Select Solarized Light theme
    await page.getByRole("option", { name: "Solarized Light" }).click();

    // Verify class is applied to html
    await expect(page.locator("html")).toHaveClass(/solarized-light/);
  });

  test("should persist theme after page reload", async ({ page }) => {
    // Open theme dropdown and select Solarized Dark
    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: "Solarized Dark" }).click();

    // Wait for theme to be applied
    await expect(page.locator("html")).toHaveClass(/solarized-dark/);

    // Reload the page
    await page.reload();
    await page.waitForSelector("text=Appearance");

    // Verify theme is still applied
    await expect(page.locator("html")).toHaveClass(/solarized-dark/);
  });

  test("should show theme preview swatches", async ({ page }) => {
    // Find the preview section
    const previewLabel = page.getByText("Preview");
    await expect(previewLabel).toBeVisible();

    // Find the color swatches
    const swatches = page.locator('[title="Background"], [title="Primary"], [title="Secondary"], [title="Accent"], [title="Muted"]');
    await expect(swatches).toHaveCount(5);
  });
});

test.describe("System Theme Preference", () => {
  test("should follow system preference when set to system", async ({ page }) => {
    // Emulate dark mode preference
    await page.emulateMedia({ colorScheme: "dark" });

    await page.goto("/settings");
    await page.waitForSelector("text=Appearance");

    // Open theme dropdown and select System
    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: "System" }).click();

    // Should resolve to dark since we emulated dark preference
    await expect(page.locator("html")).toHaveClass(/dark/);
  });

  test("should follow light system preference", async ({ page }) => {
    // Emulate light mode preference
    await page.emulateMedia({ colorScheme: "light" });

    await page.goto("/settings");
    await page.waitForSelector("text=Appearance");

    // Open theme dropdown and select System
    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: "System" }).click();

    // Should resolve to light since we emulated light preference
    await expect(page.locator("html")).toHaveClass(/light/);
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });
});

test.describe("Theme Visual Verification", () => {
  test("solarized-dark should have correct background color", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForSelector("text=Appearance");

    // Switch to solarized-dark
    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: "Solarized Dark" }).click();

    // Verify the body has solarized dark background
    const body = page.locator("body");
    await expect(body).toHaveCSS("background-color", /rgb\(0, 43, 54\)|oklch/);
  });

  test("solarized-light should have correct background color", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForSelector("text=Appearance");

    // Switch to solarized-light
    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: "Solarized Light" }).click();

    // Verify the body has solarized light background
    const body = page.locator("body");
    await expect(body).toHaveCSS("background-color", /rgb\(253, 246, 227\)|oklch/);
  });
});
