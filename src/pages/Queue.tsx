import { useState } from "react";
import type { Nav } from "../App";
import { Badge, Empty, NumberInput } from "../components/ui";
import { date, duration, num } from "../lib/format";
import { projectLabel } from "../lib/numbering";
import { buildQueue, printAsProject, printFromProject, rankPatches, setPrinted, type QueueEntry } from "../lib/queue";
import { PrivatePrintDialog } from "../components/PrivatePrintDialog";
import { api } from "../lib/api";
import { isModelFile, useSlicer } from "../lib/slicer";
import { useStore } from "../lib/store";
import { colorCss } from "../lib/threemf";
import { newPrivatePrint, statusInfo } from "../lib/defaults";
import type { PrivatePrint, Project } from "../lib/types";

function daysUntil(iso: string) {
  const d = Math.round((new Date(`${iso}T00:00:00`).getTime() - new Date(new Date().toDateString()).getTime()) / 86_400_000);
  if (d === 0) return "heute";
  if (d === 1) return "morgen";
  if (d === -1) return "gestern";
  return d > 0 ? `in ${d} Tagen` : `vor ${-d} Tagen`;
}

function Filaments({ e }: { e: QueueEntry }) {
  return (
    <span className="filament-dots">
      {e.part.filaments.map((f) => {
        const c = colorCss(f.color);
        return (
          <span key={f.id} className="fdot-wrap" title={`${f.material}${f.color ? `, ${f.color}` : ""}: ${num(f.weight, 1)} g je Stück`}>
            <i className="fdot" style={c ? { background: c } : undefined} />
            <span>
              {f.color || f.material}
              {e.part.filaments.length > 1 && <span className="muted"> {num(f.weight, 0)} g</span>}
            </span>
          </span>
        );
      })}
    </span>
  );
}

export default function Queue({ nav }: { nav: Nav }) {
  const store = useStore();
  const { projects, customers, settings, prints } = store;
  const [printer, setPrinter] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [editing, setEditing] = useState<{ print: PrivatePrint; isNew: boolean } | null>(null);
  const [error, setError] = useState("");
  const slicer = useSlicer();
  const q = buildQueue(projects, customers, settings, { printerId: printer, includeDone: showDone }, prints);
  const printerName = (id: string) => settings.printers.find((p) => p.id === id)?.name ?? "ohne Drucker";
  const totalMinutes = q.open.reduce((s, e) => s + e.minutes, 0);
  const late = q.open.filter((e) => e.late).length;

  /** Aufträge normal speichern, private Drucke in ihren eigenen Datensatz zurückschreiben. */
  const saveProjects = (changed: Project[]) =>
    changed.forEach((p) => {
      const priv = prints.find((x) => x.id === p.id);
      if (priv) store.savePrint(printFromProject(priv, p));
      else store.saveProject(p);
    });

  const print = (e: QueueEntry, printed: number) => saveProjects([setPrinted(e.project, e.part.id, printed)]);

  /** Verschieben gilt für die ganze Warteschlange (auch bei gefilterter Ansicht). */
  const move = (e: QueueEntry, dir: -1 | 1) => {
    const full = buildQueue(projects, customers, settings, {}, prints).open;
    const from = full.findIndex((x) => x.key === e.key);
    let to = from + dir;
    // bei gefiltertem Drucker am nächsten sichtbaren Eintrag vorbeischieben
    while (printer && to >= 0 && to < full.length && full[to].printerId !== printer) to += dir;
    if (from < 0 || to < 0 || to >= full.length) return;
    const patches = rankPatches(full, from, to);
    const changed: Project[] = [];
    for (const p of [...projects, ...prints.map(printAsProject)]) {
      const mine = patches.filter((r) => r.projectId === p.id);
      if (mine.length) changed.push({ ...p, parts: p.parts.map((x) => ({ ...x, queueRank: mine.find((r) => r.partId === x.id)?.rank ?? x.queueRank })) });
    }
    saveProjects(changed);
  };

  const resetOrder = () => {
    const changed = projects
      .filter((p) => p.parts.some((x) => x.queueRank !== undefined))
      .map((p) => ({ ...p, parts: p.parts.map(({ queueRank: _, ...x }) => x) }));
    saveProjects(changed);
    prints.filter((p) => p.queueRank !== undefined).forEach(({ queueRank: _, ...p }) => store.savePrint(p));
  };

  const manual = projects.some((p) => p.parts.some((x) => x.queueRank !== undefined)) || prints.some((p) => p.queueRank !== undefined);

  const openInSlicer = (e: QueueEntry) => api.filesOpenSlicer(e.project.id, e.part.fileName).catch((err) => setError(String(err)));

  const row = (e: QueueEntry, i: number) => {
    const s = statusInfo(e.project.status);
    return (
      <tr key={e.key} className={`static ${e.late ? "late" : ""} ${e.done ? "done" : ""}`}>
        <td className="num-col">{e.done ? "✓" : i + 1}</td>
        <td className="nowrap">
          {e.project.dueDate ? (
            <>
              <div>{date(e.project.dueDate)}</div>
              <div className={`small ${e.late ? "late-text" : "muted"}`}>{daysUntil(e.project.dueDate)}</div>
            </>
          ) : (
            <span className="muted">ohne Termin</span>
          )}
        </td>
        <td>
          <div className="q-part">
            {e.private ? (
              <button className="link q-part-link" onClick={() => setEditing({ print: e.private!, isNew: false })} title="Privaten Druck bearbeiten">
                {e.part.name || "Privater Druck"}
              </button>
            ) : (
              e.part.name || "Druckteil"
            )}
          </div>
          <Filaments e={e} />
        </td>
        <td>
          {e.private ? (
            <>
              <Badge color="gray">Privat</Badge>
              {e.private.notes && <div className="small muted">{e.private.notes}</div>}
            </>
          ) : (
            <>
              <button className="link" onClick={() => nav({ page: "project", id: e.project.id, tab: "kalkulation" })}>
                {e.project.number}
              </button>{" "}
              <Badge color={s.color}>{s.label}</Badge>
              <div className="small">
                {e.customer?.name ?? "–"} <span className="muted">· {projectLabel(e.project)}</span>
              </div>
            </>
          )}
        </td>
        {!printer && <td className="small">{printerName(e.printerId)}</td>}
        <td className="r nowrap">
          <strong>{e.remaining}</strong> <span className="muted">/ {e.part.quantity}</span>
          {e.printed > 0 && !e.done && <div className="small muted">{e.printed} gedruckt</div>}
        </td>
        <td className="r nowrap">
          {duration(e.minutes)} h<div className="small muted">{duration(e.part.minutes)} h/Stk.</div>
        </td>
        <td className="nowrap">
          {e.done ? (
            <span className="muted">–</span>
          ) : (
            <>
              <div className={e.late ? "late-text" : ""}>{date(e.estimate)}</div>
              {e.late && <div className="small late-text">⚠ nach dem Termin</div>}
            </>
          )}
        </td>
        <td className="r nowrap q-actions">
          {e.part.fileName && isModelFile(e.part.fileName) && (
            <button
              className="icon slicer-icon"
              onClick={() => openInSlicer(e)}
              disabled={!slicer.available}
              title={slicer.available ? `${e.part.fileName} in ${slicer.name} öffnen` : `${slicer.name} wurde nicht gefunden`}
            >
              ▶
            </button>
          )}
          {e.done ? (
            <button className="ghost small" onClick={() => print(e, e.part.quantity - 1)} title="Ein Stück wieder offen">
              ↶
            </button>
          ) : (
            <>
              <button className="ghost small" onClick={() => print(e, e.printed + 1)} title="Ein Stück gedruckt">
                +1
              </button>
              <button className="ghost small" onClick={() => print(e, e.part.quantity)} title="Alle Stück gedruckt">
                ✓ fertig
              </button>
              {e.printed > 0 && (
                <button className="icon" onClick={() => print(e, e.printed - 1)} title="Ein Stück zurücknehmen">
                  ↶
                </button>
              )}
              <button className="icon" onClick={() => move(e, -1)} title="Nach vorn" disabled={i === 0}>
                ↑
              </button>
              <button className="icon" onClick={() => move(e, 1)} title="Nach hinten" disabled={i === q.open.length - 1}>
                ↓
              </button>
            </>
          )}
        </td>
      </tr>
    );
  };

  return (
    <div className="page">
      <header className="page-head">
        <h1>Druckwarteschlange</h1>
        <div className="toolbar">
          <button className="primary" onClick={() => setEditing({ print: newPrivatePrint(settings), isNew: true })} title="Eigenen Druck ohne Auftrag hinzufügen">
            + Privater Druck
          </button>
          <select value={printer} onChange={(e) => setPrinter(e.target.value)}>
            <option value="">Alle Drucker</option>
            {settings.printers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </header>

      <div className="stats queue-stats">
        <div className="stat">
          <span className="stat-label">Offene Druckteile</span>
          <span className="stat-value">{q.open.length}</span>
          <span className="stat-sub">{q.open.reduce((s, e) => s + e.remaining, 0)} Stück</span>
        </div>
        <div className="stat">
          <span className="stat-label">Druckzeit offen</span>
          <span className="stat-value">{duration(totalMinutes)} h</span>
          <span className="stat-sub">
            {[...q.hoursByPrinter.entries()]
              .filter(([id]) => !printer || id === printer)
              .map(([id, h]) => `${printerName(id)}: ${num(h, 1)} h`)
              .join(" · ") || "–"}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">Termine in Gefahr</span>
          <span className={`stat-value ${late ? "late-text" : ""}`}>{late}</span>
          <span className="stat-sub">{late ? "voraussichtlich nach dem Liefertermin" : "alles im Plan"}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Druckstunden pro Tag</span>
          <div className="row">
            <NumberInput value={settings.printHoursPerDay} digits={1} min={0.5} onChange={(v) => v && store.saveSettings({ ...settings, printHoursPerDay: v })} suffix="h" />
          </div>
          <span className="stat-sub">Grundlage für „voraussichtlich fertig“</span>
        </div>
      </div>

      {error && (
        <div className="alert error">
          {error}{" "}
          <button className="icon" onClick={() => setError("")}>
            ×
          </button>
        </div>
      )}
      <section className="card">
        <div className="card-head">
          <div>
            <h2>Als Nächstes drucken</h2>
            <span className="muted small">
              Aufträge mit Status „Beauftragt“ und „Im Druck“ sowie private Drucke · Reihenfolge nach Termin{manual ? ", eigene Reihenfolge per ↑↓" : ", per ↑↓ änderbar"}
            </span>
          </div>
          <div className="row">
            {manual && (
              <button className="ghost small" onClick={resetOrder} title="Eigene Reihenfolge verwerfen, wieder nach Liefertermin">
                Nach Termin sortieren
              </button>
            )}
            <label className="check small">
              <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
              Gedruckte zeigen
            </label>
          </div>
        </div>
        {q.open.length === 0 && q.done.length === 0 ? (
          <Empty>
            Nichts zu drucken. Aufträge erscheinen hier, sobald ihr Status auf „Beauftragt“ steht – eigene Drucke über „+ Privater Druck“.
          </Empty>
        ) : (
          <table className="list queue">
            <thead>
              <tr>
                <th>#</th>
                <th>Termin</th>
                <th>Druckteil</th>
                <th>Auftrag</th>
                {!printer && <th>Drucker</th>}
                <th className="r">Offen</th>
                <th className="r">Druckzeit</th>
                <th>Fertig ca.</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {q.open.map(row)}
              {q.done.map((e, i) => row(e, i))}
            </tbody>
          </table>
        )}
      </section>
      {editing && <PrivatePrintDialog initial={editing.print} isNew={editing.isNew} onClose={() => setEditing(null)} />}
    </div>
  );
}
