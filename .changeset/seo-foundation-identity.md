---
"emdash": minor
"@emdash-cms/admin": minor
---

Adds structured site, user, and guest byline identity with extensible profile links for JSON-LD `sameAs` and `<link rel="me">` head output.

- **Publisher identity (`site:identity`)**: Site settings now describe the publisher as an `Organization` or `Person` with an open list of profile links, optional organization metadata (logo, address, identifiers, policies), and `getSiteIdentity()` for themes. Existing `site:social` values and `settings.social` continue working without changes.
- **Unified SEO & Profile settings**: The admin replaces **Settings → Social** with the **Publisher Identity** section inside **Settings → SEO** (and redirects `/settings/social` to `/settings/seo`), and adds **Settings → Profile** so signed-in users can manage their own `profileLinks` across all locales.
- **Author & guest bylines**: User-linked bylines inherit `profileLinks` from the linked user, guest bylines store their own `profileLinks`, and bylines support localized `jobTitle` values.
- **Head & structured data**: `EmDashHead` emits `https://` `sameAs` URLs on article `Person` authors and `Organization` publishers, and emits `<link rel="me">` tags for links marked `relMe`.
