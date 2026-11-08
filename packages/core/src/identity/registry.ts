const HTTP_URL_RE = /^https?:\/\//i;
const LEADING_AT_RE = /^@/;
const YOUTUBE_CHANNEL_ID_RE = /^UC[\w-]{22}$/;

export interface PlatformDefinition {
	key: string;
	displayName: string;
	iconName: string;
	placeholder?: string;
	handleOnly?: boolean;
	/**
	 * Builds an absolute https URL from a handle, ID, or existing URL.
	 * Returns null if the platform is handle-only or if the value cannot form a valid URL.
	 */
	buildProfileUrl?: (value: string) => string | null;
	/**
	 * Extracts the concise username/handle from an absolute profile URL for legacy sync.
	 * Returns null if extraction is not supported or does not match platform URL structure.
	 */
	extractHandle?: (url: string) => string | null;
}

/**
 * Factory for standard handle-based URL builders.
 * Automatically accepts existing http(s) URLs or replaces {handle} with the stripped handle.
 */
export function patternUrlBuilder(template: string): (raw: string) => string | null {
	return (raw: string) => {
		const trimmed = raw.trim();
		if (!trimmed) return null;
		if (HTTP_URL_RE.test(trimmed)) return trimmed;
		const handle = trimmed.replace(LEADING_AT_RE, "");
		return handle ? template.replace("{handle}", encodeURIComponent(handle)) : null;
	};
}

const PLATFORMS: Record<string, PlatformDefinition> = {
	twitter: {
		key: "twitter",
		displayName: "X (Twitter)",
		iconName: "twitter",
		placeholder: "@username or https://x.com/username",
		buildProfileUrl: patternUrlBuilder("https://x.com/{handle}"),
		extractHandle: (urlStr: string) => {
			const trimmed = urlStr.trim();
			if (!trimmed) return null;
			if (!trimmed.includes("://")) {
				return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
			}
			try {
				const parsed = new URL(trimmed);
				const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
				if (host !== "twitter.com" && host !== "x.com") return null;
				const parts = parsed.pathname.split("/").filter(Boolean);
				if (parts.length === 1 && !["home", "explore", "notifications", "messages"].includes(parts[0].toLowerCase())) {
					const h = parts[0].replace(LEADING_AT_RE, "");
					return `@${h}`;
				}
				return null;
			} catch {
				return null;
			}
		},
	},
	github: {
		key: "github",
		displayName: "GitHub",
		iconName: "github",
		placeholder: "username or https://github.com/username",
		buildProfileUrl: patternUrlBuilder("https://github.com/{handle}"),
		extractHandle: (urlStr: string) => {
			try {
				const parsed = new URL(urlStr);
				const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
				if (host !== "github.com") return null;
				const parts = parsed.pathname.split("/").filter(Boolean);
				return parts.length === 1 ? parts[0] : null;
			} catch {
				return null;
			}
		},
	},
	facebook: {
		key: "facebook",
		displayName: "Facebook",
		iconName: "facebook",
		placeholder: "username or https://facebook.com/username",
		buildProfileUrl: patternUrlBuilder("https://facebook.com/{handle}"),
		extractHandle: (urlStr: string) => {
			try {
				const parsed = new URL(urlStr);
				const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
				if (host !== "facebook.com" && host !== "fb.com") return null;
				const parts = parsed.pathname.split("/").filter(Boolean);
				return parts.length === 1 ? parts[0] : null;
			} catch {
				return null;
			}
		},
	},
	instagram: {
		key: "instagram",
		displayName: "Instagram",
		iconName: "instagram",
		placeholder: "@username or https://instagram.com/username",
		buildProfileUrl: patternUrlBuilder("https://instagram.com/{handle}"),
		extractHandle: (urlStr: string) => {
			try {
				const parsed = new URL(urlStr);
				const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
				if (host !== "instagram.com") return null;
				const parts = parsed.pathname.split("/").filter(Boolean);
				return parts.length === 1 ? parts[0] : null;
			} catch {
				return null;
			}
		},
	},
	linkedin: {
		key: "linkedin",
		displayName: "LinkedIn",
		iconName: "linkedin",
		placeholder: "in/username or https://linkedin.com/in/username",
		buildProfileUrl: (raw: string) => {
			const trimmed = raw.trim();
			if (!trimmed) return null;
			if (HTTP_URL_RE.test(trimmed)) return trimmed;
			const clean = trimmed.replace(/^\/?(in\/|company\/)?/, "");
			if (!clean) return null;
			const prefix = trimmed.startsWith("company/") ? "company" : "in";
			return `https://linkedin.com/${prefix}/${encodeURIComponent(clean)}`;
		},
		extractHandle: (urlStr: string) => {
			try {
				const parsed = new URL(urlStr);
				const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
				if (host !== "linkedin.com") return null;
				const parts = parsed.pathname.split("/").filter(Boolean);
				if (parts.length >= 2 && (parts[0] === "in" || parts[0] === "company")) {
					return `${parts[0]}/${parts[1]}`;
				}
				return parts.length === 1 ? parts[0] : null;
			} catch {
				return null;
			}
		},
	},
	youtube: {
		key: "youtube",
		displayName: "YouTube",
		iconName: "youtube",
		placeholder: "@channel or https://youtube.com/@channel",
		buildProfileUrl: (raw: string) => {
			const trimmed = raw.trim();
			if (!trimmed) return null;
			if (HTTP_URL_RE.test(trimmed)) return trimmed;
			if (YOUTUBE_CHANNEL_ID_RE.test(trimmed)) {
				return `https://youtube.com/channel/${trimmed}`;
			}
			const handle = trimmed.replace(LEADING_AT_RE, "");
			return handle ? `https://youtube.com/@${encodeURIComponent(handle)}` : null;
		},
		extractHandle: (urlStr: string) => {
			try {
				const parsed = new URL(urlStr);
				const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
				if (host !== "youtube.com" && host !== "youtu.be") return null;
				const parts = parsed.pathname.split("/").filter(Boolean);
				if (parts.length === 1 && parts[0].startsWith("@")) {
					return parts[0].substring(1);
				}
				if (parts.length === 2 && parts[0] === "channel") {
					return parts[1];
				}
				return null;
			} catch {
				return null;
			}
		},
	},
	mastodon: {
		key: "mastodon",
		displayName: "Mastodon",
		iconName: "mastodon",
		placeholder: "https://mastodon.social/@username or @user@instance.social",
		buildProfileUrl: (raw: string) => {
			const trimmed = raw.trim();
			if (!trimmed) return null;
			if (HTTP_URL_RE.test(trimmed)) return trimmed;
			// Pattern @user@instance.social or user@instance.social
			const match = trimmed.replace(/^@/, "").match(/^([^@]+)@([^@]+)$/);
			if (match) {
				const [, user, instance] = match;
				return `https://${instance}/@${encodeURIComponent(user)}`;
			}
			return null;
		},
	},
	bluesky: {
		key: "bluesky",
		displayName: "Bluesky",
		iconName: "bluesky",
		placeholder: "username.bsky.social or https://bsky.app/profile/...",
		buildProfileUrl: patternUrlBuilder("https://bsky.app/profile/{handle}"),
	},
	threads: {
		key: "threads",
		displayName: "Threads",
		iconName: "threads",
		placeholder: "@username or https://threads.net/@username",
		buildProfileUrl: patternUrlBuilder("https://threads.net/@{handle}"),
	},
	wechat: {
		key: "wechat",
		displayName: "WeChat",
		iconName: "wechat",
		placeholder: "WeChat ID (handle only)",
		handleOnly: true,
		// No URL builder: WeChat has no public web profile, so values never reach sameAs or rel="me"
	},
	telegram: {
		key: "telegram",
		displayName: "Telegram",
		iconName: "telegram",
		placeholder: "@username or https://t.me/username",
		buildProfileUrl: patternUrlBuilder("https://t.me/{handle}"),
	},
	whatsapp: {
		key: "whatsapp",
		displayName: "WhatsApp",
		iconName: "whatsapp",
		placeholder: "Phone number with country code (e.g. 15551234567)",
		buildProfileUrl: (raw: string) => {
			const trimmed = raw.trim();
			if (!trimmed) return null;
			if (HTTP_URL_RE.test(trimmed)) return trimmed;
			const digits = trimmed.replace(/\D/g, "");
			return digits ? `https://wa.me/${digits}` : null;
		},
	},
	reddit: {
		key: "reddit",
		displayName: "Reddit",
		iconName: "reddit",
		placeholder: "username or https://reddit.com/user/username",
		buildProfileUrl: (raw: string) => {
			const trimmed = raw.trim();
			if (!trimmed) return null;
			if (HTTP_URL_RE.test(trimmed)) return trimmed;
			const user = trimmed.replace(/^u\//, "").replace(LEADING_AT_RE, "");
			return user ? `https://reddit.com/user/${encodeURIComponent(user)}` : null;
		},
	},
	twitch: {
		key: "twitch",
		displayName: "Twitch",
		iconName: "twitch",
		placeholder: "channel or https://twitch.tv/channel",
		buildProfileUrl: patternUrlBuilder("https://twitch.tv/{handle}"),
	},
	tiktok: {
		key: "tiktok",
		displayName: "TikTok",
		iconName: "tiktok",
		placeholder: "@username or https://tiktok.com/@username",
		buildProfileUrl: patternUrlBuilder("https://tiktok.com/@{handle}"),
	},
	discord: {
		key: "discord",
		displayName: "Discord",
		iconName: "discord",
		placeholder: "Invite code or https://discord.gg/invite",
		buildProfileUrl: (raw: string) => {
			const trimmed = raw.trim();
			if (!trimmed) return null;
			if (HTTP_URL_RE.test(trimmed)) return trimmed;
			return `https://discord.gg/${encodeURIComponent(trimmed)}`;
		},
	},
	custom: {
		key: "custom",
		displayName: "Custom Link",
		iconName: "link",
		placeholder: "https://...",
		buildProfileUrl: (raw: string) => {
			const trimmed = raw.trim();
			return HTTP_URL_RE.test(trimmed) ? trimmed : null;
		},
	},
};

export const LEGACY_PLATFORM_KEYS = [
	"twitter",
	"github",
	"facebook",
	"instagram",
	"linkedin",
	"youtube",
] as const;

export type LegacyPlatformKey = (typeof LEGACY_PLATFORM_KEYS)[number];

export function getPlatform(key: string): PlatformDefinition | undefined {
	return PLATFORMS[key.toLowerCase()];
}

export function getAllPlatforms(): PlatformDefinition[] {
	return Object.values(PLATFORMS);
}

/**
 * Dynamically register or override a platform definition (e.g. from plugins or themes).
 */
export function registerPlatform(definition: PlatformDefinition): void {
	PLATFORMS[definition.key.toLowerCase()] = definition;
}

/**
 * Resolves a profile link's raw value into an absolute https URL if possible.
 * Returns null if the value is not a URL and cannot be converted to one.
 */
export function resolveProfileUrl(platform: string, value: string): string | null {
	const trimmed = value.trim();
	if (!trimmed) return null;
	const def = getPlatform(platform);
	if (def?.buildProfileUrl) {
		const url = def.buildProfileUrl(trimmed);
		if (url && HTTP_URL_RE.test(url)) return url;
	}
	return HTTP_URL_RE.test(trimmed) ? trimmed : null;
}

/**
 * Extracts a handle from an absolute URL for a legacy platform.
 */
export function extractLegacyHandle(platform: string, urlStr: string): string | null {
	const def = getPlatform(platform);
	return def?.extractHandle ? def.extractHandle(urlStr) : null;
}
