---
"emdash": minor
"@emdash-cms/admin": minor
---

Adds dynamic social profile links with IndieWeb `rel="me"` verification and Schema.org `sameAs` structured data:

- Replaces the static 6-field social settings form in the Admin UI (**Settings > Social**) with a dynamic list editor where site owners can add, label, and remove arbitrary profile URLs (such as Mastodon, Bluesky, GitHub, Threads, YouTube, etc.).
- Adds an **Identity verification (`rel="me"`)** toggle to each social link. Profiles with verification enabled and valid http(s) URLs emit `<link rel="me" href="...">` tags in `<head>` via `<EmDashHead>`, enabling two-way decentralized identity verification across IndieWeb services, Mastodon, and GitHub.
- Automatically populates the `sameAs` property on the root `WebSite` JSON-LD structured data graph with the site's verified social profile links (`relMe: true`).
- Maintains bidirectional backward compatibility with the legacy `settings.social` map (Twitter, GitHub, Facebook, Instagram, LinkedIn, YouTube): updates to `socialLinks` automatically synchronize the legacy map, extracting platform handles to prevent doubled URLs in existing themes. Legacy updates (via older clients or MCP) are non-destructively merged into `socialLinks` without wiping custom profiles or unverified flags.
- Automatically converts existing stored handles (e.g. `@user`) to platform URLs on upgrade with `relMe: false`, ensuring zero broken relative links or unintended identity assertions on existing sites.
