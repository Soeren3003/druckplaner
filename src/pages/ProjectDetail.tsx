import { useState } from "react";
import type { Nav } from "../App";
import { Field, Modal, NumberInput } from "../components/ui";
import { calcProject } from "../lib/calc";
import { STATUS, newCustomer } from "../lib/defaults";
import { autoTitle, projectTitle } from "../lib/numbering";
import { duration, fixed, money, num } from "../lib/format";
import { useStore } from "../lib/store";
import { confirmDialog } from "../lib/api";
import type { Project } from "../lib/types";
import CalcTab from "./project/CalcTab";
import FilesTab from "./project/FilesTab";
import DocsTab from "./project/DocsTab";

type Tab = "kalkulation" | "dateien" | "notizen" | "dokumente";

export default function ProjectDetail({ id, nav }: { id: string; nav: Nav }) {
  const store = useStore();
  const { settings, customers } = store;
  const project = store.projects.find((p) => p.id === id);
  const [tab, setTab] = useState<Tab>("kalkulation");
  const [newCust, setNewCust] = useState<string | null>(null);

  if (!project) {
    return (
      <div className="page">
        <p>Auftrag nicht gefunden.</p>
        <button onClick={() => nav({ page: "projects" })}>Zurück</button>
      </div>
    );
  }

  const update = (patch: Partial<Project>) => store.saveProject({ ...project, ...patch });
  const customer = customers.find((c) => c.id === project.customerId);
  const title = projectTitle(project, customer);
  const numberTaken = store.projects.some((p) => p.id !== project.id && p.number && p.number === project.number);
  const cost = calcProject(project, settings);
  const cur = settings.currency;

  const remove = async () => {
    if (!(await confirmDialog(`Auftrag „${title}“ mit allen Dateien und Rechnungs-PDFs löschen?`))) return;
    await store.deleteProject(project.id);
    nav({ page: "projects" });
  };

  const createCustomer = () => {
    if (!newCust?.trim()) return;
    const c = { ...newCustomer(customers.map((x) => x.number)), name: newCust.trim() };
    store.saveCustomer(c);
    update({ customerId: c.id });
    setNewCust(null);
  };

  const sorted = [...customers].sort((a, b) => a.name.localeCompare(b.name, "de"));

  return (
    <div className="page project">
      <header className="page-head">
        <button className="ghost" onClick={() => nav({ page: "projects" })}>
          ←
        </button>
        <input
          className={`title-input ${project.customTitle ? "custom" : ""}`}
          value={title}
          title={project.customTitle ? "Eigene Bezeichnung" : "Automatisch aus Auftragsnummer, Kunde und Beschreibung – zum Ändern einfach überschreiben"}
          onChange={(e) =>
            // Leeres Feld = zurück zur automatischen Bezeichnung
            update(e.target.value.trim() ? { title: e.target.value, customTitle: true } : { title: "", customTitle: false })
          }
        />
        {project.customTitle && (
          <button className="ghost small" title={`Automatisch: ${autoTitle(project, customer)}`} onClick={() => update({ title: "", customTitle: false })}>
            ↺ Automatisch
          </button>
        )}
        <button className="danger ghost" onClick={remove}>
          Löschen
        </button>
      </header>

      <div className="meta card">
        <Field label="Kunde">
          <div className="row">
            <select
              value={project.customerId}
              onChange={(e) => (e.target.value === "__new" ? setNewCust("") : update({ customerId: e.target.value }))}
            >
              <option value="">– kein Kunde –</option>
              {sorted.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || "(ohne Namen)"}
                </option>
              ))}
              <option value="__new">+ Neuer Kunde …</option>
            </select>
            {project.customerId && (
              <button className="ghost small" onClick={() => nav({ page: "customers", id: project.customerId })} title="Kunde öffnen">
                ↗
              </button>
            )}
          </div>
        </Field>
        <Field label="Status">
          <select value={project.status} onChange={(e) => update({ status: e.target.value as Project["status"] })}>
            {STATUS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Auftragsdatum">
          <input type="date" value={project.orderDate} onChange={(e) => update({ orderDate: e.target.value })} />
        </Field>
        <Field label="Liefertermin">
          <input type="date" value={project.dueDate} onChange={(e) => update({ dueDate: e.target.value })} />
        </Field>
        <Field label="Auftragsnummer" hint={numberTaken ? "Nummer ist bereits vergeben" : undefined}>
          <input className={numberTaken ? "invalid" : ""} value={project.number} onChange={(e) => update({ number: e.target.value })} />
        </Field>
        <Field label="Beschreibung" wide>
          <input
            value={project.description}
            placeholder="Worum geht es? z. B. 20× Kabelhalter in PLA"
            onChange={(e) => update({ description: e.target.value })}
            autoFocus={!project.description && !project.customTitle}
          />
        </Field>
      </div>

      <div className="split">
        <div className="main-col">
          <div className="tabs">
            {(
              [
                ["kalkulation", "Kalkulation"],
                ["dateien", "Dateien"],
                ["notizen", "Notizen"],
                ["dokumente", `Angebot & Rechnung${project.invoices.length ? ` (${project.invoices.length})` : ""}`],
              ] as [Tab, string][]
            ).map(([t, label]) => (
              <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
                {label}
              </button>
            ))}
          </div>
          {tab === "kalkulation" && <CalcTab project={project} update={update} cost={cost} />}
          {tab === "dateien" && <FilesTab project={project} update={update} />}
          {tab === "notizen" && (
            <section className="card">
              <textarea
                className="notes"
                value={project.notes}
                placeholder="Notizen zum Auftrag: Wünsche, Maße, Absprachen, Lieferung …"
                onChange={(e) => update({ notes: e.target.value })}
              />
            </section>
          )}
          {tab === "dokumente" && <DocsTab project={project} update={update} />}
        </div>

        <aside className="summary card">
          <h2>Zusammenfassung</h2>
          <dl>
            <dt>Filament ({num(cost.grams, 1)} g)</dt>
            <dd>{money(cost.filament, cur)}</dd>
            <dt>
              Strom ({fixed(cost.kwh, 2)} kWh × {fixed(cost.electricityPrice, 2)})
            </dt>
            <dd>{money(cost.energy, cur)}</dd>
            {cost.wear > 0 && (
              <>
                <dt>Verschleiß</dt>
                <dd>{money(cost.wear, cur)}</dd>
              </>
            )}
            <dt>Arbeitspakete</dt>
            <dd>{money(cost.work, cur)}</dd>
            <dt>Verpackung</dt>
            <dd>{money(cost.packaging, cur)}</dd>
            <dt>Versand</dt>
            <dd>{money(cost.shipping, cur)}</dd>
            {cost.discount !== 0 && (
              <>
                <dt>Nachlass</dt>
                <dd>−{money(cost.discount, cur)}</dd>
              </>
            )}
            {cost.vatRate > 0 && (
              <>
                <dt className="sep">Netto</dt>
                <dd className="sep">{money(cost.net, cur)}</dd>
                <dt>USt. {fixed(cost.vatRate, 2)} %</dt>
                <dd>{money(cost.vat, cur)}</dd>
              </>
            )}
            <dt className="total">Gesamt</dt>
            <dd className="total">{money(cost.total, cur)}</dd>
          </dl>
          <p className="muted small">
            Druckzeit gesamt: {duration(cost.hours * 60)} h
            {project.parts.length > 0 && cost.total > 0 && (
              <>
                <br />
                Filamentanteil: {num((cost.filament / cost.total) * 100, 0)} %
              </>
            )}
          </p>
          <div className="kv">
            <Field label="Verpackung">
              <NumberInput value={project.packaging} onChange={(v) => update({ packaging: v ?? 0 })} suffix={cur} />
            </Field>
            <Field label="Versand">
              <NumberInput value={project.shipping} onChange={(v) => update({ shipping: v ?? 0 })} suffix={cur} />
            </Field>
            <Field label="Nachlass / Freundschaftspreis">
              <NumberInput value={project.discount} onChange={(v) => update({ discount: v ?? 0 })} suffix={cur} />
            </Field>
            <Field label="Strompreis (leer = Standard)">
              <NumberInput
                value={project.electricityPrice}
                allowEmpty
                placeholder={fixed(settings.electricityPrice, 2)}
                onChange={(v) => update({ electricityPrice: v })}
                suffix={`${cur}/kWh`}
              />
            </Field>
          </div>
        </aside>
      </div>

      {newCust !== null && (
        <Modal
          title="Neuer Kunde"
          onClose={() => setNewCust(null)}
          footer={
            <>
              <button onClick={() => setNewCust(null)}>Abbrechen</button>
              <button className="primary" onClick={createCustomer} disabled={!newCust.trim()}>
                Anlegen
              </button>
            </>
          }
        >
          <Field label="Name" hint="Weitere Angaben (Adresse, E-Mail …) später unter „Kunden“.">
            <input autoFocus value={newCust} onChange={(e) => setNewCust(e.target.value)} onKeyDown={(e) => e.key === "Enter" && createCustomer()} />
          </Field>
        </Modal>
      )}
    </div>
  );
}
