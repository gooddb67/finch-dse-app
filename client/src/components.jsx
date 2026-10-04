// Shared building blocks. React escapes all text it renders, so provider data
// can't inject HTML (we never use dangerouslySetInnerHTML).
import { Fragment } from 'react';
import { isEmpty, NOT_PROVIDED } from './format.js';

// Label/value pairs as a definition list, one row per field.
export function FieldList({ rows }) {
  return (
    <dl className="fields">
      {rows.map(([label, value], i) => (
        <Fragment key={i}>
          <dt>{label}</dt>
          <dd><FieldValue value={value} /></dd>
        </Fragment>
      ))}
    </dl>
  );
}

// One field's value: "Not provided" if it's empty, otherwise one line per item
// (most values are a single string; some, like emails, are a list).
function FieldValue({ value }) {
  if (isEmpty(value)) {
    return <span className="not-provided">{NOT_PROVIDED}</span>;
  }
  const lines = Array.isArray(value) ? value : [value];
  return lines.map((line, i) => <div key={i}>{line}</div>);
}

export function ErrorBox({ error }) {
  return (
    <div className="error" role="alert">
      {error.message}
      {error.status && <small>HTTP {error.status}</small>}
    </div>
  );
}
