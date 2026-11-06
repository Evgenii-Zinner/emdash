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

	const [formData, setFormData] = React.useState<{ socialLinks?: SocialLink[] }>({});
	const [savedFormData, setSavedFormData] = React.useState<{ socialLinks?: SocialLink[] }>({});
	const [errors, setErrors] = React.useState<
		Record<number, { label?: string; url?: string }>
	>({});

	React.useEffect(() => {
		if (settings) {
			const links = settings.socialLinks ?? [];
			const normalized = { socialLinks: links };
			setFormData(normalized);
			setSavedFormData(normalized);
			setErrors({});
		}
	}, [settings]);

	const isDirty = React.useMemo(
		() => socialSettingsSnapshot(formData) !== socialSettingsSnapshot(savedFormData),
		[formData, savedFormData],
	);

	const saveMutation = useMutation({
		mutationFn: (data: { socialLinks?: SocialLink[] }) =>
			updateSettings({ socialLinks: data.socialLinks }),
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
		const currentLinks = formData.socialLinks ?? [];
		const newErrors: Record<number, { label?: string; url?: string }> = {};
		const cleanedLinks: SocialLink[] = [];

		for (let i = 0; i < currentLinks.length; i++) {
			const link = currentLinks[i]!;
			const hasLabel = Boolean(link.label?.trim());
			const hasUrl = Boolean(link.url?.trim());

			// Silently drop fully blank rows added without content
			if (!hasLabel && !hasUrl) {
				continue;
			}

			let rowError: { label?: string; url?: string } | null = null;
			if (!hasLabel) {
				rowError = { ...rowError, label: t`Label is required` };
			}
			if (!hasUrl) {
				rowError = { ...rowError, url: t`URL is required` };
			} else if (!/^https?:\/\//i.test(link.url.trim())) {
				rowError = { ...rowError, url: t`URL must start with http:// or https://` };
			}

			if (rowError) {
				newErrors[i] = rowError;
			} else {
				cleanedLinks.push({
					...link,
					label: link.label.trim(),
					url: link.url.trim(),
				});
			}
		}

		if (Object.keys(newErrors).length > 0) {
			setErrors(newErrors);
			return;
		}

		setErrors({});
		setFormData({ socialLinks: cleanedLinks });
		saveMutation.mutate({ socialLinks: cleanedLinks });
	};

	const handleAddLink = () => {
		const newLink: SocialLink = {
			id:
				typeof crypto !== "undefined" && crypto.randomUUID
					? crypto.randomUUID()
					: `link_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
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
		setErrors((prev) => {
			if (!prev[index]?.[field as "label" | "url"]) return prev;
			const next = { ...prev };
			const row = { ...next[index] };
			delete row[field as "label" | "url"];
			if (Object.keys(row).length === 0) {
				delete next[index];
			} else {
				next[index] = row;
			}
			return next;
		});
		setFormData((prev) => {
			const links = [...(prev.socialLinks ?? [])];
			const target = links[index];
			if (!target) return prev;
			links[index] = { ...target, [field]: value };
			return { ...prev, socialLinks: links };
		});
	};

	const handleRemoveLink = (index: number) => {
		setErrors((prev) => {
			if (!prev[index]) return prev;
			const next = { ...prev };
			delete next[index];
			return next;
		});
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
			<form
				id="social-settings-form"
				noValidate
				onSubmit={handleSubmit}
				className="grid gap-8"
			>
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
											error={errors[index]?.label}
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
											error={errors[index]?.url}
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
											aria-label={
												link.label?.trim()
													? t`Remove ${link.label.trim()}`
													: t`Remove link`
											}
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
										aria-label={
											link.label?.trim() || link.url?.trim()
												? t`Verify identity (rel="me") for ${link.label?.trim() || link.url?.trim()}`
												: t`Verify identity with rel="me"`
										}
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
