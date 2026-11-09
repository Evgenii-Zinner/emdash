/**
 * Settings Pages E2E Tests
 *
 * Tests the Social, SEO, and Email settings sub-pages.
 * These are form-based pages that load settings from the API and save them.
 *
 * The primary class of bug we're catching: API response shape mismatches
 * that crash the page on load, or save mutations that silently fail.
 */

import { test, expect } from "../fixtures";

// API patterns
const SETTINGS_API_PATTERN = /\/api\/settings$/;

test.describe("Social Settings", () => {
	test.beforeEach(async ({ admin }) => {
		await admin.devBypassAuth();
	});

	test("page renders with heading and form", async ({ admin, page }) => {
		await admin.goto("/settings/social");
		await admin.waitForShell();
		await admin.waitForLoading();

		// Page heading
		await expect(page.locator("h1")).toContainText("Social Links");

		// Should show publisher identity and profiles sections
		await expect(page.locator("text=Publisher Identity")).toBeVisible({ timeout: 10000 });
		await expect(page.locator("text=Profiles & Links")).toBeVisible({ timeout: 10000 });
	});

	test("adds and saves a profile link with modal and persists across reload", async ({
		admin,
		page,
	}) => {
		await admin.goto("/settings/social");
		await admin.waitForShell();
		await admin.waitForLoading();

		const testHandle = `e2e_user_${Date.now()}`;

		// Click "Add Profile Link"
		await page.getByRole("button", { name: "Add Profile Link" }).click();

		const dialog = page.locator('[role="dialog"]').filter({ hasText: "Add Profile Link" });
		await expect(dialog).toBeVisible();

		// Fill handle
		await dialog.getByLabel("Handle or URL").fill(testHandle);

		// Add link via modal action
		await dialog.getByRole("button", { name: "Add" }).click();
		await expect(dialog).not.toBeVisible();

		// Check link is in list
		await expect(page.locator(`text=${testHandle}`)).toBeVisible();

		// Save settings form
		const saveResponse = page.waitForResponse(
			(res) =>
				SETTINGS_API_PATTERN.test(res.url()) &&
				res.request().method() === "POST" &&
				res.status() === 200,
			{ timeout: 15000 },
		);

		await page.getByRole("button", { name: "Save", exact: true }).first().click();
		await saveResponse;

		// Reload the page
		await admin.goto("/settings/social");
		await admin.waitForShell();
		await admin.waitForLoading();

		// The value should persist in the list
		await expect(page.locator(`text=${testHandle}`)).toBeVisible({ timeout: 10000 });
	});

	test("adds a custom link requiring label and saves successfully", async ({
		admin,
		page,
	}) => {
		await admin.goto("/settings/social");
		await admin.waitForShell();
		await admin.waitForLoading();

		await page.getByRole("button", { name: "Add Profile Link" }).click();
		const dialog = page.locator('[role="dialog"]').filter({ hasText: "Add Profile Link" });
		await expect(dialog).toBeVisible();

		// Change platform to Custom URL
		await dialog.getByRole("combobox", { name: "Platform" }).click();
		await page.getByRole("option", { name: "Custom URL" }).click();

		// Label is required: clicking Add with empty label shows error
		await dialog.getByLabel("URL, Handle, or ID").fill("https://example.com/portfolio");
		await dialog.getByRole("button", { name: "Add" }).click();
		await expect(dialog.getByText("Label is required for custom links")).toBeVisible();

		// Fill label and submit
		await dialog.getByLabel("Link Label").fill("My Portfolio");
		await dialog.getByRole("button", { name: "Add" }).click();
		await expect(dialog).not.toBeVisible();

		// Custom link with label is displayed in the list
		await expect(page.locator("text=My Portfolio")).toBeVisible();
		await expect(page.locator("text=https://example.com/portfolio")).toBeVisible();
	});
});

test.describe("SEO Settings", () => {
	test.beforeEach(async ({ admin }) => {
		await admin.devBypassAuth();
	});

	test("page renders with heading and form", async ({ admin, page }) => {
		await admin.goto("/settings/seo");
		await admin.waitForShell();
		await admin.waitForLoading();

		// Page heading
		await expect(page.locator("h1")).toContainText("SEO Settings");

		// Should show the SEO section
		await expect(
			page.getByRole("heading", { name: "Search Engine Optimization", exact: true }),
		).toBeVisible({ timeout: 10000 });
	});

	test("displays expected SEO fields", async ({ admin, page }) => {
		await admin.goto("/settings/seo");
		await admin.waitForShell();
		await admin.waitForLoading();

		for (const label of [
			"Title Separator",
			"Google Verification",
			"Bing Verification",
			"robots.txt",
		]) {
			await expect(page.getByRole("textbox", { name: label, exact: true })).toBeVisible({
				timeout: 5000,
			});
		}

		await expect(page.getByRole("button", { name: "Saved", exact: true }).first()).toBeVisible();
	});

	test("saves SEO settings and persists across reload", async ({ admin, page }) => {
		await admin.goto("/settings/seo");
		await admin.waitForShell();
		await admin.waitForLoading();

		const testVerification = `e2e-verify-${Date.now()}`;

		// Fill the Google Verification field
		const googleInput = page.getByRole("textbox", {
			name: "Google Verification",
			exact: true,
		});
		await googleInput.fill(testVerification);

		// Wait for save response
		const saveResponse = page.waitForResponse(
			(res) =>
				SETTINGS_API_PATTERN.test(res.url()) &&
				res.request().method() === "POST" &&
				res.status() === 200,
			{ timeout: 15000 },
		);

		await page.getByRole("button", { name: "Save", exact: true }).first().click();
		await saveResponse;

		// Success banner
		await expect(page.locator("text=SEO settings saved")).toBeVisible({ timeout: 5000 });

		// Reload
		await admin.goto("/settings/seo");
		await admin.waitForShell();
		await admin.waitForLoading();

		// Value should persist
		const googleInputAfterReload = page.getByRole("textbox", {
			name: "Google Verification",
			exact: true,
		});
		await expect(googleInputAfterReload).toHaveValue(testVerification, { timeout: 10000 });
	});
});

test.describe("Language Switcher", () => {
	test.beforeEach(async ({ admin }) => {
		await admin.devBypassAuth();
	});

	test("settings page shows language select", async ({ admin, page }) => {
		await admin.goto("/settings");
		await admin.waitForShell();

		const languageSelect = page.getByRole("combobox", { name: "Language", exact: true });
		await expect(languageSelect).toBeVisible();
	});

	test("switching language updates the UI", async ({ admin, page }) => {
		await admin.goto("/settings");
		await admin.waitForShell();

		// Switch to German
		await page.getByRole("combobox", { name: "Language", exact: true }).click();
		await page.getByRole("option", { name: "Deutsch", exact: true }).click();

		await expect(page.locator("h1")).toContainText("Einstellungen", { timeout: 5000 });

		// Switch back — the select now shows "Deutsch" as its value
		await page.getByRole("combobox").filter({ hasText: "Deutsch" }).click();
		await page.getByRole("option", { name: "English", exact: true }).click();

		await expect(page.locator("h1")).toContainText("Settings", { timeout: 5000 });
	});
});

test.describe("Email Settings", () => {
	test.beforeEach(async ({ admin }) => {
		await admin.devBypassAuth();
	});

	test("page renders with heading and pipeline status", async ({ admin, page }) => {
		await admin.goto("/settings/email");
		await admin.waitForShell();
		await admin.waitForLoading();

		// Page heading
		await expect(page.locator("h1")).toContainText("Email Settings");

		// Should show the Email Pipeline section
		await expect(page.getByRole("heading", { name: "Email Pipeline" })).toBeVisible({
			timeout: 10000,
		});
	});
});
