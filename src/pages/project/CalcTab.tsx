import { Fragment, useState } from "react";
import { DurationInput, NumberInput } from "../../components/ui";
import type { ProjectCost } from "../../lib/calc";
import { pricePerGram } from "../../lib/calc";
import { newFilament, newPart, newWork, uid } from "../../lib/defaults";
import { fixed, money, num } from "../../lib/format";
import { useStore } from "../../lib/store";
import type { FilamentUse, PartLine, Project, WorkLine } from "../../lib/types";

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
  const setFilament = (part: PartLine, fid: string, patch: Partial<FilamentUse>) =>
    setPart(part.id, { filaments: part.filaments.map((f) => (f.id === fid ? { ...f, ...patch } : f)) });
  const setWork = (id: string, patch: Partial<WorkLine>) =>
    update({ work: project.work.map((w) => (w.id === id ? { ...w, ...patch } : w)) });

  const chooseMaterial = (part: PartLine, f: FilamentUse, name: string) => {
    const m = settings.materials.find((x) => x.name === name);
    setFilament(part, f.id, m ? { material: m.name, spoolPrice: m.spoolPrice, spoolWeight: m.spoolWeight, markupPercent: m.markupPercent } : { material: name });
  };

  /** Weiteres Filament für mehrfarbige Drucke – übernimmt das Material des letzten. */
  const addFilament = (part: PartLine) => {
    const last = part.filaments[part.filaments.length - 1];
    const f = last ? { ...last, id: uid(), color: "", weight: 0 } : newFilament(settings);
    setPart(part.id, { filaments: [...part.filaments, f] });
  };

  const duplicate = (p: PartLine, i: number) => {
    const copy = { ...p, id: uid(), filaments: p.filaments.map((f) => ({ ...f, id: uid() })) };
    update({ parts: [...project.parts.slice(0, i + 1), copy, ...project.parts.slice(i + 1)] });
  };

  const addTemplate = (id: string) => {
    const t = settings.workTemplates.find((x) => x.id === id);
    if (t) update({ work: [...project.work, newWork(t.name, t.unit, t.price)] });
  };

  const materialSelect = (p: PartLine, f: FilamentUse) => (
    <select value={f.material} onChange={(e) => chooseMaterial(p, f, e.target.value)}>
      {!settings.materials.some((m) => m.name === f.material) && <option value={f.material}>{f.material || "–"}</option>}
      {settings.materials.map((m) => (
        <option key={m.id} value={m.name}>
          {m.name}
        </option>
      ))}
    </select>
  );

  return (
    <>
      <section className="card">
        <div className="card-head">
          <h2>Druckteile</h2>
          <span className="muted small">Gewicht je Filament und Druckzeit jeweils pro Stück (Druckzeit bei 100 % Geschwindigkeit)</span>
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
              <th className="w-act3" />
            </tr>
          </thead>
          <tbody>
            {project.parts.map((p, i) => {
              const pc = cost.parts[i];
              const [first, ...more] = p.filaments;
              return (
                <Fragment key={p.id}>
                  <tr className={more.length ? "multi" : ""}>
                    <td>
                      <input value={p.name} placeholder={`Teil ${i + 1}`} onChange={(e) => setPart(p.id, { name: e.target.value })} />
                    </td>
                    <td>
                      <NumberInput value={p.quantity} digits={0} min={0} onChange={(v) => setPart(p.id, { quantity: v ?? 0 })} />
                    </td>
                    <td>{first && materialSelect(p, first)}</td>
                    <td>{first && <input list="colors" value={first.color} onChange={(e) => setFilament(p, first.id, { color: e.target.value })} />}</td>
                    <td>
                      {first && <NumberInput value={first.weight} min={0} onChange={(v) => setFilament(p, first.id, { weight: v ?? 0 })} suffix="g" />}
                    </td>
                    <td>
                      <DurationInput minutes={p.minutes} onChange={(m) => setPart(p.id, { minutes: m })} />
                    </td>
                    <td className="r nowrap">{money(pc?.total ?? 0, cur)}</td>
                    <td className="nowrap">
                      <button className="icon" title="Weiteres Filament (mehrfarbiger Druck)" onClick={() => addFilament(p)}>
                        ＋
                      </button>
                      <button className="icon" title="Details: Drucker, Rollenpreise, Aufschlag …" onClick={() => setOpen(open === p.id ? null : p.id)}>
                        {open === p.id ? "▴" : "▾"}
                      </button>
                      <button className="icon danger" title="Druckteil entfernen" onClick={() => update({ parts: project.parts.filter((x) => x.id !== p.id) })}>
                        ×
                      </button>
                    </td>
                  </tr>
                  {more.map((f, j) => (
                    <tr key={f.id} className={`sub ${j === more.length - 1 ? "last" : ""}`}>
                      <td className="r muted small">↳ Filament {j + 2}</td>
                      <td />
                      <td>{materialSelect(p, f)}</td>
                      <td>
                        <input list="colors" value={f.color} onChange={(e) => setFilament(p, f.id, { color: e.target.value })} />
                      </td>
                      <td>
                        <NumberInput value={f.weight} min={0} onChange={(v) => setFilament(p, f.id, { weight: v ?? 0 })} suffix="g" />
                      </td>
                      <td className="muted small">{j === more.length - 1 && <>Σ {num(pc ? pc.grams / (p.quantity || 1) : 0, 2)} g</>}</td>
                      <td className="r nowrap muted small">{money(pc?.filaments[j + 1] ?? 0, cur)}</td>
                      <td>
                        <button
                          className="icon danger"
                          title="Filament entfernen"
                          onClick={() => setPart(p.id, { filaments: p.filaments.filter((x) => x.id !== f.id) })}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                  {open === p.id && (
                    <tr className="details">
                      <td colSpan={8}>
                        <div className="detail-grid">
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
                          <table className="filament-prices">
                            <thead>
                              <tr>
                                <th>Filament</th>
                                <th className="w-num">Preis pro Rolle</th>
                                <th className="w-num">Rolleninhalt</th>
                                <th className="w-num">Aufschlag</th>
                                <th className="r">Preis/kg</th>
                                <th className="r">Kosten</th>
                              </tr>
                            </thead>
                            <tbody>
                              {p.filaments.map((f, j) => (
                                <tr key={f.id}>
                                  <td className="small">
                                    {p.filaments.length > 1 && <span className="muted">{j + 1}. </span>}
                                    {[f.material, f.color].filter(Boolean).join(", ") || "–"}
                                  </td>
                                  <td>
                                    <NumberInput value={f.spoolPrice} min={0} onChange={(v) => setFilament(p, f.id, { spoolPrice: v ?? 0 })} suffix={cur} />
                                  </td>
                                  <td>
                                    <NumberInput value={f.spoolWeight} digits={0} min={0} onChange={(v) => setFilament(p, f.id, { spoolWeight: v ?? 0 })} suffix="g" />
                                  </td>
                                  <td>
                                    <NumberInput value={f.markupPercent} onChange={(v) => setFilament(p, f.id, { markupPercent: v ?? 0 })} suffix="%" />
                                  </td>
                                  <td className="r small nowrap">{money(pricePerGram(f) * 1000, cur)}</td>
                                  <td className="r small nowrap">{money(pc?.filaments[j] ?? 0, cur)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <div className="detail-info muted small">
                            <button className="ghost small" onClick={() => duplicate(p, i)}>
                              ⧉ Duplizieren
                            </button>{" "}
                            Filament {money(pc?.filament ?? 0, cur)} ({num(pc?.grams ?? 0, 1)} g) · Strom {money(pc?.energy ?? 0, cur)} ({fixed(pc?.kwh ?? 0, 2)} kWh)
                            {(pc?.wear ?? 0) > 0 && <> · Verschleiß {money(pc.wear, cur)}</>}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
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
