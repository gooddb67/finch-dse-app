import { useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { fmt } from './format.js';
import { ErrorBox } from './components.jsx';
import Company from './Company.jsx';
import Directory from './Directory.jsx';
import EmployeeDetails from './EmployeeDetails.jsx';

// Default to a non-assisted method; assisted connections start "pending" and return 202s.
function defaultAuthType(provider) {
  return provider.authenticationTypes.find((t) => t !== 'assisted') || provider.authenticationTypes[0];
}

export default function App() {
  const [providers, setProviders] = useState(null);
  const [providerId, setProviderId] = useState('');
  const [authType, setAuthType] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [status, setStatus] = useState(null); // string or { error }
  const [connection, setConnection] = useState(null); // { company, directory }
  const [selected, setSelected] = useState(null); // directory entry

  useEffect(() => {
    api('/api/providers')
      .then(setProviders)
      .catch((err) => {
        setProviders([]);
        setStatus({ error: { message: err.message } });
      });
  }, []);

  const provider = providers?.find((p) => p.id === providerId);

  // Directory lookup so manager IDs can be shown as names.
  const directoryById = useMemo(
    () => new Map((connection?.directory.data || []).map((e) => [e.id, e])),
    [connection]
  );
  const managerName = (manager) => (manager?.id && fmt.name(directoryById.get(manager.id))) || null;

  function selectProvider(id) {
    setProviderId(id);
    const p = providers.find((x) => x.id === id);
    setAuthType(p ? defaultAuthType(p) : '');
  }

  async function connect(event) {
    event.preventDefault();
    setConnecting(true);
    setStatus(`Connecting to ${provider.displayName}…`);
    try {
      const data = await api('/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId, authType, providerName: provider.displayName }),
      });
      setConnection(data);
      setSelected(null);
      setStatus(`Connected to ${provider.displayName} (${fmt.enum(authType)}).`);
    } catch (err) {
      setConnection(null);
      setStatus({ error: { message: err.message } });
    } finally {
      setConnecting(false);
    }
  }

  const directory = connection?.directory;

  return (
    <>
      <header>
        <h1>Finch Sandbox Explorer</h1>
        <p className="subtitle">
          Pick a provider to create a sandbox connection and view its company, directory, individual, and employment data.
        </p>
      </header>

      <main>
        <section className="card">
          <form onSubmit={connect}>
            <label>
              Provider
              <select value={providerId} onChange={(e) => selectProvider(e.target.value)} required>
                {providers === null && <option value="">Loading providers…</option>}
                {providers?.length === 0 && <option value="">Could not load providers</option>}
                {providers?.length > 0 && <option value="">Select a provider…</option>}
                {providers?.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
              </select>
            </label>
            <label>
              Authentication type
              <select value={authType} onChange={(e) => setAuthType(e.target.value)} required disabled={!provider}>
                {provider?.authenticationTypes.map((t) => <option key={t} value={t}>{fmt.enum(t)}</option>)}
              </select>
            </label>
            <button type="submit" disabled={!provider || connecting}>Connect</button>
          </form>
          <div className="status" role="status">
            {typeof status === 'string' ? status : status?.error && <ErrorBox error={status.error} />}
          </div>
        </section>

        {connection && (
          <>
            <section className="card">
              <h2>Company</h2>
              <Company result={connection.company} />
            </section>

            <div className="columns">
              <section className="card">
                <h2>
                  Directory{' '}
                  {directory.data && <span className="muted">({directory.data.length} employees)</span>}
                </h2>
                <Directory
                  result={directory}
                  selectedId={selected?.id}
                  onSelect={setSelected}
                  managerName={managerName}
                />
              </section>

              <section className="card">
                <h2>Employee details</h2>
                {selected ? (
                  <EmployeeDetails
                    key={selected.id}
                    person={selected}
                    managerName={managerName}
                  />
                ) : (
                  <p className="muted">Select an employee from the directory.</p>
                )}
              </section>
            </div>
          </>
        )}
      </main>
    </>
  );
}
