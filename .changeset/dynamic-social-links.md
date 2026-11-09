---
"emdash": minor
"@emdash-cms/admin": minor
---

Adds dynamic site and author identity management, profile link verification with `rel="me"`, and an extensible social platform registry.

#### Site Identity & Publisher Settings

Publishers can now configure whether their site represents an **Organization** or an individual **Person**, customize public publisher names, and provide structured address details and editorial policies for Schema.org metadata. Existing social profiles remain fully backwards-compatible with legacy theme templates.

#### Dynamic Profile Links & IndieWeb Verification

Site and byline social profiles now support arbitrary platforms (including Bluesky, Mastodon, Threads, YouTube, GitHub, and custom links). Profile links cleanly decouple search engine disambiguation (`sameAs`) from reciprocal identity verification (`rel="me"`). Verified links automatically emit `<link rel="me">` tags in `<head>` on site pages and author archive pages.

#### Byline Identity

Bylines now include dedicated fields for professional job titles and author profile links, editable directly from the admin byline dialog.
