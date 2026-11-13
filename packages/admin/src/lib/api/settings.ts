/**
 * Site settings APIs
 */

import { i18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";

import { API_BASE, apiFetch, parseApiResponse } from "./client.js";

export interface SocialLink {
	id: string;
	platform?: string;
	label: string;
	url: string;
	relMe?: boolean;
}

export interface ProfileLink {
	id?: string;
	platform: string;
	value: string;
	label?: string;
	sameAs?: boolean;
	relMe?: boolean;
}

const HTTP_URL_PATTERN = /^https?:\/\//i;
const FORBIDDEN_SCHEME_RE = /^(javascript|data|vbscript|file):/i;

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

export function validateProfileLinkValue(
	platform: string,
	value: string,
	t: (msg: string) => string = (m) => m,
): string | null {
	const trimmed = value.trim();
	if (!trimmed) return t("Value cannot be empty");

	// 1. Custom links: allow any non-empty value, only blocking dangerous schemes
	if (platform === "custom") {
		if (FORBIDDEN_SCHEME_RE.test(trimmed)) {
			return t("Dangerous URI scheme not permitted");
		}
		return null;
	}

	// 2. WeChat (handle-only): MUST NOT be a URL, no spaces, 3-32 chars
	if (platform === "wechat") {
		if (trimmed.includes("://") || HTTP_URL_PATTERN.test(trimmed)) {
			return t("WeChat ID must be a handle only, not a URL");
		}
		if (/\s/.test(trimmed)) {
			return t("WeChat ID cannot contain spaces");
		}
		if (!/^[a-zA-Z0-9_-]{3,32}$/.test(trimmed)) {
			return t("WeChat ID must be 3-32 letters, numbers, hyphens, or underscores");
		}
		return null;
	}

	// 3. If a full URL is provided for any named platform:
	if (HTTP_URL_PATTERN.test(trimmed) || trimmed.includes("://")) {
		try {
			const parsed = new URL(trimmed);
			if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
				return t("URL must use http or https scheme");
			}
			const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
			const allowedHosts = PLATFORM_URL_DOMAINS[platform];
			if (allowedHosts && !allowedHosts.some((h) => host === h || host.endsWith(`.${h}`))) {
				return t(`URL must be a ${allowedHosts[0]} URL for ${platform}`);
			}
			return null;
		} catch {
			return t("Invalid URL format");
		}
	}

	// 4. Handle format validation (handles cannot contain spaces)
	if (/\s/.test(trimmed)) {
		return t("Handle cannot contain spaces");
	}

	const cleanHandle = trimmed.replace(/^@/, "");

	if (platform === "github") {
		if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/.test(cleanHandle)) {
			return t("GitHub handle must be 1-39 letters, numbers, or hyphens");
		}
	} else if (platform === "twitter") {
		if (!/^[a-zA-Z0-9_]{1,15}$/.test(cleanHandle)) {
			return t("X/Twitter handle must be 1-15 letters, numbers, or underscores");
		}
	} else if (platform === "telegram") {
		if (!/^[a-zA-Z0-9_]{5,32}$/.test(cleanHandle)) {
			return t("Telegram handle must be 5-32 letters, numbers, or underscores");
		}
	} else if (platform === "bluesky") {
		if (
			!/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(cleanHandle) &&
			!/^[a-zA-Z0-9_]{1,64}$/.test(cleanHandle)
		) {
			return t("Bluesky handle must be e.g. user.bsky.social");
		}
	} else if (platform === "mastodon") {
		const match = cleanHandle.match(/^([^@\s]+)@([^@\s]+\.[a-zA-Z]{2,})$/);
		if (!match) {
			return t(
				"Mastodon handle must be @user@instance (e.g. @user@mastodon.social) or a full profile URL",
			);
		}
	}

	return null;
}

export interface PostalAddress {
	streetAddress?: string;
	postalCode?: string;
	addressLocality?: string;
	addressRegion?: string;
	addressCountry?: string;
}

export interface OrganizationIdentifier {
	propertyID: string;
	value: string;
}

export interface OrganizationPolicies {
	publishingPrinciples?: string;
	correctionsPolicy?: string;
	ethicsPolicy?: string;
	diversityPolicy?: string;
	ownershipFundingInfo?: string;
	actionableFeedbackPolicy?: string;
}

export interface SiteIdentity {
	type: "Organization" | "Person";
	name?: string;
	alternateName?: string;
	url?: string;
	description?: string;
	email?: string;
	telephone?: string;
	logo?: {
		mediaId: string;
		url?: string;
		alt?: string;
		contentType?: string;
		width?: number;
		height?: number;
	};
	image?: { mediaId: string; url?: string; alt?: string };
	links?: ProfileLink[];
	address?: PostalAddress;
	areaServed?: string[];
	foundingDate?: string;
	identifiers?: OrganizationIdentifier[];
	policies?: OrganizationPolicies;
	parentOrganization?: {
		name: string;
		url?: string;
	};
	jobTitle?: string;
	bylineId?: string;
}

export interface SiteSettings {
	// Identity
	title: string;
	tagline?: string;
	logo?: { mediaId: string; alt?: string; url?: string };
	favicon?: { mediaId: string; url?: string };
	identity?: SiteIdentity;

	// URLs
	url?: string;

	// Display
	postsPerPage: number;
	dateFormat: string;
	timezone: string;

	// Social
	socialLinks?: SocialLink[];
	social?: {
		twitter?: string;
		github?: string;
		facebook?: string;
		instagram?: string;
		linkedin?: string;
		youtube?: string;
		[platform: string]: string | undefined;
	};

	// SEO
	seo?: {
		titleSeparator?: string;
		defaultOgImage?: { mediaId: string; alt?: string; url?: string };
		robotsTxt?: string;
		disallowAiTraining?: boolean;
		googleVerification?: string;
		bingVerification?: string;
	};
}
export interface SiteSettingsUpdate extends Omit<
	Partial<SiteSettings>,
	"logo" | "favicon" | "seo" | "socialLinks" | "identity"
> {
	logo?: SiteSettings["logo"] | null;
	favicon?: SiteSettings["favicon"] | null;
	identity?: SiteIdentity | null;
	socialLinks?: SocialLink[] | null;
	seo?: Omit<NonNullable<SiteSettings["seo"]>, "defaultOgImage"> & {
		defaultOgImage?: NonNullable<SiteSettings["seo"]>["defaultOgImage"] | null;
	};
	/** Hidden from search engines until the site goes live. */
	staging?: boolean;
}

/**
 * Fetch site settings
 */
export async function fetchSettings(): Promise<Partial<SiteSettings>> {
	const response = await apiFetch(`${API_BASE}/settings`);
	// The settings forms save their whole state. Staging is read from the
	// manifest and changed on its own, so leaving it out here keeps a form
	// save from writing back a stale value.
	const { staging: _staging, ...settings } = await parseApiResponse<
		Partial<SiteSettings> & { staging?: boolean }
	>(response, i18n._(msg`Failed to fetch settings`));
	return settings;
}

/**
 * Update site settings
 */
export async function updateSettings(settings: SiteSettingsUpdate): Promise<Partial<SiteSettings>> {
	const response = await apiFetch(`${API_BASE}/settings`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(settings),
	});
	return parseApiResponse<Partial<SiteSettings>>(response, i18n._(msg`Failed to update settings`));
}

export interface SiteDomain {
	/** Site URL set by the deployment configuration, if any */
	configuredUrl: string | null;
	/** Origin that sign-in handover links to, once a Site URL or `siteUrl` is set */
	siteOrigin: string | null;
}

/**
 * Fetch the configured site URL and the origin sign-in handover links to
 */
export async function fetchSiteDomain(): Promise<SiteDomain> {
	const response = await apiFetch(`${API_BASE}/settings/domain`);
	return parseApiResponse<SiteDomain>(response, i18n._(msg`Failed to fetch the site domain`));
}

/**
 * Create a single-use link that signs the current user in at the site's address
 */
export async function createSignInHandover(): Promise<{ url: string }> {
	const response = await apiFetch(`${API_BASE}/auth/handover`, { method: "POST" });
	return parseApiResponse<{ url: string }>(response, i18n._(msg`Failed to create a sign-in link`));
}

/**
 * Email every other active user a link to the sign-in page at the site's address
 */
export async function notifyUsersOfDomain(): Promise<{ sent: number; failed: number }> {
	const response = await apiFetch(`${API_BASE}/settings/domain/notify`, { method: "POST" });
	return parseApiResponse<{ sent: number; failed: number }>(
		response,
		i18n._(msg`Failed to email users`),
	);
}

/**
 * Check that a domain serves this site, then store it as the Site URL
 */
export async function changeSiteDomain(domain: string): Promise<{ url: string }> {
	const response = await apiFetch(`${API_BASE}/settings/domain`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ domain }),
	});
	return parseApiResponse<{ url: string }>(response, i18n._(msg`Failed to change the domain`));
}
