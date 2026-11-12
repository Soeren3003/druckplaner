import { useState } from "react";
import { api, confirmDialog, inTauri, pickFiles } from "../lib/api";
import { calcPart } from "../lib/calc";
import { newFilament, uid } from "../lib/defaults";
import { money, num } from "../lib/format";
import { isModelFile, useSlicer } from "../lib/slicer";
import { useStore } from "../lib/store";
import { partsFromThreeMf } from "../lib/threemf";
import type { FilamentUse, PrivatePrint } from "../lib/types";
import { DurationInput, Field, Modal, NumberInput } from "./ui";

/**
 * Privaten Druck anlegen oder bearbeiten: nur für die Druckwarteschlange, ohne Auftrag und Kunde.
 * `isNew`: Abbrechen räumt eine bereits übernommene Druckdatei wieder weg.
 */
export function PrivatePrintDialog({ initial, isNew, onClose }: { initial: PrivatePrint; isNew: boolean; onClose: () => void }) {
  const store = useStore();
  const { settings } = store;
  const slicer = useSlicer();
  const [p, setP] = useState(initial);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const set = (patch: Partial<PrivatePrint>) => setP((x) => ({ ...x, ...patch }));
  const setFil = (id: string, patch: Partial<FilamentUse>) => set({ filaments: p.filaments.map((f) => (f.id === id ? { ...f, ...patch } : f)) });
  const cur = settings.currency;

  const chooseMaterial = (f: FilamentUse, name: string) => {
    const m = settings.materials.find((x) => x.name === name);
    setFil(f.id, m ? { material: m.name, spoolPrice: m.spoolPrice, spoolWeight: m.spoolWeight, markupPercent: m.markupPercent } : { material: name });
  };

  const cost = calcPart(
    { id: "x", name: p.name, quantity: p.quantity, filaments: p.filaments, minutes: p.minutes, printerId: p.printerId, fileName: p.fileName },
    settings,
    settings.electricityPrice,
  );

  /** Druckdatei übernehmen; bei geslicten 3MF-Dateien auch Druckzeit und Filamente. */
  const pickFile = async () => {
    setError("");
    setInfo("");
    const [path] = await pickFiles();
    if (!path) return;
    try {
      if (p.fileName) await api.filesDelete(p.id, p.fileName).catch(() => {});
      const [meta] = await api.filesImport(p.id, [path]);
      if (!meta) return;
      const patch: Partial<PrivatePrint> = { fileName: meta.name };
      if (!p.name) patch.name = meta.name.replace(/\.[^.]+$/, "");
      if (meta.name.toLowerCase().endsWith(".3mf")) {
        const tm = await api.threemfInfo(p.id, meta.name).catch(() => null);
        const [part] = tm ? partsFromThreeMf(settings, meta.name, tm) : [];
        if (part && tm && tm.plates.length > 0) {
          Object.assign(patch, { minutes: part.minutes, filaments: part.filaments, printerId: part.printerId });
          setInfo(
            tm.plates.length > 1
              ? `Druckzeit und Filamente von Platte 1 übernommen (die Datei hat ${tm.plates.length} Platten).`
              : "Druckzeit und Filamente aus der Datei übernommen.",
          );
        }
      }
      set(patch);
    } catch (e) {
      setError(String(e));
    }
  };

  const removeFile = async () => {
    if (p.fileName) await api.filesDelete(p.id, p.fileName).catch(() => {});
    set({ fileName: "" });
  };

  const cancel = async () => {
    if (isNew) await api.filesDeleteAll(p.id).catch(() => {});
    onClose();
  };

  const save = () => {
    store.savePrint({ ...p, name: p.name.trim() || "Privater Druck", printed: Math.min(p.printed, p.quantity) });
    onClose();
  };

  const remove = async () => {
    if (!(await confirmDialog(`Privaten Druck „${p.name || "ohne Namen"}“ samt Druckdatei löschen?`))) return;
    await store.deletePrint(p.id);
    onClose();
  };

  return (
    <Modal
      title={isNew ? "Privater Druck" : "Privaten Druck bearbeiten"}
      onClose={cancel}
      footer={
        <>
          {!isNew && (
            <button className="ghost danger" onClick={remove} style={{ marginRight: "auto" }}>
              Löschen
            </button>
          )}
          <button onClick={cancel}>Abbrechen</button>
          <button className="primary" onClick={save} disabled={p.quantity < 1}>
            {isNew ? "Zur Warteschlange hinzufügen" : "Speichern"}
          </button>
        </>
      }
    >
      <p className="muted small">Für eigene Drucke ohne Auftrag: Sie erscheinen nur in der Druckwarteschlange, nicht bei Aufträgen, Kunden oder Umsätzen.</p>
      {error && <div className="alert error">{error}</div>}
      {info && <div className="alert ok">{info}</div>}
      <div className="form-grid">
        <Field label="Bezeichnung" wide>
          <input value={p.name} placeholder="z. B. Ersatzknopf Spülmaschine" onChange={(e) => set({ name: e.target.value })} autoFocus={!p.name} />
        </Field>
        <Field label="Anzahl">
          <NumberInput value={p.quantity} digits={0} min={1} onChange={(v) => set({ quantity: v ?? 1 })} />
        </Field>
        <Field label="Druckzeit pro Stück">
          <DurationInput minutes={p.minutes} onChange={(m) => set({ minutes: m })} />
        </Field>
        <Field label="Drucker">
          <select value={p.printerId} onChange={(e) => set({ printerId: e.target.value })}>
            <option value="">– keiner –</option>
            {settings.printers.map((pr) => (
              <option key={pr.id} value={pr.id}>
                {pr.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Wunschtermin (optional)">
          <input type="date" value={p.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
        </Field>
      </div>

      <div className="label small muted">Filamente (Gewicht pro Stück)</div>
      <datalist id="colors-private">
        {settings.colors.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <table className="edit private-filaments">
        <tbody>
          {p.filaments.map((f) => (
            <tr key={f.id}>
              <td>
                <select value={f.material} onChange={(e) => chooseMaterial(f, e.target.value)}>
                  {!settings.materials.some((m) => m.name === f.material) && <option value={f.material}>{f.material || "–"}</option>}
                  {settings.materials.map((m) => (
                    <option key={m.id} value={m.name}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </td>
              <td className="w-color">
                <input list="colors-private" value={f.color} placeholder="Farbe" onChange={(e) => setFil(f.id, { color: e.target.value })} />
              </td>
              <td className="w-num">
                <NumberInput value={f.weight} min={0} onChange={(v) => setFil(f.id, { weight: v ?? 0 })} suffix="g" />
              </td>
              <td className="w-act">
                {p.filaments.length > 1 && (
                  <button className="icon danger" title="Filament entfernen" onClick={() => set({ filaments: p.filaments.filter((x) => x.id !== f.id) })}>
                    ×
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        className="ghost small"
        onClick={() => {
          const last = p.filaments[p.filaments.length - 1];
          set({ filaments: [...p.filaments, last ? { ...last, id: uid(), color: "", weight: 0 } : newFilament(settings)] });
        }}
      >
        ＋ Filament (mehrfarbig)
      </button>

      <div className="form-grid" style={{ marginTop: 12 }}>
        <Field label="Druckdatei (optional)" wide>
          <div className="row">
            {p.fileName ? (
              <>
                <code className="path">{p.fileName}</code>
                {isModelFile(p.fileName) && (
                  <button className="small slicer-btn" disabled={!slicer.available} onClick={() => api.filesOpenSlicer(p.id, p.fileName).catch((e) => setError(String(e)))}>
                    ▶ {slicer.name}
                  </button>
                )}
                <button className="ghost small" onClick={pickFile} disabled={!inTauri}>
                  Ersetzen …
                </button>
                <button className="ghost small danger" onClick={removeFile}>
                  Entfernen
                </button>
              </>
            ) : (
              <button className="ghost small" onClick={pickFile} disabled={!inTauri}>
                Datei wählen … (3MF, STL, STEP)
              </button>
            )}
          </div>
        </Field>
        <Field label="Notiz" wide>
          <textarea rows={2} value={p.notes} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
      </div>
      <p className="muted small">
        Materialkosten ca. {money(cost.filament, cur)} ({num(cost.grams, 1)} g), Strom ca. {money(cost.energy, cur)} – nur zur Info.
      </p>
    </Modal>
  );
}
