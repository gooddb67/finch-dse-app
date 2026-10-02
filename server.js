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
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// Server-side state. Access tokens live only here, in process memory; they are
// never sent to the browser. Restarting the server clears everything.
//
// connections: "providerId:authType" -> {
//   tokenPromise, providerName,
//   results: Map("company" | "directory" -> settled result),
//   employees: Map(individualId -> { individual, employment })
// }
// ---------------------------------------------------------------------------
const connections = new Map();
let providersCache = null;

const ENDPOINT_LABELS = {
  company: 'Company',
  directory: 'Directory',
  individual: 'Individual',
  employment: 'Employment',
};

// Turn a Finch error into a message that's safe and useful to show a user.
function toClientError(err, endpoint, providerName) {
  const label = ENDPOINT_LABELS[endpoint] || endpoint;
  const status = err instanceof finch.FinchError ? err.status : 500;

  let message;
  switch (status) {
    case 501:
      message = `${providerName} does not support the ${label} endpoint, so this information isn't available for this connection.`;
      break;
    case 202:
      message = `${providerName} is still syncing ${label.toLowerCase()} data. Please try again later.`;
      break;
    case 401:
      message = `The connection to ${providerName} is no longer authorized. Reconnect to continue.`;
      break;
    case 429:
      message = `Rate limit reached while loading ${label.toLowerCase()} data. Please wait a moment and try again.`;
      break;
    default:
      message = `Couldn't load ${label.toLowerCase()} data from ${providerName}: ${err.message}`;
  }

  return { status, type: err.name, finchCode: err.finchCode || null, message };
}

// Run a Finch call and return { data } or { error } instead of throwing, so one
// failing endpoint (e.g. a 501 on company) doesn't block the others.
async function settle(endpoint, providerName, fn) {
  try {
    return { data: await fn() };
  } catch (err) {
    console.warn(`[finch] ${endpoint} failed for ${providerName}:`, err.status, err.name, err.message);
    return { error: toClientError(err, endpoint, providerName) };
  }
}

// Successes and 501s are stable, so they're cached. Transient failures
// (202, 429, 5xx, network) are not, so the next request retries.
function isCacheable(result) {
  return !result.error || result.error.status === 501;
}

async function getProviders() {
  if (!providersCache) {
    const providers = await finch.listProviders();
    providersCache = providers
      .filter((p) => p.authentication_methods?.length)
      .map((p) => ({
        id: p.id,
        displayName: p.display_name,
        authenticationTypes: p.authentication_methods.map((m) => m.type),
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }
  return providersCache;
}

// Get the connection for a provider + auth method, creating the sandbox token
// only the first time. Storing the promise (not just the token) means two
// simultaneous clicks still create only one connection.
async function getConnection(providerId, authType) {
  const key = `${providerId}:${authType}`;
  let conn = connections.get(key);

  if (!conn) {
    const providers = await getProviders();
    const provider = providers.find((p) => p.id === providerId);
    conn = {
      providerName: provider.displayName,
      tokenPromise: finch.createSandboxConnection(providerId, authType).then((r) => r.access_token),
      results: new Map(),
      employees: new Map(),
    };
    connections.set(key, conn);
    // If token creation fails, forget it so the user can retry.
    conn.tokenPromise.catch(() => connections.delete(key));
  }

  return conn;
}

async function cachedResult(conn, endpoint, loader) {
  if (conn.results.has(endpoint)) return conn.results.get(endpoint);
  const token = await conn.tokenPromise;
  const result = await settle(endpoint, conn.providerName, () => loader(token));
  if (isCacheable(result)) conn.results.set(endpoint, result);
  return result;
}

// Validate provider/auth params against the real provider list before doing anything.
async function validateSelection(req, res, next) {
  const { providerId, authType } = req.params;
  const provider = (await getProviders()).find((p) => p.id === providerId);
  if (!provider || !provider.authenticationTypes.includes(authType)) {
    return res.status(400).json({ error: { message: 'Unknown provider or authentication type.' } });
  }
  next();
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get('/api/providers', async (req, res) => {
  res.json(await getProviders());
});

// Connect to a provider and return company + directory in one round trip.
app.post('/api/connections/:providerId/:authType', validateSelection, async (req, res) => {
  const { providerId, authType } = req.params;
  const conn = await getConnection(providerId, authType);

  try {
    await conn.tokenPromise;
  } catch (err) {
    console.warn('[finch] sandbox connection failed:', err.status, err.message);
    return res.status(502).json({
      error: { message: `Couldn't create a sandbox connection for ${conn.providerName}: ${err.message}` },
    });
  }

  const [company, directory] = await Promise.all([
    cachedResult(conn, 'company', finch.getCompany),
    cachedResult(conn, 'directory', finch.getFullDirectory),
  ]);

  res.json({ providerName: conn.providerName, company, directory });
});

// Individual + employment data for one employee, fetched on click and cached.
app.get('/api/connections/:providerId/:authType/employees/:individualId', validateSelection, async (req, res) => {
  const { providerId, authType, individualId } = req.params;
  const conn = connections.get(`${providerId}:${authType}`);
  if (!conn) {
    return res.status(404).json({ error: { message: 'Not connected to this provider yet.' } });
  }

  // Only allow lookups for employees that appear in this connection's directory.
  const directory = conn.results.get('directory');
  if (!directory?.data?.some((e) => e.id === individualId)) {
    return res.status(404).json({ error: { message: 'Employee not found in this directory.' } });
  }

  const cached = conn.employees.get(individualId);
  if (cached) return res.json(cached);

  const token = await conn.tokenPromise;
  const [individual, employment] = await Promise.all([
    settle('individual', conn.providerName, () => finch.getIndividual(token, individualId)),
    settle('employment', conn.providerName, () => finch.getEmployment(token, individualId)),
  ]);

  const result = { individual, employment };
  if (isCacheable(individual) && isCacheable(employment)) conn.employees.set(individualId, result);
  res.json(result);
});

// Catch-all error handler (Express 5 forwards rejected async handlers here).
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: { message: 'Unexpected server error. Check the server logs.' } });
});

const port = process.env.PORT || 3000;
// Express 5 passes listen errors (e.g. EADDRINUSE) to this callback instead of throwing.
app.listen(port, (err) => {
  if (err) {
    console.error(`Couldn't start on port ${port}: ${err.message}`);
    process.exit(1);
  }
  console.log(`Finch demo running at http://localhost:${port}`);
});
