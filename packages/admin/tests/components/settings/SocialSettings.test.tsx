import { Toasty } from "@cloudflare/kumo";
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

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
	identity: {
		type: "Organization",
		name: "My Blog",
		links: [
			{
				id: "twitter",
				platform: "twitter",
				value: "https://x.com/example",
				sameAs: true,
				relMe: true,
			},
			{
				id: "github",
				platform: "github",
				value: "https://github.com/example",
				sameAs: true,
				relMe: true,
			},
		],
	},
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

		await expect.element(screen.getByText("https://x.com/example")).toBeInTheDocument();
		await expect.element(screen.getByText("https://github.com/example")).toBeInTheDocument();

		const saveButtons = screen.getByRole("button", { name: "Saved", exact: true });
		await expect.poll(() => saveButtons.elements()).toHaveLength(2);
		for (const button of [saveButtons.first(), saveButtons.nth(1)]) {
			await expect.element(button).toBeDisabled();
		}
	});

	it("shows empty state when no links exist", async () => {
		mockFetchSettings.mockResolvedValue({
			title: "Empty Blog",
			identity: { type: "Organization", links: [] },
		});

		const screen = await renderSocialSettings();
		await expect.element(screen.getByText("No profile links yet")).toBeInTheDocument();
	});

	it("adds a profile link via modal and enables save action", async () => {
		const screen = await renderSocialSettings();
		const addBtn = screen.getByRole("button", { name: "Add Profile Link" });
		await userEvent.click(addBtn);

		const dialog = page.getByRole("dialog");
		await expect.element(dialog).toBeVisible();

		// Platform defaults to GitHub; fill GitHub handle or URL
		const handleInput = dialog.getByLabelText("Handle or URL");
		await handleInput.fill("https://github.com/test_user");

		const modalAddBtn = dialog.getByRole("button", { name: "Add", exact: true });
		modalAddBtn.element().click();

		await expect.element(page.getByText("https://github.com/test_user")).toBeInTheDocument();

		const saveBtn = screen.getByRole("button", { name: "Save", exact: true }).first();
		await expect.element(saveBtn).toBeEnabled();
		await saveBtn.click();

		await vi.waitFor(() => {
			expect(mockUpdateSettings).toHaveBeenCalledWith({
				identity: expect.objectContaining({
					links: expect.arrayContaining([
						expect.objectContaining({ value: "https://github.com/test_user" }),
					]),
				}),
			});
		});
	});

	it("deletes a profile link and saves successfully", async () => {
		const screen = await renderSocialSettings();
		const deleteButtons = screen.getByRole("button", { name: "Delete" });
		await userEvent.click(deleteButtons.first());

		const saveBtn = screen.getByRole("button", { name: "Save", exact: true }).first();
		await expect.element(saveBtn).toBeEnabled();
		await userEvent.click(saveBtn);

		await vi.waitFor(() => {
			expect(mockUpdateSettings).toHaveBeenCalledWith({
				identity: expect.objectContaining({
					links: [expect.objectContaining({ value: "https://github.com/example" })],
				}),
			});
		});
	});
});
