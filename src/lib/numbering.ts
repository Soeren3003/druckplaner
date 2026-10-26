import { nextNumber } from "./calc";
import type { Customer, Project } from "./types";

export const CUSTOMER_PREFIX = "K-";

/** Nächste freie Kundennummer: K-001, K-002, … */
export function nextCustomerNumber(existing: string[]) {
  const max = existing
    .filter((n) => n.startsWith(CUSTOMER_PREFIX))
    .map((n) => parseInt(n.slice(CUSTOMER_PREFIX.length), 10))
    .filter((n) => !Number.isNaN(n))
    .reduce((a, b) => Math.max(a, b), 0);
  return `${CUSTOMER_PREFIX}${String(max + 1).padStart(3, "0")}`;
}

/** Nächste freie Auftragsnummer im Jahr: 2026-001, 2026-002, … */
export function nextProjectNumber(existing: string[], year = new Date().getFullYear()) {
  return nextNumber("", year, existing);
}

/** Automatische Bezeichnung: „2026-001 · Muster, Max – 20x Kabelhalter“. */
export function autoTitle(p: Pick<Project, "number" | "description">, customer?: Pick<Customer, "name">) {
  const head = [p.number, customer?.name].filter(Boolean).join(" · ");
  return [head, p.description.trim()].filter(Boolean).join(" – ");
}

/** Angezeigte Bezeichnung: eigene, falls gesetzt, sonst die automatische. */
export function projectTitle(p: Project, customer?: Pick<Customer, "name">) {
  return p.customTitle && p.title.trim() ? p.title : autoTitle(p, customer);
}

/** Kurzbezeichnung für Listen, in denen Nummer und Kunde eigene Spalten haben. */
export function projectLabel(p: Project) {
  return p.customTitle && p.title.trim() ? p.title : p.description;
}

const byAge = <T extends { createdAt: string }>(key: (x: T) => string) => (a: T, b: T) =>
  key(a).localeCompare(key(b)) || a.createdAt.localeCompare(b.createdAt);

/**
 * Vergibt fehlende Nummern an ältere Daten. Die Reihenfolge ist deterministisch (nach Datum),
 * damit zwei Geräte bei der Umstellung zu denselben Nummern kommen.
 * Bisherige Titel werden zur Beschreibung; die Bezeichnung wird ab dann automatisch gebildet.
 */
export function assignMissingNumbers(customers: Customer[], projects: Project[]) {
  const changedCustomers: Customer[] = [];
  const changedProjects: Project[] = [];

  const custNumbers = customers.map((c) => c.number).filter(Boolean);
  const outCustomers = new Map(customers.map((c) => [c.id, c]));
  // Ältester Kunde zuerst – maßgeblich ist der erste Auftrag, sonst das Anlagedatum.
  const firstOrder = (c: Customer) =>
    projects
      .filter((p) => p.customerId === c.id)
      .map((p) => p.orderDate)
      .sort()[0] ?? c.createdAt;
  const missing = customers.filter((c) => !c.number);
  missing.sort((a, b) => firstOrder(a).localeCompare(firstOrder(b)) || a.createdAt.localeCompare(b.createdAt) || a.name.localeCompare(b.name, "de"));
  for (const c of missing) {
    const number = nextCustomerNumber(custNumbers);
    custNumbers.push(number);
    const updated = { ...c, number };
    outCustomers.set(c.id, updated);
    changedCustomers.push(updated);
  }

  const projNumbers = projects.map((p) => p.number).filter(Boolean);
  const outProjects = new Map(projects.map((p) => [p.id, p]));
  for (const p of [...projects].sort(byAge((p) => p.orderDate))) {
    let updated = p;
    if (updated.description === undefined || updated.customTitle === undefined) {
      updated = { ...updated, description: updated.title ?? "", title: "", customTitle: false };
    }
    if (!updated.number) {
      const year = parseInt(updated.orderDate?.slice(0, 4), 10) || new Date().getFullYear();
      const number = nextProjectNumber(projNumbers, year);
      projNumbers.push(number);
      updated = { ...updated, number };
    }
    if (updated !== p) {
      outProjects.set(p.id, updated);
      changedProjects.push(updated);
    }
  }

  return {
    customers: customers.map((c) => outCustomers.get(c.id)!),
    projects: projects.map((p) => outProjects.get(p.id)!),
    changedCustomers,
    changedProjects,
  };
}
