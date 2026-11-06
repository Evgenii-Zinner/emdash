import { Toasty } from "@cloudflare/kumo";
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";

import type { SiteSettings } from "../../../src/lib/api";
import { render } from "../../utils/render";

const mockFetchSettings = vi.fn<() => Promise<Partial<SiteSettings>>>();
const mockUpdateSettings =
	vi.fn<(settings: Partial<SiteSettings>) => Promise<Partial<SiteSettings>>>();

vi.mock("@tanstack/react-router", async () => {
	const actual = await vi.importActual("@tanstack/react-router");
	return {
		...actual,
		Link: ({ children, to, ...props }: any) => (
			<a href={to} {...props}>
				{children}
			</a>
		),
	};
});

vi.mock("../../../src/lib/api", async () => {
	const actual = await vi.importActual("../../../src/lib/api");
	return {
		...actual,
		fetchSettings: () => mockFetchSettings(),
		updateSettings: (settings: Partial<SiteSettings>) => mockUpdateSettings(settings),
	};
});

const { SocialSettings } = await import("../../../src/components/settings/SocialSettings");

const defaultSettings: Partial<SiteSettings> = {
	title: "My Blog",
	socialLinks: [
		{
			id: "twitter",
			platform: "twitter",
			label: "Twitter",
			url: "https://x.com/example",
			relMe: true,
		},
		{
			id: "github",
			platform: "github",
			label: "GitHub",
			url: "https://github.com/example",
			relMe: true,
		},
	],
};

function Wrapper({ children }: { children: React.ReactNode }) {
	return <Toasty>{children}</Toasty>;
}

async function renderSocialSettings() {
	return render(<SocialSettings />, { wrapper: Wrapper });
}

beforeEach(() => {
	vi.clearAllMocks();
	mockFetchSettings.mockResolvedValue(defaultSettings);
	mockUpdateSettings.mockImplementation(async (settings) => {
		mockFetchSettings.mockResolvedValue(settings);
		return settings;
	});
});

describe("SocialSettings", () => {
	it("shows the shared frame while settings load", async () => {
		mockFetchSettings.mockReturnValue(new Promise(() => undefined));
		const screen = await renderSocialSettings();

		await expect
			.element(screen.getByRole("heading", { name: "Social Links", level: 1 }))
			.toBeInTheDocument();
		await expect.element(screen.getByText("Loading settings...")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Save" }).query()).toBeNull();
	});

	it("shows a load failure without form actions", async () => {
		mockFetchSettings.mockRejectedValue(new Error("Settings service unavailable"));
		const screen = await renderSocialSettings();

		await expect.element(screen.getByRole("alert")).toHaveTextContent("An error occurred");
		await expect
			.element(screen.getByRole("alert"))
			.toHaveTextContent("Settings service unavailable");
		expect(screen.getByRole("button", { name: "Save" }).query()).toBeNull();
	});

	it("renders existing social links with both save actions initially disabled", async () => {
		const screen = await renderSocialSettings();

		const labelInputs = screen.getByLabelText("Platform / Label");
		const urlInputs = screen.getByLabelText("URL");

		await expect.element(labelInputs.first()).toHaveValue("Twitter");
		await expect.element(urlInputs.first()).toHaveValue("https://x.com/example");

		await expect.element(labelInputs.nth(1)).toHaveValue("GitHub");
		await expect.element(urlInputs.nth(1)).toHaveValue("https://github.com/example");

		const saveButtons = screen.getByRole("button", { name: "Saved", exact: true });
		await expect.poll(() => saveButtons.elements()).toHaveLength(2);
		for (const button of [saveButtons.first(), saveButtons.nth(1)]) {
			await expect.element(button).toBeDisabled();
		}
	});

	it("drops blank rows on submit", async () => {
		const screen = await renderSocialSettings();
		const addLinkBtn = screen.getByRole("button", { name: "Add Link" });
		await userEvent.click(addLinkBtn);

		// Now we have 3 rows, but 3rd row is completely empty
		const labelInputs = screen.getByLabelText("Platform / Label");
		await expect.poll(() => labelInputs.elements()).toHaveLength(3);

		// Modify first row so form is dirty
		await screen.getByLabelText("URL").first().fill("https://x.com/new_handle");

		const saveBtn = screen.getByRole("button", { name: "Save", exact: true }).first();
		await userEvent.click(saveBtn);

		await vi.waitFor(() => {
			expect(mockUpdateSettings).toHaveBeenCalledWith({
				socialLinks: [
					expect.objectContaining({ url: "https://x.com/new_handle" }),
					expect.objectContaining({ url: "https://github.com/example" }),
				],
			});
		});
	});

	it("shows validation error on partly filled rows", async () => {
		const screen = await renderSocialSettings();
		const addLinkBtn = screen.getByRole("button", { name: "Add Link" });
		await userEvent.click(addLinkBtn);

		const labelInputs = screen.getByLabelText("Platform / Label");
		await labelInputs.nth(2).fill("Mastodon");
		// URL left blank

		const saveBtn = screen.getByRole("button", { name: "Save", exact: true }).first();
		await userEvent.click(saveBtn);

		expect(mockUpdateSettings).not.toHaveBeenCalled();
		await expect.element(screen.getByText("URL is required")).toBeInTheDocument();
	});

	it("enables both save actions when dirty and returns to saved after a header save", async () => {
		const screen = await renderSocialSettings();
		await screen.getByLabelText("URL").first().fill("https://x.com/new_handle");

		const dirtyButtons = screen.getByRole("button", { name: "Save", exact: true });
		await expect.poll(() => dirtyButtons.elements()).toHaveLength(2);
		for (const button of [dirtyButtons.first(), dirtyButtons.nth(1)]) {
			await expect.element(button).toBeEnabled();
		}

		await userEvent.click(dirtyButtons.first());
		await vi.waitFor(() => {
			expect(mockUpdateSettings).toHaveBeenCalledWith(
				expect.objectContaining({
					socialLinks: expect.arrayContaining([
						expect.objectContaining({
							url: "https://x.com/new_handle",
						}),
					]),
				}),
			);
		});
		await expect.element(screen.getByText("Social links saved")).toBeInTheDocument();

		const savedButtons = screen.getByRole("button", { name: "Saved", exact: true });
		await expect.poll(() => savedButtons.elements()).toHaveLength(2);
		for (const button of [savedButtons.first(), savedButtons.nth(1)]) {
			await expect.element(button).toBeDisabled();
		}
	});

	it("keeps cached social links visible when the post-save refetch fails", async () => {
		mockUpdateSettings.mockImplementation(async (settings) => {
			mockFetchSettings.mockRejectedValue(new Error("Settings refetch failed"));
			return settings;
		});
		const screen = await renderSocialSettings();
		await screen.getByLabelText("URL").first().fill("https://x.com/refetch_test");

		await userEvent.click(screen.getByRole("button", { name: "Save", exact: true }).first());

		await vi.waitFor(() => expect(mockFetchSettings.mock.calls.length).toBeGreaterThanOrEqual(2));
		await expect.element(screen.getByLabelText("URL").first()).toHaveValue("https://x.com/refetch_test");
		expect(screen.getByRole("alert").query()).toBeNull();
	});

	it("submits changes from the bottom save action", async () => {
		const screen = await renderSocialSettings();
		await screen.getByLabelText("URL").nth(1).fill("https://github.com/new_user");

		const saveButtons = screen.getByRole("button", { name: "Save", exact: true });
		await userEvent.click(saveButtons.nth(1));

		await vi.waitFor(() => {
			expect(mockUpdateSettings).toHaveBeenCalledWith(
				expect.objectContaining({
					socialLinks: expect.arrayContaining([
						expect.objectContaining({
							url: "https://github.com/new_user",
						}),
					]),
				}),
			);
		});
	});

	it("keeps the form dirty and reports a failed save", async () => {
		mockUpdateSettings.mockRejectedValue(new Error("Could not persist settings"));
		const screen = await renderSocialSettings();
		await screen.getByLabelText("URL").first().fill("https://x.com/fail_test");

		await userEvent.click(screen.getByRole("button", { name: "Save", exact: true }).first());
		await expect.element(screen.getByText("Failed to save settings")).toBeInTheDocument();
		await expect.element(screen.getByText("Could not persist settings")).toBeInTheDocument();

		const dirtyButtons = screen.getByRole("button", { name: "Save", exact: true });
		await expect.poll(() => dirtyButtons.elements()).toHaveLength(2);
		for (const button of [dirtyButtons.first(), dirtyButtons.nth(1)]) {
			await expect.element(button).toBeEnabled();
		}
	});

	it("adds, edits, and removes links with rel=\"me\" verification", async () => {
		const screen = await renderSocialSettings();

		// Click "Add Link"
		const addLinkBtn = screen.getByRole("button", { name: "Add Link" });
		await userEvent.click(addLinkBtn);

		// Fill in the new 3rd link
		const labelInputs = screen.getByLabelText("Platform / Label");
		const urlInputs = screen.getByLabelText("URL");

		await labelInputs.nth(2).fill("Mastodon");
		await urlInputs.nth(2).fill("https://mastodon.social/@alice");

		// Save should become dirty and clickable
		const saveBtn = screen.getByRole("button", { name: "Save", exact: true }).first();
		await userEvent.click(saveBtn);

		await vi.waitFor(() => {
			expect(mockUpdateSettings).toHaveBeenCalledWith(
				expect.objectContaining({
					socialLinks: expect.arrayContaining([
						expect.objectContaining({
							label: "Mastodon",
							url: "https://mastodon.social/@alice",
							relMe: true,
						}),
					]),
				}),
			);
		});

		// Now remove the newly added link
		const removeBtn = screen.getByRole("button", { name: "Remove Mastodon" });
		await userEvent.click(removeBtn);

		// Ensure it's removed
		await expect.poll(() => screen.getByLabelText("Platform / Label").elements()).toHaveLength(2);
	});

	it("shows empty state when no links exist", async () => {
		mockFetchSettings.mockResolvedValue({
			title: "Empty Blog",
			socialLinks: [],
		});

		const screen = await renderSocialSettings();
		await expect
			.element(
				screen.getByText(
					'No social links configured yet. Click "Add Link" to add your first profile.',
				),
			)
			.toBeInTheDocument();
	});
});
