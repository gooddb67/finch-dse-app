# Finch Sandbox Explorer

A small Node + Express web app with a React front end that connects to [Finch's Sandbox API](https://developer.tryfinch.com/implementation-guide/Test/Finch-Sandbox). Pick a payroll/HRIS provider and the app creates a sandbox connection, then shows that employer's **company** info and **employee directory**. Click an employee to see their **individual** and **employment** data.

## Requirements

- Node.js 20.19 or later (required by Vite, the React build tool)
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

`npm start` builds the React app into `client/dist`, then starts the server. Open http://localhost:3000. If port 3000 is already in use, the server exits with an `EADDRINUSE` message; set `PORT` in `.env` to use another port.

`.env` is listed in `.gitignore`, so credentials are never committed.

For front-end development with hot reload, run `node server.js` in one terminal and `npm run dev` in another, then open the URL Vite prints. Vite forwards `/api` requests to the Express server.

## Using the app

1. Choose a provider. The list comes from Finch's `GET /providers` endpoint.
2. Choose an authentication type. The app picks a non-assisted method by default.
3. Click **Connect**. Company info and the directory appear.
4. Click any employee to load their individual and employment details.

**Try this to see the custom error message:** choose **Workday** with **Credential**. That combination doesn't support the Company endpoint, so Finch returns `501` and the app shows a custom message. The directory still loads.

## How it works

```
Browser (client/)   ──►  Express server (server.js)  ──►  Finch API (finch.js)
   React, no token       holds token in memory           api.tryfinch.com
```

| Finch call | When |
| --- | --- |
| `GET /providers` | When the page loads |
| `POST /sandbox/connections` | When you click **Connect** |
| `GET /employer/company` and `GET /employer/directory` | Right after connecting |
| `POST /employer/individual` and `POST /employer/employment` | Right after the directory loads: one request each, covering every employee |

### Design decisions

- **Limited token scope.** The sandbox connection requests only `company`, `directory`, `individual`, and `employment`. Because `payment` and `pay_statement` aren't granted, Finch rejects the token on `/employer/payment` and `/employer/pay-statement` with `403 insufficient_scope_error`.
- **Token stays on the server.** The access token for the current connection is kept in a variable in `server.js`. The browser never receives it; it only calls our own `/api/...` routes. Connecting again replaces the token, and restarting the server clears it.
- **Null fields.** Every value goes through one formatter. `null`, missing values, empty strings, and empty lists all display as *Not provided*. Nested objects (address, income, manager) are handled the same way.
- **Unsupported endpoints.** When Finch returns `501 not_implemented_error`, the server replaces it with a message like *"Workday does not support the Company endpoint…"*. Each endpoint is fetched and reported separately, so one 501 doesn't block the rest of the page. Other errors show a general message that includes Finch's error.
- **Batched employee details.** Individual and employment are batch endpoints (up to 10,000 IDs per request). Right after the directory loads, the server requests every employee's individual and employment data in one request each and stores the results in memory, matched by `individual_id`. Clicking an employee then reads from that store and makes no Finch requests: connecting and viewing all 20 sandbox employees takes 5 Finch requests in total, where fetching on each click would take 43. This keeps the app well under Finch's rate limit of about 20 requests per minute. The records stay on the server, so the browser only receives the employee being viewed. If one employee's record fails, only that employee shows an error; if a whole request fails (for example, a `501`), every employee shows that error and the directory still works.
- **Finch Node SDK.** `finch.js` uses Finch's official SDK, which sets the API version header and the Basic/Bearer auth headers. Two adjustments: SDK retries are turned off, because the SDK retries every status of 500 or above, including `501`, which will never succeed; and a `202` response is treated as an error, because the SDK otherwise returns the "pending" message as if it were data.
- **Safe rendering.** React escapes all rendered text, and the app never uses `dangerouslySetInnerHTML`, so provider data can't inject HTML. Bank account numbers are masked to the last four digits. SSNs aren't requested at all.

## Project structure

```
server.js        Express routes, token storage, error messages
finch.js         Finch API client built on Finch's Node SDK (@tryfinch/finch-api)
client/          React front end (built with Vite)
  index.html       Page shell
  src/
    App.jsx          Provider selection, connection, page layout
    Company.jsx      Company section
    Directory.jsx    Employee table
    EmployeeDetails.jsx  Individual and employment data for one employee
    components.jsx   Field list and error box
    format.js        Formatters; null/empty values become "Not provided"
    api.js           Calls to our own server (never to Finch directly)
    styles.css       Basic styling
vite.config.mjs  Build config and dev proxy
.env.example     Template for credentials
```

## With more time

- **Per-user token storage.** Store tokens encrypted in a database, tied to a user session, instead of one variable for the whole server.
- **Production auth flow.** Use Finch Connect and the authorization-code exchange instead of the sandbox shortcut.
- **Scope check script.** Prove against the live sandbox that the token gets `403` on payment and pay-statement, compared with a control token that has those products.
- **More specific error messages.** Separate messages for `202` (data still syncing on assisted connections), `401` (reconnect needed), and `429` (rate limit).
- **Retries.** Re-enable the SDK's retries for temporary errors (`429`, `500`, `502`) while skipping `501`.
- **Caching.** Cache company and directory results so reconnecting to the same provider doesn't call Finch again, and don't cache temporary errors.
- **Directory pagination.** Request the directory page by page for employers with more employees than one page holds. It isn't needed in the sandbox: sandbox companies have at most 100 employees, which is the directory's default page size, so one request always returns everyone. A real employer with more than 100 employees would need it.
- **Webhooks.** Listen for data-sync events so assisted connections refresh automatically.
- **Field-support hints.** Use each provider's `supported_fields` from `/providers` to label a null as either "provider doesn't support this field" or "no data entered".
- **Tests.** Add automated tests for error handling and null rendering, using a mocked Finch API.
