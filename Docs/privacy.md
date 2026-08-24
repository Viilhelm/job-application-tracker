# Privacy

JobVault sends the currently displayed job details and user-selected documents from your browser straight to `api.notion.com`, using your own Notion integration token. No other server takes part, and the project operates no backend that could see your data.

The token is stored in `chrome.storage.local`. That is device-local and does not sync to your other browsers. It is sent only to Notion, and only as an `Authorization` header. It must never be committed to the repository.

The project contains no analytics, advertising or sale/sharing of job-search data.

## Mail access

The content script runs on `mail.google.com`, `outlook.live.com`, `outlook.office.com` and `outlook.office365.com`. When JobVault is open on one of those tabs it reads the single message shown in the reading pane: sender name and address, subject, date and body. It does not read the message list, search the mailbox, open other messages, send mail or change any setting.

Captured messages are written only to the job page you pick, in your own Notion workspace. Chrome describes this permission as reading all your data on those sites, because that is the granularity Chrome offers; the narrower behaviour above is enforced by the code, not by the permission.

## LinkedIn access

The extension content script is restricted to `https://www.linkedin.com/jobs/*`. When JobVault is open, it may read:

- the current job ID and URL;
- company and position;
- visible location, work mode and employment type;
- the full currently displayed JD, its structure and the links it contains.

It does not crawl job-result lists, access unrelated LinkedIn pages, submit applications, send messages, follow people, change account data or automate navigation. Extracted fields remain reviewable before saving.
