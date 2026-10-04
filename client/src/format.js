// Every value shown to the user goes through these formatters. Each returns a
// string, an array of strings (one per line), or null. null/empty always renders
// as "Not provided".

export const NOT_PROVIDED = 'Not provided';

export function isEmpty(value) {
  return value === null || value === undefined || value === '' ||
    (Array.isArray(value) && value.length === 0);
}

// Join only the parts that have a value: ['Josh', null, 'Dietrich'] -> 'Josh Dietrich'.
// Returns null if every part is empty.
function joinNonEmpty(parts, separator) {
  const present = parts.filter((part) => !isEmpty(part));
  if (present.length === 0) {
    return null;
  }
  return present.join(separator);
}

export const fmt = {
  text: (v) => (isEmpty(v) ? null : String(v)),

  // 'full_time' -> 'Full time'
  enum: (v) => {
    if (isEmpty(v)) {
      return null;
    }
    const words = String(v).replaceAll('_', ' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
  },

  // true -> 'Yes', false -> 'No', anything else (null) -> not provided
  bool: (v) => {
    if (v === true) return 'Yes';
    if (v === false) return 'No';
    return null;
  },

  // is_active: true -> 'Active', false -> 'Inactive', null -> not provided
  active: (v) => {
    if (v === true) return 'Active';
    if (v === false) return 'Inactive';
    return null;
  },

  name: (p) => joinNonEmpty([p?.first_name, p?.middle_name, p?.last_name], ' '),

  // '1 Main St, Apt 2, Springfield, IL 62701, US', skipping any missing parts
  address: (a) => {
    if (!a) {
      return null;
    }
    const cityState = joinNonEmpty([a.city, a.state], ', ');
    const cityStateZip = joinNonEmpty([cityState, a.postal_code], ' ');
    return joinNonEmpty([a.name, a.line1, a.line2, cityStateZip, a.country], ', ');
  },

  // Finch sends money in cents: 197879 -> '$1,978.79'
  money: (cents, currency) => {
    if (isEmpty(cents)) return null;
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: (currency || 'usd').toUpperCase() })
        .format(cents / 100);
    } catch {
      return `${(cents / 100).toFixed(2)} ${currency || ''}`.trim();
    }
  },

  // '$1,978.79 (weekly) effective 2025-11-20'
  income: (inc) => {
    if (!inc || isEmpty(inc.amount)) return null;
    const pieces = [fmt.money(inc.amount, inc.currency)];
    if (inc.unit) pieces.push(`(${fmt.enum(inc.unit).toLowerCase()})`);
    if (inc.effective_date) pieces.push(`effective ${inc.effective_date}`);
    return pieces.join(' ');
  },

  // Bank account numbers: show only the last four digits.
  masked: (v) => (isEmpty(v) ? null : `••••${String(v).slice(-4)}`),
};
