/**
 * Social Settings sub-page
 *
 * Dynamic social and profile links with optional rel="me" identity verification.
 */

import {
	Banner,
	Button,
	Input,
	Loader,
	Select,
	Switch,
	useKumoToastManager,
} from "@cloudflare/kumo";
import { useLingui } from "@lingui/react/macro";
import { CaretDown } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import {
	fetchSettings,
	updateSettings,
	type ProfileLink,
	type SiteIdentity,
	type SiteSettings,
} from "../../lib/api";
import { SaveButton } from "../SaveButton.js";
import { SettingRow, SettingsFrame, SettingsSection } from "./SettingsLayout.js";
import { ProfileLinksEditor } from "./ProfileLinksEditor.js";

interface FormState {
	identity?: SiteIdentity;
}

function socialSettingsSnapshot(formData: FormState) {
	return JSON.stringify({
		links: (formData.identity?.links ?? []).map((l: any) => ({
			id: l.id,
			platform: l.platform ?? "",
			label: l.label ?? "",
			value: l.value ?? "",
			relMe: l.relMe ?? false,
			sameAs: l.sameAs ?? false,
		})),
		type: formData.identity?.type ?? "Organization",
		name: formData.identity?.name ?? "",
		alternateName: formData.identity?.alternateName ?? "",
		address: formData.identity?.address ?? {},
		policies: formData.identity?.policies ?? {},
	});
}

export function SocialSettings() {
	const { t } = useLingui();
	const queryClient = useQueryClient();
	const toastManager = useKumoToastManager();

	const {
		data: settings,
		isLoading,
		error: loadError,
	} = useQuery({
		queryKey: ["settings"],
		queryFn: fetchSettings,
		staleTime: Infinity,
	});

	const [formData, setFormData] = React.useState<FormState>({});
	const [savedFormData, setSavedFormData] = React.useState<FormState>({});

	React.useEffect(() => {
		if (settings) {
			const links = settings.socialLinks ?? [];
			const identityLinks =
				settings.identity?.links !== undefined
					? settings.identity.links
					: links.map((l) => ({
							id: l.id,
							platform: l.platform || "custom",
							value: l.url,
							relMe: l.relMe ?? false,
							sameAs: true,
						}));
			const normalized: FormState = {
				identity: {
					...(settings.identity ?? { type: "Organization" }),
					links: identityLinks,
				},
			};
			setFormData(normalized);
			setSavedFormData(normalized);
		}
	}, [settings]);

	const isDirty = React.useMemo(
		() => socialSettingsSnapshot(formData) !== socialSettingsSnapshot(savedFormData),
		[formData, savedFormData],
	);

	const saveMutation = useMutation({
		mutationFn: (data: FormState) => {
			return updateSettings({ identity: data.identity });
		},
		onSuccess: (_savedSettings, submittedSettings) => {
			setSavedFormData(submittedSettings);
			void queryClient.invalidateQueries({ queryKey: ["settings"] });
			toastManager.add({ title: t`Social links saved`, variant: "success", timeout: 3000 });
		},
		onError: (error) => {
			toastManager.add({
				title: t`Failed to save settings`,
				description: error instanceof Error ? error.message : t`An error occurred`,
				variant: "error",
				timeout: 3000,
			});
		},
	});

	const profileLinks: ProfileLink[] = React.useMemo(() => {
		return formData.identity?.links ?? [];
	}, [formData.identity?.links]);

	const handleLinksChange = (nextLinks: ProfileLink[]) => {
		setFormData((prev) => ({
			...prev,
			identity: {
				...(prev.identity ?? { type: "Organization" }),
				links: nextLinks,
			},
		}));
	};

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		const currentLinks = profileLinks.filter((l) => Boolean(l.value?.trim()));

		const submittedState: FormState = {
			identity: {
				...(formData.identity ?? { type: "Organization" }),
				links: currentLinks,
			},
		};

		setFormData(submittedState);
		saveMutation.mutate(submittedState);
	};

	const title = t`Social Links`;
	const description = t`Social media and profile links with identity verification`;

	if (isLoading) {
		return (
			<SettingsFrame title={title} description={description}>
				<div
					className="flex items-center gap-2 rounded-xl border border-kumo-line bg-kumo-base px-4 py-4 text-sm text-kumo-subtle"
					role="status"
				>
					<Loader size="sm" />
					<span>{t`Loading settings...`}</span>
				</div>
			</SettingsFrame>
		);
	}

	if (loadError && settings === undefined) {
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
					form="social-settings-form"
					isDirty={isDirty}
					isSaving={saveMutation.isPending}
				/>
			}
		>
			<form id="social-settings-form" noValidate onSubmit={handleSubmit} className="grid gap-8">
				<SettingsSection
					title={t`Publisher Identity`}
					description={t`Define whether this site represents an Organization or a Person for structured data.`}
				>
					<SettingRow className="grid gap-4 sm:grid-cols-2">
						<Select
							label={t`Publisher Type`}
							value={formData.identity?.type ?? "Organization"}
							onValueChange={(val) =>
								setFormData((prev) => ({
									...prev,
									identity: {
										...(prev.identity ?? { type: "Organization" }),
										type: val as "Organization" | "Person",
									},
								}))
							}
							items={{
								Organization: t`Organization (Business, Brand, Company)`,
								Person: t`Person (Individual, Creator, Portfolio)`,
							}}
						/>
						<Input
							label={t`Publisher Name (optional)`}
							placeholder={t`Defaults to site title`}
							value={formData.identity?.name ?? ""}
							onChange={(e) =>
								setFormData((prev) => ({
									...prev,
									identity: {
										...(prev.identity ?? { type: "Organization" }),
										name: e.target.value,
									},
								}))
							}
						/>
					</SettingRow>
				</SettingsSection>

				<SettingsSection
					title={t`Profiles & Links`}
					description={t`Add your social media profiles and links. Enable identity verification (rel="me") to verify ownership on platforms like Mastodon, Bluesky, and GitHub.`}
					contentClassName="border-0 bg-transparent divide-y-0 overflow-visible"
				>
					<ProfileLinksEditor
						links={profileLinks}
						onChange={handleLinksChange}
					/>
				</SettingsSection>

				<details className="group rounded-xl border border-kumo-line bg-kumo-base p-4">
					<summary className="flex cursor-pointer select-none items-center justify-between font-medium text-kumo-strong">
						<span>{t`Advanced Identity (Structured Data)`}</span>
						<CaretDown className="h-4 w-4 transition-transform group-open:rotate-180" />
					</summary>
					<div className="mt-4 grid gap-6 pt-2 text-sm">
						<div>
							<h3 className="font-semibold text-kumo-strong">{t`Postal Address`}</h3>
							<div className="mt-2 grid gap-3 sm:grid-cols-2">
								<Input
									label={t`Street Address`}
									placeholder={t`123 Main St`}
									value={formData.identity?.address?.streetAddress ?? ""}
									onChange={(e) =>
										setFormData((prev) => ({
											...prev,
											identity: {
												...(prev.identity ?? { type: "Organization" }),
												address: {
													...prev.identity?.address,
													streetAddress: e.target.value,
												},
											},
										}))
									}
								/>
								<Input
									label={t`Locality / City`}
									placeholder={t`City`}
									value={formData.identity?.address?.addressLocality ?? ""}
									onChange={(e) =>
										setFormData((prev) => ({
											...prev,
											identity: {
												...(prev.identity ?? { type: "Organization" }),
												address: {
													...prev.identity?.address,
													addressLocality: e.target.value,
												},
											},
										}))
									}
								/>
								<Input
									label={t`Postal Code`}
									placeholder={t`ZIP or Postcode`}
									value={formData.identity?.address?.postalCode ?? ""}
									onChange={(e) =>
										setFormData((prev) => ({
											...prev,
											identity: {
												...(prev.identity ?? { type: "Organization" }),
												address: {
													...prev.identity?.address,
													postalCode: e.target.value,
												},
											},
										}))
									}
								/>
								<Input
									label={t`Country Code`}
									placeholder={t`e.g. US, GB, DE`}
									value={formData.identity?.address?.addressCountry ?? ""}
									onChange={(e) =>
										setFormData((prev) => ({
											...prev,
											identity: {
												...(prev.identity ?? { type: "Organization" }),
												address: {
													...prev.identity?.address,
													addressCountry: e.target.value,
												},
											},
										}))
									}
								/>
							</div>
						</div>

						{formData.identity?.type !== "Person" && (
							<div>
								<h3 className="font-semibold text-kumo-strong">{t`Organization Policies`}</h3>
								<div className="mt-2 grid gap-3 sm:grid-cols-2">
									<Input
										type="url"
										label={t`Publishing Principles URL`}
										placeholder="https://..."
										value={formData.identity?.policies?.publishingPrinciples ?? ""}
										onChange={(e) =>
											setFormData((prev) => ({
												...prev,
												identity: {
													...(prev.identity ?? { type: "Organization" }),
													policies: {
														...prev.identity?.policies,
														publishingPrinciples: e.target.value,
													},
												},
											}))
										}
									/>
									<Input
										type="url"
										label={t`Corrections Policy URL`}
										placeholder="https://..."
										value={formData.identity?.policies?.correctionsPolicy ?? ""}
										onChange={(e) =>
											setFormData((prev) => ({
												...prev,
												identity: {
													...(prev.identity ?? { type: "Organization" }),
													policies: {
														...prev.identity?.policies,
														correctionsPolicy: e.target.value,
													},
												},
											}))
										}
									/>
								</div>
							</div>
						)}
					</div>
				</details>

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

export default SocialSettings;
