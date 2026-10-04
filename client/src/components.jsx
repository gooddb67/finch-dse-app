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
          <dd>
            {isEmpty(value)
              ? <span className="not-provided">{NOT_PROVIDED}</span>
              : [].concat(value).map((line, j) => <div key={j}>{line}</div>)}
          </dd>
        </Fragment>
      ))}
    </dl>
  );
}

export function ErrorBox({ error }) {
  return (
    <div className="error" role="alert">
      {error.message}
      {error.status && <small>HTTP {error.status}</small>}
    </div>
  );
}
