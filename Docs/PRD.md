# PRD — JobVault

## Product summary

JobVault is a Chrome/Edge side-panel extension that preserves job applications in the user's Notion workspace. It captures the currently displayed LinkedIn job, lets the user review key metadata, saves the original JD as readable Notion content, prevents duplicate records and attaches the exact application documents used for the role.

## Target user

An individual job seeker who wants a durable application archive and may tailor a CV or application letter for each job.

## Goals

The product must:

1. Open as a persistent right-side browser panel.
2. Recognize the currently selected LinkedIn job, including two-pane search-result pages.
3. Produce a stable `linkedin.com/jobs/view/<job-id>` URL.
4. Extract editable company, position, location, work mode and employment type.
5. preserve the complete original JD after the posting changes or disappears.
6. Save JD headings, paragraphs and lists as native Notion blocks without rewriting text.
7. Track application status, applied date and notes.
8. Attach CV, Application Letter and Other Documents files.
9. Attach rejection and other correspondence from Gmail or Outlook to the matching application, with a reason the user selects.
10. Avoid duplicates through canonical-URL lookup.
11. Install and run without a server, so it can be distributed to other people.

## Non-goals

- Applying to jobs or filling forms automatically.
- Sending LinkedIn messages or changing LinkedIn account data.
- Crawling or ranking job-result lists.
- AI rewriting, summarization, scoring or translation of JDs.
- Generating resumes or application letters.
- Replacing Notion with a separate dashboard.

## Mail boundary

Allowed behavior is limited to the single message open in the reading pane of a supported webmail host, read on demand while the panel is open. JobVault must not enumerate the message list, search the mailbox, open other messages, send mail or change account settings. The rejection reason is selected by the user; no layer classifies the message.

## LinkedIn boundary

Allowed behavior is limited to the current job visibly selected by the user under `https://www.linkedin.com/jobs/*`. JobVault may expand the current JD's “More/See more” control and read its rendered content. It must not crawl other result cards, submit applications, navigate automatically or interact with people/accounts.

## Core user flow

1. The user opens a LinkedIn job or selects a job in LinkedIn search results.
2. The user opens JobVault from the browser toolbar.
3. JobVault resolves the stable job URL and extracts the current job.
4. The side panel updates when the selected job changes.
5. The user reviews editable metadata and status.
6. JobVault checks the canonical URL for an existing Notion record.
7. A new job is saved with the full JD as page content, or the existing record is shown.
8. The user may update metadata/status and attach documents.

## JD fidelity requirements

The original visible JD is authoritative.

- Do not summarize, paraphrase, translate, correct grammar or reorder content.
- Do not truncate content or save “More/See more”.
- Keep original punctuation and item order.
- Map headings, paragraphs, bullets and numbered items one-for-one to the corresponding Notion blocks.
- Keep links clickable, pointing at the real destination.
- Derive the structure from the JD's own markup. Never re-infer it from flattened text, and never let the saved plain text and the saved structure come from separate passes.

Website CSS such as fonts, colors and exact spacing is not portable to Notion. Text and document structure are the fidelity contract.

## Editable job fields

- Job URL
- Company
- Position
- Location
- Work Mode
- Employment Type
- Status
- Notes

The JD is captured in full and shown as a capture status by default. A review/edit action may expose the raw text when needed.

## Application statuses

- Saved
- Preparing
- Applied
- Assessment
- HR Interview
- Technical Interview
- Final Interview
- Offer
- Rejected
- Withdrawn
- Archived

Changing status to Applied populates Applied Date.

## Notion database

JobVault automatically creates **Job Applications** under the configured parent page. The default view order chosen by the user is:

1. Position
2. Status
3. Location
4. Work Mode
5. Company
6. Employment Type
7. Job URL
8. CV
9. Applied Date
10. Notes
11. Application Letter
12. Other Documents
13. Canonical URL
14. Saved Date
15. Rejection Reason
16. Contact Email
17. Last Contact

There is no Source or Match Score property. Motivation-letter and cover-letter uploads both use Application Letter. Location holds the place only; Remote, Hybrid and On-site live in the Work Mode select so the board can filter on them.

## File uploads

- Supported: PDF and DOCX.
- Maximum: 20 MB per request.
- Categories: CV, Application Letter and Other Documents.
- API values: `cv`, `application_letter`, `other`. Legacy `motivation_letter` and `cover_letter` remain compatible and map to Application Letter.

## Privacy and security

- The user's own Notion token is stored device-locally and sent only to Notion.
- Job data reaches no third-party server.
- No analytics or advertising are included.

## Definition of done

- [x] Manifest V3 extension loads in Chrome and Edge-compatible Chromium.
- [x] Toolbar action opens a persistent side panel.
- [x] Current LinkedIn job and stable URL are detected.
- [x] Dynamic job switching refreshes the panel.
- [x] Full original JD is saved as native Notion blocks.
- [x] Duplicate canonical URLs are detected.
- [x] Status and notes can be updated.
- [x] PDF/DOCX application documents can be attached.
- [x] Notion database is created automatically.
- [x] Extension behavior has automated tests.
- [x] Runs with no server, using the user's own Notion token.
- [x] Rejection and other emails can be attached to an application from Gmail and Outlook.
