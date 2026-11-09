import { firstName } from "./invoice";
import { addDays, date, money } from "./format";
import { projectLabel } from "./numbering";
import type { Customer, InvoiceRecord, Project, Settings } from "./types";

/** Platzhalter für Betreff und Text der E-Mail-Vorlagen. */
export const PLACEHOLDERS: [string, string][] = [
  ["{vorname}", "Vorname des Kunden"],
  ["{name}", "Name des Kunden"],
  ["{nummer}", "Angebots- bzw. Rechnungsnummer"],
  ["{auftrag}", "Beschreibung des Auftrags"],
  ["{auftragsnr}", "Auftragsnummer"],
  ["{betrag}", "Gesamtbetrag"],
  ["{faellig}", "Zahlungsziel der Rechnung"],
  ["{gueltig}", "Gültigkeit des Angebots"],
  ["{absender}", "dein Name aus Einstellungen → Absender"],
];

export function fillTemplate(template: string, values: Record<string, string>) {
  return template.replace(/\{([a-zäöü]+)\}/gi, (m, key: string) => values[key.toLowerCase()] ?? m);
}

/** Empfänger, Betreff und Text für das Versenden eines Angebots bzw. einer Rechnung. */
export function mailDraft(rec: InvoiceRecord, project: Project, customer: Customer | undefined, settings: Settings) {
  const inv = settings.invoice;
  const isInvoice = rec.kind === "rechnung";
  const values: Record<string, string> = {
    vorname: customer ? firstName(customer.name) : "",
    name: customer?.name ?? "",
    nummer: rec.number,
    auftrag: projectLabel(project) || project.number,
    auftragsnr: project.number,
    betrag: money(rec.total, settings.currency).replace(/ /g, " "),
    faellig: date(addDays(rec.date, inv.paymentDays)),
    gueltig: date(addDays(rec.date, 30)),
    absender: settings.sender.name,
  };
  return {
    to: customer?.email ?? "",
    subject: fillTemplate(isInvoice ? inv.mailSubjectInvoice : inv.mailSubjectQuote, values),
    body: fillTemplate(isInvoice ? inv.mailBodyInvoice : inv.mailBodyQuote, values),
  };
}
