/**
 * Social Settings sub-page
 *
 * Dynamic social and profile links with optional rel="me" identity verification.
 */

import { Banner, Button, Input, Loader, Switch, useKumoToastManager } from "@cloudflare/kumo";
import { useLingui } from "@lingui/react/macro";
import { Plus, Trash } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import { fetchSettings, updateSettings, type SiteSettings, type SocialLink } from "../../lib/api";
import { SaveButton } from "../SaveButton.js";
import { SettingRow, SettingsFrame, SettingsSection } from "./SettingsLayout.js";

function socialSettingsSnapshot(settings: Partial<SiteSettings>) {
	return JSON.stringify(
		(settings.socialLinks ?? []).map((l) => ({
			id: l.id,
			platform: l.platform ?? "",
			label: l.label,
			url: l.url,
			relMe: l.relMe ?? false,
		})),
	);
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

	const [formData, setFormData] = React.useState<Partial<SiteSettings>>({});
	const [savedFormData, setSavedFormData] = React.useState<Partial<SiteSettings>>({});

	React.useEffect(() => {
		if (settings) {
			const links: SocialLink[] =
				settings.socialLinks ??
				Object.entries(settings.social ?? {}).flatMap(([platform, url]) =>
					url && typeof url === "string" && url.trim().length > 0
						? [
								{
									id: platform,
									platform,
									label: platform.charAt(0).toUpperCase() + platform.slice(1),
									url: url.trim(),
									relMe: true,
								},
							]
						: [],
				);
			const normalized: Partial<SiteSettings> = { ...settings, socialLinks: links };
			setFormData(normalized);
			setSavedFormData(normalized);
		}
	}, [settings]);

	const isDirty = React.useMemo(
		() => socialSettingsSnapshot(formData) !== socialSettingsSnapshot(savedFormData),
		[formData, savedFormData],
	);

	const saveMutation = useMutation({
		mutationFn: (data: Partial<SiteSettings>) => updateSettings(data),
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

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		saveMutation.mutate(formData);
	};

	const handleAddLink = () => {
		const newLink: SocialLink = {
			id:
				typeof crypto !== "undefined" && crypto.randomUUID
					? crypto.randomUUID()
					: `link_${Date.now()}`,
			label: "",
			url: "",
			relMe: true,
		};
		setFormData((prev) => ({
			...prev,
			socialLinks: [...(prev.socialLinks ?? []), newLink],
		}));
	};

	const handleUpdateLink = (
		index: number,
		field: keyof SocialLink,
		value: string | boolean,
	) => {
		setFormData((prev) => {
			const links = [...(prev.socialLinks ?? [])];
			const target = links[index];
			if (!target) return prev;
			links[index] = { ...target, [field]: value };
			return { ...prev, socialLinks: links };
		});
	};

	const handleRemoveLink = (index: number) => {
		setFormData((prev) => {
			const links = [...(prev.socialLinks ?? [])];
			links.splice(index, 1);
			return { ...prev, socialLinks: links };
		});
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

	const links = formData.socialLinks ?? [];

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
			<form id="social-settings-form" onSubmit={handleSubmit} className="grid gap-8">
				<SettingsSection
					title={t`Profiles & Links`}
					description={t`Add your social media profiles and links. Enable identity verification (rel="me") to verify ownership on platforms like Mastodon, Bluesky, and GitHub.`}
					actions={
						<Button
							type="button"
							variant="secondary"
							size="sm"
							icon={<Plus />}
							onClick={handleAddLink}
						>
							{t`Add Link`}
						</Button>
					}
				>
					{links.length === 0 ? (
						<SettingRow>
							<div className="py-6 text-center text-sm text-kumo-subtle">
								{t`No social links configured yet. Click "Add Link" to add your first profile.`}
							</div>
						</SettingRow>
					) : (
						links.map((link, index) => (
							<SettingRow key={link.id} className="grid gap-3">
								<div className="flex flex-col gap-3 sm:flex-row sm:items-end">
									<div className="sm:w-1/3">
										<Input
											label={t`Platform / Label`}
											placeholder={t`e.g. GitHub, Mastodon`}
											value={link.label}
											onChange={(e) =>
												handleUpdateLink(index, "label", e.target.value)
											}
										/>
									</div>
									<div className="flex-1">
										<Input
											dir="ltr"
											type="url"
											label={t`URL`}
											placeholder="https://..."
											value={link.url}
											onChange={(e) =>
												handleUpdateLink(index, "url", e.target.value)
											}
										/>
									</div>
									<div className="flex shrink-0 items-center pb-1">
										<Button
											type="button"
											variant="ghost"
											size="sm"
											icon={<Trash className="h-4 w-4" />}
											className="text-kumo-danger"
											onClick={() => handleRemoveLink(index)}
											aria-label={t`Remove ${link.label || "link"}`}
										/>
									</div>
								</div>
								<div className="flex items-center gap-2 pt-1 text-sm text-kumo-subtle">
									<Switch
										id={`rel-me-${link.id}`}
										checked={link.relMe === true}
										onCheckedChange={(checked) =>
											handleUpdateLink(index, "relMe", checked)
										}
										aria-label={t`Verify identity (rel="me") for ${link.label || link.url || "link"}`}
									/>
									<label
										htmlFor={`rel-me-${link.id}`}
										className="cursor-pointer select-none"
									>
										{t`Verify identity with rel="me"`}
									</label>
								</div>
							</SettingRow>
						))
					)}
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

export default SocialSettings;
