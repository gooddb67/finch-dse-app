// Thin wrapper around Finch's official Node SDK (@tryfinch/finch-api). This is the
// only module that talks to Finch. Docs: https://developer.tryfinch.com/api-reference
//
// The SDK sends the Finch-API-Version header, builds the Basic/Bearer Authorization
// headers, and throws an error with `status` set for any 4xx/5xx response.
const Finch = require('@tryfinch/finch-api').default;

// Only the products this app needs. Because payment and pay_statement are not
// requested, the resulting token cannot call /employer/payment or /employer/pay-statement.
const PRODUCTS = ['company', 'directory', 'individual', 'employment'];

// Reads FINCH_CLIENT_ID and FINCH_CLIENT_SECRET from the environment.
// Retries are off: the SDK retries every status >= 500, including 501 "not implemented",
// which only repeats a request that will never succeed.
const client = new Finch({ maxRetries: 0 });

// The SDK returns a 202 as if it were data. A 202 means the data isn't ready yet
// (assisted connections), so treat it as an error like the other non-data responses.
async function dataOrThrow(apiPromise) {
  const { data, response } = await apiPromise.withResponse();
  if (response.status === 202) {
    const err = new Error(data.message || 'Data is still being prepared');
    err.status = 202;
    throw err;
  }
  return data;
}

// GET /providers needs no access token, but the SDK expects one, so explicitly
// omit the Authorization header. Used to populate the provider dropdown.
async function listProviders() {
  const page = await client.providers.list({ headers: { Authorization: null } });
  return page.items;
}

// POST /sandbox/connections authenticates with Basic auth (client_id:client_secret)
// and returns an access token for a new mock company on the chosen provider.
function createSandboxConnection(providerId, authenticationType) {
  return client.sandbox.connections.create({
    provider_id: providerId,
    authentication_type: authenticationType,
    products: PRODUCTS,
  });
}

// Data calls use Bearer auth with the connection's access token.
function getCompany(token) {
  return dataOrThrow(client.withAccessToken(token).hris.company.retrieve());
}

// One page is enough for the sandbox's 20 mock employees.
async function getDirectory(token) {
  const page = await dataOrThrow(client.withAccessToken(token).hris.directory.list());
  return page.individuals;
}

// /employer/individual and /employer/employment are batch endpoints: one request can ask
// for up to 10,000 employees. Finch returns one item per employee, each with its own
// status code: { individual_id, code, body }. The caller checks each item's code.
async function getIndividuals(token, individualIds) {
  const page = await dataOrThrow(
    client.withAccessToken(token).hris.individuals.retrieveMany({
      requests: individualIds.map((id) => ({ individual_id: id })),
    })
  );
  return page.responses;
}

async function getEmployments(token, individualIds) {
  const page = await dataOrThrow(
    client.withAccessToken(token).hris.employments.retrieveMany({
      requests: individualIds.map((id) => ({ individual_id: id })),
    })
  );
  return page.responses;
}

module.exports = {
  listProviders,
  createSandboxConnection,
  getCompany,
  getDirectory,
  getIndividuals,
  getEmployments,
};
