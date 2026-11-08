---
"emdash": minor
"@emdash-cms/admin": minor
---

Implements Phase 1 (Identity Foundation) of RFC #4765 (SEO Foundation):

- **Site Identity (`site:identity`):** Introduces a unified publisher identity model supporting `Organization` and `Person` publisher types, name, alternate name, description, address (`PostalAddress`), policies (`OrganizationPolicies`), and identifiers (`OrganizationIdentifier`). Maintains seamless bidirectional synchronization with legacy `site:social` and `site:socialLinks`.
- **Platform Registry:** Centralized, extensible platform registry in `@emdash-cms/core` with URL pattern builders (`patternUrlBuilder`), handle extractors, handle-only platform support (`wechat`), and runtime plugin extensibility via `registerPlatform()`.
- **Decoupled Verification (`sameAs` & `rel="me"`):** Social and profile links cleanly decouple semantic graph equivalence (`sameAs`) from identity verification (`rel="me"`). Handle-only platforms never emit URLs.
- **Byline Identity & Author Verification:** Added migration `095_byline_identity.ts` adding `job_title` and `profile_links` to `_emdash_bylines`. Author archive pages now emit author `<link rel="me">` tags for verified profiles.
- **Admin UI:** Added reusable `ProfileLinksEditor`, updated Site Settings with Organization/Person publisher selection and collapsible advanced structured data sections (Address, Policies), and added job title and profile links editing to the Byline dialog.
