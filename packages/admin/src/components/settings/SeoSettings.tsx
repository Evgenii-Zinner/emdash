/**
 * SEO Settings sub-page.
 *
 * Publisher identity, profile links, title separator, default social image,
 * search engine verification codes, robots.txt, and AI training opt-out.
 */

import {
	Badge,
	Banner,
	Button,
	Field,
	Input,
	InputArea,
	Label,
	Loader,
	Select,
	Switch,
	useKumoToastManager,
} from "@cloudflare/kumo";
import { i18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { CaretDown, Upload, WarningCircle, X } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import {
	fetchSettings,
	updateSettings,
	type MediaItem,
	type ProfileLink,
	type SiteIdentity,
	type SiteSettings,
	type SiteSettingsUpdate,
} from "../../lib/api";
import { MediaPickerModal } from "../MediaPickerModal";
import { SaveButton } from "../SaveButton.js";
import { ProfileLinksEditor } from "./ProfileLinksEditor.js";
import { SettingRow, SettingsFrame, SettingsSection } from "./SettingsLayout.js";

const GOOGLE_SUPPORTED_LOGO_MIMES = new Set([
	"image/jpeg",
	"image/png",
	"image/webp",
	"image/gif",
	"image/svg+xml",
]);

const GOOGLE_SUPPORTED_LOGO_EXTS = new Set(["jpg", "jpeg", "png", "webp", "gif", "svg"]);

function trimOptional(value?: string): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

function pickTrimmed<T extends Record<string, string | undefined>>(
	source: T | undefined,
): Partial<T> | undefined {
	if (!source) return undefined;
	const result: Record<string, string> = {};
	for (const [key, val] of Object.entries(source)) {
		const trimmed = trimOptional(val);
		if (trimmed) {
			result[key] = trimmed;
		}
	}
	return Object.keys(result).length > 0 ? (result as Partial<T>) : undefined;
}

/**
 * Strips empty optional strings and nested objects from SiteIdentity so
 * payloads satisfy strict API schema validation.
 */
export function sanitizeSiteIdentity(identity: SiteIdentity): SiteIdentity {
	const address = pickTrimmed({ ...identity.address });
	if (address?.addressCountry) {
		address.addressCountry = address.addressCountry.toUpperCase();
	}
	const policies =
		identity.type !== "Person" ? pickTrimmed({ ...identity.policies }) : undefined;
	const links = (identity.links ?? []).filter((link) => Boolean(link.value?.trim()));

	const sanitized: SiteIdentity = {
		type: identity.type === "Person" ? "Person" : "Organization",
		links,
	};

	const optionalStrings = [
		"name",
		"alternateName",
		"description",
		"url",
		"email",
		"telephone",
		"foundingDate",
	] as const;
	for (const key of optionalStrings) {
		const trimmed = trimOptional(identity[key]);
		if (trimmed) {
			sanitized[key] = trimmed;
		}
	}

	if (identity.type === "Person") {
		const jobTitle = trimOptional(identity.jobTitle);
		if (jobTitle) sanitized.jobTitle = jobTitle;
		const bylineId = trimOptional(identity.bylineId);
		if (bylineId) sanitized.bylineId = bylineId;
	}

	if (identity.logo?.mediaId) {
		sanitized.logo = identity.logo;
	}
	if (address) {
		sanitized.address = address;
	}
	if (policies) {
		sanitized.policies = policies;
	}
	if (identity.identifiers?.length) {
		sanitized.identifiers = identity.identifiers;
	}
	if (identity.areaServed?.length) {
		sanitized.areaServed = identity.areaServed;
	}
	if (identity.parentOrganization?.name?.trim()) {
		sanitized.parentOrganization = {
			name: identity.parentOrganization.name.trim(),
			...(trimOptional(identity.parentOrganization.url)
				? { url: trimOptional(identity.parentOrganization.url) }
				: {}),
		};
	}

	return sanitized;
}

/**
 * Returns a non-blocking warning if a publisher logo is smaller than 112x112
 * pixels or uses an image format not recommended by Google Search guidelines.
 */
export function getPublisherLogoWarning(
	logo: SiteIdentity["logo"] | undefined,
	naturalSize: { width: number; height: number } | null,
): string | null {
	if (!logo?.mediaId) return null;

	const mime = logo.contentType?.toLowerCase();
	const urlExt = logo.url?.split("?")[0]?.split(".").pop()?.toLowerCase();
	const isSvg = mime === "image/svg+xml" || (!mime && urlExt === "svg");
	const warnings: string[] = [];

	const width = logo.width ?? naturalSize?.width;
	const height = logo.height ?? naturalSize?.height;
	if (
		!isSvg &&
		((typeof width === "number" && width > 0 && width < 112) ||
			(typeof height === "number" && height > 0 && height < 112))
	) {
		warnings.push(
			i18n._(
				msg`Publisher logo is smaller than 112×112 pixels. Google recommends at least 112×112 pixels for organization logos.`,
			),
		);
	}

	if (mime) {
		if (!GOOGLE_SUPPORTED_LOGO_MIMES.has(mime)) {
			warnings.push(
				i18n._(
					msg`Publisher logo format may not be supported by Google Search. Use JPEG, PNG, WebP, GIF, or SVG.`,
				),
			);
		}
	} else if (urlExt && logo.url?.includes(".") && !GOOGLE_SUPPORTED_LOGO_EXTS.has(urlExt)) {
		warnings.push(
			i18n._(
				msg`Publisher logo format may not be supported by Google Search. Use JPEG, PNG, WebP, GIF, or SVG.`,
			),
		);
	}

	return warnings.length > 0 ? warnings.join(" ") : null;
}

function hydrateInitialSettings(settings: Partial<SiteSettings>): SiteSettingsUpdate {
	if (!settings.identity && settings.socialLinks && settings.socialLinks.length > 0) {
		return {
			...settings,
			identity: {
				type: "Organization",
				links: settings.socialLinks.map((link) => ({
					id: link.id,
					platform: link.platform || "custom",
					value: link.url,
					relMe: link.relMe ?? false,
					sameAs: true,
				})),
			},
		};
	}
	return settings;
}

function seoSettingsSnapshot(settings: SiteSettingsUpdate): string {
	return JSON.stringify({
		identity: settings.identity ? sanitizeSiteIdentity(settings.identity) : null,
		titleSeparator: settings.seo?.titleSeparator ?? "",
		defaultOgImage: settings.seo?.defaultOgImage ?? null,
		googleVerification: settings.seo?.googleVerification ?? "",
		bingVerification: settings.seo?.bingVerification ?? "",
		robotsTxt: settings.seo?.robotsTxt ?? "",
		disallowAiTraining: settings.seo?.disallowAiTraining === true,
	});
}

interface SettingsMediaFieldProps {
	label: string;
	description: string;
	image?: { mediaId: string; url?: string; alt?: string } | null;
	altFallback: string;
	missingMessage: string;
	selectLabel: string;
	changeLabel: string;
	removeLabel: string;
	imgClassName: string;
	onOpenPicker: () => void;
	onRemove: () => void;
	onImageLoad?: (event: React.SyntheticEvent<HTMLImageElement>) => void;
	warning?: React.ReactNode;
}

function SettingsMediaField({
	label,
	description,
	image,
	altFallback,
	missingMessage,
	selectLabel,
	changeLabel,
	removeLabel,
	imgClassName,
	onOpenPicker,
	onRemove,
	onImageLoad,
	warning,
}: SettingsMediaFieldProps) {
	return (
		<Field label={label} description={description}>
			{image?.mediaId ? (
				<div className="grid gap-3">
					{image.url ? (
						<img
							src={image.url}
							alt={image.alt || altFallback}
							className={imgClassName}
							onLoad={onImageLoad}
						/>
					) : (
						<div
							className="flex min-h-32 items-start gap-2 rounded border border-dashed border-kumo-line bg-kumo-tint px-3 py-2 text-sm leading-5 text-kumo-subtle"
							role="status"
						>
							<span className="flex h-5 shrink-0 items-center" aria-hidden="true">
								<WarningCircle className="h-4 w-4" />
							</span>
							<span>{missingMessage}</span>
						</div>
					)}
					{warning}
					<div className="flex flex-wrap gap-3">
						<Button
							type="button"
							variant="outline"
							size="sm"
							icon={<Upload />}
							onClick={onOpenPicker}
						>
							{changeLabel}
						</Button>
						<Button
							type="button"
							variant="outline"
							size="sm"
							icon={<X />}
							onClick={onRemove}
						>
							{removeLabel}
						</Button>
					</div>
				</div>
			) : (
				<div className="grid gap-3 justify-items-start">
					{warning}
					<Button
						type="button"
						variant="outline"
						icon={<Upload />}
						onClick={onOpenPicker}
					>
						{selectLabel}
					</Button>
				</div>
			)}
		</Field>
	);
}

/**
 * Unified SEO and publisher identity settings page.
 */
export function SeoSettings() {
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

	const [formData, setFormData] = React.useState<SiteSettingsUpdate>({});
	const [savedFormData, setSavedFormData] = React.useState<SiteSettingsUpdate>({});
	const [ogImagePickerOpen, setOgImagePickerOpen] = React.useState(false);
	const [logoPickerOpen, setLogoPickerOpen] = React.useState(false);
	const [logoNaturalSize, setLogoNaturalSize] = React.useState<{
		width: number;
		height: number;
	} | null>(null);

	React.useEffect(() => {
		if (settings) {
			const hydrated = hydrateInitialSettings(settings);
			setFormData(hydrated);
			setSavedFormData(hydrated);
		}
	}, [settings]);

	const activeLogo = formData.identity?.logo?.mediaId
		? formData.identity.logo
		: settings?.logo?.mediaId
			? settings.logo
			: undefined;

	React.useEffect(() => {
		setLogoNaturalSize(null);
	}, [activeLogo?.mediaId, activeLogo?.url]);

	const logoWarning = React.useMemo(
		() => getPublisherLogoWarning(activeLogo, logoNaturalSize),
		[activeLogo, logoNaturalSize],
	);

	const isDirty = React.useMemo(
		() => seoSettingsSnapshot(formData) !== seoSettingsSnapshot(savedFormData),
		[formData, savedFormData],
	);

	const saveMutation = useMutation({
		mutationFn: (data: SiteSettingsUpdate) => updateSettings(data),
		onSuccess: (_savedSettings, submittedSettings) => {
			setSavedFormData(submittedSettings);
			void queryClient.invalidateQueries({ queryKey: ["settings"] });
			toastManager.add({ title: t`SEO settings saved`, variant: "success", timeout: 3000 });
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
		const payload: SiteSettingsUpdate = formData.identity
			? { ...formData, identity: sanitizeSiteIdentity(formData.identity) }
			: formData;
		if (formData.identity) {
			setFormData(payload);
		}
		saveMutation.mutate(payload);
	};

	const updateIdentity = (updater: (current: SiteIdentity) => SiteIdentity) => {
		setFormData((prev) => ({
			...prev,
			identity: updater(prev.identity ?? { type: "Organization", links: [] }),
		}));
	};

	const handleSeoChange = (key: string, value: unknown) => {
		setFormData((prev) => ({
			...prev,
			seo: {
				...prev.seo,
				[key]: value,
			},
		}));
	};

	const handleDefaultOgImageSelect = (media: MediaItem) => {
		setFormData((prev) => ({
			...prev,
			seo: {
				...prev.seo,
				defaultOgImage: { mediaId: media.id, alt: media.alt || "", url: media.url },
			},
		}));
		setOgImagePickerOpen(false);
	};

	const handleDefaultOgImageRemove = () => {
		setFormData((prev) => ({
			...prev,
			seo: { ...prev.seo, defaultOgImage: null },
		}));
	};

	const handlePublisherLogoSelect = (media: MediaItem) => {
		updateIdentity((current) => ({
			...current,
			logo: {
				mediaId: media.id,
				alt: media.alt || "",
				url: media.url,
				contentType: media.mimeType,
				width: media.width,
				height: media.height,
			},
		}));
		setLogoPickerOpen(false);
	};

	const handlePublisherLogoRemove = () => {
		updateIdentity((current) => {
			const { logo: _removed, ...rest } = current;
			return rest;
		});
	};

	const identityView: SiteIdentity = formData.identity ?? { type: "Organization", links: [] };
	const profileLinks: ProfileLink[] = identityView.links ?? [];

	const title = t`SEO Settings`;
	const description = t`Publisher identity, social links, search engine optimization, and verification`;

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
					form="seo-settings-form"
					isDirty={isDirty}
					isSaving={saveMutation.isPending}
				/>
			}
		>
			<form id="seo-settings-form" noValidate onSubmit={handleSubmit} className="grid gap-8">
				<SettingsSection
					title={t`Publisher Identity`}
					description={t`Public publisher details and profile links emitted in Schema.org structured data and rel="me" verification tags.`}
					actions={<Badge variant="neutral">{t`Public`}</Badge>}
				>
					<SettingRow className="grid gap-4 sm:grid-cols-2">
						<Select
							label={t`Publisher Type`}
							value={identityView.type ?? "Organization"}
							onValueChange={(val) =>
								updateIdentity((current) => ({
									...current,
									type: val as "Organization" | "Person",
								}))
							}
							items={{
								Organization: t`Organization (Business, Brand, Company)`,
								Person: t`Person (Individual, Creator, Portfolio)`,
							}}
						/>
						<Input
							label={t`Publisher Name (optional)`}
							placeholder={settings?.title || t`Defaults to site title`}
							value={identityView.name ?? ""}
							onChange={(e) =>
								updateIdentity((current) => ({
									...current,
									name: e.target.value,
								}))
							}
						/>
					</SettingRow>
					<SettingRow>
						<SettingsMediaField
							label={t`Publisher Logo`}
							description={t`Logo representing your organization or personal brand in structured data. Falls back to the site logo when unset. Recommended: at least 112×112 pixels in JPEG, PNG, WebP, GIF, or SVG.`}
							image={identityView.logo}
							altFallback={t`Publisher logo`}
							missingMessage={t`The referenced logo is no longer available. Pick a new one or clear the reference.`}
							selectLabel={t`Select Logo`}
							changeLabel={t`Change Logo`}
							removeLabel={t`Clear Logo`}
							imgClassName="emdash-media-transparency-grid h-24 max-w-full rounded border border-kumo-line object-contain p-2"
							onOpenPicker={() => setLogoPickerOpen(true)}
							onRemove={handlePublisherLogoRemove}
							onImageLoad={(e) => {
								if (e.currentTarget.naturalWidth > 0 && e.currentTarget.naturalHeight > 0) {
									setLogoNaturalSize({
										width: e.currentTarget.naturalWidth,
										height: e.currentTarget.naturalHeight,
									});
								}
							}}
							warning={
								logoWarning ? (
									<Banner
										variant="alert"
										title={t`Logo guideline warning`}
										description={logoWarning}
										role="status"
									/>
								) : null
							}
						/>
					</SettingRow>
					<SettingRow>
						<div className="grid gap-3">
							<div>
								<h3 className="text-sm font-medium text-kumo-strong">{t`Profiles & Links`}</h3>
								<p className="mt-1 text-sm text-kumo-subtle">
									{t`Social and external profiles emitted for structured data (sameAs) and identity verification (rel="me").`}
								</p>
							</div>
							<ProfileLinksEditor
								links={profileLinks}
								onChange={(nextLinks) =>
									updateIdentity((current) => ({
										...current,
										links: nextLinks,
									}))
								}
							/>
						</div>
					</SettingRow>
					<SettingRow>
						<details className="group">
							<summary className="flex cursor-pointer select-none items-center justify-between text-sm font-medium text-kumo-strong">
								<span>{t`Advanced Publisher Details`}</span>
								<CaretDown className="h-4 w-4 transition-transform group-open:rotate-180" />
							</summary>
							<div className="mt-4 grid gap-6 pt-2 text-sm">
								<div className="grid gap-3 sm:grid-cols-2">
									<Input
										label={t`Alternate Name`}
										value={identityView.alternateName ?? ""}
										onChange={(e) =>
											updateIdentity((current) => ({
												...current,
												alternateName: e.target.value,
											}))
										}
									/>
									<Input
										dir="ltr"
										type="url"
										label={t`Website URL`}
										placeholder="https://..."
										value={identityView.url ?? ""}
										onChange={(e) =>
											updateIdentity((current) => ({
												...current,
												url: e.target.value,
											}))
										}
									/>
									<Input
										dir="ltr"
										type="email"
										label={t`Contact Email`}
										placeholder="hello@example.com"
										value={identityView.email ?? ""}
										onChange={(e) =>
											updateIdentity((current) => ({
												...current,
												email: e.target.value,
											}))
										}
									/>
									<Input
										dir="ltr"
										label={t`Telephone`}
										placeholder="+1-555-0100"
										value={identityView.telephone ?? ""}
										onChange={(e) =>
											updateIdentity((current) => ({
												...current,
												telephone: e.target.value,
											}))
										}
									/>
									{identityView.type === "Person" ? (
										<Input
											label={t`Job Title`}
											value={identityView.jobTitle ?? ""}
											onChange={(e) =>
												updateIdentity((current) => ({
													...current,
													jobTitle: e.target.value,
												}))
											}
										/>
									) : (
										<Input
											dir="ltr"
											label={t`Founding Date`}
											placeholder="YYYY-MM-DD"
											value={identityView.foundingDate ?? ""}
											onChange={(e) =>
												updateIdentity((current) => ({
													...current,
													foundingDate: e.target.value,
												}))
											}
										/>
									)}
								</div>

								<InputArea
									label={t`Description`}
									rows={2}
									value={identityView.description ?? ""}
									onChange={(e) =>
										updateIdentity((current) => ({
											...current,
											description: e.target.value,
										}))
									}
								/>

								<div>
									<h4 className="font-semibold text-kumo-strong">{t`Postal Address`}</h4>
									<div className="mt-2 grid gap-3 sm:grid-cols-2">
										<Input
											label={t`Street Address`}
											placeholder={t`123 Main St`}
											value={identityView.address?.streetAddress ?? ""}
											onChange={(e) =>
												updateIdentity((current) => ({
													...current,
													address: {
														...current.address,
														streetAddress: e.target.value,
													},
												}))
											}
										/>
										<Input
											label={t`Locality / City`}
											placeholder={t`City`}
											value={identityView.address?.addressLocality ?? ""}
											onChange={(e) =>
												updateIdentity((current) => ({
													...current,
													address: {
														...current.address,
														addressLocality: e.target.value,
													},
												}))
											}
										/>
										<Input
											label={t`Region / State`}
											value={identityView.address?.addressRegion ?? ""}
											onChange={(e) =>
												updateIdentity((current) => ({
													...current,
													address: {
														...current.address,
														addressRegion: e.target.value,
													},
												}))
											}
										/>
										<Input
											label={t`Postal Code`}
											placeholder={t`ZIP or Postcode`}
											value={identityView.address?.postalCode ?? ""}
											onChange={(e) =>
												updateIdentity((current) => ({
													...current,
													address: {
														...current.address,
														postalCode: e.target.value,
													},
												}))
											}
										/>
										<Input
											dir="ltr"
											label={t`Country Code`}
											placeholder={t`e.g. US, GB, DE`}
											maxLength={2}
											value={identityView.address?.addressCountry ?? ""}
											onChange={(e) =>
												updateIdentity((current) => ({
													...current,
													address: {
														...current.address,
														addressCountry: e.target.value,
													},
												}))
											}
										/>
									</div>
								</div>

								{identityView.type !== "Person" && (
									<div>
										<h4 className="font-semibold text-kumo-strong">{t`Organization Policies`}</h4>
										<div className="mt-2 grid gap-3 sm:grid-cols-2">
											<Input
												dir="ltr"
												type="url"
												label={t`Publishing Principles URL`}
												placeholder="https://..."
												value={identityView.policies?.publishingPrinciples ?? ""}
												onChange={(e) =>
													updateIdentity((current) => ({
														...current,
														policies: {
															...current.policies,
															publishingPrinciples: e.target.value,
														},
													}))
												}
											/>
											<Input
												dir="ltr"
												type="url"
												label={t`Corrections Policy URL`}
												placeholder="https://..."
												value={identityView.policies?.correctionsPolicy ?? ""}
												onChange={(e) =>
													updateIdentity((current) => ({
														...current,
														policies: {
															...current.policies,
															correctionsPolicy: e.target.value,
														},
													}))
												}
											/>
											<Input
												dir="ltr"
												type="url"
												label={t`Ethics Policy URL`}
												placeholder="https://..."
												value={identityView.policies?.ethicsPolicy ?? ""}
												onChange={(e) =>
													updateIdentity((current) => ({
														...current,
														policies: {
															...current.policies,
															ethicsPolicy: e.target.value,
														},
													}))
												}
											/>
											<Input
												dir="ltr"
												type="url"
												label={t`Diversity Policy URL`}
												placeholder="https://..."
												value={identityView.policies?.diversityPolicy ?? ""}
												onChange={(e) =>
													updateIdentity((current) => ({
														...current,
														policies: {
															...current.policies,
															diversityPolicy: e.target.value,
														},
													}))
												}
											/>
											<Input
												dir="ltr"
												type="url"
												label={t`Ownership / Funding Info URL`}
												placeholder="https://..."
												value={identityView.policies?.ownershipFundingInfo ?? ""}
												onChange={(e) =>
													updateIdentity((current) => ({
														...current,
														policies: {
															...current.policies,
															ownershipFundingInfo: e.target.value,
														},
													}))
												}
											/>
											<Input
												dir="ltr"
												type="url"
												label={t`Actionable Feedback Policy URL`}
												placeholder="https://..."
												value={identityView.policies?.actionableFeedbackPolicy ?? ""}
												onChange={(e) =>
													updateIdentity((current) => ({
														...current,
														policies: {
															...current.policies,
															actionableFeedbackPolicy: e.target.value,
														},
													}))
												}
											/>
										</div>
									</div>
								)}
							</div>
						</details>
					</SettingRow>
				</SettingsSection>

				<SettingsSection title={t`Search Engine Optimization`}>
					<SettingRow>
						<Input
							label={t`Title Separator`}
							value={formData.seo?.titleSeparator ?? ""}
							placeholder="|"
							onChange={(e) => handleSeoChange("titleSeparator", e.target.value)}
							description={t`Character between page title and site name (e.g., "My Post | My Site")`}
						/>
					</SettingRow>
					<SettingRow>
						<SettingsMediaField
							label={t`Default Social Image`}
							description={t`Used as the fallback Open Graph image when a page has none. Recommended size: 1200×630.`}
							image={formData.seo?.defaultOgImage}
							altFallback={t`Default social image`}
							missingMessage={t`The referenced image is no longer available. Pick a new one or remove the reference.`}
							selectLabel={t`Select Image`}
							changeLabel={t`Change Image`}
							removeLabel={t`Remove`}
							imgClassName="emdash-media-transparency-grid h-32 max-w-full rounded border border-kumo-line object-contain p-2"
							onOpenPicker={() => setOgImagePickerOpen(true)}
							onRemove={handleDefaultOgImageRemove}
						/>
					</SettingRow>
				</SettingsSection>

				<SettingsSection title={t`Search Engine Verification`}>
					<SettingRow>
						<Input
							dir="ltr"
							label={t`Google Verification`}
							value={formData.seo?.googleVerification || ""}
							onChange={(e) => handleSeoChange("googleVerification", e.target.value)}
							description={t`Meta tag content for Google Search Console verification`}
						/>
					</SettingRow>
					<SettingRow>
						<Input
							dir="ltr"
							label={t`Bing Verification`}
							value={formData.seo?.bingVerification || ""}
							onChange={(e) => handleSeoChange("bingVerification", e.target.value)}
							description={t`Meta tag content for Bing Webmaster Tools verification`}
						/>
					</SettingRow>
				</SettingsSection>

				<SettingsSection title={t`robots.txt`}>
					<SettingRow>
						<InputArea
							dir="ltr"
							label={t`robots.txt`}
							value={formData.seo?.robotsTxt || ""}
							onChange={(e) => handleSeoChange("robotsTxt", e.target.value)}
							rows={5}
							description={t`Custom robots.txt content. Leave empty to use the default.`}
						/>
					</SettingRow>
					<SettingRow className="flex items-start justify-between gap-6">
						<div className="grid gap-1">
							<Label htmlFor="seo-disallow-ai-training">{t`Disallow AI training`}</Label>
							<p id="seo-disallow-ai-training-description" className="text-sm text-kumo-subtle">
								{t`Adds rules to robots.txt that ask AI crawlers not to use this site for training. Search engines can still index it.`}
							</p>
						</div>
						<Switch
							id="seo-disallow-ai-training"
							className="shrink-0"
							checked={formData.seo?.disallowAiTraining === true}
							onCheckedChange={(checked) => handleSeoChange("disallowAiTraining", checked)}
							aria-label={t`Disallow AI training`}
							aria-describedby="seo-disallow-ai-training-description"
						/>
					</SettingRow>
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

			<MediaPickerModal
				open={ogImagePickerOpen}
				onOpenChange={setOgImagePickerOpen}
				onSelect={handleDefaultOgImageSelect}
				mimeTypeFilters={["image/jpeg", "image/png", "image/webp", "image/gif"]}
				localOnly
				title={t`Select default social image`}
			/>
			<MediaPickerModal
				open={logoPickerOpen}
				onOpenChange={setLogoPickerOpen}
				onSelect={handlePublisherLogoSelect}
				mimeTypeFilter="image/"
				localOnly
				title={t`Select publisher logo`}
			/>
		</SettingsFrame>
	);
}

export default SeoSettings;
