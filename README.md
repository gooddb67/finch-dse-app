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

## Using the app

1. Choose a provider. The list comes from Finch's `GET /providers` endpoint.
2. Choose an authentication type.
3. Click **Connect**. Company info and the directory appear.
4. Click any employee to load their individual and employment details.

**To see a custom error message:** choose **Workday** with **Credential**. That combination doesn't support the Company endpoint, so Finch returns `501` and the app shows a custom message. The directory still loads.

## With more time

- **Disconnect tokens that are no longer needed.** Finch access tokens don't expire, so the app should call `POST /disconnect` before discarding one (when reconnecting, or when a customer leaves) and then delete it. Right now the old token is just overwritten, so its connection stays live in Finch.
- **More specific error messages.** Separate messages for `202` (data still syncing on assisted connections), `401` (reconnect needed), and `429` (rate limit).
- **Caching.** Cache company and directory results so reconnecting to the same provider doesn't call Finch again.
- **Directory pagination.** Request the directory page by page for employers with more employees than one page holds. It isn't needed in the sandbox since sandbox companies have at most 100 employees, which is the directory's default page size, so one request always returns the full amount. A real employer with more than 100 employees would need it.
- **Loading spinner.** Indicate to user that data is being fetched. 
