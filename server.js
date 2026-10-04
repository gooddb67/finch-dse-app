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

// Individual + employment data for every employee, fetched in one batch when connecting.
// individual_id -> { individual, employment }, each { data } or { error }.
// Kept on the server so the browser only receives the employee being viewed.
let employees = new Map();

// The error shape the browser shows. A 501 gets the custom "not supported" message.
function errorResult(label, status, message) {
  console.warn(`[finch] ${label} failed:`, status, message);
  return {
    error: {
      status,
      message: status === 501
        ? `${providerName} does not support the ${label} endpoint, so this information isn't available.`
        : `Couldn't load ${label.toLowerCase()} data: ${message}`,
    },
  };
}

// Run one Finch call and return { data } or { error }, so one failing endpoint
// (e.g. a 501 on company) doesn't stop the rest of the page from loading.
async function settle(label, fn) {
  try {
    return { data: await fn() };
  } catch (err) {
    return errorResult(label, err.status, err.message);
  }
}

// Pick one employee's result out of a settled batch call. If the whole request failed
// (e.g. a 501 or 429), every employee gets that error. Otherwise each item has its
// own code, so one employee can fail while the rest succeed.
function resultFor(label, batch, itemsById, individualId) {
  if (batch.error) return batch;
  const item = itemsById.get(individualId);
  if (!item) return errorResult(label, 404, 'No record was returned for this employee');
  if (item.code !== 200) return errorResult(label, item.code, item.body?.message || `Finch returned code ${item.code}`);
  return { data: item.body };
}

// Fetch individual + employment data for all employees: two requests in total,
// no matter how many employees. Results are matched by individual_id, not by position.
async function loadEmployees(individualIds) {
  const [individuals, employments] = await Promise.all([
    settle('Individual', () => finch.getIndividuals(accessToken, individualIds)),
    settle('Employment', () => finch.getEmployments(accessToken, individualIds)),
  ]);
  const byId = (batch) => new Map((batch.data || []).map((item) => [item.individual_id, item]));
  const individualsById = byId(individuals);
  const employmentsById = byId(employments);

  return new Map(individualIds.map((id) => [id, {
    individual: resultFor('Individual', individuals, individualsById, id),
    employment: resultFor('Employment', employments, employmentsById, id),
  }]));
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
  employees = new Map();
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

  // Once we have the employee IDs, prefetch everyone's details in one batch.
  if (directory.data?.length) {
    employees = await loadEmployees(directory.data.map((e) => e.id));
  }
  res.json({ company, directory });
});

// Individual + employment data for one employee, from the batch fetched at connect time.
app.get('/api/employees/:individualId', (req, res) => {
  const record = employees.get(req.params.individualId);
  if (!record) {
    return res.status(404).json({ error: { message: 'Employee not found. Connect to a provider first.' } });
  }
  res.json(record);
});

const port = process.env.PORT || 3000;
app.listen(port, (err) => {
  if (err) {
    console.error(`Couldn't start on port ${port}: ${err.message}`);
    process.exit(1);
  }
  console.log(`Finch demo running at http://localhost:${port}`);
});
