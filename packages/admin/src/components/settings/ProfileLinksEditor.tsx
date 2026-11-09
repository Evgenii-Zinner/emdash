import { Button, Input, LayerDialog, Select, Switch } from "@cloudflare/kumo";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { CaretDown, CaretUp, Plus, ShareNetwork, Trash } from "@phosphor-icons/react";
import * as React from "react";

import type { ProfileLink } from "../../lib/api/settings.js";

export const BUILTIN_PLATFORMS = [
	{ value: "github", label: msg`GitHub`, urlPrefix: "https://github.com/" },
	{ value: "twitter", label: msg`X (Twitter)`, urlPrefix: "https://x.com/" },
	{ value: "bluesky", label: msg`Bluesky`, urlPrefix: "https://bsky.app/profile/" },
	{ value: "mastodon", label: msg`Mastodon`, urlPrefix: "" },
	{ value: "threads", label: msg`Threads`, urlPrefix: "https://threads.net/@" },
	{ value: "linkedin", label: msg`LinkedIn`, urlPrefix: "https://linkedin.com/in/" },
	{ value: "youtube", label: msg`YouTube`, urlPrefix: "https://youtube.com/@" },
	{ value: "facebook", label: msg`Facebook`, urlPrefix: "https://facebook.com/" },
	{ value: "instagram", label: msg`Instagram`, urlPrefix: "https://instagram.com/" },
	{ value: "tiktok", label: msg`TikTok`, urlPrefix: "https://tiktok.com/@" },
	{ value: "telegram", label: msg`Telegram`, urlPrefix: "https://t.me/" },
	{ value: "wechat", label: msg`WeChat`, urlPrefix: "" },
	{ value: "custom", label: msg`Custom URL`, urlPrefix: "" },
] as const;

export interface ProfileLinksEditorProps {
	links: ProfileLink[];
	onChange: (links: ProfileLink[]) => void;
	errors?: Record<number, { platform?: string; value?: string }>;
}

function getPlatformPlaceholder(platform: string): string {
	switch (platform) {
		case "wechat":
			return "WeChat ID (handle only)";
		case "telegram":
			return "@username or https://t.me/...";
		case "bluesky":
			return "user.bsky.social or https://...";
		case "twitter":
			return "@handle or https://x.com/...";
		case "github":
			return "username or https://github.com/...";
		case "threads":
			return "@handle or https://threads.net/@...";
		case "instagram":
			return "@handle or https://instagram.com/...";
		case "tiktok":
			return "@handle or https://tiktok.com/@...";
		case "youtube":
			return "@channel or https://youtube.com/@...";
		case "linkedin":
			return "in/username or https://linkedin.com/in/...";
		case "mastodon":
			return "@user@instance or https://...";
		case "custom":
			return "https://..., matrix:..., or @handle";
		default:
			return "https://... or @handle";
	}
}

const HTTP_URL_PATTERN = /^https?:\/\//i;
const FORBIDDEN_SCHEME_RE = /^(javascript|data|vbscript|file):/i;

const PLATFORM_URL_DOMAINS: Record<string, string[]> = {
	github: ["github.com"],
	twitter: ["x.com", "twitter.com"],
	telegram: ["t.me", "telegram.me"],
	bluesky: ["bsky.app"],
	threads: ["threads.net"],
	instagram: ["instagram.com"],
	tiktok: ["tiktok.com"],
	youtube: ["youtube.com", "youtu.be"],
	linkedin: ["linkedin.com"],
	facebook: ["facebook.com", "fb.com"],
	reddit: ["reddit.com"],
};

function validatePlatformHandleOrUrl(platform: string, value: string): string | null {
	const trimmed = value.trim();
	if (!trimmed) return "Please enter a handle or URL";

	// 1. Custom links: allow any non-empty value, only blocking dangerous schemes
	if (platform === "custom") {
		if (FORBIDDEN_SCHEME_RE.test(trimmed)) {
			return "Dangerous URI scheme not permitted";
		}
		return null;
	}

	// 2. WeChat (handle-only): MUST NOT be a URL, no spaces, 3-32 chars
	if (platform === "wechat") {
		if (trimmed.includes("://") || HTTP_URL_PATTERN.test(trimmed)) {
			return "WeChat ID must be a handle only, not a URL";
		}
		if (/\s/.test(trimmed)) {
			return "WeChat ID cannot contain spaces";
		}
		if (!/^[a-zA-Z0-9_-]{3,32}$/.test(trimmed)) {
			return "WeChat ID must be 3-32 letters, numbers, hyphens, or underscores";
		}
		return null;
	}

	// 3. If a full URL is provided for any named platform:
	if (HTTP_URL_PATTERN.test(trimmed) || trimmed.includes("://")) {
		try {
			const parsed = new URL(trimmed);
			if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
				return "URL must use http or https scheme";
			}
			const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
			const allowedHosts = PLATFORM_URL_DOMAINS[platform];
			if (allowedHosts && !allowedHosts.some((h) => host === h || host.endsWith(`.${h}`))) {
				return `URL must be a ${allowedHosts[0]} URL for ${platform}`;
			}
			return null;
		} catch {
			return "Invalid URL format";
		}
	}

	// 4. Handle format validation (handles cannot contain spaces)
	if (/\s/.test(trimmed)) {
		return "Handle cannot contain spaces";
	}

	const cleanHandle = trimmed.replace(/^@/, "");

	if (platform === "github") {
		if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/.test(cleanHandle)) {
			return "GitHub handle must be 1-39 letters, numbers, or hyphens";
		}
	} else if (platform === "twitter") {
		if (!/^[a-zA-Z0-9_]{1,15}$/.test(cleanHandle)) {
			return "X/Twitter handle must be 1-15 letters, numbers, or underscores";
		}
	} else if (platform === "telegram") {
		if (!/^[a-zA-Z0-9_]{5,32}$/.test(cleanHandle)) {
			return "Telegram handle must be 5-32 letters, numbers, or underscores";
		}
	} else if (platform === "bluesky") {
		if (
			!/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(cleanHandle) &&
			!/^[a-zA-Z0-9_]{1,64}$/.test(cleanHandle)
		) {
			return "Bluesky handle must be e.g. user.bsky.social";
		}
	} else if (platform === "mastodon") {
		const match = cleanHandle.match(/^([^@\s]+)@([^@\s]+\.[a-zA-Z]{2,})$/);
		if (!match) {
			return "Mastodon handle must be @user@instance (e.g. @user@mastodon.social) or a full profile URL";
		}
	}

	return null;
}

function createEmptyDraft(): ProfileLink {
	return {
		id:
			typeof crypto !== "undefined" && crypto.randomUUID
				? crypto.randomUUID()
				: `link_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
		platform: "github",
		label: "",
		value: "",
		sameAs: true,
		relMe: false,
	};
}

export function ProfileLinksEditor({ links, onChange }: ProfileLinksEditorProps) {
	const { t } = useLingui();

	const [isModalOpen, setIsModalOpen] = React.useState(false);
	const [editingIndex, setEditingIndex] = React.useState<number | null>(null);
	const [modalDraft, setModalDraft] = React.useState<ProfileLink>(createEmptyDraft);
	const [modalError, setModalError] = React.useState<string | null>(null);

	const handleOpenAdd = () => {
		setEditingIndex(null);
		setModalDraft(createEmptyDraft());
		setModalError(null);
		setIsModalOpen(true);
	};

	const handleOpenEdit = (index: number) => {
		const target = links[index];
		if (!target) return;
		setEditingIndex(index);
		setModalDraft({ ...target, label: target.label ?? "" });
		setModalError(null);
		setIsModalOpen(true);
	};

	const handleDraftValueChange = (val: string) => {
		setModalError(null);
		let nextPlatform = modalDraft.platform;

		// Auto-detect platform when pasting URLs if custom or default
		if (val && (nextPlatform === "custom" || !nextPlatform)) {
			const lower = val.trim().toLowerCase();
			if (lower.includes("github.com")) nextPlatform = "github";
			else if (lower.includes("twitter.com") || lower.includes("x.com")) nextPlatform = "twitter";
			else if (lower.includes("bsky.app")) nextPlatform = "bluesky";
			else if (lower.includes("threads.net")) nextPlatform = "threads";
			else if (lower.includes("linkedin.com")) nextPlatform = "linkedin";
			else if (lower.includes("youtube.com")) nextPlatform = "youtube";
			else if (lower.includes("facebook.com")) nextPlatform = "facebook";
			else if (lower.includes("instagram.com")) nextPlatform = "instagram";
			else if (lower.includes("tiktok.com")) nextPlatform = "tiktok";
			else if (lower.includes("t.me")) nextPlatform = "telegram";
		}

		setModalDraft((prev) => ({
			...prev,
			platform: nextPlatform,
			value: val,
		}));
	};

	const handleDraftPlatformChange = (platform: string) => {
		setModalError(null);
		const isWeChat = platform === "wechat";
		setModalDraft((prev) => ({
			...prev,
			platform,
			label: prev.label,
			sameAs: isWeChat ? false : prev.sameAs !== false,
			relMe: isWeChat ? false : prev.relMe === true,
		}));
	};

	const handleSaveModal = () => {
		if (modalDraft.platform === "custom" && !modalDraft.label?.trim()) {
			setModalError(t`Label is required for custom links`);
			return;
		}

		const error = validatePlatformHandleOrUrl(modalDraft.platform, modalDraft.value);
		if (error) {
			setModalError(error);
			return;
		}

		const cleanValue = modalDraft.value.trim();
		const savedLink: ProfileLink = {
			...modalDraft,
			label: modalDraft.label?.trim() || undefined,
			value: cleanValue,
			sameAs: modalDraft.platform === "wechat" ? false : modalDraft.sameAs !== false,
			relMe: modalDraft.platform === "wechat" ? false : modalDraft.relMe === true,
		};

		if (editingIndex === null) {
			onChange([...links, savedLink]);
		} else {
			const updated = [...links];
			updated[editingIndex] = savedLink;
			onChange(updated);
		}

		setIsModalOpen(false);
	};

	const handleMove = (index: number, direction: "up" | "down") => {
		const targetIndex = direction === "up" ? index - 1 : index + 1;
		if (targetIndex < 0 || targetIndex >= links.length) return;
		const updated = [...links];
		const temp = updated[index]!;
		updated[index] = updated[targetIndex]!;
		updated[targetIndex] = temp;
		onChange(updated);
	};

	const handleDelete = (index: number) => {
		const updated = [...links];
		updated.splice(index, 1);
		onChange(updated);
	};

	const platformItems = Object.fromEntries(BUILTIN_PLATFORMS.map((p) => [p.value, t(p.label)]));

	return (
		<div>
			{links.length === 0 ? (
				<div className="rounded-lg border border-dashed border-kumo-line bg-kumo-base/50 p-8 text-center">
					<ShareNetwork className="mx-auto mb-3 h-10 w-10 text-kumo-subtle" />
					<h3 className="mb-1 text-base font-semibold text-kumo-default">{t`No profile links yet`}</h3>
					<p className="mx-auto mb-4 max-w-md text-sm text-kumo-subtle">
						{t`Add your social media profiles and links to verify your identity and connect with readers.`}
					</p>
					<Button
						type="button"
						variant="secondary"
						icon={<Plus className="h-4 w-4" />}
						onClick={handleOpenAdd}
					>
						{t`Add Profile Link`}
					</Button>
				</div>
			) : (
				<div className="space-y-2">
					{links.map((link, index) => {
						const platformObj = BUILTIN_PLATFORMS.find((p) => p.value === link.platform);
						const platformLabel =
							link.platform === "custom"
								? link.label?.trim() || t`Custom Link`
								: link.label?.trim()
									? `${link.label.trim()} (${platformObj ? t(platformObj.label) : link.platform})`
									: (platformObj ? t(platformObj.label) : link.platform || t`Custom`);
						return (
							<div
								key={link.id ?? index}
								className="flex items-center justify-between gap-3 rounded-lg border border-kumo-line bg-kumo-base p-3 sm:p-4"
							>
								<div className="min-w-0 flex-1">
									<div className="flex flex-wrap items-center gap-2">
										<span className="font-medium text-kumo-default">{platformLabel}</span>
										{link.relMe && (
											<span className="inline-flex items-center rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400">
												rel="me"
											</span>
										)}
										{link.sameAs !== false && link.platform !== "wechat" && (
											<span className="inline-flex items-center rounded-full bg-kumo-tint px-2 py-0.5 text-xs font-medium text-kumo-subtle">
												sameAs
											</span>
										)}
									</div>
									<div className="mt-0.5 truncate font-mono text-sm text-kumo-subtle">
										{link.value}
									</div>
								</div>
								<div className="flex shrink-0 items-center gap-1.5">
									<Button
										type="button"
										variant="ghost"
										size="sm"
										aria-label={t`Move up`}
										disabled={index === 0}
										onClick={() => handleMove(index, "up")}
									>
										<CaretUp className="h-4 w-4" />
									</Button>
									<Button
										type="button"
										variant="ghost"
										size="sm"
										aria-label={t`Move down`}
										disabled={index === links.length - 1}
										onClick={() => handleMove(index, "down")}
									>
										<CaretDown className="h-4 w-4" />
									</Button>
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() => handleOpenEdit(index)}
									>
										{t`Edit`}
									</Button>
									<Button
										type="button"
										variant="outline"
										size="sm"
										aria-label={t`Delete`}
										onClick={() => handleDelete(index)}
									>
										<Trash className="h-4 w-4" />
									</Button>
								</div>
							</div>
						);
					})}

					<div className="pt-2">
						<Button
							type="button"
							variant="secondary"
							icon={<Plus className="h-4 w-4" />}
							onClick={handleOpenAdd}
						>
							{t`Add Profile Link`}
						</Button>
					</div>
				</div>
			)}

			<LayerDialog.Root open={isModalOpen} onOpenChange={setIsModalOpen}>
				<LayerDialog.Content>
					<LayerDialog.Title>
						{editingIndex === null ? t`Add Profile Link` : t`Edit Profile Link`}
					</LayerDialog.Title>
					<LayerDialog.Description>
						{t`Configure the social platform, handle or URL, and verification options.`}
					</LayerDialog.Description>
					<LayerDialog.Body>
						<div
							className="grid gap-5 py-2"
							onKeyDown={(e) => {
								if (e.key === "Enter" && !e.shiftKey) {
									e.preventDefault();
									e.stopPropagation();
									handleSaveModal();
								}
							}}
						>
							<Select
								label={t`Platform`}
								items={platformItems}
								value={modalDraft.platform || "custom"}
								onValueChange={(val) => handleDraftPlatformChange(val as string)}
								className="w-full"
							/>
							{modalDraft.platform === "custom" && (
								<Input
									type="text"
									label={t`Link Label`}
									placeholder={t`e.g. Personal Website, Portfolio, Substack`}
									value={modalDraft.label ?? ""}
									onChange={(e) => {
										setModalError(null);
										setModalDraft((prev) => ({ ...prev, label: e.target.value }));
									}}
									error={
										modalError && modalError.includes("Label") ? modalError : undefined
									}
									aria-invalid={modalError && modalError.includes("Label") ? true : undefined}
								/>
							)}
							<Input
								dir="ltr"
								type="text"
								label={
									modalDraft.platform === "wechat"
										? t`WeChat ID`
										: modalDraft.platform === "custom"
											? t`URL, Handle, or ID`
											: t`Handle or URL`
								}
								placeholder={getPlatformPlaceholder(modalDraft.platform)}
								value={modalDraft.value}
								onChange={(e) => handleDraftValueChange(e.target.value)}
								error={
									modalError && !modalError.includes("Label") ? modalError : undefined
								}
								aria-invalid={
									modalError && !modalError.includes("Label") ? true : undefined
								}
							/>
							<div className="grid gap-4 border-t border-kumo-line pt-3">
								<div className="flex items-start gap-3">
									<Switch
										id="modal-same-as"
										checked={
											modalDraft.platform !== "wechat" && modalDraft.sameAs !== false
										}
										disabled={modalDraft.platform === "wechat"}
										onCheckedChange={(checked) =>
											setModalDraft((prev) => ({ ...prev, sameAs: checked }))
										}
									/>
									<div>
										<label
											htmlFor="modal-same-as"
											className={`text-sm font-medium ${
												modalDraft.platform === "wechat"
													? "cursor-not-allowed opacity-50"
													: "cursor-pointer"
											}`}
										>
											{t`Include in Schema.org (sameAs)`}
										</label>
										<p className="mt-0.5 text-xs text-kumo-subtle">
											{t`Adds this profile to search engine structured data so search engines associate it with your entity.`}
										</p>
									</div>
								</div>
								<div className="flex items-start gap-3">
									<Switch
										id="modal-rel-me"
										checked={modalDraft.platform !== "wechat" && modalDraft.relMe === true}
										disabled={modalDraft.platform === "wechat"}
										onCheckedChange={(checked) =>
											setModalDraft((prev) => ({ ...prev, relMe: checked }))
										}
									/>
									<div>
										<label
											htmlFor="modal-rel-me"
											className={`text-sm font-medium ${
												modalDraft.platform === "wechat"
													? "cursor-not-allowed opacity-50"
													: "cursor-pointer"
											}`}
										>
											{t`Verify identity with rel="me"`}
										</label>
										<p className="mt-0.5 text-xs text-kumo-subtle">
											{t`Adds rel="me" attribute for decentralized identity verification on Mastodon, GitHub, etc.`}
										</p>
									</div>
								</div>
							</div>
						</div>
					</LayerDialog.Body>
					<LayerDialog.Actions dismissLabel={t`Cancel`}>
						<LayerDialog.Action
							onClick={(e) => {
								e.preventDefault();
								e.stopPropagation();
								handleSaveModal();
							}}
						>
							{editingIndex === null ? t`Add` : t`Save`}
						</LayerDialog.Action>
					</LayerDialog.Actions>
				</LayerDialog.Content>
			</LayerDialog.Root>
		</div>
	);
}
