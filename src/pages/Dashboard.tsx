import type { Nav } from "../App";
import { Badge, Empty } from "../components/ui";
import { calcProject } from "../lib/calc";
import { isOpen, statusInfo } from "../lib/defaults";
import { date, money, num } from "../lib/format";
import { useStore } from "../lib/store";

export default function Dashboard({ nav, onNew }: { nav: Nav; onNew: () => void }) {
  const { projects, customers, settings } = useStore();
  const year = new Date().getFullYear();
  const cur = settings.currency;
  const withCost = projects.map((p) => ({ p, c: calcProject(p, settings) }));

  const open = withCost.filter(({ p }) => isOpen(p)).sort((a, b) => (a.p.dueDate || "9").localeCompare(b.p.dueDate || "9"));
  const invoiced = (p: (typeof projects)[number]) => p.invoices.filter((i) => i.kind === "rechnung");
  const paidThisYear = projects
    .flatMap(invoiced)
    .filter((i) => i.paidAt && i.paidAt.startsWith(String(year)))
    .reduce((s, i) => s + i.total, 0);
  const unpaid = projects
    .filter((p) => p.status !== "storniert")
    .flatMap(invoiced)
    .filter((i) => !i.paidAt)
    .reduce((s, i) => s + i.total, 0);
  const thisYear = withCost.filter(({ p }) => p.orderDate.startsWith(String(year)) && p.status !== "storniert");
  const grams = thisYear.reduce((s, x) => s + x.c.grams, 0);
  const hours = thisYear.reduce((s, x) => s + x.c.hours, 0);
  const customerName = (id: string) => customers.find((c) => c.id === id)?.name || "–";

  return (
    <div className="page">
      <header className="page-head">
        <h1>Übersicht</h1>
      </header>
      <div className="stats">
        <div className="stat">
          <span className="stat-label">Offene Aufträge</span>
          <span className="stat-value">{open.length}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Eingenommen {year}</span>
          <span className="stat-value">{money(paidThisYear, cur)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Offene Rechnungen</span>
          <span className="stat-value">{money(unpaid, cur)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Gedruckt {year}</span>
          <span className="stat-value">
            {num(grams / 1000, 2)} kg · {num(hours, 0)} h
          </span>
        </div>
      </div>

      <section className="card">
        <div className="card-head">
          <h2>Laufende Aufträge</h2>
          <button className="ghost small" onClick={() => nav({ page: "projects" })}>
            Alle Aufträge →
          </button>
        </div>
        {open.length === 0 ? (
          <Empty>
            Keine offenen Aufträge.{" "}
            <button className="link" onClick={onNew}>
              Neuen Auftrag anlegen
            </button>
          </Empty>
        ) : (
          <table className="list">
            <thead>
              <tr>
                <th>Auftrag</th>
                <th>Kunde</th>
                <th>Status</th>
                <th>Fällig</th>
                <th className="r">Betrag</th>
              </tr>
            </thead>
            <tbody>
              {open.map(({ p, c }) => (
                <tr key={p.id} onClick={() => nav({ page: "project", id: p.id })}>
                  <td>{p.title || <i className="muted">Ohne Titel</i>}</td>
                  <td>{customerName(p.customerId)}</td>
                  <td>
                    <Badge color={statusInfo(p.status).color}>{statusInfo(p.status).label}</Badge>
                  </td>
                  <td>{date(p.dueDate)}</td>
                  <td className="r">{money(c.total, cur)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
