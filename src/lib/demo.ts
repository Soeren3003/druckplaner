/**
 * Erfundene Beispieldaten für Screenshots und zum Ausprobieren.
 * Nur in der Browser-Vorschau: http://localhost:1420/?demo (überschreibt die Vorschau-Daten im localStorage).
 * Alle Personen, Adressen und Aufträge sind frei erfunden; Ähnlichkeiten wären Zufall.
 * Die Daten liegen relativ zum heutigen Tag, damit die Übersicht immer gefüllt ist.
 */
import { documentLines, documentTotals } from "./calc";
import { defaultSettings } from "./defaults";
import type { Customer, InvoiceRecord, PartLine, Project, ProjectStatus, Settings, WorkLine } from "./types";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return iso(d);
};
const stamp = (date: string) => `${date}T10:00:00.000Z`;

function demoSettings(): Settings {
  const s = defaultSettings();
  // feste Kennungen, damit die Aufträge auf Drucker verweisen können
  s.printers = s.printers.map((p, i) => ({ ...p, id: `printer-${i}`, wearPerHour: i === 0 ? 0.1 : 0.15 }));
  s.defaultPrinterId = "printer-0";
  s.materials = s.materials.map((m, i) => ({ ...m, id: `mat-${i}`, markupPercent: 10 }));
  s.workTemplates = s.workTemplates.map((w, i) => ({ ...w, id: `work-${i}` }));
  s.sender = {
    name: "Alex Beispiel",
    street: "Musterweg 1",
    zip: "12345",
    city: "Musterstadt",
    country: "Deutschland",
    email: "alex@example.com",
    phone: "0123 456789",
    iban: "DE00 1234 5678 9012 3456 78",
    bic: "",
    bank: "Beispielbank",
    taxId: "",
  };
  s.defaultPackaging = 0.5;
  return s;
}

const people: [string, string, string, string, string][] = [
  ["Kowalski, Jana", "Lindenallee 4", "12345", "Musterstadt", "Fragt gern nach Sonderfarben."],
  ["Brandt, Tobias", "Am Bach 12", "12347", "Musterstadt", ""],
  ["Özdemir, Leyla", "Gartenstraße 7", "23456", "Beispielhausen", "Abholung meist samstags."],
  ["Fischer, Ole", "Hauptstraße 21", "23456", "Beispielhausen", ""],
  ["Werkstatt Nord GmbH", "Industriering 3", "34567", "Testdorf", "Ansprechpartnerin: Frau Hahn"],
  ["Nguyen, Minh", "Rosenweg 9", "12345", "Musterstadt", ""],
];

const customers: Customer[] = people.map(([name, street, zip, city, notes], i) => ({
  id: `cust-${i + 1}`,
  createdAt: stamp(daysAgo(330 - i * 30)),
  updatedAt: stamp(daysAgo(10)),
  number: `K-${String(i + 1).padStart(3, "0")}`,
  name: name.includes("GmbH") ? "Hahn, Sabine" : name,
  company: name.includes("GmbH") ? name : "",
  street,
  zip,
  city,
  country: "",
  email: `${name.split(",")[0].toLowerCase().replace(/[^a-z]/g, "")}@example.com`,
  phone: "",
  notes,
}));

type P = [number, string, number, number, number, string?, number?];
const part = (id: string, [qty, name, weight, minutes, mat, color = "schwarz", printer = 0]: P): PartLine => {
  const m = demoSettings().materials[mat];
  return {
    id,
    name,
    quantity: qty,
    material: m.name,
    color,
    spoolWeight: m.spoolWeight,
    spoolPrice: m.spoolPrice,
    markupPercent: m.markupPercent,
    weight,
    minutes,
    printerId: `printer-${printer}`,
    fileName: "",
  };
};
const work = (id: string, name: string, quantity: number, unit: string, unitPrice: number): WorkLine => ({ id, name, quantity, unit, unitPrice });

interface Spec {
  ago: number;
  customer: number;
  description: string;
  status: ProjectStatus;
  parts: P[];
  work?: [string, number, string, number][];
  shipping?: number;
  discount?: number;
  due?: number;
  notes?: string;
  invoice?: "offen" | "bezahlt";
}

const specs: Spec[] = [
  { ago: 320, customer: 1, description: "Ersatzteile Geschirrspüler", status: "bezahlt", parts: [[4, "Rollenhalter", 9.6, 38, 2, "weiß", 1]], work: [["Nachvermessungen", 0.5, "h", 15]], invoice: "bezahlt" },
  { ago: 280, customer: 2, description: "Kabelkanal-Clips", status: "bezahlt", parts: [[30, "Clip 12 mm", 1.8, 6, 1, "grau", 1]], invoice: "bezahlt" },
  { ago: 240, customer: 5, description: "Halterungen für Werkbank", status: "bezahlt", parts: [[6, "Wandhalter Akkuschrauber", 48.5, 142, 6, "schwarz", 2], [6, "Bithalter", 12.2, 35, 6, "orange", 2]], work: [["Vorarbeiten / Konstruktion", 2, "h", 20]], shipping: 6.99, invoice: "bezahlt" },
  { ago: 200, customer: 3, description: "Schlüsselanhänger Vereinsfest", status: "bezahlt", parts: [[12, "Anhänger mit Logo", 7.9, 33, 1, "mehrfarbig"]], work: [["Vorarbeiten / Konstruktion", 1, "h", 20]], discount: 5, invoice: "bezahlt", notes: "Logo als SVG erhalten, Farben laut Liste." },
  { ago: 150, customer: 4, description: "Fahrradhalter Garage", status: "bezahlt", parts: [[2, "Wandhaken", 86.0, 260, 2, "schwarz", 2]], invoice: "bezahlt" },
  { ago: 110, customer: 1, description: "Brettspiel-Organizer", status: "bezahlt", parts: [[1, "Einsatz Spielfiguren", 142.3, 410, 0, "blau", 3], [1, "Einsatz Karten", 96.4, 275, 0, "gelb", 3]], work: [["Nachvermessungen", 1, "h", 15]], invoice: "bezahlt" },
  { ago: 75, customer: 6, description: "Pflanzenstecker mit Gravur", status: "bezahlt", parts: [[20, "Stecker", 4.1, 14, 3, "grün", 1]], shipping: 4.5, invoice: "bezahlt" },
  { ago: 45, customer: 5, description: "Gehäuse für Sensor", status: "geliefert", parts: [[10, "Gehäuse unten", 22.4, 64, 7, "schwarz", 2], [10, "Deckel", 11.8, 31, 7, "schwarz", 2]], work: [["Vorarbeiten / Konstruktion", 3, "h", 20], ["Nacharbeiten", 1, "h", 40]], shipping: 6.99, invoice: "offen" },
  { ago: 20, customer: 2, description: "Ersatz-Drehknöpfe Herd", status: "fertig", parts: [[4, "Drehknopf", 6.3, 29, 4, "schwarz", 1]], work: [["Nachvermessungen", 0.5, "h", 15]], due: -3 },
  { ago: 12, customer: 3, description: "Dekofiguren Drache", status: "druck", parts: [[2, "Drache groß", 64.7, 395, 0, "grün", 0], [4, "Drache klein", 18.2, 112, 0, "violett", 0]], work: [["3D-Druck reinigen", 1, "h", 30]], due: 6, notes: "Stützen vorsichtig entfernen, Flügel dünn." },
  { ago: 6, customer: 6, description: "Halter für Werkzeugwand", status: "auftrag", parts: [[8, "Hakenleiste", 31.5, 88, 2, "orange", 2]], due: 14 },
  { ago: 2, customer: 4, description: "Abdeckkappen Gartenzaun", status: "angebot", parts: [[40, "Kappe 40×40", 5.6, 18, 6, "schwarz", 1]], shipping: 4.5, due: 21 },
];

function build() {
  const settings = demoSettings();
  let invoiceNo = 0;
  let quoteNo = 0;
  const projects: Project[] = specs.map((s, i) => {
    const date = daysAgo(s.ago);
    const year = date.slice(0, 4);
    const p: Project = {
      id: `proj-${i + 1}`,
      createdAt: stamp(date),
      updatedAt: stamp(daysAgo(Math.max(0, s.ago - 5))),
      number: "",
      description: s.description,
      title: "",
      customTitle: false,
      customerId: `cust-${s.customer}`,
      status: s.status,
      orderDate: date,
      dueDate: s.due !== undefined ? daysAgo(-s.due) : "",
      notes: s.notes ?? "",
      parts: s.parts.map((x, j) => part(`proj-${i + 1}-p${j}`, x)),
      work: (s.work ?? []).map(([n, q, u, pr], j) => work(`proj-${i + 1}-w${j}`, n, q, u, pr)),
      packaging: settings.defaultPackaging,
      shipping: s.shipping ?? 0,
      discount: s.discount ?? 0,
      electricityPrice: null,
      invoices: [],
    };
    const invoices: InvoiceRecord[] = [];
    if (s.status === "angebot") {
      const lines = documentLines(p, settings, "einzeln");
      invoices.push({ id: `${p.id}-a`, kind: "angebot", number: `A${year}-${String(++quoteNo).padStart(3, "0")}`, date, fileName: "", lines, ...documentTotals(lines, 0), paidAt: "" });
    }
    if (s.invoice) {
      const d = daysAgo(Math.max(0, s.ago - 7));
      const lines = documentLines(p, settings, "einzeln");
      invoices.push({
        id: `${p.id}-r`,
        kind: "rechnung",
        number: `R${d.slice(0, 4)}-${String(++invoiceNo).padStart(3, "0")}`,
        date: d,
        fileName: "",
        lines,
        ...documentTotals(lines, 0),
        paidAt: s.invoice === "bezahlt" ? daysAgo(Math.max(0, s.ago - 12)) : "",
      });
    }
    return { ...p, invoices };
  });
  // Auftragsnummern je Jahr fortlaufend
  const perYear = new Map<string, number>();
  for (const p of projects) {
    const y = p.orderDate.slice(0, 4);
    const n = (perYear.get(y) ?? 0) + 1;
    perYear.set(y, n);
    p.number = `${y}-${String(n).padStart(3, "0")}`;
  }
  return { settings, customers, projects };
}

export function demoData() {
  return build();
}

/** Legt die Beispieldaten in den Browser-Speicher der Vorschau. */
export function loadDemo() {
  const { settings, customers, projects } = build();
  const put = (c: string, list: { id: string }[]) => localStorage.setItem(`druckplaner:${c}`, JSON.stringify(Object.fromEntries(list.map((x) => [x.id, x]))));
  put("settings", [settings]);
  put("customers", customers);
  put("projects", projects);
}
