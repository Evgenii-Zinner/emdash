import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { afterEach, describe, expect, it, vi } from "vitest";

import EmDashHead from "../../src/components/EmDashHead.astro";
import type { PageMetadataContribution, PublicPageContext } from "../../src/plugins/types.js";
import { getSiteSettings } from "../../src/settings/index.js";
import type { SiteSettings } from "../../src/settings/types.js";

vi.mock("../../src/settings/index.js", () => ({ getSiteSettings: vi.fn() }));

const page: PublicPageContext = {
	url: "https://example.com/",
	path: "/",
	locale: "en",
	kind: "custom",
	pageType: "website",
	title: "A Blog",
	description: "A test blog",
	canonical: "https://example.com/",
	image: null,
	siteName: "A Blog",
	siteUrl: "https://example.com",
};

function runtimeWithPluginMetadata(contributions: PageMetadataContribution[]) {
	return {
		collectPageMetadata: async () => contributions,
		collectPageFragments: async () => [],
	};
}

async function render(settings: Partial<SiteSettings>, emdash?: unknown) {
	vi.mocked(getSiteSettings).mockResolvedValue(settings);
	const container = await AstroContainer.create();
	return container.renderToString(EmDashHead, {
		props: { page },
		locals: emdash ? { emdash } : {},
	});
}

describe("EmDashHead", () => {
	afterEach(() => {
		vi.mocked(getSiteSettings).mockReset();
	});

	it("renders JSON-LD as a structured data script", async () => {
		const html = await render({});

		expect(html).toContain('<script type="application/ld+json">');
		expect(html).toContain('"@type":"WebSite"');
		expect(html).toContain('"url":"https://example.com"');
	});

	it("renders a single noindex robots tag over plugin robots metadata while staging", async () => {
		const html = await render(
			{ staging: true },
			runtimeWithPluginMetadata([{ kind: "meta", name: "robots", content: "index, follow" }]),
		);

		expect(html.match(/<meta name="robots"/g)).toHaveLength(1);
		expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
	});

	it("keeps plugin robots metadata once the site is live", async () => {
		const html = await render(
			{ staging: false },
			runtimeWithPluginMetadata([{ kind: "meta", name: "robots", content: "index, follow" }]),
		);

		expect(html).toContain('<meta name="robots" content="index, follow">');
		expect(html).not.toContain("noindex");
	});

	it("renders rel=\"me\" links for verified social profiles and populates sameAs in JSON-LD", async () => {
		const html = await render(
			{
				socialLinks: [
					{
						id: "mastodon",
						platform: "mastodon",
						label: "Mastodon",
						url: "https://mastodon.social/@alice",
						relMe: true,
					},
					{
						id: "github",
						platform: "github",
						label: "GitHub",
						url: "https://github.com/alice",
						relMe: true,
					},
					{
						id: "internal",
						label: "Internal",
						url: "https://example.com/alice",
						relMe: false,
					},
				],
			},
			runtimeWithPluginMetadata([]),
		);

		expect(html).toContain('<link rel="me" href="https://mastodon.social/@alice">');
		expect(html).toContain('<link rel="me" href="https://github.com/alice">');
		expect(html).not.toContain('<link rel="me" href="https://example.com/alice">');
		expect(html).toContain(
			'"sameAs":["https://mastodon.social/@alice","https://github.com/alice"]',
		);
		expect(html).not.toContain('"https://example.com/alice"');
	});

	it("never emits rel=\"me\" or sameAs for non-http values or unverified links", async () => {
		const html = await render(
			{
				socialLinks: [
					{
						id: "bad-url",
						label: "Bad Handle",
						url: "@alice",
						relMe: true,
					},
					{
						id: "unverified",
						label: "Unverified Profile",
						url: "https://example.com/unverified",
						relMe: false,
					},
				],
			},
			runtimeWithPluginMetadata([]),
		);

		expect(html).not.toContain('rel="me"');
		expect(html).not.toContain('"sameAs"');
	});
});
