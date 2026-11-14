import { Toasty } from "@cloudflare/kumo";
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

import type { CurrentUser, ProfileLink } from "../../../src/lib/api";
import { render } from "../../utils/render";

const mockUseCurrentUser = vi.fn<() => {
	data?: CurrentUser;
	isLoading: boolean;
	error: Error | null;
}>();
const mockUpdateCurrentUserProfileLinks =
	vi.fn<(links: ProfileLink[]) => Promise<ProfileLink[]>>();

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
		useCurrentUser: () => mockUseCurrentUser(),
		updateCurrentUserProfileLinks: (links: ProfileLink[]) =>
			mockUpdateCurrentUserProfileLinks(links),
	};
});

const { ProfileSettings } = await import("../../../src/components/settings/ProfileSettings");

const defaultUser: CurrentUser = {
	id: "user-1",
	email: "author@example.com",
	name: "Alex Author",
	role: 30,
	profileLinks: [
		{
			id: "github-1",
			platform: "github",
			value: "https://github.com/alex",
			sameAs: true,
			relMe: true,
		},
	],
};

function Wrapper({ children }: { children: React.ReactNode }) {
	return <Toasty>{children}</Toasty>;
}

async function renderProfileSettings() {
	return render(<ProfileSettings />, { wrapper: Wrapper });
}

beforeEach(() => {
	vi.clearAllMocks();
	mockUseCurrentUser.mockReturnValue({
		data: defaultUser,
		isLoading: false,
		error: null,
	});
	mockUpdateCurrentUserProfileLinks.mockImplementation(async (links) => links);
});

describe("ProfileSettings", () => {
	it("shows loading state while current user is loading", async () => {
		mockUseCurrentUser.mockReturnValue({
			data: undefined,
			isLoading: true,
			error: null,
		});
		const screen = await renderProfileSettings();

		await expect
			.element(screen.getByRole("heading", { name: "Profile", level: 1 }))
			.toBeInTheDocument();
		await expect.element(screen.getByText("Loading profile...")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Save" }).query()).toBeNull();
	});

	it("renders existing links and Public badge with save actions initially disabled", async () => {
		const screen = await renderProfileSettings();

		await expect.element(screen.getByText("Public", { exact: true })).toBeInTheDocument();
		await expect.element(screen.getByText("https://github.com/alex")).toBeInTheDocument();

		const saveButtons = screen.getByRole("button", { name: "Saved", exact: true }).all();
		expect(saveButtons).toHaveLength(2);
		for (const button of saveButtons) {
			await expect.element(button).toBeDisabled();
		}
	});

	it("adds a profile link via modal and saves via updateCurrentUserProfileLinks", async () => {
		const screen = await renderProfileSettings();

		await userEvent.click(screen.getByRole("button", { name: "Add Profile Link" }));
		const dialog = page.getByRole("dialog");
		await expect.element(dialog).toBeVisible();

		await dialog.getByLabelText("Handle or URL").fill("https://github.com/alex-dev");
		dialog.getByRole("button", { name: "Add", exact: true }).element().click();

		await expect.element(page.getByText("https://github.com/alex-dev")).toBeInTheDocument();

		const saveBtn = screen.getByRole("button", { name: "Save", exact: true }).first();
		await expect.element(saveBtn).toBeEnabled();
		await userEvent.click(saveBtn);

		await vi.waitFor(() => {
			expect(mockUpdateCurrentUserProfileLinks).toHaveBeenCalledWith(
				expect.arrayContaining([
					expect.objectContaining({ value: "https://github.com/alex" }),
					expect.objectContaining({ value: "https://github.com/alex-dev" }),
				]),
			);
		});
		await expect.element(screen.getByText("Profile links saved")).toBeInTheDocument();
	});
});
