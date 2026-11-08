import { Button, Input, Select, Switch } from "@cloudflare/kumo";
import { useLingui } from "@lingui/react/macro";
import { Plus, Trash } from "@phosphor-icons/react";
import * as React from "react";

import type { ProfileLink } from "../../lib/api/settings.js";

export const BUILTIN_PLATFORMS = [
	{ value: "github", label: "GitHub", urlPrefix: "https://github.com/" },
	{ value: "twitter", label: "X (Twitter)", urlPrefix: "https://x.com/" },
	{ value: "bluesky", label: "Bluesky", urlPrefix: "https://bsky.app/profile/" },
	{ value: "mastodon", label: "Mastodon", urlPrefix: "" },
	{ value: "threads", label: "Threads", urlPrefix: "https://threads.net/@" },
	{ value: "linkedin", label: "LinkedIn", urlPrefix: "https://linkedin.com/in/" },
	{ value: "youtube", label: "YouTube", urlPrefix: "https://youtube.com/@" },
	{ value: "facebook", label: "Facebook", urlPrefix: "https://facebook.com/" },
	{ value: "instagram", label: "Instagram", urlPrefix: "https://instagram.com/" },
	{ value: "tiktok", label: "TikTok", urlPrefix: "https://tiktok.com/@" },
	{ value: "telegram", label: "Telegram", urlPrefix: "https://t.me/" },
	{ value: "wechat", label: "WeChat (Handle only)", urlPrefix: "" },
	{ value: "custom", label: "Other / Custom URL", urlPrefix: "" },
] as const;

export interface ProfileLinksEditorProps {
	links: ProfileLink[];
	onChange: (links: ProfileLink[]) => void;
	errors?: Record<number, { platform?: string; value?: string }>;
}

export function ProfileLinksEditor({ links, onChange, errors = {} }: ProfileLinksEditorProps) {
	const { t } = useLingui();

	const handleAdd = () => {
		const newLink: ProfileLink = {
			id:
				typeof crypto !== "undefined" && crypto.randomUUID
					? crypto.randomUUID()
					: `link_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
			platform: "custom",
			value: "",
			sameAs: true,
			relMe: true,
		};
		onChange([...links, newLink]);
	};

	const handleUpdate = (index: number, patch: Partial<ProfileLink>) => {
		const updated = [...links];
		const current = updated[index];
		if (!current) return;

		const next = { ...current, ...patch };

		// Auto-detect platform when pasting full URLs if currently custom
		if (patch.value && (next.platform === "custom" || !next.platform)) {
			const val = patch.value.trim().toLowerCase();
			if (val.includes("github.com")) next.platform = "github";
			else if (val.includes("twitter.com") || val.includes("x.com")) next.platform = "twitter";
			else if (val.includes("bsky.app")) next.platform = "bluesky";
			else if (val.includes("threads.net")) next.platform = "threads";
			else if (val.includes("linkedin.com")) next.platform = "linkedin";
			else if (val.includes("youtube.com")) next.platform = "youtube";
			else if (val.includes("facebook.com")) next.platform = "facebook";
			else if (val.includes("instagram.com")) next.platform = "instagram";
			else if (val.includes("tiktok.com")) next.platform = "tiktok";
			else if (val.includes("t.me")) next.platform = "telegram";
		}

		// Handle-only platforms cannot emit sameAs or relMe URLs
		if (next.platform === "wechat") {
			next.sameAs = false;
			next.relMe = false;
		}

		updated[index] = next;
		onChange(updated);
	};

	const handleRemove = (index: number) => {
		const updated = [...links];
		updated.splice(index, 1);
		onChange(updated);
	};

	const platformItems = Object.fromEntries(
		BUILTIN_PLATFORMS.map((p) => [p.value, p.label]),
	);

	return (
		<div className="grid gap-4">
			{links.length === 0 ? (
				<div className="py-4 text-center text-sm text-kumo-subtle">
					{t`No profile links configured yet. Click "Add Profile Link" below.`}
				</div>
			) : (
				links.map((link, index) => {
					const isWeChat = link.platform === "wechat";
					const err = errors[index];

					return (
						<div
							key={link.id ?? `link-${index}`}
							className="rounded-lg border border-kumo-line bg-kumo-base p-4 grid gap-3"
						>
							<div className="flex flex-col gap-3 sm:flex-row sm:items-end">
								<div className="sm:w-1/3">
									<Select
										label={t`Platform`}
										value={link.platform || "custom"}
										onValueChange={(val) => handleUpdate(index, { platform: val as string })}
										items={platformItems}
										className="w-full"
									/>
								</div>
								<div className="flex-1">
									<Input
										dir="ltr"
										type={isWeChat ? "text" : "url"}
										label={isWeChat ? t`WeChat ID` : t`Handle or URL`}
										placeholder={
											isWeChat
												? t`WeChat ID (handle only)`
												: link.platform === "telegram"
													? "@username or https://t.me/..."
													: link.platform === "bluesky"
														? "handle.bsky.social or https://..."
														: "https://... or @handle"
										}
										value={link.value}
										error={err?.value}
										onChange={(e) => handleUpdate(index, { value: e.target.value })}
									/>
								</div>
								<div className="flex shrink-0 items-center pb-1">
									<Button
										type="button"
										variant="ghost"
										size="sm"
										icon={<Trash className="h-4 w-4" />}
										className="text-kumo-danger"
										onClick={() => handleRemove(index)}
										aria-label={t`Remove link`}
									/>
								</div>
							</div>

							{!isWeChat && (
								<div className="flex flex-wrap items-center gap-6 pt-1 text-sm text-kumo-subtle">
									<div className="flex items-center gap-2">
										<Switch
											id={`same-as-${link.id ?? index}`}
											checked={link.sameAs !== false}
											onCheckedChange={(checked) => handleUpdate(index, { sameAs: checked })}
										/>
										<label
											htmlFor={`same-as-${link.id ?? index}`}
											className="cursor-pointer select-none text-xs"
										>
											{t`Include in Schema.org (sameAs)`}
										</label>
									</div>
									<div className="flex items-center gap-2">
										<Switch
											id={`rel-me-${link.id ?? index}`}
											checked={link.relMe === true}
											onCheckedChange={(checked) => handleUpdate(index, { relMe: checked })}
										/>
										<label
											htmlFor={`rel-me-${link.id ?? index}`}
											className="cursor-pointer select-none text-xs"
										>
											{t`Verify identity (rel="me")`}
										</label>
									</div>
								</div>
							)}
						</div>
					);
				})
			)}

			<div>
				<Button
					type="button"
					variant="secondary"
					size="sm"
					icon={<Plus className="h-4 w-4" />}
					onClick={handleAdd}
				>
					{t`Add Profile Link`}
				</Button>
			</div>
		</div>
	);
}
