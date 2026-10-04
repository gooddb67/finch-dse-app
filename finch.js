// Thin wrapper around the Finch REST API. This is the only module that talks to Finch.
// Docs: https://developer.tryfinch.com/api-reference

const BASE_URL = 'https://api.tryfinch.com';
const API_VERSION = '2020-09-17';

// Only the products this app needs. Because payment and pay_statement are not
// requested, the resulting token cannot call /employer/payment or /employer/pay-statement.
const PRODUCTS = ['company', 'directory', 'individual', 'employment'];

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
  const json = await res.json().catch(() => null);

  // 202 means the data isn't ready yet (assisted connections), so treat it as an error too.
  if (!res.ok || res.status === 202) {
    const err = new Error(json?.message || `Finch API returned HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

// GET /providers is unauthenticated; used to populate the provider dropdown.
function listProviders() {
  return request('/providers');
}

// POST /sandbox/connections authenticates with Basic auth (client_id:client_secret)
// and returns an access token for a new mock company on the chosen provider.
function createSandboxConnection(providerId, authenticationType) {
  const basicAuth = Buffer.from(
    `${process.env.FINCH_CLIENT_ID}:${process.env.FINCH_CLIENT_SECRET}`
  ).toString('base64');

  return request('/sandbox/connections', {
    method: 'POST',
    basicAuth,
    body: {
      provider_id: providerId,
      authentication_type: authenticationType,
      products: PRODUCTS,
    },
  });
}

function getCompany(token) {
  return request('/employer/company', { token });
}

// One page is enough for the sandbox's 20 mock employees.
async function getDirectory(token) {
  const data = await request('/employer/directory', { token });
  return data.individuals;
}

// /employer/individual and /employer/employment are batch endpoints: the record is
// inside responses[0].body, and each item has its own status code.
async function getBatchItem(path, token, individualId) {
  const data = await request(path, {
    method: 'POST',
    token,
    body: { requests: [{ individual_id: individualId }] },
  });

  const item = data.responses[0];
  if (item.code !== 200) {
    const err = new Error(item.body?.message || `Finch returned code ${item.code} for this employee`);
    err.status = item.code;
    throw err;
  }
  return item.body;
}

function getIndividual(token, individualId) {
  return getBatchItem('/employer/individual', token, individualId);
}

function getEmployment(token, individualId) {
  return getBatchItem('/employer/employment', token, individualId);
}

module.exports = {
  listProviders,
  createSandboxConnection,
  getCompany,
  getDirectory,
  getIndividual,
  getEmployment,
};
