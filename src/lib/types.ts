export type TaxMode = "privat" | "kleinunternehmer" | "mwst";

export interface Printer {
  id: string;
  name: string;
  /** Durchschnittliche Leistungsaufnahme beim Drucken. */
  watts: number;
  /** Verschleiß/Abschreibung pro Druckstunde. */
  wearPerHour: number;
}

export interface Material {
  id: string;
  name: string;
  spoolWeight: number;
  spoolPrice: number;
  /** Aufschlag auf den Rollenpreis in Prozent (Ausschuss, Fehldrucke …). */
  markupPercent: number;
}

export interface WorkTemplate {
  id: string;
  name: string;
  unit: string;
  price: number;
}

export interface Sender {
  name: string;
  street: string;
  zip: string;
  city: string;
  country: string;
  email: string;
  phone: string;
  iban: string;
  bic: string;
  bank: string;
  taxId: string;
}

export interface InvoiceSettings {
  invoicePrefix: string;
  quotePrefix: string;
  paymentDays: number;
  introInvoice: string;
  introQuote: string;
  closing: string;
  textPrivat: string;
  textKleinunternehmer: string;
  /** E-Mail-Vorlagen; Platzhalter siehe lib/mailtext.ts */
  mailSubjectInvoice: string;
  mailBodyInvoice: string;
  mailSubjectQuote: string;
  mailBodyQuote: string;
}

export interface Settings {
  id: "settings";
  updatedAt: string;
  sender: Sender;
  taxMode: TaxMode;
  vatRate: number;
  currency: string;
  electricityPrice: number;
  printers: Printer[];
  materials: Material[];
  colors: string[];
  workTemplates: WorkTemplate[];
  defaultPrinterId: string;
  /** Für die Druckwarteschlange: wie viele Stunden am Tag die Drucker laufen. */
  printHoursPerDay: number;
  defaultPackaging: number;
  defaultShipping: number;
  invoice: InvoiceSettings;
}

export interface Customer {
  id: string;
  createdAt: string;
  updatedAt: string;
  /** Kundennummer, z. B. „K-001“. */
  number: string;
  name: string;
  company: string;
  street: string;
  zip: string;
  city: string;
  country: string;
  email: string;
  phone: string;
  notes: string;
}

/** Ein Filament eines Druckteils; mehrfarbige Teile (z. B. mit AMS) haben mehrere. */
export interface FilamentUse {
  id: string;
  /** Name des Filaments – als Kopie, damit spätere Preisänderungen alte Aufträge nicht verändern. */
  material: string;
  color: string;
  spoolWeight: number;
  spoolPrice: number;
  markupPercent: number;
  /** Verbrauch pro Stück in Gramm. */
  weight: number;
}

export interface PartLine {
  id: string;
  name: string;
  quantity: number;
  /** Mindestens ein Filament; bei mehrfarbigen Drucken mehrere mit eigenem Verbrauch. */
  filaments: FilamentUse[];
  /** Bereits gedruckte Stück (Druckwarteschlange). */
  printed?: number;
  /** Eigene Position in der Druckwarteschlange; leer = nach Liefertermin. */
  queueRank?: number;
  /** Druckzeit pro Stück in Minuten (bei 100 % Geschwindigkeit), gilt für das ganze Teil. */
  minutes: number;
  printerId: string;
  fileName: string;
}

export interface WorkLine {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
}

export type ProjectStatus =
  | "anfrage"
  | "angebot"
  | "auftrag"
  | "druck"
  | "fertig"
  | "geliefert"
  | "bezahlt"
  | "storniert";

export interface DocLine {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
}

export interface InvoiceRecord {
  id: string;
  kind: "rechnung" | "angebot";
  number: string;
  date: string;
  fileName: string;
  lines: DocLine[];
  net: number;
  vat: number;
  total: number;
  paidAt: string;
  /** Zuletzt per E-Mail versendet (ISO-Zeitpunkt) und an wen. */
  sentAt?: string;
  sentTo?: string;
}

export interface Project {
  id: string;
  createdAt: string;
  updatedAt: string;
  /** Auftragsnummer, z. B. „2026-001“. */
  number: string;
  /** Worum es geht, z. B. „20x Kabelhalter in PLA“. */
  description: string;
  /** Eigene Bezeichnung; nur genutzt, wenn `customTitle` gesetzt ist. */
  title: string;
  customTitle: boolean;
  customerId: string;
  status: ProjectStatus;
  orderDate: string;
  dueDate: string;
  notes: string;
  parts: PartLine[];
  work: WorkLine[];
  packaging: number;
  shipping: number;
  discount: number;
  /** Leer = Strompreis aus den Einstellungen. */
  electricityPrice: number | null;
  invoices: InvoiceRecord[];
}

/** Privater Druck: nur für die Druckwarteschlange, ohne Auftrag, Kunde oder Rechnung. */
export interface PrivatePrint {
  id: string;
  createdAt: string;
  updatedAt: string;
  name: string;
  quantity: number;
  printed: number;
  /** Druckzeit pro Stück in Minuten */
  minutes: number;
  printerId: string;
  filaments: FilamentUse[];
  /** optionaler Wunschtermin */
  dueDate: string;
  notes: string;
  /** optionale Druckdatei, abgelegt unter files/<id>/ */
  fileName: string;
  queueRank?: number;
}

export interface FileMeta {
  name: string;
  size: number;
  modified: number;
}

export interface FilamentInfo {
  kind: string;
  color: string;
  usedG: number;
}

export interface ThreeMfInfo {
  thumbnail: string | null;
  printer: string | null;
  plates: { index: number; weightG: number; printSeconds: number; filaments: FilamentInfo[] }[];
  filaments: FilamentInfo[];
}

export interface WebdavConfig {
  enabled: boolean;
  url: string;
  username: string;
  remoteFolder: string;
  autoSyncMinutes: number;
}

export interface SmtpConfig {
  enabled: boolean;
  host: string;
  /** 0 = Standard (587 bei STARTTLS, 465 bei SSL/TLS) */
  port: number;
  security: "starttls" | "ssl";
  /** leer = Absenderadresse */
  username: string;
  fromName: string;
  fromAddress: string;
  copyToSelf: boolean;
}

export type SlicerKind = "bambu" | "orca" | "prusa";

export interface LocalConfig {
  dataDir: string;
  webdav: WebdavConfig;
  smtp: SmtpConfig;
  /** leer = Bambu Studio */
  slicer: SlicerKind | "";
}

export interface SyncReport {
  uploaded: number;
  downloaded: number;
  deletedLocal: number;
  deletedRemote: number;
  conflicts: string[];
  errors: string[];
  finishedAt: string;
}
