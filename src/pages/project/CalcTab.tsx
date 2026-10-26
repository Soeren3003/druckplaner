import { Fragment, useState } from "react";
import { DurationInput, NumberInput } from "../../components/ui";
import type { ProjectCost } from "../../lib/calc";
import { pricePerGram } from "../../lib/calc";
import { newPart, newWork, uid } from "../../lib/defaults";
import { fixed, money } from "../../lib/format";
import { useStore } from "../../lib/store";
import type { PartLine, Project, WorkLine } from "../../lib/types";

interface Props {
  project: Project;
  update: (patch: Partial<Project>) => void;
  cost: ProjectCost;
}

export default function CalcTab({ project, update, cost }: Props) {
  const { settings } = useStore();
  const cur = settings.currency;
  const [open, setOpen] = useState<string | null>(null);

  const setPart = (id: string, patch: Partial<PartLine>) =>
    update({ parts: project.parts.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  const setWork = (id: string, patch: Partial<WorkLine>) =>
    update({ work: project.work.map((w) => (w.id === id ? { ...w, ...patch } : w)) });

  const chooseMaterial = (part: PartLine, name: string) => {
    const m = settings.materials.find((x) => x.name === name);
    setPart(part.id, m ? { material: m.name, spoolPrice: m.spoolPrice, spoolWeight: m.spoolWeight, markupPercent: m.markupPercent } : { material: name });
  };

  const addTemplate = (id: string) => {
    const t = settings.workTemplates.find((x) => x.id === id);
    if (t) update({ work: [...project.work, newWork(t.name, t.unit, t.price)] });
  };

  return (
    <>
      <section className="card">
        <div className="card-head">
          <h2>Druckteile</h2>
          <span className="muted small">Gewicht und Druckzeit jeweils pro Stück (Druckzeit bei 100 % Geschwindigkeit)</span>
        </div>
        <datalist id="colors">
          {settings.colors.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <table className="edit fixed">
          <thead>
            <tr>
              <th>Bezeichnung</th>
              <th className="w-qty">Anz.</th>
              <th className="w-mat">Filament</th>
              <th className="w-color">Farbe</th>
              <th className="w-num">Gewicht/Stk.</th>
              <th className="w-time">Zeit/Stk.</th>
              <th className="r w-sum">Kosten</th>
              <th className="w-act" />
            </tr>
          </thead>
          <tbody>
            {project.parts.map((p, i) => (
              <Fragment key={p.id}>
                <tr>
                  <td>
                    <input value={p.name} placeholder={`Teil ${i + 1}`} onChange={(e) => setPart(p.id, { name: e.target.value })} />
                  </td>
                  <td>
                    <NumberInput value={p.quantity} digits={0} min={0} onChange={(v) => setPart(p.id, { quantity: v ?? 0 })} />
                  </td>
                  <td>
                    <select value={p.material} onChange={(e) => chooseMaterial(p, e.target.value)}>
                      {!settings.materials.some((m) => m.name === p.material) && <option value={p.material}>{p.material || "–"}</option>}
                      {settings.materials.map((m) => (
                        <option key={m.id} value={m.name}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input list="colors" value={p.color} onChange={(e) => setPart(p.id, { color: e.target.value })} />
                  </td>
                  <td>
                    <NumberInput value={p.weight} min={0} onChange={(v) => setPart(p.id, { weight: v ?? 0 })} suffix="g" />
                  </td>
                  <td>
                    <DurationInput minutes={p.minutes} onChange={(m) => setPart(p.id, { minutes: m })} />
                  </td>
                  <td className="r nowrap">{money(cost.parts[i]?.total ?? 0, cur)}</td>
                  <td className="nowrap">
                    <button className="icon" title="Details: Drucker, Rollenpreis, Aufschlag …" onClick={() => setOpen(open === p.id ? null : p.id)}>
                      {open === p.id ? "▴" : "▾"}
                    </button>
                    <button className="icon danger" title="Entfernen" onClick={() => update({ parts: project.parts.filter((x) => x.id !== p.id) })}>
                      ×
                    </button>
                  </td>
                </tr>
                {open === p.id && (
                  <tr className="details">
                    <td colSpan={8}>
                      <div className="detail-grid">
                        <label>
                          Preis pro Rolle
                          <NumberInput value={p.spoolPrice} min={0} onChange={(v) => setPart(p.id, { spoolPrice: v ?? 0 })} suffix={cur} />
                        </label>
                        <label>
                          Rolleninhalt
                          <NumberInput value={p.spoolWeight} digits={0} min={0} onChange={(v) => setPart(p.id, { spoolWeight: v ?? 0 })} suffix="g" />
                        </label>
                        <label>
                          Filamentaufschlag
                          <NumberInput value={p.markupPercent} onChange={(v) => setPart(p.id, { markupPercent: v ?? 0 })} suffix="%" />
                        </label>
                        <label>
                          Drucker
                          <select value={p.printerId} onChange={(e) => setPart(p.id, { printerId: e.target.value })}>
                            <option value="">– keiner (kein Strom) –</option>
                            {settings.printers.map((pr) => (
                              <option key={pr.id} value={pr.id}>
                                {pr.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Druckdatei
                          <input value={p.fileName} onChange={(e) => setPart(p.id, { fileName: e.target.value })} placeholder="optional" />
                        </label>
                        <div className="detail-info muted small">
                          <button
                            className="ghost small"
                            onClick={() => update({ parts: [...project.parts.slice(0, i + 1), { ...p, id: uid() }, ...project.parts.slice(i + 1)] })}
                          >
                            ⧉ Duplizieren
                          </button>{" "}
                          {fixed(pricePerGram(p) * 1000, 2)} {cur}/kg · Filament {money(cost.parts[i]?.filament ?? 0, cur)} · Strom{" "}
                          {money(cost.parts[i]?.energy ?? 0, cur)} ({fixed(cost.parts[i]?.kwh ?? 0, 2)} kWh)
                          {(cost.parts[i]?.wear ?? 0) > 0 && <> · Verschleiß {money(cost.parts[i].wear, cur)}</>}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
        <button className="ghost small add" onClick={() => update({ parts: [...project.parts, newPart(settings)] })}>
          + Druckteil
        </button>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Arbeitspakete & sonstige Kosten</h2>
        </div>
        {project.work.length > 0 && (
          <table className="edit">
            <thead>
              <tr>
                <th>Bezeichnung</th>
                <th className="w-qty">Anzahl</th>
                <th className="w-unit">Einheit</th>
                <th className="w-num">Preis/Einheit</th>
                <th className="r w-sum">Summe</th>
                <th className="w-act" />
              </tr>
            </thead>
            <tbody>
              {project.work.map((w) => (
                <tr key={w.id}>
                  <td>
                    <input value={w.name} onChange={(e) => setWork(w.id, { name: e.target.value })} />
                  </td>
                  <td>
                    <NumberInput value={w.quantity} onChange={(v) => setWork(w.id, { quantity: v ?? 0 })} />
                  </td>
                  <td>
                    <input value={w.unit} onChange={(e) => setWork(w.id, { unit: e.target.value })} />
                  </td>
                  <td>
                    <NumberInput value={w.unitPrice} onChange={(v) => setWork(w.id, { unitPrice: v ?? 0 })} suffix={cur} />
                  </td>
                  <td className="r nowrap">{money(w.quantity * w.unitPrice, cur)}</td>
                  <td>
                    <button className="icon danger" title="Entfernen" onClick={() => update({ work: project.work.filter((x) => x.id !== w.id) })}>
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="row add">
          <button className="ghost small" onClick={() => update({ work: [...project.work, newWork()] })}>
            + Position
          </button>
          <select value="" onChange={(e) => addTemplate(e.target.value)} className="small">
            <option value="">+ aus Vorlage …</option>
            {settings.workTemplates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({money(t.price, cur)}/{t.unit})
              </option>
            ))}
          </select>
        </div>
      </section>
    </>
  );
}
