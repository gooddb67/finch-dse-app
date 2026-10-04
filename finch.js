// Thin wrapper around the Finch REST API. This is the only module that talks to Finch.
// Docs: https://developer.tryfinch.com/api-reference

const BASE_URL = 'https://api.tryfinch.com';
const API_VERSION = '2020-09-17';

// Only the products this app needs. Because payment and pay_statement are not
// requested, the resulting token cannot call /employer/payment or /employer/pay-statement.
const PRODUCTS = ['company', 'directory', 'individual', 'employment'];

class FinchError extends Error {
  constructor(status, body) {
    super(body?.message || `Finch API returned HTTP ${status}`);
    this.status = status;
    this.name = body?.name || 'finch_error';
    this.finchCode = body?.finch_code || null;
  }
}

async function request(path, { method = 'GET', token, basicAuth, body } = {}) {
  const headers = { 'Finch-API-Version': API_VERSION };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (basicAuth) headers.Authorization = `Basic ${basicAuth}`;
  if (body) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Non-JSON error body (e.g. a gateway error page); fall through with json = null.
  }

  // 202 means the connection exists but data isn't ready yet (e.g. assisted connections).
  // The body is a status message, not data, so treat it like an error for the caller.
  if (!res.ok || res.status === 202) throw new FinchError(res.status, json);
  return json;
}

// GET /providers is unauthenticated; used to populate the provider dropdown.
function listProviders() {
  return request('/providers');
}

// POST /sandbox/connections authenticates with Basic auth (client_id:client_secret)
// and returns an access token for a new mock company on the chosen provider.
// `products` defaults to the app's limited scope; scripts/verify-scope.js overrides it
// to create a control token.
function createSandboxConnection(providerId, authenticationType, products = PRODUCTS) {
  const basicAuth = Buffer.from(
    `${process.env.FINCH_CLIENT_ID}:${process.env.FINCH_CLIENT_SECRET}`
  ).toString('base64');

  return request('/sandbox/connections', {
    method: 'POST',
    basicAuth,
    body: {
      provider_id: providerId,
      authentication_type: authenticationType,
      products,
    },
  });
}

function getCompany(token) {
  return request('/employer/company', { token });
}

// The directory is paginated: keep requesting pages until we've collected
// paging.count individuals (or a page comes back empty).
async function getFullDirectory(token) {
  const limit = 100;
  const individuals = [];
  let offset = 0;

  while (true) {
    const page = await request(`/employer/directory?limit=${limit}&offset=${offset}`, { token });
    const batch = page.individuals || [];
    individuals.push(...batch);
    offset += batch.length;
    if (batch.length === 0 || offset >= (page.paging?.count ?? 0)) break;
  }

  return individuals;
}

// /employer/individual and /employer/employment are batch endpoints. Each item in
// `responses` has its own `code`, so one employee can fail even when the HTTP call succeeds.
async function getBatchItem(path, token, individualId) {
  const data = await request(path, {
    method: 'POST',
    token,
    body: { requests: [{ individual_id: individualId }] },
  });

  const item = data.responses?.[0];
  if (!item) throw new FinchError(404, { message: 'No record returned for this employee.' });
  if (item.code !== 200) throw new FinchError(item.code, item.body);
  return item.body;
}

function getIndividual(token, individualId) {
  return getBatchItem('/employer/individual', token, individualId);
}

function getEmployment(token, individualId) {
  return getBatchItem('/employer/employment', token, individualId);
}

module.exports = {
  FinchError,
  PRODUCTS,
  request,
  listProviders,
  createSandboxConnection,
  getCompany,
  getFullDirectory,
  getIndividual,
  getEmployment,
};
