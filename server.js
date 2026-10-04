require('dotenv').config({ quiet: true });
const path = require('path');
const express = require('express');
const finch = require('./finch');

if (!process.env.FINCH_CLIENT_ID || !process.env.FINCH_CLIENT_SECRET) {
  console.error('Missing FINCH_CLIENT_ID or FINCH_CLIENT_SECRET. Copy .env.example to .env and fill them in.');
  process.exit(1);
}

const app = express();
app.use(express.json());
// Serve the built React app (npm start runs `vite build` first).
app.use(express.static(path.join(__dirname, 'client', 'dist')));

// The access token for the current connection. It lives only here, in server memory,
// and is never sent to the browser. Connecting again replaces it; restarting clears it.
let accessToken = null;
let providerName = null; // for error messages, e.g. "Workday does not support..."

// Run one Finch call and return { data } or { error }, so one failing endpoint
// (e.g. a 501 on company) doesn't stop the rest of the page from loading.
async function settle(label, fn) {
  try {
    return { data: await fn() };
  } catch (err) {
    console.warn(`[finch] ${label} failed:`, err.status, err.message);
    const message = err.status === 501
      ? `${providerName} does not support the ${label} endpoint, so this information isn't available.`
      : `Couldn't load ${label.toLowerCase()} data: ${err.message}`;
    return { error: { status: err.status, message } };
  }
}

app.get('/api/providers', async (req, res) => {
  const providers = await finch.listProviders();
  res.json(
    providers
      .filter((p) => p.authentication_methods?.length)
      .map((p) => ({
        id: p.id,
        displayName: p.display_name,
        authenticationTypes: p.authentication_methods.map((m) => m.type),
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
  );
});

// Create a sandbox connection for the chosen provider, then return company + directory.
app.post('/api/connect', async (req, res) => {
  const { providerId, authType } = req.body;
  providerName = req.body.providerName;
  try {
    const connection = await finch.createSandboxConnection(providerId, authType);
    accessToken = connection.access_token;
  } catch (err) {
    accessToken = null;
    return res.status(502).json({ error: { message: `Couldn't create a sandbox connection: ${err.message}` } });
  }

  const [company, directory] = await Promise.all([
    settle('Company', () => finch.getCompany(accessToken)),
    settle('Directory', () => finch.getDirectory(accessToken)),
  ]);
  res.json({ company, directory });
});

// Individual + employment data for one employee.
app.get('/api/employees/:individualId', async (req, res) => {
  if (!accessToken) {
    return res.status(400).json({ error: { message: 'Connect to a provider first.' } });
  }
  const { individualId } = req.params;
  const [individual, employment] = await Promise.all([
    settle('Individual', () => finch.getIndividual(accessToken, individualId)),
    settle('Employment', () => finch.getEmployment(accessToken, individualId)),
  ]);
  res.json({ individual, employment });
});

const port = process.env.PORT || 3000;
app.listen(port, (err) => {
  if (err) {
    console.error(`Couldn't start on port ${port}: ${err.message}`);
    process.exit(1);
  }
  console.log(`Finch demo running at http://localhost:${port}`);
});
