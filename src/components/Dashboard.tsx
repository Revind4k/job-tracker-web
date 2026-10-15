import { useEffect, useState } from "react";
import { api, ApiError, STATUSES, type Application, type ApplicationInput, type Page, type Stats, type Status } from "../api";
import { LABEL } from "../format";
import { ApplicationForm } from "./ApplicationForm";
import { StatsPanel } from "./StatsPanel";

const PAGE_SIZE = 20;

export function Dashboard({ email, onLogout }: { email: string; onLogout: () => void }) {
  const [filter, setFilter] = useState<Status | null>(null);
  const [page, setPage] = useState(0);
  const [data, setData] = useState<Page<Application> | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Application | "new" | null>(null);
  const [version, setVersion] = useState(0); // bumped after every write to refetch
  const load = () => setVersion((v) => v + 1);

  useEffect(() => {
    // Ignore a response that arrives after a newer request started: clicking two filters
    // quickly must not let the first, slower response overwrite the second.
    let current = true;
    Promise.all([api.list({ status: filter ?? undefined, page, size: PAGE_SIZE }), api.stats()]).then(
      ([list, s]) => {
        if (!current) return;
        // Deleting the last row on a page leaves it empty: step back instead of showing nothing.
        if (list.items.length === 0 && page > 0) return setPage(page - 1);
        setData(list);
        setStats(s);
        setError(null);
      },
      (e) => current && (e as ApiError).status !== 401 && setError((e as Error).message),
    );
    return () => {
      current = false;
    };
  }, [filter, page, version]);

  async function changeStatus(app: Application, status: Status) {
    // Optimistic: show the change immediately, put it back if the server refuses.
    setData((d) => d && { ...d, items: d.items.map((a) => (a.id === app.id ? { ...a, status } : a)) });
    try {
      await api.update(app.id, { status });
      load();
    } catch (e) {
      setData((d) => d && { ...d, items: d.items.map((a) => (a.id === app.id ? app : a)) });
      setError(`Couldn't update ${app.company}: ${(e as Error).message}`);
    }
  }

  async function remove(app: Application) {
    if (!confirm(`Delete ${app.company} — ${app.role}?`)) return;
    try {
      await api.remove(app.id);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function save(input: ApplicationInput) {
    if (editing === "new") await api.create(input);
    else if (editing) await api.update(editing.id, input);
    setEditing(null);
    load();
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  return (
    <div className="app">
      <header className="topbar">
        <h1>Job Tracker</h1>
        <div className="who">
          <span className="muted small">{email.endsWith("@demo.invalid") ? "Demo account" : email}</span>
          <button onClick={onLogout}>Log out</button>
        </div>
      </header>

      {error && (
        <p className="error banner" role="alert">
          {error} <button className="link" onClick={() => setError(null)}>Dismiss</button>
        </p>
      )}

      {stats && <StatsPanel stats={stats} />}

      <section className="card">
        <div className="toolbar">
          <div className="chips" role="group" aria-label="Filter by status">
            <button className={filter === null ? "chip on" : "chip"} aria-pressed={filter === null}
              onClick={() => { setFilter(null); setPage(0); }}>
              All {stats ? `(${stats.total})` : ""}
            </button>
            {STATUSES.map((s) => (
              <button key={s} className={filter === s ? `chip on s-${s}` : `chip s-${s}`} aria-pressed={filter === s}
                onClick={() => { setFilter(s); setPage(0); }}>
                {LABEL[s]} {stats ? `(${stats.byStatus[s] ?? 0})` : ""}
              </button>
            ))}
          </div>
          <button className="primary" onClick={() => setEditing("new")}>+ Add application</button>
        </div>

        {!data ? (
          <p className="muted">Loading…</p>
        ) : data.items.length === 0 ? (
          <div className="empty">
            <p>{filter ? `No applications marked ${LABEL[filter]}.` : "No applications yet."}</p>
            {!filter && <button className="primary" onClick={() => setEditing("new")}>Add your first one</button>}
          </div>
        ) : (
          <div className="table-wrap"><table>
            <thead>
              <tr><th>Company</th><th>Role</th><th>Applied</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr>
            </thead>
            <tbody>
              {data.items.map((a) => (
                <tr key={a.id}>
                  <td>{a.url ? <a href={a.url} target="_blank" rel="noreferrer noopener">{a.company}</a> : a.company}</td>
                  <td>{a.role}</td>
                  <td>{new Date(a.appliedOn + "T00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</td>
                  <td>
                    <select aria-label={`Status for ${a.company}`} className={`status s-${a.status}`} value={a.status}
                      onChange={(e) => changeStatus(a, e.target.value as Status)}>
                      {STATUSES.map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}
                    </select>
                  </td>
                  <td className="actions">
                    <div className="act">
                      <button className="link" onClick={() => setEditing(a)}>Edit</button>
                      <button className="link danger" onClick={() => remove(a)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}

        {data && pages > 1 && (
          <nav className="pager" aria-label="Pages">
            <button disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button>
            <span className="muted small">Page {page + 1} of {pages}</span>
            <button disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next</button>
          </nav>
        )}
      </section>

      {editing && (
        <ApplicationForm initial={editing === "new" ? null : editing} onSave={save} onCancel={() => setEditing(null)} />
      )}
    </div>
  );
}
