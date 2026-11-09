import { describe, expect, it } from "vitest";
import { demoData } from "./demo";
import { fillTemplate, mailDraft } from "./mailtext";

describe("E-Mail-Vorlagen", () => {
  it("ersetzt bekannte Platzhalter und lässt unbekannte stehen", () => {
    expect(fillTemplate("Hallo {vorname}, {nummer} {unbekannt}", { vorname: "Jana", nummer: "R2026-001" })).toBe("Hallo Jana, R2026-001 {unbekannt}");
  });

  it("füllt Empfänger, Betreff und Text einer Rechnung", () => {
    const { settings, customers, projects } = demoData();
    const p = projects.find((x) => x.id === "proj-8")!;
    const rec = p.invoices.find((i) => i.kind === "rechnung")!;
    const d = mailDraft(rec, p, customers.find((c) => c.id === p.customerId), settings);
    expect(d.to).toBe("werkstattnordgmbh@example.com");
    expect(d.subject).toBe(`Rechnung ${rec.number} – Gehäuse für Sensor`);
    expect(d.body).toContain("Hallo Sabine,");
    expect(d.body).toContain("123,29 €");
    expect(d.body).toMatch(/bis zum \d{1,2}\.\d{1,2}\.\d{4}\./);
    expect(d.body).toContain("Alex Beispiel");
  });
});
