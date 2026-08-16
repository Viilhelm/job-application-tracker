# Notion setup

JobVault automatically creates a database named **Job Applications** with these properties:

| Property | Type | Required |
|---|---|---|
| Position | Title | Yes |
| Status | Select | Yes |
| Location | Text | No |
| Work Mode | Select | No — Remote / Hybrid / On-site |
| Company | Text | Yes |
| Employment Type | Select | No |
| Job URL | URL | Yes |
| CV | Files & media | For uploads |
| Applied Date | Date | No |
| Notes | Text | No |
| Application Letter | Files & media | For ML/CL uploads |
| Other Documents | Files & media | For uploads |
| Canonical URL | Text | Internal deduplication |
| Saved Date | Date | Yes |

Create a Notion internal integration with read, update, and insert-content capabilities. Create one blank parent page and connect the integration to it, then paste the token and the page URL into JobVault's Settings page and run the connection test.

On the first save, JobVault creates the database and caches its generated ids in `chrome.storage.sync`.

## Reusing an existing database

Paste it into the **Existing database ID or URL** field in Settings and JobVault writes to it instead of creating one. Open the database in Notion first; if it is inline inside another page, choose **Open as full page**, otherwise the copied link points at the parent page and Notion reports only "not found". Any of these forms is accepted:

```text
https://www.notion.so/me/Job-Applications-0a6958f70b1542c9a70ca2102de3ced7?v=2f8c89ac…
0a6958f7-0b15-42c9-a70c-a2102de3ced7
0a6958f70b1542c9a70ca2102de3ced7
```

The `?v=` value is a view id, not the database id, and is ignored. Changing this field clears the cached data-source id so the new database is resolved from scratch.

The JD is stored in each job page body as native Notion headings, paragraphs and list items, with its links intact. Its text and order come from the original JD without summarizing, translating or rewriting.

Notion view-column order is controlled by the Notion UI; the table above is only the order used when the database is first created. Rearranging, hiding or restyling columns in Notion is safe — startup migrations only add and remove properties, and never touch view state.
