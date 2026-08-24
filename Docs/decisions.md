# Architecture decisions

## ADR-001 — Server-side Notion credentials — **superseded by ADR-010**

The local MVP used a private FastAPI backend configured with `NOTION_TOKEN` and `NOTION_PARENT_PAGE_ID`, so the extension never received the Notion token.

## ADR-002 — Persistent side panel

JobVault uses the Manifest V3 Side Panel API instead of a temporary popup. Clicking the extension action opens a persistent companion panel on the right side of the browser.

## ADR-003 — Narrow LinkedIn current-page extraction

The extension registers a content script only for `https://www.linkedin.com/jobs/*`. It reads the currently displayed job after the user opens JobVault. It does not crawl result lists, apply, message, navigate or perform background account automation.

This decision supersedes the original manual-only/no-content-script proposal.

## ADR-004 — Original JD is authoritative

JD capture is a zero-rewrite operation. The extension must not summarize, translate, reorder or infer new content. Browser-rendered paragraphs, headings and list items are converted to corresponding native Notion blocks in their original order. Text heuristics exist only as a compatibility fallback when structured browser blocks are unavailable.

## ADR-005 — Automatic Notion provisioning

JobVault creates the Job Applications database under the configured parent page and caches its database/data-source ids. The user never builds the schema by hand.

## ADR-006 — One application-letter property

Motivation letters and cover letters share the `Application Letter` file property. `application_letter` is the request value the popup sends; the legacy values `motivation_letter` and `cover_letter` remain accepted and map to the same property. The popup offers a single upload slot, because an upload replaces the property's file list and two slots silently overwrote each other.

## ADR-007 — Anchor extraction on component ids, not class names

LinkedIn ships build-hashed CSS class names (`_4bbf76d5`), so class selectors break on every deploy. The description is anchored on `[id^="JobDetails_AboutTheJob_"]`; the panel header, which has no id, is found by shape — the sibling preceding the description that carries a work-mode or employment pill. Legacy class selectors are kept only as a fallback for older markup.

Selectors are not accepted without a captured-DOM fixture. Seven parallel class selectors previously looked like redundancy but were seven copies of one assumption, and all of them died together.

## ADR-008 — `jd_text` is derived from `jd_blocks`

`jd_text` is the joined block text and has no independent source. `JobCreate` rejects a payload whose blocks do not reconstruct the text, so a silent structure/text divergence is impossible rather than merely unlikely. Editing the JD in the panel rebuilds the blocks for the same reason.

This replaced two independent extraction passes — one reading `innerText`, one walking the DOM — that disagreed with each other and made every LinkedIn save fail that validation.

## ADR-009 — Work mode is its own property

`Location` holds the place only. Remote/Hybrid/On-site is a three-value axis worth filtering and grouping on, which free text cannot support, and LinkedIn already renders it as a separate pill. A one-time migration in Settings splits legacy combined values and leaves unrecognized ones untouched.

## ADR-010 — The extension talks to Notion directly, and reverses ADR-001

There is no backend. Extension pages hold `host_permissions` for `https://api.notion.com/*`, which exempts their requests from CORS, so the panel calls Notion itself. Each user supplies their own integration token, stored in `chrome.storage.local` — device-local, never synced.

ADR-001 kept the token server-side, which was right while the backend was a private local process. It stopped being right once the goal became distribution: a shared backend would have to hold *other people's* Notion tokens and job-search data, and a per-user local backend requires every user to install Python and run a server.

This is a deliberate trade. Notion OAuth would avoid handing users a raw secret, but its token exchange needs a `client_secret` and Notion has no PKCE public-client flow, so OAuth cannot exist without a server. Between "user pastes their own token" and "we custody everyone's credentials", the first is both less work and less exposure. The cost is onboarding friction — creating an integration is a real step that will lose non-technical users. If that drop-off ever matters more than the operational burden, the answer is a minimal server that does the OAuth exchange only and never sees JD content.

## ADR-011 — Email capture reads the reading pane, and the reason is never inferred

Correspondence is attached to a job from Gmail and Outlook on the web. Two constraints shape it.

Everything is read from the reading pane, never from the document. The message list holds a sender for every conversation in the mailbox, so a page-wide lookup would file a stranger's address under the job — the same defect the LinkedIn search page produced by matching a stale job panel.

The rejection reason is a select the user picks, and the message is stored verbatim. Classifying "they wanted a Dutch speaker" as a skills gap rather than a hard requirement would quietly corrupt the one thing the retrospective exists to answer, and inference over captured content is excluded by ADR-004.

A date is converted only when it is year-first and therefore unambiguous. `8/9/2026` is August or September depending on locale, and a silently wrong date is worse in a timeline than no date; otherwise the raw string is kept in the entry and the capture time stamps the property.

The cost is real: the extension now holds host permissions for two mail providers, which Chrome presents as the ability to read all mail on those domains. It reads one open message, on demand, and never enumerates a mailbox.
