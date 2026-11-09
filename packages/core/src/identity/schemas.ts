import { z } from "zod";

import { PLATFORM_URL_DOMAINS, validateProfileLinkValue } from "@emdash-cms/admin";

export { PLATFORM_URL_DOMAINS, validateProfileLinkValue };

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
