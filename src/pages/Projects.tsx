import { useState } from "react";
import type { Nav } from "../App";
import { Badge, Empty } from "../components/ui";
import { calcProject } from "../lib/calc";
import { STATUS, isOpen, statusInfo } from "../lib/defaults";
import { date, money } from "../lib/format";
import { useStore } from "../lib/store";

export default function Projects({ nav }: { nav: Nav }) {
  const { projects, customers, settings } = useStore();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string>("offen");

  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? "";
  const q = query.trim().toLowerCase();
  const list = projects
    .filter((p) => (filter === "alle" ? true : filter === "offen" ? isOpen(p) : p.status === filter))
    .filter((p) => !q || `${p.title} ${customerName(p.customerId)} ${p.notes}`.toLowerCase().includes(q))
    .sort((a, b) => b.orderDate.localeCompare(a.orderDate) || b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="page">
      <header className="page-head">
        <h1>Aufträge</h1>
        <div className="toolbar">
          <input className="search" placeholder="Suchen …" value={query} onChange={(e) => setQuery(e.target.value)} />
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="offen">Offene</option>
            <option value="alle">Alle</option>
            {STATUS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </header>
      <section className="card">
        {list.length === 0 ? (
          <Empty>Keine Aufträge gefunden.</Empty>
        ) : (
          <table className="list">
            <thead>
              <tr>
                <th>Datum</th>
                <th>Auftrag</th>
                <th>Kunde</th>
                <th>Status</th>
                <th>Rechnung</th>
                <th className="r">Betrag</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const s = statusInfo(p.status);
                const inv = p.invoices.filter((i) => i.kind === "rechnung").at(-1);
                return (
                  <tr key={p.id} onClick={() => nav({ page: "project", id: p.id })}>
                    <td>{date(p.orderDate)}</td>
                    <td>{p.title || <i className="muted">Ohne Titel</i>}</td>
                    <td>{customerName(p.customerId) || "–"}</td>
                    <td>
                      <Badge color={s.color}>{s.label}</Badge>
                    </td>
                    <td>{inv ? `${inv.number}${inv.paidAt ? " ✓" : ""}` : "–"}</td>
                    <td className="r">{money(calcProject(p, settings).total, settings.currency)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
