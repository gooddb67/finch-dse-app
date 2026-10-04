import { fmt, isEmpty, NOT_PROVIDED } from './format.js';
import { ErrorBox } from './components.jsx';

function Cell({ value }) {
  return isEmpty(value) ? <td className="not-provided">{NOT_PROVIDED}</td> : <td>{value}</td>;
}

export default function Directory({ result: { data: people, error }, selectedId, onSelect, managerName }) {
  if (error) return <ErrorBox error={error} />;
  if (people.length === 0) return <p className="muted">No employees returned.</p>;

  return (
    <table>
      <thead>
        <tr>{['Name', 'Department', 'Manager', 'Status'].map((h) => <th key={h}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {people.map((person) => (
          <tr
            key={person.id}
            className={person.id === selectedId ? 'selected' : undefined}
            onClick={() => onSelect(person)}
          >
            <td>
              <button className="link" type="button">{fmt.name(person) || '(Unnamed employee)'}</button>
            </td>
            <Cell value={fmt.text(person.department?.name)} />
            <Cell value={managerName(person.manager)} />
            <Cell value={fmt.active(person.is_active)} />
          </tr>
        ))}
      </tbody>
    </table>
  );
}
