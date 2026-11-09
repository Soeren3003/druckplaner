import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Customer, InvoiceRecord, Project, Settings } from "./types";
import { addDays, date, fixed, money } from "./format";
import { projectLabel } from "./numbering";

const clean = (s: string) => s.replace(/[  ]/g, " ");


/** „Muster, Max“ → „Max“, „Erika Beispiel“ → „Erika“ */
export function firstName(name: string) {
  const n = name.trim();
  if (n.includes(",")) return n.split(",")[1].trim().split(/\s+/)[0] || n;
  return n.split(/\s+/)[0] || n;
}

/** „Muster, Max“ → „Max Muster“ für die Anschrift. */
function displayName(name: string) {
  const n = name.trim();
  if (!n.includes(",")) return n;
  const [last, first] = n.split(",").map((s) => s.trim());
  return `${first} ${last}`.trim();
}

export function buildPdf(doc: InvoiceRecord, project: Project, customer: Customer | undefined, settings: Settings, note: string): Uint8Array {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const s = settings.sender;
  const cur = settings.currency;
  const m = (n: number) => clean(money(n, cur));
  const L = 22;
  const R = 190;
  const isInvoice = doc.kind === "rechnung";
  const gray = (v = 110) => pdf.setTextColor(v, v, v);
  const black = () => pdf.setTextColor(20, 20, 20);

  // Kopf
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  black();
  pdf.text(s.name || "3D-Druck", R, 22, { align: "right" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  gray();
  const head = [s.street, [s.zip, s.city].filter(Boolean).join(" "), s.email, s.phone].filter(Boolean);
  head.forEach((l, i) => pdf.text(l, R, 28 + i * 4.2, { align: "right" }));

  // Absenderzeile + Empfänger (Fensterposition DIN 5008)
  pdf.setFontSize(7);
  const senderLine = [s.name, s.street, [s.zip, s.city].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
  if (senderLine) {
    pdf.text(senderLine, L, 50);
    pdf.setDrawColor(180);
    pdf.line(L, 51, L + Math.min(85, pdf.getTextWidth(senderLine)), 51);
  }
  pdf.setFontSize(10.5);
  black();
  const rcpt = customer
    ? [customer.company, displayName(customer.name), customer.street, [customer.zip, customer.city].filter(Boolean).join(" "), customer.country]
    : ["–"];
  rcpt.filter(Boolean).forEach((l, i) => pdf.text(l, L, 57 + i * 5));

  // Infoblock rechts
  const info: [string, string][] = [
    [isInvoice ? "Rechnungsnr." : "Angebotsnr.", doc.number],
    ["Datum", date(doc.date)],
  ];
  if (project.number) info.push(["Auftragsnr.", project.number]);
  if (customer?.number) info.push(["Kundennr.", customer.number]);
  if (isInvoice && project.dueDate) info.push(["Lieferdatum", date(project.dueDate)]);
  if (!isInvoice) info.push(["Gültig bis", date(addDays(doc.date, 30))]);
  pdf.setFontSize(9.5);
  info.forEach(([k, v], i) => {
    gray();
    pdf.text(k, 135, 57 + i * 5);
    black();
    pdf.text(v, R, 57 + i * 5, { align: "right" });
  });

  // Titel und Einleitung
  let y = 100;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(15);
  pdf.text(`${isInvoice ? "Rechnung" : "Angebot"} ${doc.number}`, L, y);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  const subject = projectLabel(project);
  if (subject) {
    y += 6;
    gray();
    pdf.text(`Auftrag: ${subject}`, L, y);
    black();
  }
  y += 10;
  pdf.text(`Hallo ${customer ? firstName(customer.name) : ""},`, L, y);
  y += 6;
  const intro = pdf.splitTextToSize(isInvoice ? settings.invoice.introInvoice : settings.invoice.introQuote, R - L);
  pdf.text(intro, L, y);
  y += intro.length * 4.6 + 3;

  // Positionen
  autoTable(pdf, {
    startY: y,
    margin: { left: L, right: 210 - R },
    head: [["Pos.", "Beschreibung", "Menge", "Einheit", "Einzelpreis", "Gesamt"]],
    body: doc.lines.map((l, i) => [String(i + 1), l.description, fixed(l.quantity, l.quantity % 1 ? 2 : 0), l.unit, m(l.unitPrice), m(l.total)]),
    theme: "plain",
    styles: { font: "helvetica", fontSize: 9.5, cellPadding: { top: 2, bottom: 2, left: 1.5, right: 1.5 }, textColor: 20 },
    headStyles: { fontStyle: "bold", fillColor: [238, 241, 247] },
    columnStyles: {
      0: { cellWidth: 12 },
      2: { halign: "right", cellWidth: 16 },
      3: { cellWidth: 18 },
      4: { halign: "right", cellWidth: 26 },
      5: { halign: "right", cellWidth: 26 },
    },
    didParseCell: (d) => {
      if (d.section === "head" && d.column.index >= 4) d.cell.styles.halign = "right";
      if (d.section === "head" && d.column.index === 2) d.cell.styles.halign = "right";
    },
    didDrawCell: (d) => {
      if (d.section === "body") {
        pdf.setDrawColor(225);
        pdf.line(d.cell.x, d.cell.y + d.cell.height, d.cell.x + d.cell.width, d.cell.y + d.cell.height);
      }
    },
  });
  y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  // Summen
  const sumRow = (label: string, value: string, bold = false) => {
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.text(label, 135, y);
    pdf.text(value, R, y, { align: "right" });
    y += 5.5;
  };
  pdf.setFontSize(10);
  if (doc.vat) {
    sumRow("Nettobetrag", m(doc.net));
    sumRow(`zzgl. ${fixed(settings.vatRate, settings.vatRate % 1 ? 2 : 0)} % USt.`, m(doc.vat));
  }
  pdf.setDrawColor(60);
  pdf.line(135, y - 3.5, R, y - 3.5);
  y += 1;
  pdf.setFontSize(11.5);
  sumRow("Gesamtbetrag", m(doc.total), true);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  y += 4;

  const paragraphs: string[] = [];
  if (settings.taxMode === "privat") paragraphs.push(settings.invoice.textPrivat);
  if (settings.taxMode === "kleinunternehmer") paragraphs.push(settings.invoice.textKleinunternehmer);
  if (isInvoice) {
    const due = date(addDays(doc.date, settings.invoice.paymentDays));
    paragraphs.push(
      s.iban
        ? `Bitte überweise den Betrag bis zum ${due} auf das unten angegebene Konto. Verwendungszweck: ${doc.number}`
        : `Bitte zahle den Betrag bis zum ${due}.`,
    );
  } else {
    paragraphs.push("Dieses Angebot ist 30 Tage gültig. Ich freue mich auf deine Rückmeldung.");
  }
  if (note.trim()) paragraphs.push(note.trim());
  for (const p of paragraphs) {
    const lines = pdf.splitTextToSize(p, R - L);
    if (y + lines.length * 4.6 > 262) {
      pdf.addPage();
      y = 25;
    }
    pdf.text(lines, L, y);
    y += lines.length * 4.6 + 2.5;
  }
  y += 4;
  pdf.text(settings.invoice.closing, L, y);
  if (s.name) pdf.text(s.name, L, y + 5);

  // Fußzeile auf jeder Seite
  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    pdf.setFontSize(7.5);
    gray(120);
    pdf.setDrawColor(210);
    pdf.line(L, 276, R, 276);
    const cols = [
      [s.name, s.street, [s.zip, s.city].filter(Boolean).join(" ")],
      [s.email && `E-Mail: ${s.email}`, s.phone && `Telefon: ${s.phone}`, s.taxId && `Steuernr.: ${s.taxId}`],
      [s.bank, s.iban && `IBAN: ${s.iban}`, s.bic && `BIC: ${s.bic}`],
    ];
    cols.forEach((c, ci) => c.filter(Boolean).forEach((l, li) => pdf.text(String(l), L + ci * 60, 281 + li * 3.6)));
    if (pages > 1) pdf.text(`Seite ${i} von ${pages}`, R, 292, { align: "right" });
  }

  return new Uint8Array(pdf.output("arraybuffer"));
}
