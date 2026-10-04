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
| `POST /employer/individual` and `POST /employer/employment` | When you click an employee |

### Design decisions

- **Limited token scope.** The sandbox connection requests only `company`, `directory`, `individual`, and `employment`. Because `payment` and `pay_statement` aren't granted, Finch rejects the token on `/employer/payment` and `/employer/pay-statement` with `403 insufficient_scope_error`.
- **Token stays on the server.** The access token for the current connection is kept in a variable in `server.js`. The browser never receives it; it only calls our own `/api/...` routes. Connecting again replaces the token, and restarting the server clears it.
- **Null fields.** Every value goes through one formatter. `null`, missing values, empty strings, and empty lists all display as *Not provided*. Nested objects (address, income, manager) are handled the same way.
- **Unsupported endpoints.** When Finch returns `501 not_implemented_error`, the server replaces it with a message like *"Workday does not support the Company endpoint…"*. Each endpoint is fetched and reported separately, so one 501 doesn't block the rest of the page. Other errors show a general message that includes Finch's error.
- **Safe rendering.** React escapes all rendered text, and the app never uses `dangerouslySetInnerHTML`, so provider data can't inject HTML. Bank account numbers are masked to the last four digits. SSNs aren't requested at all.

## Project structure

```
server.js        Express routes, token storage, error messages
finch.js         Finch API client (all HTTP calls to Finch)
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
- **Caching.** Cache company, directory, and employee results so repeat clicks don't call Finch again, and don't cache temporary errors.
- **Directory pagination.** Request the directory page by page for employers with more employees than one page holds.
- **Webhooks.** Listen for data-sync events so assisted connections refresh automatically.
- **Field-support hints.** Use each provider's `supported_fields` from `/providers` to label a null as either "provider doesn't support this field" or "no data entered".
- **Tests.** Add automated tests for error handling and null rendering, using a mocked Finch API.
