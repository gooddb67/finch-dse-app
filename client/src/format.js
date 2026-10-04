// Every value shown to the user goes through these formatters. Each returns a
// string, an array of strings (one per line), or null. null/empty always renders
// as "Not provided".

export const NOT_PROVIDED = 'Not provided';

export function isEmpty(value) {
  return value === null || value === undefined || value === '' ||
    (Array.isArray(value) && value.length === 0);
}

export const fmt = {
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
