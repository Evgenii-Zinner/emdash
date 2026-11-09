import { z } from "zod";

const HTTP_SCHEME_RE = /^https?:\/\//i;
const FORBIDDEN_SCHEME_RE = /^(javascript|data|vbscript|file):/i;

/**
 * Validates link value: trimmed, non-empty, max 2048 chars,
 * rejecting dangerous browser execution schemes (javascript:, data:, vbscript:, file:).
 */
export const profileLinkValue = z
	.string()
	.transform((v) => v.trim())
	.pipe(
		z
			.string()
			.min(1, "Value cannot be empty")
			.max(2048, "Value exceeds maximum 2048 characters")
			.refine((val) => !FORBIDDEN_SCHEME_RE.test(val), "Dangerous URI scheme not permitted"),
	);

const HTTP_URL_PATTERN = /^https?:\/\//i;

export const PLATFORM_URL_DOMAINS: Record<string, string[]> = {
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

export function validateProfileLinkValue(platform: string, value: string): string | null {
	const trimmed = value.trim();
	if (!trimmed) return "Value cannot be empty";

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

export const profileLinkInputSchema = z
	.object({
		id: z.string().max(64).optional(),
		platform: z
			.string()
			.min(1)
			.max(32)
			.regex(/^[a-z0-9_-]+$/, "Platform must be alphanumeric with hyphens or underscores"),
		label: z.string().max(100).optional(),
		value: profileLinkValue,
		sameAs: z.boolean().optional().default(false),
		relMe: z.boolean().optional().default(false),
	})
	.superRefine((link, ctx) => {
		if (link.platform === "custom" && (!link.label || !link.label.trim())) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Label is required for custom links",
				path: ["label"],
			});
		}
		const err = validateProfileLinkValue(link.platform, link.value);
		if (err) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: err,
				path: ["value"],
			});
		}
	});

export const profileLinkSchema = profileLinkInputSchema;

export const profileLinkResponseSchema = z.object({
	id: z.string(),
	platform: z.string(),
	label: z.string().optional(),
	value: z.string(),
	sameAs: z.boolean(),
	relMe: z.boolean(),
});

export const postalAddressSchema = z.object({
	streetAddress: z.string().max(200).optional(),
	postalCode: z.string().max(32).optional(),
	addressLocality: z.string().max(100).optional(),
	addressRegion: z.string().max(100).optional(),
	addressCountry: z.string().max(2).optional(), // ISO 3166-1 alpha-2
});

export const organizationIdentifierSchema = z.object({
	propertyID: z.string().min(1).max(100),
	value: z.string().min(1).max(200),
});

export const organizationPoliciesSchema = z.object({
	publishingPrinciples: z.string().url().max(2048).optional(),
	correctionsPolicy: z.string().url().max(2048).optional(),
	ethicsPolicy: z.string().url().max(2048).optional(),
	diversityPolicy: z.string().url().max(2048).optional(),
	ownershipFundingInfo: z.string().url().max(2048).optional(),
	actionableFeedbackPolicy: z.string().url().max(2048).optional(),
});

export const mediaReferenceInputSchema = z.object({
	mediaId: z.string(),
	alt: z.string().optional(),
});

export const mediaReferenceResponseSchema = z.object({
	mediaId: z.string(),
	alt: z.string().optional(),
	url: z.string().optional(),
	contentType: z.string().optional(),
	width: z.number().int().optional(),
	height: z.number().int().optional(),
});

export const siteIdentityInputSchema = z.object({
	type: z.enum(["Organization", "Person"]).default("Organization"),
	name: z.string().max(200).optional(),
	alternateName: z.string().max(200).optional(),
	description: z.string().max(1000).optional(),
	logo: mediaReferenceInputSchema.nullable().optional(),
	url: z.string().url().max(2048).optional(),
	email: z.string().email().max(254).optional(),
	telephone: z.string().max(50).optional(),
	address: postalAddressSchema.optional(),
	areaServed: z.array(z.string().max(100)).max(50).optional(),
	foundingDate: z.string().max(30).optional(),
	identifiers: z.array(organizationIdentifierSchema).max(30).optional(),
	policies: organizationPoliciesSchema.optional(),
	jobTitle: z.string().max(100).optional(),
	bylineId: z.string().max(64).optional(),
	links: z.array(profileLinkInputSchema).max(50).optional().default([]),
});

export const siteIdentityResponseSchema = z.object({
	type: z.enum(["Organization", "Person"]),
	name: z.string().optional(),
	alternateName: z.string().optional(),
	description: z.string().optional(),
	logo: mediaReferenceResponseSchema.optional(),
	url: z.string().optional(),
	email: z.string().optional(),
	telephone: z.string().optional(),
	address: postalAddressSchema.optional(),
	areaServed: z.array(z.string()).optional(),
	foundingDate: z.string().optional(),
	identifiers: z.array(organizationIdentifierSchema).optional(),
	policies: organizationPoliciesSchema.optional(),
	jobTitle: z.string().optional(),
	bylineId: z.string().optional(),
	links: z.array(profileLinkResponseSchema),
});
