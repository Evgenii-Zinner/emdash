import { Badge, Banner, Loader, useKumoToastManager } from "@cloudflare/kumo";
import { useLingui } from "@lingui/react/macro";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import {
	updateCurrentUserProfileLinks,
	useCurrentUser,
	type ProfileLink,
} from "../../lib/api";
import { SaveButton } from "../SaveButton.js";
import { ProfileLinksEditor } from "./ProfileLinksEditor.js";
import { SettingsFrame, SettingsSection } from "./SettingsLayout.js";

function profileLinksSnapshot(links: ProfileLink[]): string {
	return JSON.stringify(
		links.map((link) => ({
			id: link.id,
			platform: link.platform ?? "",
			label: link.label ?? "",
			value: link.value ?? "",
			relMe: link.relMe ?? false,
			sameAs: link.sameAs ?? false,
		})),
	);
}

/**
 * Profile settings screen for managing the signed-in user's public author profile links.
 */
export function ProfileSettings() {
	const { t } = useLingui();
	const queryClient = useQueryClient();
	const toastManager = useKumoToastManager();

	const { data: user, isLoading, error: loadError } = useCurrentUser();

	const [links, setLinks] = React.useState<ProfileLink[]>([]);
	const [savedLinks, setSavedLinks] = React.useState<ProfileLink[]>([]);

	React.useEffect(() => {
		if (user) {
			const nextLinks = user.profileLinks ?? [];
			setLinks(nextLinks);
			setSavedLinks(nextLinks);
		}
	}, [user]);

	const isDirty = React.useMemo(
		() => profileLinksSnapshot(links) !== profileLinksSnapshot(savedLinks),
		[links, savedLinks],
	);

	const saveMutation = useMutation({
		mutationFn: (nextLinks: ProfileLink[]) => updateCurrentUserProfileLinks(nextLinks),
		onSuccess: (updatedLinks) => {
			setLinks(updatedLinks);
			setSavedLinks(updatedLinks);
			void queryClient.invalidateQueries({ queryKey: ["currentUser"] });
			void queryClient.invalidateQueries({ queryKey: ["bylines"] });
			toastManager.add({ title: t`Profile links saved`, variant: "success", timeout: 3000 });
		},
		onError: (error) => {
			toastManager.add({
				title: t`Failed to save profile links`,
				description: error instanceof Error ? error.message : t`An error occurred`,
				variant: "error",
				timeout: 3000,
			});
		},
	});

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		const cleanedLinks = links.filter((link) => Boolean(link.value?.trim()));
		setLinks(cleanedLinks);
		saveMutation.mutate(cleanedLinks);
	};

	const title = t`Profile`;
	const description = t`Manage your public author profile links`;

	if (isLoading) {
		return (
			<SettingsFrame title={title} description={description}>
				<div
					className="flex items-center gap-2 rounded-xl border border-kumo-line bg-kumo-base px-4 py-4 text-sm text-kumo-subtle"
					role="status"
				>
					<Loader size="sm" />
					<span>{t`Loading profile...`}</span>
				</div>
			</SettingsFrame>
		);
	}

	if (loadError && user === undefined) {
		return (
			<SettingsFrame title={title} description={description}>
				<Banner
					variant="error"
					title={t`An error occurred`}
					description={loadError instanceof Error ? loadError.message : t`An error occurred`}
					role="alert"
				/>
			</SettingsFrame>
		);
	}

	return (
		<SettingsFrame
			title={title}
			description={description}
			actions={
				<SaveButton
					type="submit"
					form="profile-settings-form"
					isDirty={isDirty}
					isSaving={saveMutation.isPending}
				/>
			}
		>
			<form id="profile-settings-form" noValidate onSubmit={handleSubmit} className="grid gap-8">
				<SettingsSection
					title={t`Profile Links`}
					description={t`Public links shown on your author pages and emitted in structured data (sameAs) and identity verification (rel="me") across all locales.`}
					actions={<Badge variant="neutral">{t`Public`}</Badge>}
					contentClassName="border-0 bg-transparent divide-y-0 overflow-visible"
				>
					<ProfileLinksEditor links={links} onChange={setLinks} />
				</SettingsSection>

				<div className="flex justify-end">
					<SaveButton
						type="submit"
						isDirty={isDirty}
						isSaving={saveMutation.isPending}
						announce={false}
					/>
				</div>
			</form>
		</SettingsFrame>
	);
}

export default ProfileSettings;
