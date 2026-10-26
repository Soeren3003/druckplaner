import { useState } from "react";
import type { Nav } from "../App";
import { BarList, Legend, Sparkline, StackedColumns, type Series } from "../components/charts";
import { Badge, Empty } from "../components/ui";
import { calcProject } from "../lib/calc";
import { STATUS, isOpen, statusInfo } from "../lib/defaults";
import { date, money, num } from "../lib/format";
import { projectLabel } from "../lib/numbering";
import { useStore } from "../lib/store";

type Period = "12m" | "jahr" | "vorjahr" | "alle";

const PERIODS: [Period, string][] = [
  ["12m", "Letzte 12 Monate"],
  ["jahr", "Dieses Jahr"],
  ["vorjahr", "Letztes Jahr"],
  ["alle", "Gesamt"],
];

const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const MONTHS_LONG = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

const SERIES: Series[] = [
  { name: "Bezahlt", color: "var(--viz-1)" },
  { name: "Offen", color: "var(--viz-2)" },
];

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/** Monate des Zeitraums als „JJJJ-MM“, älteste zuerst. */
function monthRange(period: Period, firstOrder: string | undefined): string[] {
  const now = new Date();
  let start: Date;
  let end = new Date(now.getFullYear(), now.getMonth(), 1);
  if (period === "12m") start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  else if (period === "jahr") {
    start = new Date(now.getFullYear(), 0, 1);
    end = new Date(now.getFullYear(), 11, 1);
  } else if (period === "vorjahr") {
    start = new Date(now.getFullYear() - 1, 0, 1);
    end = new Date(now.getFullYear() - 1, 11, 1);
  } else {
    const f = firstOrder ? new Date(`${firstOrder.slice(0, 7)}-01T00:00:00`) : end;
    start = new Date(f.getFullYear(), f.getMonth(), 1);
    if (start > end) start = end;
  }
  const out: string[] = [];
  for (let d = start; d <= end; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) out.push(monthKey(d));
  return out;
}

const compactMoney = (n: number) => (n >= 1000 ? `${num(n / 1000, 1)} T€` : `${num(n, 0)} €`);
const grams = (g: number) => (g >= 1000 ? `${num(g / 1000, 2)} kg` : `${num(g, 0)} g`);

export default function Dashboard({ nav, onNew }: { nav: Nav; onNew: () => void }) {
  const { projects, customers, settings } = useStore();
  const [period, setPeriod] = useState<Period>("12m");
  const [asTable, setAsTable] = useState(false);
  const cur = settings.currency;
  const m = (n: number) => money(n, cur);

  const all = projects.filter((p) => p.status !== "storniert").map((p) => ({ p, c: calcProject(p, settings) }));
  const firstOrder = all.map((x) => x.p.orderDate).sort()[0];
  const months = monthRange(period, firstOrder);
  const inPeriod = all.filter(({ p }) => months.includes(p.orderDate.slice(0, 7)));

  // Kennzahlen
  const value = inPeriod.reduce((s, x) => s + x.c.total, 0);
  const paid = inPeriod.filter((x) => x.p.status === "bezahlt").reduce((s, x) => s + x.c.total, 0);
  const receivable = all.filter((x) => x.p.status === "geliefert" || x.p.status === "fertig");
  const receivableSum = receivable.reduce((s, x) => s + x.c.total, 0);
  const gramsTotal = inPeriod.reduce((s, x) => s + x.c.grams, 0);
  const hoursTotal = inPeriod.reduce((s, x) => s + x.c.hours, 0);

  // Auftragswert je Monat, aufgeteilt nach bezahlt / offen
  const monthly = months.map((k) => {
    const [y, mo] = k.split("-").map(Number);
    const list = inPeriod.filter((x) => x.p.orderDate.startsWith(k));
    const paidM = list.filter((x) => x.p.status === "bezahlt").reduce((s, x) => s + x.c.total, 0);
    const openM = list.filter((x) => x.p.status !== "bezahlt").reduce((s, x) => s + x.c.total, 0);
    const label = months.length > 12 && mo === 1 ? `${MONTHS[mo - 1]} ${String(y).slice(2)}` : MONTHS[mo - 1];
    return { label, long: `${MONTHS_LONG[mo - 1]} ${y}`, values: [paidM, openM], count: list.length };
  });

  // Wohin das Geld fließt
  const costs = [
    { label: "Filament", value: inPeriod.reduce((s, x) => s + x.c.filament, 0) },
    { label: "Strom & Verschleiß", value: inPeriod.reduce((s, x) => s + x.c.energy + x.c.wear, 0) },
    { label: "Arbeitszeit", value: inPeriod.reduce((s, x) => s + x.c.work, 0) },
    { label: "Verpackung & Versand", value: inPeriod.reduce((s, x) => s + x.c.packaging + x.c.shipping, 0) },
  ];

  // Filament nach Material
  const byMaterial = new Map<string, number>();
  for (const { p } of inPeriod) for (const part of p.parts) byMaterial.set(part.material || "Unbekannt", (byMaterial.get(part.material || "Unbekannt") ?? 0) + part.weight * part.quantity);
  let materials = [...byMaterial.entries()].map(([label, value]) => ({ label, value })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
  if (materials.length > 6) {
    const rest = materials.slice(5).reduce((s, x) => s + x.value, 0);
    materials = [...materials.slice(0, 5), { label: "Sonstige", value: rest }];
  }

  // Beste Kunden
  const byCustomer = new Map<string, { value: number; count: number }>();
  for (const { p, c } of inPeriod) {
    const e = byCustomer.get(p.customerId) ?? { value: 0, count: 0 };
    byCustomer.set(p.customerId, { value: e.value + c.total, count: e.count + 1 });
  }
  const topCustomers = [...byCustomer.entries()]
    .map(([id, v]) => ({
      label: customers.find((c) => c.id === id)?.name || "Ohne Kunde",
      value: v.value,
      hint: `${v.count} Auftr.`,
      onClick: id ? () => nav({ page: "customers", id }) : undefined,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  // Offene Aufträge nach Status
  const pipeline = STATUS.filter((s) => !["bezahlt", "storniert"].includes(s.id))
    .map((s) => ({ label: s.label, value: all.filter((x) => x.p.status === s.id).length }))
    .filter((x) => x.value > 0);

  const open = all.filter(({ p }) => isOpen(p)).sort((a, b) => (a.p.dueDate || "9").localeCompare(b.p.dueDate || "9"));
  const customerName = (id: string) => customers.find((c) => c.id === id)?.name || "–";
  const periodLabel = PERIODS.find(([k]) => k === period)![1];

  return (
    <div className="page dashboard">
      <header className="page-head">
        <h1>Übersicht</h1>
        <div className="segmented" role="group" aria-label="Zeitraum">
          {PERIODS.map(([k, label]) => (
            <button key={k} className={period === k ? "active" : ""} onClick={() => setPeriod(k)}>
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="stats">
        <div className="stat hero">
          <span className="stat-label">Auftragswert · {periodLabel}</span>
          <div className="stat-row">
            <span className="stat-value">{m(value)}</span>
            <Sparkline values={monthly.map((x) => x.values[0] + x.values[1])} />
          </div>
          <span className="stat-sub">
            {inPeriod.length} {inPeriod.length === 1 ? "Auftrag" : "Aufträge"} · Ø {m(inPeriod.length ? value / inPeriod.length : 0)}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">Bezahlt</span>
          <span className="stat-value">{m(paid)}</span>
          <span className="stat-sub">{value ? `${num((paid / value) * 100, 0)} % des Auftragswerts` : "–"}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Offene Forderungen</span>
          <span className="stat-value">{m(receivableSum)}</span>
          <span className="stat-sub">
            {receivable.length} fertig oder geliefert, nicht bezahlt
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">Gedruckt</span>
          <span className="stat-value">{grams(gramsTotal)}</span>
          <span className="stat-sub">{num(hoursTotal, 0)} Std. Druckzeit</span>
        </div>
      </div>

      <div className="dash-grid two">
        <section className="card">
          <div className="card-head">
            <div>
              <h2>Auftragswert pro Monat</h2>
              <span className="muted small">nach Auftragsdatum</span>
            </div>
            <div className="row">
              <Legend series={SERIES} />
              <button className="ghost small" onClick={() => setAsTable(!asTable)}>
                {asTable ? "Diagramm" : "Tabelle"}
              </button>
            </div>
          </div>
          {asTable ? (
            <table className="list compact">
              <thead>
                <tr>
                  <th>Monat</th>
                  <th className="r">Aufträge</th>
                  <th className="r">Bezahlt</th>
                  <th className="r">Offen</th>
                  <th className="r">Gesamt</th>
                </tr>
              </thead>
              <tbody>
                {monthly.map((x) => (
                  <tr key={x.long} className="static">
                    <td>{x.long}</td>
                    <td className="r">{x.count}</td>
                    <td className="r">{m(x.values[0])}</td>
                    <td className="r">{m(x.values[1])}</td>
                    <td className="r">{m(x.values[0] + x.values[1])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <StackedColumns data={monthly} series={SERIES} format={m} formatAxis={compactMoney} />
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <h2>Zusammensetzung</h2>
              <span className="muted small">Woraus sich der Auftragswert ergibt</span>
            </div>
          </div>
          {value > 0 ? <BarList items={costs} format={m} /> : <Empty>Keine Aufträge im Zeitraum.</Empty>}
        </section>
      </div>

      <div className="dash-grid three">
        <section className="card">
          <div className="card-head">
            <h2>Filament nach Material</h2>
          </div>
          {materials.length ? <BarList items={materials} format={grams} /> : <Empty>Noch kein Verbrauch.</Empty>}
        </section>
        <section className="card">
          <div className="card-head">
            <h2>Top-Kunden</h2>
          </div>
          {topCustomers.length ? <BarList items={topCustomers} format={m} showShare={false} /> : <Empty>Noch keine Kunden.</Empty>}
        </section>
        <section className="card">
          <div className="card-head">
            <h2>Offene Aufträge nach Status</h2>
          </div>
          {pipeline.length ? (
            <BarList items={pipeline} format={(n) => String(n)} showShare={false} color="var(--viz-2)" />
          ) : (
            <Empty>Alles erledigt.</Empty>
          )}
        </section>
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
                <th>Nr.</th>
                <th>Auftrag</th>
                <th>Kunde</th>
                <th>Status</th>
                <th>Bestellt</th>
                <th>Fällig</th>
                <th className="r">Betrag</th>
              </tr>
            </thead>
            <tbody>
              {open.map(({ p, c }) => (
                <tr key={p.id} onClick={() => nav({ page: "project", id: p.id })}>
                  <td className="nowrap num-col">{p.number}</td>
                  <td>{projectLabel(p) || <i className="muted">Ohne Beschreibung</i>}</td>
                  <td>{customerName(p.customerId)}</td>
                  <td>
                    <Badge color={statusInfo(p.status).color}>{statusInfo(p.status).label}</Badge>
                  </td>
                  <td>{date(p.orderDate)}</td>
                  <td>{date(p.dueDate)}</td>
                  <td className="r num-col">{m(c.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
