/**
 * JSON-LD structured data builders
 *
 * Moved from template SEO.astro components into core so all JSON-LD
 * is serialized via safeJsonLdSerialize() and never hand-rolled in templates.
 */

import { resolveProfileUrl } from "../identity/index.js";
import type { ProfileLink } from "../identity/types.js";
import type { PublicPageContext } from "../plugins/types.js";
import type { SocialLink } from "../settings/types.js";

/**
 * Remove null/undefined values from a JSON-LD object recursively.
 * JSON-LD validators prefer absent keys over null values.
 */
export function cleanJsonLd(obj: Record<string, unknown>): Record<string, unknown> {
	const cleaned: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(obj)) {
		if (value !== undefined && value !== null) {
			if (typeof value === "object" && !Array.isArray(value)) {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- non-null, non-array object is safely treated as Record<string, unknown> for JSON-LD traversal
				cleaned[key] = cleanJsonLd(value as Record<string, unknown>);
			} else {
				cleaned[key] = value;
			}
		}
	}
	return cleaned;
}

/**
 * Site origin to use for JSON-LD node identifiers.
 *
 * `page.siteUrl` wins over `page.url` so IDs stay stable when a theme
 * overrides the public origin. Falls back to the raw canonical or URL only
 * when neither parses as a URL.
 */
function siteOrigin(page: PublicPageContext): string {
	if (page.siteUrl) {
		try {
			return new URL(page.siteUrl).origin;
		} catch {
			return page.siteUrl;
		}
	}
	try {
		return new URL(page.url).origin;
	} catch {
		return page.canonical || page.url;
	}
}

function extractSameAsUrls(links: unknown): string[] | undefined {
	if (!Array.isArray(links)) return undefined;
	const urls = links
		.filter(
			(link): link is { platform?: string; value?: string; url?: string; sameAs?: boolean } =>
				Boolean(
					link &&
						typeof link === "object" &&
						link.sameAs !== false &&
						link.platform !== "wechat",
				),
		)
		.map((link) => {
			if (typeof link.value === "string") {
				return resolveProfileUrl(link.platform ?? "custom", link.value) || link.value;
			}
			return link.url;
		})
		.filter((url): url is string => typeof url === "string" && /^https:\/\//i.test(url.trim()))
		.map((url) => url.trim());
	return urls.length > 0 ? urls : undefined;
}

/**
 * Build a BlogPosting JSON-LD graph from page context.
 * Used for article-type content pages.
 *
 * @param page - Page context for the current request.
 * @param defaultOgImage - Optional site-wide fallback image URL, used when
 *   the page has no own OG image. Matches the fallback applied to `og:image`
 *   in `generateBaseSeoContributions`.
 * @param socialLinks - Optional site profile links used to populate publisher `sameAs`.
 */
export function buildBlogPostingJsonLd(
	page: PublicPageContext,
	defaultOgImage?: string | null,
	socialLinks?: Array<ProfileLink | SocialLink>,
): Record<string, unknown> | null {
	if (page.pageType !== "article" || !page.canonical) return null;

	const ogTitle = page.seo?.ogTitle ?? page.pageTitle ?? page.title;
	const description = page.seo?.ogDescription || page.description;
	const ogImage = page.seo?.ogImage || page.image || defaultOgImage || null;
	const publishedTime = page.articleMeta?.publishedTime;
	const modifiedTime = page.articleMeta?.modifiedTime;
	const author = page.articleMeta?.author;
	const siteName = page.siteName;

	const authors = author
		? author
				.split(",")
				.map((a) => a.trim())
				.filter(Boolean)
		: [];

	const rawBylines = Array.isArray(page.byline)
		? page.byline
		: page.byline && typeof page.byline === "object"
			? [page.byline]
			: Array.isArray(page.author)
				? page.author
				: page.author && typeof page.author === "object"
					? [page.author]
					: [];

	const bylineList: Array<{ name: string; profileLinks?: unknown[] }> = [];
	for (const item of rawBylines) {
		if (!item || typeof item !== "object") continue;
		const unwrapped =
			"byline" in item && item.byline && typeof item.byline === "object" ? item.byline : item;
		const name = (unwrapped as any).displayName ?? (unwrapped as any).name;
		if (typeof name === "string" && name.trim()) {
			bylineList.push({
				name: name.trim(),
				profileLinks: (unwrapped as any).profileLinks,
			});
		}
	}

	const toPerson = (name: string, profileLinks?: unknown[]) => {
		const sameAs = extractSameAsUrls(profileLinks);
		return {
			"@type": "Person",
			name,
			...(sameAs ? { sameAs } : {}),
		};
	};

	let authorNode: unknown;
	if (bylineList.length > 0) {
		const people = bylineList.map((b) => toPerson(b.name, b.profileLinks));
		authorNode = people.length === 1 ? people[0] : people;
	} else if (authors.length > 0) {
		const people = authors.map((name) => ({ "@type": "Person", name }));
		authorNode = people.length === 1 ? people[0] : people;
	}

	const sameAs = extractSameAsUrls(socialLinks);

	return cleanJsonLd({
		"@context": "https://schema.org",
		"@type": "BlogPosting",
		"@id": `${page.canonical}#article`,
		headline: ogTitle,
		description,
		image: ogImage || undefined,
		url: page.canonical,
		datePublished: publishedTime || undefined,
		dateModified: modifiedTime || publishedTime || undefined,
		author: authorNode,
		publisher: siteName
			? {
					"@type": "Organization",
					"@id": `${siteOrigin(page)}/#organization`,
					name: siteName,
					sameAs: sameAs && sameAs.length > 0 ? sameAs : undefined,
				}
			: undefined,
		mainEntityOfPage: {
			"@type": "WebPage",
			"@id": page.canonical,
		},
	});
}

/**
 * Build a WebSite JSON-LD graph from page context.
 * Used for non-article pages (homepage, listing pages, etc.).
 *
 * @param page - Page context for the current request.
 */
export function buildWebSiteJsonLd(
	page: PublicPageContext,
	_socialLinks?: Array<ProfileLink | SocialLink>,
): Record<string, unknown> | null {
	const siteName = page.siteName;
	if (!siteName) return null;

	const siteUrl = siteOrigin(page);

	return cleanJsonLd({
		"@context": "https://schema.org",
		"@type": "WebSite",
		"@id": `${siteUrl}/#website`,
		name: siteName,
		url: siteUrl,
	});
}
