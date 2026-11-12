import { addDays, isoDate } from "./format";
import type { Customer, PartLine, PrivatePrint, Project, Settings } from "./types";

/** Aufträge in diesen Status kommen in die Druckwarteschlange. */
export const QUEUE_STATUSES: Project["status"][] = ["auftrag", "druck"];

export interface QueueEntry {
  key: string;
  /** gesetzt bei privaten Drucken (ohne Auftrag) */
  private?: PrivatePrint;
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

/** Druckteil eines privaten Drucks (gleiche Kennung wie der Druck). */
export const PRIVATE_PART = "druck";

/**
 * Ein privater Druck als Auftrag mit genau einem Druckteil – so laufen Reihenfolge, Zeitplan und
 * Abhaken über dieselbe Logik. Gespeichert wird er weiterhin als eigener Datensatz (siehe printFromProject).
 */
export function printAsProject(p: PrivatePrint): Project {
  const part: PartLine = {
    id: PRIVATE_PART,
    name: p.name,
    quantity: p.quantity,
    filaments: p.filaments,
    minutes: p.minutes,
    printerId: p.printerId,
    fileName: p.fileName,
    printed: p.printed,
    queueRank: p.queueRank,
  };
  const printed = Math.min(p.printed, p.quantity);
  return {
    id: p.id,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    number: "",
    description: p.name,
    title: "",
    customTitle: false,
    customerId: "",
    status: p.quantity > 0 && printed >= p.quantity ? "fertig" : printed > 0 ? "druck" : "auftrag",
    orderDate: p.createdAt.slice(0, 10),
    dueDate: p.dueDate,
    notes: p.notes,
    parts: [part],
    work: [],
    packaging: 0,
    shipping: 0,
    discount: 0,
    electricityPrice: null,
    invoices: [],
  };
}

/** Änderungen aus der Warteschlange (gedruckt, Position) zurück in den privaten Druck übernehmen. */
export function printFromProject(p: PrivatePrint, project: Project): PrivatePrint {
  const part = project.parts.find((x) => x.id === PRIVATE_PART);
  return part ? { ...p, printed: part.printed ?? 0, queueRank: part.queueRank } : p;
}

export interface QueueOptions {
  /** nur ein Drucker, leer = alle */
  printerId?: string;
  includeDone?: boolean;
  /** Bezugsdatum für die Schätzung (Test), Standard: heute */
  today?: string;
}

export function buildQueue(projects: Project[], customers: Customer[], settings: Settings, opts: QueueOptions = {}, prints: PrivatePrint[] = []) {
  const today = opts.today ?? isoDate(new Date());
  const hoursPerDay = settings.printHoursPerDay > 0 ? settings.printHoursPerDay : 8;
  const all: QueueEntry[] = [];
  const privateById = new Map(prints.map((p) => [p.id, p]));
  for (const project of [...projects, ...prints.map(printAsProject)]) {
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
        private: privateById.get(project.id),
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
