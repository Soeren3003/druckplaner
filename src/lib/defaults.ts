import { nextCustomerNumber, nextProjectNumber } from "./numbering";
import type { Customer, PartLine, Project, Settings, WorkLine } from "./types";

export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const today = () => new Date().toISOString().slice(0, 10);

/** Werte aus „Druckkostenrechner_Projekt.ods“ übernommen. */
export function defaultSettings(): Settings {
  const printer = (name: string, watts: number) => ({ id: uid(), name, watts, wearPerHour: 0 });
  const printers = [
    printer("Bambu Lab A1 mini", 150),
    printer("Bambu Lab A1", 1300),
    printer("Bambu Lab P1S", 1000),
    printer("Bambu Lab P1P", 1000),
    printer("Bambu Lab X1C", 1000),
  ];
  const mat = (name: string, spoolPrice: number, spoolWeight = 1000) => ({
    id: uid(),
    name,
    spoolWeight,
    spoolPrice,
    markupPercent: 0,
  });
  const work = (name: string, unit: string, price: number) => ({ id: uid(), name, unit, price });
  return {
    id: "settings",
    updatedAt: now(),
    sender: { name: "", street: "", zip: "", city: "", country: "Deutschland", email: "", phone: "", iban: "", bic: "", bank: "", taxId: "" },
    taxMode: "privat",
    vatRate: 19,
    currency: "EUR",
    electricityPrice: 0.3,
    printers,
    defaultPrinterId: printers[0].id,
    materials: [
      mat("PLA Bambulab", 22.99),
      mat("PLA generisch", 19.99),
      mat("PETG Bambulab", 22.99),
      mat("PETG generisch", 19.99),
      mat("PETG HF", 22.99),
      mat("PETG-CF", 34.99),
      mat("ASA Bambulab", 29.99),
      mat("ABS Bambulab", 22.99),
      mat("TPU Bambulab", 39.99),
      mat("PC Bambulab", 39.99),
      mat("PA Bambulab", 49.99),
      mat("Support PLA", 34.99, 500),
    ],
    colors: ["schwarz", "weiß", "grau", "silber", "gold", "rot", "orange", "gelb", "grün", "blau", "hellblau", "violett", "braun", "transparent", "mehrfarbig"],
    workTemplates: [
      work("Vorarbeiten / Konstruktion", "h", 20),
      work("3D-Druck reinigen", "h", 30),
      work("Nacharbeiten", "h", 40),
      work("Recherche", "pauschal", 5),
      work("Sekundenleim-Manipulationen", "Stk.", 0),
      work("Nachvermessungen", "h", 0),
    ],
    defaultPackaging: 0,
    defaultShipping: 0,
    invoice: {
      invoicePrefix: "R",
      quotePrefix: "A",
      paymentDays: 14,
      introInvoice: "vielen Dank für deinen Auftrag. Hiermit stelle ich dir folgende Leistungen in Rechnung:",
      introQuote: "vielen Dank für deine Anfrage. Gerne biete ich dir Folgendes an:",
      closing: "Viele Grüße",
      textPrivat: "Privatverkauf – es wird keine Umsatzsteuer ausgewiesen.",
      textKleinunternehmer: "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.",
    },
  };
}

/** Füllt fehlende Felder auf, wenn ältere Daten geladen werden. */
export function migrateSettings(s: Partial<Settings>): Settings {
  const d = defaultSettings();
  return {
    ...d,
    ...s,
    sender: { ...d.sender, ...s.sender },
    invoice: { ...d.invoice, ...s.invoice },
  } as Settings;
}

export function newCustomer(existingNumbers: string[]): Customer {
  const t = now();
  return { id: uid(), createdAt: t, updatedAt: t, number: nextCustomerNumber(existingNumbers), name: "", company: "", street: "", zip: "", city: "", country: "", email: "", phone: "", notes: "" };
}

export function newPart(settings: Settings): PartLine {
  const m = settings.materials[0];
  return {
    id: uid(),
    name: "",
    quantity: 1,
    material: m?.name ?? "",
    color: "",
    spoolWeight: m?.spoolWeight ?? 1000,
    spoolPrice: m?.spoolPrice ?? 0,
    markupPercent: m?.markupPercent ?? 0,
    weight: 0,
    minutes: 0,
    printerId: settings.defaultPrinterId || settings.printers[0]?.id || "",
    fileName: "",
  };
}

export function newWork(name = "", unit = "h", unitPrice = 0): WorkLine {
  return { id: uid(), name, quantity: 1, unit, unitPrice };
}

export function newProject(settings: Settings, customerId = "", existingNumbers: string[] = []): Project {
  const t = now();
  return {
    id: uid(),
    createdAt: t,
    updatedAt: t,
    number: nextProjectNumber(existingNumbers),
    description: "",
    title: "",
    customTitle: false,
    customerId,
    status: "anfrage",
    orderDate: today(),
    dueDate: "",
    notes: "",
    parts: [newPart(settings)],
    work: [],
    packaging: settings.defaultPackaging,
    shipping: settings.defaultShipping,
    discount: 0,
    electricityPrice: null,
    invoices: [],
  };
}

export function migrateProject(p: Partial<Project>): Project {
  const base: Partial<Project> = { invoices: [], work: [], parts: [], discount: 0, electricityPrice: null, notes: "", dueDate: "", number: "" };
  return { ...base, ...p } as Project;
}

export const STATUS: { id: Project["status"]; label: string; color: string }[] = [
  { id: "anfrage", label: "Anfrage", color: "gray" },
  { id: "angebot", label: "Angebot", color: "purple" },
  { id: "auftrag", label: "Beauftragt", color: "blue" },
  { id: "druck", label: "Im Druck", color: "orange" },
  { id: "fertig", label: "Fertig", color: "teal" },
  { id: "geliefert", label: "Geliefert", color: "yellow" },
  { id: "bezahlt", label: "Bezahlt", color: "green" },
  { id: "storniert", label: "Storniert", color: "red" },
];

export const statusInfo = (id: Project["status"]) => STATUS.find((s) => s.id === id) ?? STATUS[0];
export const isOpen = (p: Project) => !["bezahlt", "storniert"].includes(p.status);
