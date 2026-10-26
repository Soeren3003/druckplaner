import { useState } from "react";
import type { Nav } from "../App";
import { Badge, Empty, Field } from "../components/ui";
import { confirmDialog } from "../lib/api";
import { calcProject } from "../lib/calc";
import { newCustomer, statusInfo } from "../lib/defaults";
import { date, money } from "../lib/format";
import { firstName } from "../lib/invoice";
import { useStore } from "../lib/store";
import type { Customer } from "../lib/types";

export default function Customers({ nav, selected, onNewProject }: { nav: Nav; selected?: string; onNewProject: (customerId: string) => void }) {
  const store = useStore();
  const { customers, projects, settings } = store;
  const [query, setQuery] = useState("");
  const [current, setCurrent] = useState<string | undefined>(selected ?? customers[0]?.id);

  const q = query.trim().toLowerCase();
  const list = customers
    .filter((c) => !q || `${c.name} ${c.company} ${c.city} ${c.email}`.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
  const customer = customers.find((c) => c.id === current);
  const cur = settings.currency;

  const add = () => {
    const c = newCustomer();
    store.saveCustomer(c);
    setCurrent(c.id);
  };

  const set = (patch: Partial<Customer>) => customer && store.saveCustomer({ ...customer, ...patch });

  const theirs = customer ? projects.filter((p) => p.customerId === customer.id).sort((a, b) => b.orderDate.localeCompare(a.orderDate)) : [];

  const remove = async () => {
    if (!customer) return;
    const msg = theirs.length
      ? `„${customer.name}“ hat ${theirs.length} Auftrag/Aufträge. Kunde trotzdem löschen? (Die Aufträge bleiben erhalten.)`
      : `Kunde „${customer.name}“ löschen?`;
    if (!(await confirmDialog(msg))) return;
    await store.deleteCustomer(customer.id);
    setCurrent(undefined);
  };

  const revenue = theirs
    .flatMap((p) => p.invoices)
    .filter((i) => i.kind === "rechnung" && i.paidAt)
    .reduce((s, i) => s + i.total, 0);

  return (
    <div className="page">
      <header className="page-head">
        <h1>Kunden</h1>
        <div className="toolbar">
          <input className="search" placeholder="Suchen …" value={query} onChange={(e) => setQuery(e.target.value)} />
          <button className="primary" onClick={add}>
            + Kunde
          </button>
        </div>
      </header>
      <div className="master-detail">
        <section className="card master">
          {list.length === 0 ? (
            <Empty>Noch keine Kunden.</Empty>
          ) : (
            <ul className="pick-list">
              {list.map((c) => (
                <li key={c.id} className={c.id === current ? "active" : ""} onClick={() => setCurrent(c.id)}>
                  <strong>{c.name || <i className="muted">Ohne Namen</i>}</strong>
                  <span className="muted small">{[c.company, c.city].filter(Boolean).join(" · ") || " "}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        {customer ? (
          <div className="detail">
            <section className="card">
              <div className="card-head">
                <h2>{customer.name || "Neuer Kunde"}</h2>
                <button className="ghost small danger" onClick={remove}>
                  Löschen
                </button>
              </div>
              <div className="form-grid">
                <Field label="Name" hint="z. B. „Muster, Max“ oder „Max Muster“">
                  <input value={customer.name} onChange={(e) => set({ name: e.target.value })} autoFocus={!customer.name} />
                </Field>
                <Field label="Firma (optional)">
                  <input value={customer.company} onChange={(e) => set({ company: e.target.value })} />
                </Field>
                <Field label="Straße & Hausnr." wide>
                  <input value={customer.street} onChange={(e) => set({ street: e.target.value })} />
                </Field>
                <Field label="PLZ">
                  <input value={customer.zip} onChange={(e) => set({ zip: e.target.value })} />
                </Field>
                <Field label="Ort">
                  <input value={customer.city} onChange={(e) => set({ city: e.target.value })} />
                </Field>
                <Field label="Land (nur bei Ausland)">
                  <input value={customer.country} onChange={(e) => set({ country: e.target.value })} />
                </Field>
                <Field label="E-Mail">
                  <input type="email" value={customer.email} onChange={(e) => set({ email: e.target.value })} />
                </Field>
                <Field label="Telefon">
                  <input value={customer.phone} onChange={(e) => set({ phone: e.target.value })} />
                </Field>
                <Field label="Notizen" wide>
                  <textarea rows={3} value={customer.notes} onChange={(e) => set({ notes: e.target.value })} />
                </Field>
              </div>
            </section>
            <section className="card">
              <div className="card-head">
                <h2>Aufträge {revenue > 0 && <span className="muted small">· bezahlt gesamt {money(revenue, cur)}</span>}</h2>
                <button className="ghost small" onClick={() => onNewProject(customer.id)}>
                  + Auftrag für {firstName(customer.name) || "Kunde"}
                </button>
              </div>
              {theirs.length === 0 ? (
                <Empty>Noch keine Aufträge.</Empty>
              ) : (
                <table className="list">
                  <tbody>
                    {theirs.map((p) => (
                      <tr key={p.id} onClick={() => nav({ page: "project", id: p.id })}>
                        <td>{date(p.orderDate)}</td>
                        <td>{p.title || <i className="muted">Ohne Titel</i>}</td>
                        <td>
                          <Badge color={statusInfo(p.status).color}>{statusInfo(p.status).label}</Badge>
                        </td>
                        <td className="r">{money(calcProject(p, settings).total, cur)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>
        ) : (
          <div className="detail">
            <Empty>Kunden auswählen oder neu anlegen.</Empty>
          </div>
        )}
      </div>
    </div>
  );
}
