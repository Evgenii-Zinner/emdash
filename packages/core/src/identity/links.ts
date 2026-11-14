import type { SocialLink } from "../settings/types.js";
import {
	extractLegacyHandle,
	getPlatform,
	LEGACY_PLATFORM_KEYS,
	resolveProfileUrl,
} from "./registry.js";
import type { ProfileLink } from "./types.js";

const KNOWN_LEGACY_PLATFORMS = new Set<string>(LEGACY_PLATFORM_KEYS);

const LEGACY_PLATFORM_LABELS: Record<string, string> = {
	twitter: "X (Twitter)",
	github: "GitHub",
	facebook: "Facebook",
	instagram: "Instagram",
	linkedin: "LinkedIn",
	youtube: "YouTube",
};

/**
 * Normalizes an array of ProfileLinks.
 * Enforces unique IDs, trims values, ignores forbidden URI schemes, and sets defaults.
 */
export function normalizeProfileLinks(links: unknown): ProfileLink[] {
	if (!Array.isArray(links)) return [];
	const seenIds = new Set<string>();
	const normalized: ProfileLink[] = [];

	for (const raw of links) {
		if (!raw || typeof raw !== "object") continue;
		const item = raw as Partial<ProfileLink>;
		if (typeof item.value !== "string" || !item.value.trim()) continue;
		const value = item.value.trim();
		if (value.length > 2048) continue;
		if (/^(javascript|data|vbscript|file):/i.test(value)) continue;

		const platform =
			typeof item.platform === "string" && item.platform.trim()
				? item.platform.trim().toLowerCase()
				: "custom";
		const def = getPlatform(platform);
		const label =
			typeof item.label === "string" && item.label.trim()
				? item.label.trim()
				: (def?.displayName ??
					(platform === "custom"
						? "Custom Link"
						: platform.charAt(0).toUpperCase() + platform.slice(1)));

		const sameAs = item.sameAs === true;
		const relMe = item.relMe === true;

		let id = typeof item.id === "string" && item.id.trim() ? item.id.trim() : `link-${platform}`;
		if (seenIds.has(id)) {
			let counter = 1;
			while (seenIds.has(`${id}-${counter}`)) {
				counter++;
			}
			id = `${id}-${counter}`;
		}
		seenIds.add(id);

		normalized.push({
			id,
			platform,
			label,
			value,
			sameAs,
			relMe,
		});
		if (normalized.length >= 50) break;
	}
	return normalized;
}

/**
 * Converts a legacy site:social map into canonical ProfileLink array.
 * Emits sameAs: true and relMe: false by default for legacy profiles.
 */
export function legacySocialToProfileLinks(
	social: Record<string, unknown> | null | undefined,
): ProfileLink[] {
	if (!social || typeof social !== "object") return [];
	const links: ProfileLink[] = [];
	for (const [platform, raw] of Object.entries(social)) {
		if (typeof raw !== "string" || !raw.trim()) continue;
		const platformKey = platform.toLowerCase();
		const def = getPlatform(platformKey);
		links.push({
			id: `legacy-${platformKey}`,
			platform: platformKey,
			label: def?.displayName ?? (LEGACY_PLATFORM_LABELS[platformKey] || platform),
			value: raw.trim(),
			sameAs: true,
			relMe: false,
		});
	}
	return links;
}

/**
 * Extracts legacy site:social key-value map from ProfileLinks.
 * Uses the first matching link for each of the 6 legacy platforms.
 */
export function profileLinksToLegacySocial(
	links: ProfileLink[] | undefined,
): Record<string, string | undefined> {
	const result: Record<string, string | undefined> = {};
	if (!links || !Array.isArray(links)) return result;
	for (const link of links) {
		const platform = link.platform?.toLowerCase();
		if (
			platform &&
			KNOWN_LEGACY_PLATFORMS.has(platform) &&
			link.value &&
			result[platform] === undefined
		) {
			const handle = extractLegacyHandle(platform, link.value);
			result[platform] = handle || link.value;
		}
	}
	return result;
}

/**
 * Non-destructively merges updates from a legacy site:social patch into ProfileLinks.
 * Leaves custom links and switches untouched.
 */
export function mergeLegacySocialPatchIntoIdentityLinks(
	existingLinks: ProfileLink[],
	patch: Record<string, unknown>,
): ProfileLink[] {
	const links = [...existingLinks];

	for (const [platform, rawValue] of Object.entries(patch)) {
		const platformKey = platform.toLowerCase();
		const existingIndex = links.findIndex((l) => l.platform?.toLowerCase() === platformKey);

		if (rawValue === null || rawValue === "" || rawValue === undefined) {
			if (existingIndex !== -1) {
				links.splice(existingIndex, 1);
			}
			continue;
		}

		if (typeof rawValue !== "string" || !rawValue.trim()) continue;
		const val = rawValue.trim();

		if (existingIndex !== -1) {
			const current = links[existingIndex]!;
			links[existingIndex] = {
				...current,
				value: val,
			};
		} else {
			const def = getPlatform(platformKey);
			links.push({
				id: `legacy-${platformKey}`,
				platform: platformKey,
				label: def?.displayName ?? (LEGACY_PLATFORM_LABELS[platformKey] || platformKey),
				value: val,
				sameAs: true,
				relMe: false,
			});
		}
	}

	return normalizeProfileLinks(links);
}

/** Converts ProfileLinks into legacy SocialLink items with resolved URLs. */
export function profileLinksToSocialLinks(links: ProfileLink[]): SocialLink[] {
	return links.map((l) => ({
		id: l.id,
		platform: l.platform,
		label: l.label ?? l.platform,
		url: resolveProfileUrl(l.platform, l.value) || l.value,
		relMe: l.relMe,
	}));
}

/** Converts legacy SocialLink items into ProfileLink records. */
export function socialLinksToProfileLinks(links: SocialLink[]): ProfileLink[] {
	return links.map((l) => ({
		id: l.id,
		platform: l.platform ?? "custom",
		label: l.label,
		value: l.url,
		sameAs: true,
		relMe: l.relMe === true,
	}));
}
