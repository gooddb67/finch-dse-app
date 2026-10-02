# Finch Sandbox Explorer

A small Node + Express web app that connects to [Finch's Sandbox API](https://developer.tryfinch.com/implementation-guide/Test/Finch-Sandbox). Pick a payroll/HRIS provider and the app creates a sandbox connection, then shows that employer's **company** info and **employee directory**. Click an employee to see their **individual** and **employment** data.

## Requirements

- Node.js 18 or later (uses the built-in `fetch`)
- A Finch developer account with **sandbox** credentials ([sign up](https://dashboard.tryfinch.com/signup))

## Setup and run

```bash
git clone <this-repo-url>
cd finch-challenge
npm install
cp .env.example .env
```

Edit `.env` and paste in your sandbox `client_id` and `client_secret` from the Finch Dashboard. Then:

```bash
npm start
```

Open http://localhost:3000.

`.env` is listed in `.gitignore`, so credentials are never committed.

## Using the app

1. Choose a provider. The list comes from Finch's `GET /providers` endpoint.
2. Choose an authentication type. The app picks a non-assisted method by default.
3. Click **Connect**. Company info and the directory appear.
4. Click any employee to load their individual and employment details.

**Try these to see error handling:**
- **Paylocity** with **Api token**, or **Workday** with **Credential**: these methods don't support the Company endpoint, so Finch returns `501` and the app shows a custom message. The directory still loads.
- Any provider with **Assisted**: sandbox assisted connections start as "pending", so Finch returns `202`. The app shows a "still syncing" message.

## How it works

```
Browser (public/)  ──►  Express server (server.js)  ──►  Finch API (finch.js)
   no token              holds token in memory           api.tryfinch.com
```

| Finch call | When |
| --- | --- |
| `GET /providers` | Once, at first page load (cached) |
| `POST /sandbox/connections` | Once per provider + auth type |
| `GET /employer/company` | Once per connection (cached) |
| `GET /employer/directory` | Once per connection, all pages (cached) |
| `POST /employer/individual` and `POST /employer/employment` | Once per employee, on first click (cached) |

### Design decisions

- **Limited token scope.** The sandbox connection requests only `company`, `directory`, `individual`, and `employment`. Because `payment` and `pay_statement` aren't granted, the token can't call `/employer/payment` or `/employer/pay-statement`.
- **Token stays on the server.** Access tokens live in an in-memory `Map` in `server.js`. The browser sends only a provider ID and auth type, and the server looks up the token. Restarting the server clears all tokens.
- **Null fields.** Every value goes through one formatter. `null`, missing values, empty strings, and empty lists all display as *Not provided*. Nested objects (address, income, manager) are handled the same way.
- **Unsupported endpoints.** When Finch returns `501 not_implemented_error`, the server replaces it with a message like *"Paylocity does not support the Company endpoint…"*. Each endpoint is fetched and reported separately, so one 501 doesn't block the rest of the page. `202`, `401`, and `429` also get specific messages.
- **Directory pagination.** The server requests 100 records at a time, increasing `offset` until it has collected `paging.count` records.
- **Caching.** Successful results and 501s are cached, because a provider won't start supporting an endpoint mid-session. Temporary errors (202, 429, 5xx) are not cached, so the next click retries.
- **Safe rendering.** Data is inserted with `textContent`, never `innerHTML`, so provider data can't inject HTML. Bank account numbers are masked to the last four digits. SSNs aren't requested at all.

## Project structure

```
server.js        Express routes, token store, caching, error messages
finch.js         Finch API client (all HTTP calls to Finch)
public/
  index.html     Page layout
  app.js         UI logic and field rendering
  styles.css     Basic styling
.env.example     Template for credentials
```

## With more time

- **Persistent, per-user token storage.** Store tokens encrypted in a database, tied to a user session, instead of one in-memory map for the whole server.
- **Production auth flow.** Use Finch Connect and the authorization-code exchange instead of the sandbox shortcut.
- **Webhooks.** Listen for data-sync events so assisted connections (202) refresh automatically instead of needing a retry.
- **Field-support hints.** Use each provider's `supported_fields` from `/providers` to label a null as either "provider doesn't support this field" or "no data entered".
- **Tests.** Add automated tests for pagination, error mapping, and null rendering, using a mocked Finch API.
- **Larger directories.** Add search, client-side pagination, and batch-fetching of individual/employment records.
