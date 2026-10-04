// Verifies against the live Finch Sandbox that the app's access token cannot call
// /employer/payment or /employer/pay-statement.
//
// It creates two Gusto sandbox connections:
//   1. The app's token, with the same limited products the app requests.
//   2. A control token that also requests payment and pay_statement.
// The app's token must be rejected with 403, and the control token must not be.
// The control shows the 403 comes from token scope, not from a bad token or provider.
//
// Usage: npm run verify-scope

require('dotenv').config({ quiet: true });
const finch = require('../finch');

if (!process.env.FINCH_CLIENT_ID || !process.env.FINCH_CLIENT_SECRET) {
  console.error('Missing FINCH_CLIENT_ID or FINCH_CLIENT_SECRET. Copy .env.example to .env and fill them in.');
  process.exit(1);
}

const PROVIDER = 'gusto';
const AUTH_TYPE = 'oauth';

const CHECKS = [
  { label: 'GET  /employer/directory', path: '/employer/directory?limit=1' },
  { label: 'GET  /employer/payment', path: '/employer/payment?start_date=2020-01-01&end_date=2030-12-31', restricted: true },
  {
    label: 'POST /employer/pay-statement',
    path: '/employer/pay-statement',
    method: 'POST',
    // Any payment ID works: a granted token gets a per-item 404, a restricted one a 403.
    body: { requests: [{ payment_id: '00000000-0000-0000-0000-000000000000' }] },
    restricted: true,
  },
];

// Returns the HTTP status and Finch error name for a call, without throwing.
async function statusOf(token, { path, method, body }) {
  try {
    await finch.request(path, { token, method, body });
    return { status: 200, name: 'ok' };
  } catch (err) {
    if (!(err instanceof finch.FinchError)) throw err;
    return { status: err.status, name: err.name };
  }
}

async function probe(title, products, expectRestrictedBlocked) {
  const { access_token: token } = await finch.createSandboxConnection(PROVIDER, AUTH_TYPE, products);
  const { products: granted } = await finch.request('/introspect', { token });

  console.log(`\n${title}`);
  console.log(`  granted products: ${granted.join(', ')}`);

  let passed = true;
  for (const check of CHECKS) {
    const { status, name } = await statusOf(token, check);
    const shouldBlock = check.restricted && expectRestrictedBlocked;
    const ok = shouldBlock ? status === 403 : status !== 403;
    if (!ok) passed = false;
    const expected = shouldBlock ? 'expect 403' : 'expect allowed';
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${check.label.padEnd(30)} ${status} ${name}  (${expected})`);
  }
  return passed;
}

(async () => {
  const appPassed = await probe('App token', finch.PRODUCTS, true);
  const controlPassed = await probe('Control token (adds payment, pay_statement)', [
    ...finch.PRODUCTS,
    'payment',
    'pay_statement',
  ], false);

  const passed = appPassed && controlPassed;
  console.log(`\n${passed ? 'PASS' : 'FAIL'}: the app token ${passed ? 'cannot' : 'may be able to'} call payment or pay-statement.`);
  process.exit(passed ? 0 : 1);
})().catch((err) => {
  console.error('Verification failed to run:', err.status ?? '', err.message);
  process.exit(1);
});
