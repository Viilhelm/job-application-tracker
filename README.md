# JobVault

A Chrome/Edge side-panel extension that saves the LinkedIn job you are looking at into your own Notion database — the full job description included, with its original headings, lists and links intact.

There is no server. The extension calls the Notion API directly from your browser using your own integration token, so your job-search data never passes through anyone else's infrastructure.

## What it does

- Reads the job currently open on LinkedIn: company, position, location, work mode, employment type and the complete description.
- Follows the selected job on two-pane search pages, updating as you click through results.
- Saves the description as native Notion blocks — headings stay headings, lists stay lists, links stay clickable.
- Normalizes the messy URL into `linkedin.com/jobs/view/<id>` and refuses to create a second row for a job you already saved.
- Tracks status, applied date and notes, and attaches the CV and application letter you actually sent.
- Attaches correspondence: open a message in Gmail or Outlook on the web, pick which application it belongs to, and the sender, date and full text are appended to that job's Notion page as a timeline. Rejection reason is a dropdown you choose — never guessed from the text.

Everything extracted is shown in the panel for review before anything is written.

### What it does not do

It does not apply to jobs, fill forms, message anyone, crawl result lists, or automate your account. It reads the one job you are looking at, when you open the panel. It never rewrites, summarizes or translates a description.

Email capture is the same shape: it reads the single message open in the reading pane, only while the panel is open, and never enumerates a mailbox. Chrome will nonetheless warn that the extension can read all data on `mail.google.com` and `outlook.*` — that is the permission Chrome grants for a content script on those hosts, and it is the honest cost of the feature. If you do not want it, delete the second entry from `content_scripts` and the mail hosts from `host_permissions` in `extension/public/manifest.json` and rebuild; everything else keeps working.

## Install

```powershell
cd extension
npm install
npm run build
```

Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `extension/dist`. After any rebuild, reload the extension and refresh open LinkedIn tabs.

## Connect Notion

1. Create an internal integration at [notion.so/profile/integrations](https://www.notion.so/profile/integrations) and copy its token.
2. Create a blank Notion page to hold the tracker.
3. On that page choose **Connections** and connect your integration to it.
4. Open JobVault's Settings, paste the token and the page URL, then **Save & test connection**.

JobVault creates the **Job Applications** database on the first save. To keep using a database you already have, paste it into the *Existing database ID or URL* field instead — see [Docs/notion-setup.md](Docs/notion-setup.md) for the schema and for how to copy a database link correctly.

Your token is stored in `chrome.storage.local`: local to that browser, never synced, and sent only to `api.notion.com`.

## How it works

```text
LinkedIn job page
   │  content script, scoped to linkedin.com/jobs/*
   ▼
Side panel (React + TypeScript)
   │  Notion REST API, called directly
   ▼
Your Notion workspace
```

LinkedIn ships build-hashed CSS class names that change on every deploy, so extraction is anchored on stable component ids such as `JobDetails_AboutTheJob_<id>` and on document structure, never on class names. Each supported markup variant is pinned by a real captured-DOM fixture in `extension/src/adapters/__fixtures__/`, so a regression shows up as a failing test rather than as a silently empty field.

The description is read from the DOM's own structure, and the saved plain text is generated from the saved blocks — one source, so the two cannot drift apart.

Design decisions and their reasoning live in [Docs/decisions.md](Docs/decisions.md); the implementation detail is in [Docs/TECH_SPEC.md](Docs/TECH_SPEC.md).

## Development

```powershell
cd extension
npm run lint
npm run typecheck
npm test -- --run
npm run build
```

Changes to extraction need a captured-DOM fixture. jsdom does not implement `innerText`, so any code path reading it is untestable, and a test that fakes it proves nothing about the browser.

## Repository layout

```text
extension/   the whole application
  src/adapters/    LinkedIn and webmail extraction + DOM fixtures
  src/lib/         Notion client, domain types
  src/popup/       side panel
  src/options/     settings page
Docs/        PRD, tech spec, architecture decisions, Notion schema, privacy
```

## Privacy

Job data goes from your browser straight to your Notion workspace. No analytics, no advertising, no third-party server. See [Docs/privacy.md](Docs/privacy.md).
