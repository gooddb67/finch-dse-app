// Front end for the Finch Sandbox Explorer. It only talks to our own server
// (/api/...). The server holds the Finch access token, so the browser never sees it.

const NOT_PROVIDED = 'Not provided';

const els = {
  form: document.getElementById('connect-form'),
  provider: document.getElementById('provider-select'),
  auth: document.getElementById('auth-select'),
  button: document.getElementById('connect-button'),
  status: document.getElementById('connect-status'),
  results: document.getElementById('results'),
  company: document.getElementById('company'),
  directory: document.getElementById('directory'),
  directoryCount: document.getElementById('directory-count'),
  employee: document.getElementById('employee'),
};

let providers = [];
let current = null; // { providerId, authType, directoryById }

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

async function api(url, options) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error?.message || `Request failed (${res.status})`);
  return body;
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'text') node.textContent = value;
    else if (key === 'class') node.className = value;
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) if (child) node.append(child);
  return node;
}

function isEmpty(value) {
  return value === null || value === undefined || value === '' ||
    (Array.isArray(value) && value.length === 0);
}

// Formatters return a string, an array of strings (one per line), or null.
// null/empty always renders as "Not provided".
const fmt = {
  text: (v) => (isEmpty(v) ? null : String(v)),
  enum: (v) => (isEmpty(v) ? null : String(v).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())),
  bool: (v) => (v === true ? 'Yes' : v === false ? 'No' : null),
  name: (p) => {
    const parts = [p?.first_name, p?.middle_name, p?.last_name].filter((x) => !isEmpty(x));
    return parts.length ? parts.join(' ') : null;
  },
  address: (a) => {
    if (!a) return null;
    const cityLine = [a.city, a.state].filter((x) => !isEmpty(x)).join(', ');
    const parts = [a.name, a.line1, a.line2, [cityLine, a.postal_code].filter(Boolean).join(' '), a.country]
      .filter((x) => !isEmpty(x));
    return parts.length ? parts.join(', ') : null;
  },
  money: (cents, currency) => {
    if (isEmpty(cents)) return null;
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: (currency || 'usd').toUpperCase() })
        .format(cents / 100);
    } catch {
      return `${(cents / 100).toFixed(2)} ${currency || ''}`.trim();
    }
  },
  income: (inc) => {
    if (!inc || isEmpty(inc.amount)) return null;
    const pieces = [fmt.money(inc.amount, inc.currency)];
    if (inc.unit) pieces.push(`(${fmt.enum(inc.unit).toLowerCase()})`);
    if (inc.effective_date) pieces.push(`effective ${inc.effective_date}`);
    return pieces.join(' ');
  },
  masked: (v) => (isEmpty(v) ? null : `••••${String(v).slice(-4)}`),
};

// Render label/value pairs as a definition list, one row per field.
function fieldList(rows) {
  const dl = el('dl', { class: 'fields' });
  for (const [label, value] of rows) {
    const dd = el('dd');
    if (isEmpty(value)) {
      dd.append(el('span', { class: 'not-provided', text: NOT_PROVIDED }));
    } else {
      for (const line of [].concat(value)) dd.append(el('div', { text: line }));
    }
    dl.append(el('dt', { text: label }), dd);
  }
  return dl;
}

function errorBox(error) {
  const box = el('div', { class: 'error', role: 'alert' }, [el('span', { text: error.message })]);
  if (error.status) {
    const detail = [`HTTP ${error.status}`, error.type, error.finchCode].filter(Boolean).join(' · ');
    box.append(el('small', { text: detail }));
  }
  return box;
}

function managerName(manager) {
  if (!manager?.id) return null;
  const m = current.directoryById.get(manager.id);
  return (m && fmt.name(m)) || null;
}

// ---------------------------------------------------------------------------
// Provider selection
// ---------------------------------------------------------------------------

async function loadProviders() {
  try {
    providers = await api('/api/providers');
    els.provider.replaceChildren(el('option', { value: '', text: 'Select a provider…' }));
    for (const p of providers) els.provider.append(el('option', { value: p.id, text: p.displayName }));
  } catch (err) {
    els.provider.replaceChildren(el('option', { value: '', text: 'Could not load providers' }));
    els.status.textContent = err.message;
  }
}

els.provider.addEventListener('change', () => {
  const provider = providers.find((p) => p.id === els.provider.value);
  els.auth.replaceChildren();
  if (!provider) {
    els.auth.disabled = els.button.disabled = true;
    return;
  }
  for (const type of provider.authenticationTypes) {
    els.auth.append(el('option', { value: type, text: fmt.enum(type) }));
  }
  // Default to a non-assisted method; assisted connections start "pending" and return 202s.
  els.auth.value = provider.authenticationTypes.find((t) => t !== 'assisted') || provider.authenticationTypes[0];
  els.auth.disabled = els.button.disabled = false;
});

els.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const providerId = els.provider.value;
  const authType = els.auth.value;
  const providerName = els.provider.selectedOptions[0].textContent;

  els.button.disabled = true;
  els.status.textContent = `Connecting to ${providerName}…`;

  try {
    const data = await api(`/api/connections/${encodeURIComponent(providerId)}/${encodeURIComponent(authType)}`, {
      method: 'POST',
    });
    const directory = data.directory.data || [];
    current = { providerId, authType, directoryById: new Map(directory.map((e) => [e.id, e])) };

    renderCompany(data.company);
    renderDirectory(data.directory);
    els.employee.replaceChildren(el('p', { class: 'muted', text: 'Select an employee from the directory.' }));
    els.results.hidden = false;
    els.status.textContent = `Connected to ${data.providerName} (${fmt.enum(authType)}).`;
  } catch (err) {
    els.results.hidden = true;
    els.status.replaceChildren(errorBox({ message: err.message }));
  } finally {
    els.button.disabled = false;
  }
});

// ---------------------------------------------------------------------------
// Company
// ---------------------------------------------------------------------------

function renderCompany({ data: c, error }) {
  if (error) return els.company.replaceChildren(errorBox(error));

  const content = [
    fieldList([
      ['Legal name', fmt.text(c.legal_name)],
      ['Company ID', fmt.text(c.id)],
      ['EIN', fmt.text(c.ein)],
      ['Entity type', fmt.enum(c.entity?.type)],
      ['Entity subtype', fmt.enum(c.entity?.subtype)],
      ['Primary email', fmt.text(c.primary_email)],
      ['Primary phone', fmt.text(c.primary_phone_number)],
    ]),
    el('h3', { text: 'Departments' }),
    fieldList(
      isEmpty(c.departments)
        ? [['Departments', null]]
        : c.departments.map((d, i) => [
          fmt.text(d.name) || `Department ${i + 1}`,
          d.parent?.name ? `Parent: ${d.parent.name}` : 'No parent department',
        ])
    ),
    el('h3', { text: 'Locations' }),
    fieldList(
      isEmpty(c.locations)
        ? [['Locations', null]]
        : c.locations.map((loc, i) => [`Location ${i + 1}`, fmt.address(loc)])
    ),
    el('h3', { text: 'Bank accounts' }),
  ];

  if (isEmpty(c.accounts)) {
    content.push(fieldList([['Accounts', null]]));
  } else {
    c.accounts.forEach((a, i) => {
      content.push(el('p', { class: 'muted', text: `Account ${i + 1}` }), fieldList([
        ['Institution', fmt.text(a.institution_name)],
        ['Account name', fmt.text(a.account_name)],
        ['Account type', fmt.enum(a.account_type)],
        ['Routing number', fmt.text(a.routing_number)],
        ['Account number', fmt.masked(a.account_number)],
      ]));
    });
  }

  els.company.replaceChildren(...content);
}

// ---------------------------------------------------------------------------
// Directory
// ---------------------------------------------------------------------------

function renderDirectory({ data: people, error }) {
  if (error) {
    els.directoryCount.textContent = '';
    return els.directory.replaceChildren(errorBox(error));
  }

  els.directoryCount.textContent = `(${people.length} employees)`;
  if (people.length === 0) {
    return els.directory.replaceChildren(el('p', { class: 'muted', text: 'No employees returned.' }));
  }

  const tbody = el('tbody');
  for (const person of people) {
    const nameButton = el('button', { class: 'link', type: 'button', text: fmt.name(person) || '(Unnamed employee)' });
    const cell = (value) => (isEmpty(value) ? el('td', { class: 'not-provided', text: NOT_PROVIDED }) : el('td', { text: value }));
    const row = el('tr', { 'data-id': person.id }, [
      el('td', {}, nameButton),
      cell(fmt.text(person.department?.name)),
      cell(managerName(person.manager)),
      cell(person.is_active === true ? 'Active' : person.is_active === false ? 'Inactive' : null),
    ]);
    row.addEventListener('click', () => selectEmployee(person, row));
    tbody.append(row);
  }

  els.directory.replaceChildren(el('table', {}, [
    el('thead', {}, el('tr', {}, ['Name', 'Department', 'Manager', 'Status'].map((h) => el('th', { text: h })))),
    tbody,
  ]));
}

// ---------------------------------------------------------------------------
// Employee: individual + employment
// ---------------------------------------------------------------------------

async function selectEmployee(person, row) {
  document.querySelectorAll('tbody tr.selected').forEach((r) => r.classList.remove('selected'));
  row.classList.add('selected');
  els.employee.replaceChildren(el('p', { class: 'muted', text: `Loading ${fmt.name(person) || 'employee'}…` }));

  const { providerId, authType } = current;
  try {
    const data = await api(
      `/api/connections/${encodeURIComponent(providerId)}/${encodeURIComponent(authType)}/employees/${encodeURIComponent(person.id)}`
    );
    // Ignore stale responses if the user clicked someone else meanwhile.
    if (!row.classList.contains('selected')) return;
    els.employee.replaceChildren(
      el('h3', { text: 'Individual' }),
      renderIndividual(data.individual),
      el('h3', { text: 'Employment' }),
      renderEmployment(data.employment)
    );
  } catch (err) {
    els.employee.replaceChildren(errorBox({ message: err.message }));
  }
}

function renderIndividual({ data: p, error }) {
  if (error) return errorBox(error);
  return fieldList([
    ['First name', fmt.text(p.first_name)],
    ['Middle name', fmt.text(p.middle_name)],
    ['Last name', fmt.text(p.last_name)],
    ['Preferred name', fmt.text(p.preferred_name)],
    ['Emails', (p.emails || []).filter((e) => e?.data).map((e) => (e.type ? `${e.data} (${e.type})` : e.data))],
    ['Phone numbers', (p.phone_numbers || []).filter((n) => n?.data).map((n) => (n.type ? `${n.data} (${n.type})` : n.data))],
    ['Date of birth', fmt.text(p.dob)],
    ['Gender', fmt.enum(p.gender)],
    ['Ethnicity', fmt.enum(p.ethnicity)],
    ['Marital status', fmt.enum(p.marital_status)],
    ['Residence', fmt.address(p.residence)],
  ]);
}

function renderEmployment({ data: e, error }) {
  if (error) return errorBox(error);
  return fieldList([
    ['Title', fmt.text(e.title)],
    ['Department', fmt.text(e.department?.name)],
    ['Manager', managerName(e.manager)],
    ['Employment type', fmt.enum(e.employment?.type)],
    ['Employment subtype', fmt.enum(e.employment?.subtype)],
    ['Employment status', fmt.enum(e.employment_status)],
    ['Active', fmt.bool(e.is_active)],
    ['FLSA status', fmt.enum(e.flsa_status)],
    ['Start date', fmt.text(e.start_date)],
    ['End date', fmt.text(e.end_date)],
    ['Latest rehire date', fmt.text(e.latest_rehire_date)],
    ['Work location', fmt.address(e.location)],
    ['Income', fmt.income(e.income)],
    ['Income history', (e.income_history || []).map(fmt.income).filter(Boolean)],
    ['Class code', fmt.text(e.class_code)],
    ['Union code', fmt.text(e.union_code)],
    ['Union local', fmt.text(e.union_local)],
    ['Highly compensated', fmt.bool(e.highly_compensated_employee)],
    ['Key employee', fmt.bool(e.key_employee)],
    ['Custom fields', (e.custom_fields || []).filter((f) => f?.name).map((f) =>
      `${f.name}: ${isEmpty(f.value) ? NOT_PROVIDED : typeof f.value === 'object' ? JSON.stringify(f.value) : f.value}`)],
    ['Source ID', fmt.text(e.source_id)],
  ]);
}

loadProviders();
