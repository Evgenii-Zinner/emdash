/**
 * generateSiteSeoContributions() Tests
 *
 * Bug context: SiteSettings.seo.googleVerification and bingVerification are
 * stored in the database and editable in the admin UI, but were never emitted
 * as <meta> tags into <head>. This left Google Search Console and Bing
 * Webmaster Tools verification impossible via meta-tag method.
 *
 * Fix: A new pure function generates the verification meta contributions from
 * site SEO settings, and EmDashHead.astro loads settings and includes them.
 */

import { describe, it, expect } from "vitest";

import type { ContentSeo } from "../../../src/database/repositories/types.js";
import { buildBlogPostingJsonLd } from "../../../src/page/jsonld.js";
import {
	applySeoPanelToPageContext,
	generateAuthorSocialContributions,
	generateBaseSeoContributions,
	generateSiteSeoContributions,
	generateSiteSocialContributions,
} from "../../../src/page/seo-contributions.js";
import { peekSeoPanel, primeSeoPanel } from "../../../src/page/seo-panel.js";
import type { PublicPageContext } from "../../../src/plugins/types.js";
import { runWithContext } from "../../../src/request-context.js";

describe("generateSiteSeoContributions", () => {
	it("returns empty array when no settings provided", () => {
		const result = generateSiteSeoContributions(undefined);
		expect(result).toEqual([]);
	});

	it("returns empty array when seo settings are empty", () => {
		const result = generateSiteSeoContributions({});
		expect(result).toEqual([]);
	});

	it("emits google-site-verification meta when googleVerification is set", () => {
		const result = generateSiteSeoContributions({
			googleVerification: "abc123",
		});

		expect(result).toContainEqual({
			kind: "meta",
			name: "google-site-verification",
			content: "abc123",
		});
	});

	it("emits msvalidate.01 meta when bingVerification is set", () => {
		const result = generateSiteSeoContributions({
			bingVerification: "xyz789",
		});

		expect(result).toContainEqual({
			kind: "meta",
			name: "msvalidate.01",
			content: "xyz789",
		});
	});

	it("emits both verification tags when both are set", () => {
		const result = generateSiteSeoContributions({
			googleVerification: "g-token",
			bingVerification: "b-token",
		});

		expect(result).toHaveLength(2);
		expect(result).toContainEqual({
			kind: "meta",
			name: "google-site-verification",
			content: "g-token",
		});
		expect(result).toContainEqual({
			kind: "meta",
			name: "msvalidate.01",
			content: "b-token",
		});
	});

	it("ignores empty string values", () => {
		const result = generateSiteSeoContributions({
			googleVerification: "",
			bingVerification: "",
		});

		expect(result).toEqual([]);
	});

	it("ignores unrelated seo settings without crashing", () => {
		const result = generateSiteSeoContributions({
			titleSeparator: " | ",
			robotsTxt: "User-agent: *\nAllow: /",
		});

		expect(result).toEqual([]);
	});
});

describe("generateSiteSocialContributions", () => {
	it("returns empty array when neither identity nor socialLinks provided", () => {
		expect(generateSiteSocialContributions(undefined)).toEqual([]);
		expect(generateSiteSocialContributions(null)).toEqual([]);
	});

	it('emits rel="me" links from site:identity.links for verified links', () => {
		const identity = {
			type: "Organization" as const,
			name: "Test Org",
			links: [
				{
					id: "gh",
					platform: "github",
					value: "emdash-cms",
					relMe: true,
					sameAs: true,
				},
				{
					id: "masto",
					platform: "mastodon",
					value: "https://mastodon.social/@emdash",
					relMe: true,
					sameAs: true,
				},
				{
					id: "tw",
					platform: "twitter",
					value: "@emdash",
					relMe: false,
					sameAs: true,
				},
				{
					id: "insecure",
					platform: "custom",
					value: "http://example.com/insecure",
					relMe: true,
					sameAs: true,
				},
			],
		};

		const result = generateSiteSocialContributions(identity);

		expect(result).toEqual([
			{ kind: "link", rel: "me", href: "https://github.com/emdash-cms" },
			{ kind: "link", rel: "me", href: "https://mastodon.social/@emdash" },
		]);
	});

	it("falls back to settings.socialLinks when site:identity is not set", () => {
		const socialLinks = [
			{
				id: "gh",
				platform: "github",
				label: "GitHub",
				url: "https://github.com/emdash-cms",
				relMe: true,
			},
			{
				id: "unverified",
				label: "Other",
				url: "https://example.com/other",
				relMe: false,
			},
		];

		const result = generateSiteSocialContributions(undefined, socialLinks);

		expect(result).toEqual([{ kind: "link", rel: "me", href: "https://github.com/emdash-cms" }]);
	});

	it("does not fall back to socialLinks when site:identity is explicitly set with empty links", () => {
		const identity = {
			type: "Organization" as const,
			links: [],
		};
		const fallbackSocial = [
			{
				id: "gh",
				url: "https://github.com/emdash-cms",
				relMe: true,
			},
		];

		const result = generateSiteSocialContributions(identity, fallbackSocial);
		expect(result).toEqual([]);
	});
});

describe("generateAuthorSocialContributions", () => {
	it("returns empty array when author/byline is missing or has no profileLinks", () => {
		expect(generateAuthorSocialContributions(undefined)).toEqual([]);
		expect(generateAuthorSocialContributions(null)).toEqual([]);
		expect(generateAuthorSocialContributions({})).toEqual([]);
		expect(generateAuthorSocialContributions({ author: null })).toEqual([]);
	});

	it('emits rel="me" links for verified author byline links', () => {
		const author = {
			displayName: "Jane Doe",
			profileLinks: [
				{
					id: "gh",
					platform: "github",
					value: "janedoe",
					relMe: true,
					sameAs: true,
				},
				{
					id: "unverified",
					platform: "twitter",
					value: "janedoe",
					relMe: false,
					sameAs: true,
				},
				{
					id: "http-only",
					platform: "custom",
					value: "http://janedoe.com",
					relMe: true,
					sameAs: true,
				},
			],
		};

		const result = generateAuthorSocialContributions({ author });

		expect(result).toEqual([{ kind: "link", rel: "me", href: "https://github.com/janedoe" }]);
	});

	it("supports byline directly or nested in author", () => {
		const byline = {
			displayName: "John Smith",
			profileLinks: [
				{
					id: "bsky",
					platform: "bluesky",
					value: "johnsmith.bsky.social",
					relMe: true,
					sameAs: true,
				},
			],
		};

		expect(generateAuthorSocialContributions({ byline })).toEqual([
			{ kind: "link", rel: "me", href: "https://bsky.app/profile/johnsmith.bsky.social" },
		]);
		expect(generateAuthorSocialContributions(byline)).toEqual([
			{ kind: "link", rel: "me", href: "https://bsky.app/profile/johnsmith.bsky.social" },
		]);
	});
});

/**
 * applySeoPanelToPageContext() overlays admin SEO panel values onto the
 * page context before base contributions and JSON-LD are generated, so
 * editor-set values apply by default and structured data stays consistent
 * with the head tags.
 */
describe("applySeoPanelToPageContext", () => {
	const emptySeo: ContentSeo = {
		title: null,
		description: null,
		image: null,
		canonical: null,
		noIndex: false,
	};

	function createPage(overrides: Partial<PublicPageContext> = {}): PublicPageContext {
		return {
			url: "https://example.com/posts/hello",
			path: "/posts/hello",
			locale: null,
			kind: "content",
			pageType: "article",
			title: "Template Title | My Site",
			pageTitle: "Template Title",
			description: "Template description",
			canonical: "https://example.com/posts/hello",
			image: "https://example.com/template-og.png",
			siteName: "My Site",
			...overrides,
		};
	}

	it("leaves the page context unchanged when no panel field is set", () => {
		const page = createPage();
		const result = applySeoPanelToPageContext(page, emptySeo);

		expect(generateBaseSeoContributions(result)).toEqual(generateBaseSeoContributions(page));
	});

	it("panel title reaches og:title and twitter:title via seo.ogTitle", () => {
		const result = applySeoPanelToPageContext(createPage(), { ...emptySeo, title: "Panel Title" });

		const contributions = generateBaseSeoContributions(result);
		expect(contributions).toContainEqual({
			kind: "property",
			property: "og:title",
			content: "Panel Title",
		});
		expect(contributions).toContainEqual({
			kind: "meta",
			name: "twitter:title",
			content: "Panel Title",
		});
	});

	it("panel description overrides the template description everywhere", () => {
		const result = applySeoPanelToPageContext(createPage(), {
			...emptySeo,
			description: "Panel desc",
		});

		const contributions = generateBaseSeoContributions(result);
		expect(contributions).toContainEqual({
			kind: "meta",
			name: "description",
			content: "Panel desc",
		});
		expect(contributions).toContainEqual({
			kind: "property",
			property: "og:description",
			content: "Panel desc",
		});
		expect(contributions).toContainEqual({
			kind: "meta",
			name: "twitter:description",
			content: "Panel desc",
		});
	});

	it("passes a protocol-relative image reference through unchanged", () => {
		const result = applySeoPanelToPageContext(
			createPage(),
			{ ...emptySeo, image: "//cdn.example.com/x.png" },
			{ siteUrl: "https://example.com" },
		);

		const contributions = generateBaseSeoContributions(result);
		expect(contributions).toContainEqual({
			kind: "property",
			property: "og:image",
			content: "//cdn.example.com/x.png",
		});
	});

	it("resolves a bare media id image against siteUrl and wins the og/twitter image", () => {
		const result = applySeoPanelToPageContext(
			createPage(),
			{ ...emptySeo, image: "01KSMEDIA" },
			{ siteUrl: "https://example.com/" },
		);

		const expected = "https://example.com/_emdash/api/media/file/01KSMEDIA";
		const contributions = generateBaseSeoContributions(result);
		expect(contributions).toContainEqual({
			kind: "property",
			property: "og:image",
			content: expected,
		});
		expect(contributions).toContainEqual({
			kind: "meta",
			name: "twitter:image",
			content: expected,
		});
		expect(contributions).toContainEqual({
			kind: "meta",
			name: "twitter:card",
			content: "summary_large_image",
		});
	});

	it("absolutizes a relative panel canonical for the link tag and og:url", () => {
		const result = applySeoPanelToPageContext(
			createPage(),
			{ ...emptySeo, canonical: "/posts/other-post" },
			{ siteUrl: "https://example.com" },
		);

		const expected = "https://example.com/posts/other-post";
		const contributions = generateBaseSeoContributions(result);
		expect(contributions).toContainEqual({ kind: "link", rel: "canonical", href: expected });
		expect(contributions).toContainEqual({
			kind: "property",
			property: "og:url",
			content: expected,
		});
	});

	it("passes an absolute panel canonical through unchanged", () => {
		const result = applySeoPanelToPageContext(
			createPage(),
			{ ...emptySeo, canonical: "https://other.example/page" },
			{ siteUrl: "https://example.com" },
		);

		expect(result.canonical).toBe("https://other.example/page");
	});

	it("panel noindex emits robots but a template robots value survives without it", () => {
		const withNoindex = applySeoPanelToPageContext(createPage(), { ...emptySeo, noIndex: true });
		expect(generateBaseSeoContributions(withNoindex)).toContainEqual({
			kind: "meta",
			name: "robots",
			content: "noindex, nofollow",
		});

		const templateRobots = applySeoPanelToPageContext(
			createPage({ seo: { robots: "noindex" } }),
			emptySeo,
		);
		expect(templateRobots.seo?.robots).toBe("noindex");
	});

	it("keeps JSON-LD consistent with the head tags (panel image and canonical)", () => {
		const result = applySeoPanelToPageContext(
			createPage({ articleMeta: { publishedTime: "2026-04-03T12:00:00.000Z" } }),
			{ ...emptySeo, title: "Panel Title", image: "01KSMEDIA", canonical: "/posts/other-post" },
			{ siteUrl: "https://example.com" },
		);

		const graph = buildBlogPostingJsonLd(result);
		expect(graph).toMatchObject({
			headline: "Panel Title",
			image: "https://example.com/_emdash/api/media/file/01KSMEDIA",
			url: "https://example.com/posts/other-post",
			mainEntityOfPage: { "@id": "https://example.com/posts/other-post" },
		});
	});
});

/**
 * primeSeoPanel / peekSeoPanel — the request-scoped handoff between the
 * loader (which has the folded _emdash_seo data in hand) and <EmDashHead>
 * (which overlays it without a database query of its own).
 */
describe("SEO panel request cache", () => {
	const panelSeo: ContentSeo = {
		title: "Panel Title",
		description: null,
		image: null,
		canonical: null,
		noIndex: false,
	};

	function testContext() {
		return { editMode: false };
	}

	it("returns primed panel data within the same request context", async () => {
		await runWithContext(testContext(), async () => {
			primeSeoPanel("posts", "01AAA", panelSeo);
			expect(await peekSeoPanel("posts", "01AAA")).toEqual(panelSeo);
		});
	});

	it("returns null when nothing was primed for the entry", async () => {
		await runWithContext(testContext(), async () => {
			primeSeoPanel("posts", "01AAA", panelSeo);
			expect(await peekSeoPanel("posts", "01OTHER")).toBeNull();
			expect(await peekSeoPanel("pages", "01AAA")).toBeNull();
		});
	});

	it("does not leak primed data across request contexts", async () => {
		await runWithContext(testContext(), async () => {
			primeSeoPanel("posts", "01AAA", panelSeo);
		});
		await runWithContext(testContext(), async () => {
			expect(await peekSeoPanel("posts", "01AAA")).toBeNull();
		});
	});

	it("returns null outside a request context instead of throwing", async () => {
		primeSeoPanel("posts", "01NOCTX", panelSeo);
		expect(await peekSeoPanel("posts", "01NOCTX")).toBeNull();
	});
});
