import { fmt, isEmpty } from './format.js';
import { ErrorBox, FieldList } from './components.jsx';

export default function Company({ result: { data: c, error } }) {
  if (error) return <ErrorBox error={error} />;

  return (
    <>
      <FieldList rows={[
        ['Legal name', fmt.text(c.legal_name)],
        ['Company ID', fmt.text(c.id)],
        ['EIN', fmt.text(c.ein)],
        ['Entity type', fmt.enum(c.entity?.type)],
        ['Entity subtype', fmt.enum(c.entity?.subtype)],
        ['Primary email', fmt.text(c.primary_email)],
        ['Primary phone', fmt.text(c.primary_phone_number)],
      ]} />

      <h3>Departments</h3>
      <FieldList rows={
        isEmpty(c.departments)
          ? [['Departments', null]]
          : c.departments.map((d, i) => [
            fmt.text(d.name) || `Department ${i + 1}`,
            d.parent?.name ? `Parent: ${d.parent.name}` : 'No parent department',
          ])
      } />

      <h3>Locations</h3>
      <FieldList rows={
        isEmpty(c.locations)
          ? [['Locations', null]]
          : c.locations.map((loc, i) => [`Location ${i + 1}`, fmt.address(loc)])
      } />

      <h3>Bank accounts</h3>
      {isEmpty(c.accounts)
        ? <FieldList rows={[['Accounts', null]]} />
        : c.accounts.map((a, i) => (
          <div key={i}>
            <p className="muted">Account {i + 1}</p>
            <FieldList rows={[
              ['Institution', fmt.text(a.institution_name)],
              ['Account name', fmt.text(a.account_name)],
              ['Account type', fmt.enum(a.account_type)],
              ['Routing number', fmt.text(a.routing_number)],
              ['Account number', fmt.masked(a.account_number)],
            ]} />
          </div>
        ))}
    </>
  );
}
