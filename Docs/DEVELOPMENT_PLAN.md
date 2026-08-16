# DEVELOPMENT_PLAN — JobVault

This plan reflects the implemented product rather than the superseded manual-capture prototype.

## Completed foundation

- [x] Manifest V3 React extension with a persistent side panel.
- [x] Direct browser-to-Notion calls with no server, using the user's own integration token.
- [x] Reuse of an existing Job Applications database instead of always creating one.
- [x] Canonical URL handling and duplicate-safe Notion lookup.
- [x] Automatic Notion database provisioning from `NOTION_PARENT_PAGE_ID`.
- [x] Current LinkedIn job extraction through a narrowly scoped content script.
- [x] Stable `/jobs/view/<job-id>` URLs on LinkedIn search pages.
- [x] Dynamic selected-job updates using URL/history and DOM observation.
- [x] Editable company, position, location, work mode, employment type, status and notes.
- [x] Full JD capture as native Notion headings, paragraphs and list blocks, with links preserved.
- [x] Extraction anchored on stable component ids, pinned by captured-DOM fixtures.
- [x] PDF/DOCX upload for CV, Application Letter and Other Documents.
- [x] Chrome extension icons and side-panel presentation.

JD preservation rules are stated in `PRD.md`; the reasoning behind them is in ADR-004 and ADR-007 of `decisions.md`. Verification commands are in the README.

## Next hardening work

- [ ] Add an explicit “Replace saved JD” action for existing duplicate records.
- [ ] Add fixtures for English-language LinkedIn and for numbered-list JDs; both are currently unpinned.
- [ ] Add end-to-end browser tests for search-page job switching.
- [ ] Chrome Web Store listing: privacy policy, store assets, and a first-run prompt pointing at Settings.
- [ ] Add a minimal OAuth-exchange server only if onboarding drop-off proves worse than the operational cost (see ADR-010).

## Out of scope

- Automatic job applications or form filling.
- LinkedIn messaging or account automation.
- Background crawling of job lists.
- AI rewriting, scoring or ranking of JDs.
- Resume or application-letter generation.
