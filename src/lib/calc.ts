import { projectLabel } from "./numbering";
import type { DocLine, PartLine, Project, Settings } from "./types";

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface PartCost {
  pricePerGram: number;
  filament: number;
  hours: number;
  kwh: number;
  energy: number;
  wear: number;
  total: number;
}

export interface ProjectCost {
  parts: PartCost[];
  filament: number;
  energy: number;
  wear: number;
  kwh: number;
  hours: number;
  grams: number;
  work: number;
  packaging: number;
  shipping: number;
  discount: number;
  net: number;
  vatRate: number;
  vat: number;
  total: number;
  electricityPrice: number;
}

export function effectiveElectricity(project: Project, settings: Settings) {
  return project.electricityPrice ?? settings.electricityPrice;
}

/** Preis pro Gramm inkl. Filamentaufschlag (Tabelle: „Input × (100 + Marge) / 100“). */
export function pricePerGram(p: Pick<PartLine, "spoolPrice" | "spoolWeight" | "markupPercent">) {
  if (!p.spoolWeight) return 0;
  return (p.spoolPrice * (1 + (p.markupPercent || 0) / 100)) / p.spoolWeight;
}

export function calcPart(part: PartLine, settings: Settings, electricity: number): PartCost {
  const ppg = pricePerGram(part);
  const filament = ppg * part.weight * part.quantity;
  const printer = settings.printers.find((p) => p.id === part.printerId);
  const hours = (part.minutes / 60) * part.quantity;
  const kwh = printer ? (printer.watts * hours) / 1000 : 0;
  const energy = kwh * electricity;
  const wear = printer ? printer.wearPerHour * hours : 0;
  return { pricePerGram: ppg, filament, hours, kwh, energy, wear, total: filament + energy + wear };
}

export function vatRateFor(settings: Settings) {
  return settings.taxMode === "mwst" ? settings.vatRate : 0;
}

export function calcProject(project: Project, settings: Settings): ProjectCost {
  const electricityPrice = effectiveElectricity(project, settings);
  const parts = project.parts.map((p) => calcPart(p, settings, electricityPrice));
  const sum = (k: keyof PartCost) => parts.reduce((s, p) => s + p[k], 0);
  const work = project.work.reduce((s, w) => s + w.quantity * w.unitPrice, 0);
  const filament = sum("filament");
  const energy = sum("energy");
  const wear = sum("wear");
  const net = filament + energy + wear + work + project.packaging + project.shipping - project.discount;
  const vatRate = vatRateFor(settings);
  const vat = net * (vatRate / 100);
  return {
    parts,
    filament,
    energy,
    wear,
    kwh: sum("kwh"),
    hours: sum("hours"),
    grams: project.parts.reduce((s, p) => s + p.weight * p.quantity, 0),
    work,
    packaging: project.packaging,
    shipping: project.shipping,
    discount: project.discount,
    net,
    vatRate,
    vat,
    total: net + vat,
    electricityPrice,
  };
}

export type DetailLevel = "einzeln" | "pauschal";

/**
 * Positionen für Rechnung/Angebot. Strom und Verschleiß stecken im Stückpreis der Druckteile.
 * Jede Zeile wird auf Cent gerundet, damit die Summe auf dem Papier aufgeht.
 */
export function documentLines(project: Project, settings: Settings, detail: DetailLevel): DocLine[] {
  const cost = calcProject(project, settings);
  const line = (description: string, quantity: number, unit: string, unitPrice: number): DocLine => {
    const up = round2(unitPrice);
    return { description, quantity, unit, unitPrice: up, total: round2(up * quantity) };
  };

  if (detail === "pauschal") {
    return [line(projectLabel(project) || "3D-Druck", 1, "pauschal", cost.net)];
  }

  const lines: DocLine[] = [];
  project.parts.forEach((p, i) => {
    if (!p.quantity) return;
    const extra = [p.material, p.color].filter(Boolean).join(", ");
    const desc = `${p.name || "3D-Druckteil"}${extra ? ` (${extra})` : ""}`;
    lines.push(line(desc, p.quantity, "Stk.", cost.parts[i].total / p.quantity));
  });
  for (const w of project.work) {
    if (w.quantity && w.unitPrice) lines.push(line(w.name || "Arbeitsleistung", w.quantity, w.unit, w.unitPrice));
  }
  if (project.packaging) lines.push(line("Verpackung", 1, "pauschal", project.packaging));
  if (project.shipping) lines.push(line("Versand", 1, "pauschal", project.shipping));
  if (project.discount) lines.push(line("Nachlass", 1, "pauschal", -project.discount));
  return lines;
}

export function documentTotals(lines: DocLine[], vatRate: number) {
  const net = round2(lines.reduce((s, l) => s + l.total, 0));
  const vat = round2(net * (vatRate / 100));
  return { net, vat, total: round2(net + vat) };
}

/** Nächste freie Nummer im Format PREFIX-JJJJ-NNN. */
export function nextNumber(prefix: string, year: number, existing: string[]) {
  const head = `${prefix}${year}-`;
  const max = existing
    .filter((n) => n.startsWith(head))
    .map((n) => parseInt(n.slice(head.length), 10))
    .filter((n) => !Number.isNaN(n))
    .reduce((a, b) => Math.max(a, b), 0);
  return `${head}${String(max + 1).padStart(3, "0")}`;
}
