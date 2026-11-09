import { addDays, isoDate } from "./format";
import type { Customer, PartLine, Project, Settings } from "./types";

/** Aufträge in diesen Status kommen in die Druckwarteschlange. */
export const QUEUE_STATUSES: Project["status"][] = ["auftrag", "druck"];

export interface QueueEntry {
  key: string;
  project: Project;
  part: PartLine;
  customer?: Customer;
  printed: number;
  remaining: number;
  /** offene Druckzeit in Minuten */
  minutes: number;
  printerId: string;
  /** Beginn und Ende im Zeitplan des Druckers, in Stunden ab jetzt */
  startHours: number;
  endHours: number;
  /** voraussichtlich fertig (JJJJ-MM-TT) */
  estimate: string;
  late: boolean;
  done: boolean;
}

const printedOf = (p: PartLine) => Math.min(p.printed ?? 0, p.quantity);
const deadline = (p: Project) => p.dueDate || "9999-12-31";

/** Reihenfolge ohne eigene Position: Liefertermin, Auftragsdatum, Auftragsnummer, Teil. */
function byDeadline(a: QueueEntry, b: QueueEntry) {
  return (
    deadline(a.project).localeCompare(deadline(b.project)) ||
    a.project.orderDate.localeCompare(b.project.orderDate) ||
    a.project.number.localeCompare(b.project.number) ||
    a.project.parts.indexOf(a.part) - b.project.parts.indexOf(b.part)
  );
}

/**
 * Eigene Reihenfolge (queueRank) bleibt erhalten. Teile ohne Position ordnen sich nach Liefertermin
 * ein: vor dem ersten Teil mit späterem Termin. Teile ohne Termin behalten ihren Platz, neue Teile
 * ohne Termin kommen ans Ende.
 */
export function orderEntries(entries: QueueEntry[]) {
  const ranked = entries.filter((e) => e.part.queueRank !== undefined).sort((a, b) => a.part.queueRank! - b.part.queueRank! || byDeadline(a, b));
  const free = entries.filter((e) => e.part.queueRank === undefined).sort(byDeadline);
  const out = [...ranked];
  for (const e of free) {
    const i = out.findIndex((x) => !!x.project.dueDate && deadline(x.project) > deadline(e.project));
    if (i < 0) out.push(e);
    else out.splice(i, 0, e);
  }
  return out;
}

export interface QueueOptions {
  /** nur ein Drucker, leer = alle */
  printerId?: string;
  includeDone?: boolean;
  /** Bezugsdatum für die Schätzung (Test), Standard: heute */
  today?: string;
}

export function buildQueue(projects: Project[], customers: Customer[], settings: Settings, opts: QueueOptions = {}) {
  const today = opts.today ?? isoDate(new Date());
  const hoursPerDay = settings.printHoursPerDay > 0 ? settings.printHoursPerDay : 8;
  const all: QueueEntry[] = [];
  for (const project of projects) {
    // Fertige Aufträge nur mit ihren gedruckten Teilen, damit sich versehentliches Abhaken zurücknehmen lässt
    const finished = project.status === "fertig";
    if (!QUEUE_STATUSES.includes(project.status) && !(finished && opts.includeDone)) continue;
    for (const part of project.parts) {
      if (!part.quantity) continue;
      const printed = printedOf(part);
      const remaining = part.quantity - printed;
      if (finished && remaining > 0) continue;
      all.push({
        key: `${project.id}/${part.id}`,
        project,
        part,
        customer: customers.find((c) => c.id === project.customerId),
        printed,
        remaining,
        minutes: remaining * part.minutes,
        printerId: part.printerId,
        startHours: 0,
        endHours: 0,
        estimate: "",
        late: false,
        done: remaining === 0,
      });
    }
  }
  const open = orderEntries(all.filter((e) => !e.done));
  // Drucker arbeiten parallel: je Drucker ein eigener Zeitplan
  const lanes = new Map<string, number>();
  for (const e of open) {
    const start = lanes.get(e.printerId) ?? 0;
    const end = start + e.minutes / 60;
    lanes.set(e.printerId, end);
    e.startHours = start;
    e.endHours = end;
    e.estimate = addDays(today, Math.max(0, Math.ceil(end / hoursPerDay) - 1));
    e.late = !!e.project.dueDate && e.estimate > e.project.dueDate;
  }
  const filter = (e: QueueEntry) => !opts.printerId || e.printerId === opts.printerId;
  return {
    open: open.filter(filter),
    done: opts.includeDone ? all.filter((e) => e.done).filter(filter) : [],
    /** offene Stunden je Drucker */
    hoursByPrinter: lanes,
  };
}

/** Neue Positionen nach dem Verschieben: alle offenen Einträge bekommen ihre Stelle als queueRank. */
export function rankPatches(open: QueueEntry[], from: number, to: number) {
  const list = open.slice();
  const [moved] = list.splice(from, 1);
  list.splice(to, 0, moved);
  return list.map((e, i) => ({ projectId: e.project.id, partId: e.part.id, rank: i + 1 }));
}

/** Status nach dem Drucken: erstes Stück → „Im Druck“, alles gedruckt → „Fertig“. */
export function statusAfterPrint(project: Project): Project["status"] {
  const parts = project.parts.filter((p) => p.quantity > 0);
  const total = parts.reduce((s, p) => s + p.quantity, 0);
  const done = parts.reduce((s, p) => s + printedOf(p), 0);
  if (total > 0 && done >= total) return QUEUE_STATUSES.includes(project.status) ? "fertig" : project.status;
  if (done > 0 && (project.status === "auftrag" || project.status === "fertig")) return "druck";
  return project.status;
}

/** Stückzahl gedruckt setzen (begrenzt auf 0 … Anzahl) und den Status nachziehen. */
export function setPrinted(project: Project, partId: string, printed: number): Project {
  const parts = project.parts.map((p) => (p.id === partId ? { ...p, printed: Math.max(0, Math.min(p.quantity, Math.round(printed))) } : p));
  const next = { ...project, parts };
  return { ...next, status: statusAfterPrint(next) };
}
