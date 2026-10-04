import { useEffect, useState } from 'react';
import { api } from './api.js';
import { fmt, isEmpty, NOT_PROVIDED } from './format.js';
import { ErrorBox, FieldList } from './components.jsx';

// Loads and shows individual + employment data for one employee. App renders this
// with key={person.id}, so selecting someone else starts with fresh state.
export default function EmployeeDetails({ person, managerName }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Ignore the response if the user selects someone else before it arrives.
    let ignore = false;
    api(`/api/employees/${encodeURIComponent(person.id)}`)
      .then((result) => { if (!ignore) setData(result); })
      .catch((err) => { if (!ignore) setError({ message: err.message }); });
    return () => { ignore = true; };
  }, [person.id]);

  if (error) return <ErrorBox error={error} />;
  if (!data) return <p className="muted">Loading {fmt.name(person) || 'employee'}…</p>;

  return (
    <>
      <h3>Individual</h3>
      <Individual result={data.individual} />
      <h3>Employment</h3>
      <Employment result={data.employment} managerName={managerName} />
    </>
  );
}

function Individual({ result: { data: p, error } }) {
  if (error) return <ErrorBox error={error} />;
  return (
    <FieldList rows={[
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
    ]} />
  );
}

function Employment({ result: { data: e, error }, managerName }) {
  if (error) return <ErrorBox error={error} />;
  return (
    <FieldList rows={[
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
    ]} />
  );
}
