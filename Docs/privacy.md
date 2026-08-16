# Privacy

JobVault sends the currently displayed job details and user-selected documents from your browser straight to `api.notion.com`, using your own Notion integration token. No other server takes part, and the project operates no backend that could see your data.

The token is stored in `chrome.storage.local`. That is device-local and does not sync to your other browsers. It is sent only to Notion, and only as an `Authorization` header. It must never be committed to the repository.

The project contains no analytics, advertising or sale/sharing of job-search data.

## LinkedIn access

The extension content script is restricted to `https://www.linkedin.com/jobs/*`. When JobVault is open, it may read:

- the current job ID and URL;
- company and position;
- visible location, work mode and employment type;
- the full currently displayed JD, its structure and the links it contains.

It does not crawl job-result lists, access unrelated LinkedIn pages, submit applications, send messages, follow people, change account data or automate navigation. Extracted fields remain reviewable before saving.
