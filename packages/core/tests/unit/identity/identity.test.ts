import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
	getPlatform,
	getAllPlatforms,
	resolveProfileUrl,
	extractLegacyHandle,
	normalizeProfileLinks,
	legacySocialToProfileLinks,
	profileLinksToLegacySocial,
	mergeLegacySocialPatchIntoIdentityLinks,
	type ProfileLink,
	type SiteIdentity,
} from "../../../src/identity/index.js";
import {
	getSiteIdentityWithDb,
	setSiteSettings,
	getSiteSettingsWithDb,
} from "../../../src/settings/index.js";
import { setupTestDatabase, teardownTestDatabase } from "../../utils/test-db.js";
import type { Database } from "../../../src/database/types.js";
import type { Kysely } from "kysely";

describe("Platform Registry & Identity", () => {
	describe("Platform Registry", () => {
		it("resolves handles to canonical absolute URLs for legacy platforms", () => {
			expect(resolveProfileUrl("twitter", "@alice")).toBe("https://x.com/alice");
			expect(resolveProfileUrl("twitter", "alice")).toBe("https://x.com/alice");
			expect(resolveProfileUrl("github", "alice")).toBe("https://github.com/alice");
			expect(resolveProfileUrl("facebook", "alice")).toBe("https://facebook.com/alice");
			expect(resolveProfileUrl("instagram", "@alice")).toBe("https://instagram.com/alice");
			expect(resolveProfileUrl("linkedin", "in/alice")).toBe("https://linkedin.com/in/alice");
			expect(resolveProfileUrl("linkedin", "company/acme")).toBe("https://linkedin.com/company/acme");
			expect(resolveProfileUrl("youtube", "@alice")).toBe("https://youtube.com/@alice");
			expect(resolveProfileUrl("youtube", "UC1234567890123456789012")).toBe("https://youtube.com/channel/UC1234567890123456789012");
		});

		it("resolves modern social platforms", () => {
			expect(resolveProfileUrl("bluesky", "alice.bsky.social")).toBe("https://bsky.app/profile/alice.bsky.social");
			expect(resolveProfileUrl("threads", "@alice")).toBe("https://threads.net/@alice");
			expect(resolveProfileUrl("telegram", "@alice")).toBe("https://t.me/alice");
			expect(resolveProfileUrl("whatsapp", "+1 (555) 123-4567")).toBe("https://wa.me/15551234567");
			expect(resolveProfileUrl("reddit", "u/alice")).toBe("https://reddit.com/user/alice");
			expect(resolveProfileUrl("mastodon", "@alice@mastodon.social")).toBe("https://mastodon.social/@alice");
		});

		it("treats wechat as handle-only without public profile URL", () => {
			const wechat = getPlatform("wechat");
			expect(wechat?.handleOnly).toBe(true);
			expect(resolveProfileUrl("wechat", "my_wechat_id")).toBeNull();
		});

		it("extracts concise handles for legacy platforms", () => {
			expect(extractLegacyHandle("twitter", "https://x.com/alice")).toBe("@alice");
			expect(extractLegacyHandle("twitter", "https://twitter.com/alice")).toBe("@alice");
			expect(extractLegacyHandle("github", "https://github.com/alice")).toBe("alice");
			expect(extractLegacyHandle("facebook", "https://facebook.com/alice")).toBe("alice");
			expect(extractLegacyHandle("instagram", "https://instagram.com/alice")).toBe("alice");
			expect(extractLegacyHandle("linkedin", "https://linkedin.com/in/alice")).toBe("in/alice");
			expect(extractLegacyHandle("youtube", "https://youtube.com/@alice")).toBe("alice");
		});

		it("rejects dangerous URI schemes in resolveProfileUrl", () => {
			expect(resolveProfileUrl("custom", "javascript:alert(1)")).toBeNull();
			expect(resolveProfileUrl("custom", "data:text/html,test")).toBeNull();
			expect(resolveProfileUrl("custom", "vbscript:msgbox(1)")).toBeNull();
		});
	});

	describe("normalizeProfileLinks", () => {
		it("normalizes links and enforces unique IDs and bounds", () => {
			const raw = [
				{ platform: "twitter", value: "alice", sameAs: true, relMe: true },
				{ platform: "twitter", value: "bob", sameAs: true, relMe: false },
				{ platform: "custom", value: "https://example.com", label: "My Blog", sameAs: false, relMe: true },
				{ platform: "custom", value: "javascript:evil()", label: "Bad" },
			];
			const normalized = normalizeProfileLinks(raw);
			expect(normalized.length).toBe(3);
			expect(normalized[0]?.id).toBe("link-twitter");
			expect(normalized[0]?.sameAs).toBe(true);
			expect(normalized[0]?.relMe).toBe(true);
			expect(normalized[1]?.id).toBe("link-twitter-1");
			expect(normalized[2]?.label).toBe("My Blog");
		});
	});

	describe("SiteIdentity storage and sync with DB", () => {
		let db: Kysely<Database>;

		beforeEach(async () => {
			db = await setupTestDatabase();
		});

		afterEach(async () => {
			await teardownTestDatabase(db);
		});

		it("stores and retrieves canonical SiteIdentity", async () => {
			const identity: SiteIdentity = {
				type: "Organization",
				name: "Acme Corp",
				description: "Innovations in tech",
				url: "https://example.com",
				address: {
					streetAddress: "123 Main St",
					postalCode: "10001",
					addressLocality: "New York",
					addressCountry: "US",
				},
				identifiers: [
					{ propertyID: "VAT", value: "US123456789" },
				],
				links: [
					{ id: "l1", platform: "github", value: "https://github.com/acme", sameAs: true, relMe: false },
					{ id: "l2", platform: "twitter", value: "@acme", sameAs: true, relMe: true },
				],
			};

			await setSiteSettings({ identity }, db);
			const stored = await getSiteIdentityWithDb(db);
			expect(stored.type).toBe("Organization");
			expect(stored.name).toBe("Acme Corp");
			expect(stored.identifiers).toEqual([{ propertyID: "VAT", value: "US123456789" }]);
			expect(stored.links.length).toBe(2);
			expect(stored.links[0]?.platform).toBe("github");

			// Check that legacy site:social was automatically synchronized
			const allSettings = await getSiteSettingsWithDb(db);
			expect(allSettings.social?.github).toBe("acme");
			expect(allSettings.social?.twitter).toBe("@acme");
		});

		it("synthesizes SiteIdentity when only legacy site:social exists", async () => {
			await setSiteSettings({
				title: "Legacy Site",
				social: {
					github: "legacyuser",
					twitter: "@legacyuser",
				},
			}, db);

			const identity = await getSiteIdentityWithDb(db);
			expect(identity.type).toBe("Organization");
			expect(identity.name).toBe("Legacy Site");
			expect(identity.links.length).toBe(2);
			expect(identity.links[0]?.sameAs).toBe(true);
			expect(identity.links[0]?.relMe).toBe(false);
		});

		it("non-destructively merges legacy social patches into identity.links", async () => {
			const initialIdentity: SiteIdentity = {
				type: "Person",
				name: "Jane Doe",
				links: [
					{ id: "custom-1", platform: "custom", label: "Portfolio", value: "https://janedoe.com", sameAs: true, relMe: true },
					{ id: "gh-1", platform: "github", value: "janedoe", sameAs: true, relMe: false },
				],
			};

			await setSiteSettings({ identity: initialIdentity }, db);

			// Legacy client or script updates only `social.twitter`
			await setSiteSettings({ social: { twitter: "@janedoe" } }, db);

			const updated = await getSiteIdentityWithDb(db);
			expect(updated.links.length).toBe(3);
			expect(updated.links.find((l) => l.platform === "custom")?.value).toBe("https://janedoe.com");
			expect(updated.links.find((l) => l.platform === "github")?.value).toBe("janedoe");
			expect(updated.links.find((l) => l.platform === "twitter")?.value).toBe("@janedoe");
		});

		it("supports Person publisher identity with jobTitle and bylineId", async () => {
			const identity: SiteIdentity = {
				type: "Person",
				name: "Jane Doe",
				jobTitle: "Founder & Lead Designer",
				bylineId: "byl_123456",
				links: [
					{ id: "p1", platform: "mastodon", value: "@jane@mastodon.social", sameAs: true, relMe: true },
				],
			};

			await setSiteSettings({ identity }, db);
			const stored = await getSiteIdentityWithDb(db);
			expect(stored.type).toBe("Person");
			expect(stored.name).toBe("Jane Doe");
			expect(stored.jobTitle).toBe("Founder & Lead Designer");
			expect(stored.bylineId).toBe("byl_123456");
			expect(stored.links[0]?.relMe).toBe(true);
		});

		it("clears identity and synced legacy social when identity is set to null", async () => {
			await setSiteSettings({
				identity: {
					type: "Organization",
					links: [
						{ id: "gh", platform: "github", value: "acme", sameAs: true, relMe: false },
					],
				},
			}, db);

			let settings = await getSiteSettingsWithDb(db);
			expect(settings.social?.github).toBe("acme");

			await setSiteSettings({ identity: null }, db);
			settings = await getSiteSettingsWithDb(db);
			expect(settings.social?.github).toBeUndefined();
		});
	});

	describe("Zod Schema Validation", () => {
		it("validates profile links at REST/MCP boundary", async () => {
			const { siteIdentityInputSchema } = await import("../../../src/identity/schemas.js");

			// Valid organization
			const valid = siteIdentityInputSchema.safeParse({
				type: "Organization",
				name: "Acme",
				links: [
					{ platform: "custom", label: "Website", value: "https://example.com", sameAs: true, relMe: true },
					{ platform: "wechat", value: "acme_id", sameAs: false, relMe: false },
				],
			});
			expect(valid.success).toBe(true);

			// Custom link missing label should fail
			const invalidCustom = siteIdentityInputSchema.safeParse({
				type: "Organization",
				links: [
					{ platform: "custom", value: "https://example.com" },
				],
			});
			expect(invalidCustom.success).toBe(false);

			// Forbidden scheme should fail
			const invalidScheme = siteIdentityInputSchema.safeParse({
				type: "Organization",
				links: [
					{ platform: "custom", label: "Evil", value: "javascript:alert(1)" },
				],
			});
			expect(invalidScheme.success).toBe(false);
		});
	});
});
