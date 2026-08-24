# TECH_SPEC — JobVault

## Architecture

```text
Current LinkedIn job page
        │ narrowly scoped MV3 content script
        ▼
Chrome/Edge side panel (React + TypeScript)
        │ Notion REST API 2026-03-11, called directly
        ▼
Job Applications database + job page blocks + uploaded files
```

Gmail and Outlook tabs carry a second content script feeding the same panel, which appends the open message to a job page the user picks.

There is no server. Extension pages carry `host_permissions` for `https://api.notion.com/*`, which exempts their requests from CORS; content scripts cannot do this, so every Notion call happens in the panel, never in the LinkedIn page.

## Stack

- TypeScript, React, Vite, Manifest V3, Vitest, ESLint.
- Persistence: the user's Notion workspace. Generated database and data-source ids live in `chrome.storage.sync`; the token lives in `chrome.storage.local`.

## Extension permissions

```json
{
  "permissions": ["activeTab", "storage", "sidePanel", "scripting"],
  "host_permissions": [
    "https://api.notion.com/*",
    "https://www.linkedin.com/*",
    "https://mail.google.com/*",
    "https://outlook.live.com/*",
    "https://outlook.office.com/*",
    "https://outlook.office365.com/*"
  ]
}
```

Content scripts match `https://www.linkedin.com/jobs/*` and the four webmail hosts. The extension requests no `<all_urls>` permission. Removing the mail hosts and the second `content_scripts` entry disables email capture and leaves everything else working.

## Build

Panel, options page and service worker are built as ES modules. Content scripts are built one at a time as self-contained IIFE bundles by `vite.content.config.ts`, because a Manifest V3 content script cannot be an ES module — and one shared source file is enough for the bundler to hoist a chunk and emit an `import`, after which the script never runs and nothing reports it. `scripts/check-content-scripts.mjs` reads every file named in `content_scripts` after each build and fails on an `import` or `export`.

## Side-panel lifecycle

- The toolbar action opens `popup.html` through the Side Panel API.
- The panel queries the active tab and requests current-job extraction.
- If a content script is missing after extension reload, the panel injects the bundled LinkedIn adapter and retries.
- Content-script messaging checks `chrome.runtime.id`; an invalidated extension context disconnects observers and clears timers.

## LinkedIn extraction

### Stable URL

For direct pages, preserve `/jobs/view/<id>`. For search pages, read `currentJobId` and construct:

```text
https://www.linkedin.com/jobs/view/<currentJobId>
```

Tracking and search query parameters are not saved as the Job URL.

### Dynamic updates

The adapter observes selected-job DOM changes and wraps `history.pushState` / `history.replaceState`. A changed URL/title signature notifies the side panel with a short debounce.

### Metadata

Extraction is scoped to the selected job-detail panel. Preferred sources are:

1. JobPosting JSON-LD when present.
2. Legacy LinkedIn top-card class selectors.
3. The job panel header, located by shape: the sibling before the description that carries a work-mode or employment pill.
4. The page title.

LinkedIn now ships hashed CSS class names, so the description is anchored on `[id^="JobDetails_AboutTheJob_"]` and the header is found by walking up from it. The location line is the shortest element holding a `·` plus a posted-time or applicant count; the recruiter-promotion line uses `•` and is excluded by that alone. Work mode normalizes to Remote, Hybrid or On-site and lives in its own property. Employment values normalize to Full-time, Internship, Contract or Other.

### JD fidelity

The adapter clicks the More/See more control **inside the description container only**; a page-wide search hits the company feed instead. It walks the description DOM to derive `jd_blocks` in source order, and `jd_text` is the joined block text, so the two can never diverge.

```ts
type JdSpan = { text: string; href?: string }
type JdBlock = {
  type: 'heading_2' | 'heading_3' | 'paragraph' |
        'bulleted_list_item' | 'numbered_list_item'
  text: string
  spans?: JdSpan[]   // only when the block carries links
}
```

No layer may summarize, translate or rewrite the JD. Links become Notion `rich_text` entries with `link.url`; LinkedIn `/safety/go` redirects are unwrapped to the destination. A manually entered job with no structure is stored as plain paragraphs split on blank lines — no keyword-based section guessing.

## Domain model

`JobCreate` contains URL, company, position, optional location, optional work mode, source detection metadata, optional employment type, status, full `jd_text`, ordered `jd_blocks`, and optional notes. Source remains an internal request value but is not a Notion database property.

Application statuses, employment types and work modes are defined in `src/lib/domain.ts`, which is the single source of truth now that no server mirrors them. An unset optional field is an empty string and is simply omitted from the Notion payload.

## Mail capture

`detectMailClient(host)` gates the panel into email mode. Extraction is scoped to the reading pane — `#ReadingPaneContainerId` / `[role="main"]` on Outlook, `[role="main"]` on Gmail — because the message list carries a sender for every conversation in the mailbox.

| | Outlook web | Gmail |
|---|---|---|
| Body | `[id^="UniqueMessageBody"]`, `[role="document"]` | `.a3s`, `[data-message-id] [dir="ltr"]` |
| Subject | `[id$="_SUBJECT"]` | `h2` |
| Sender | text node `Name<address>` | `[email]` / `[jid]` / `[data-hovercard-id]` |
| Date | `[id$="_DATETIME"]` | `[title]` holding a year |

The sender search skips the body subtree, so an address quoted in a signature cannot be mistaken for the sender. `toIsoDate` converts only year-first dates; anything else keeps its raw string in the entry while `Last Contact` falls back to the capture time.

The Outlook and Gmail fixtures are reconstructions of captured structure with the content replaced, because a raw capture carries real names, addresses and message text into a public repository. Ids, roles and nesting match what was observed; only the words differ. The LinkedIn fixtures are raw captures of public job postings.

## Notion operations

`src/lib/notion.ts` exposes `lookupJob`, `createJob`, `updateJob`, `uploadDocument`, `listJobs`, `appendEmail` and `migrateWorkMode`; `src/lib/notion-client.ts` holds the token, the request wrapper and error shaping.

Duplicate creation is prevented by a data-source query on Canonical URL. Existing jobs are returned rather than overwritten; replacing an existing JD requires a future explicit action.

Notion accepts at most 100 children per request, so a JD longer than that is created with the first 100 blocks and the rest appended through `PATCH /blocks/{id}/children`.

## Canonical URLs

Canonicalization lowercases the host, removes fragments and known tracking parameters, sorts remaining parameters and preserves requisition identifiers. LinkedIn search URLs are converted to stable view URLs before lookup.

## Notion provisioning

The user supplies an integration token and a parent page in Settings. The database is created on first use and its database/data-source ids are cached in `chrome.storage.sync`. The schema is documented in `notion-setup.md`.

`migrateWorkMode`, run from Settings, splits the legacy combined `Location` text into `Location` plus the `Work Mode` select, for both the ` · ` and the ` (mode)` separators. Rows without a recognizable mode are left untouched, so it is safe to run twice.

Notion view-column ordering is UI state and cannot be reordered through the public API. Reordering columns in Notion is safe: migrations only add and remove properties. `DATABASE_PROPERTIES` records the user's preferred order for newly created databases only.

## JD page body

Each new job page contains:

```text
# Job Description Snapshot
Saved at: <UTC timestamp>
Source URL: <stable URL>

<native Notion blocks corresponding to the original JD>
```

Text longer than the Notion rich-text limit is chunked without discarding content.

## Document uploads

- MIME: PDF or DOCX.
- Maximum: 20 MB.
- Flow: create Notion file upload → send bytes → attach file upload to the page property.
- `cv` maps to CV.
- `application_letter` maps to Application Letter; legacy `motivation_letter` and `cover_letter` map there too.
- `other` maps to Other Documents.

## Security and observability

- The Notion token lives in `chrome.storage.local`: device-local, never synced, never sent anywhere but `api.notion.com`.
- Job data reaches no third party — the browser talks to Notion directly.
- No remote extension code or `eval`.
- Strict extension CSP.
- Size and type checks before upload, and Notion errors surfaced with their own message rather than a status code.

## Verification

Commands live in the README. `npm run typecheck` covers test files, which the build config excludes; without it a test fixture can drift from the type it claims to satisfy and still pass. Extraction changes additionally require a captured-DOM fixture: jsdom does not implement `innerText`, so any code path that reads it is untestable and any test that fakes it proves nothing about the browser.
