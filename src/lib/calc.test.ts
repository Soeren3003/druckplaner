import { describe, expect, it } from "vitest";
import { calcProject, documentLines, documentTotals, nextNumber, round2 } from "./calc";
import { defaultSettings, newProject } from "./defaults";
import { parseDuration, parseNum } from "./format";

describe("Kalkulation wie in der ODS-Tabelle", () => {
  const settings = defaultSettings();
  const a1mini = settings.printers.find((p) => p.name === "Bambu Lab A1 mini")!;

  it("rechnet den Auftrag Kabelhalter nach", () => {
    // Vorlage: 5 Stk., 11,24 g, 0:26 h, PLA 22,99 €/1000 g, A1 mini 150 W, 0,23 €/kWh,
    // Arbeitspakete Recherche 5 € + Energie (separat erfasst) → Summe 6,38 €.
    const p = newProject(settings);
    p.electricityPrice = 0.23;
    p.parts = [{ ...p.parts[0], quantity: 5, weight: 11.24, minutes: 26, spoolPrice: 22.99, spoolWeight: 1000, printerId: a1mini.id }];
    p.work = [{ id: "w", name: "Recherche", quantity: 1, unit: "pauschal", unitPrice: 5 }];
    const c = calcProject(p, settings);
    expect(round2(c.filament)).toBe(1.29);
    // Tabelle rechnet Strom nur für 1× Druckzeit; hier wird die Stückzahl berücksichtigt.
    expect(round2(c.kwh)).toBe(round2((150 * (26 / 60) * 5) / 1000));
    expect(round2(c.net)).toBe(round2(1.292 + c.energy + 5));
    expect(c.vat).toBe(0);
  });

  it("wendet Filamentaufschlag und MwSt an", () => {
    const s = { ...settings, taxMode: "mwst" as const, vatRate: 19 };
    const p = newProject(s);
    p.parts = [{ ...p.parts[0], quantity: 1, weight: 100, minutes: 0, spoolPrice: 20, spoolWeight: 1000, markupPercent: 50 }];
    const c = calcProject(p, s);
    expect(c.filament).toBeCloseTo(3);
    expect(c.vat).toBeCloseTo(0.57);
  });

  it("erzeugt Rechnungszeilen, deren Summe aufgeht", () => {
    const p = newProject(settings);
    p.parts = [{ ...p.parts[0], name: "Halter", quantity: 3, weight: 10, minutes: 30, printerId: a1mini.id }];
    p.shipping = 4.5;
    p.discount = 1;
    const lines = documentLines(p, settings, "einzeln");
    expect(lines.map((l) => l.description)).toEqual(["Halter (PLA Bambulab)", "Versand", "Nachlass"]);
    const t = documentTotals(lines, 0);
    expect(t.total).toBe(round2(lines.reduce((s, l) => s + l.total, 0)));
  });
});

describe("Eingaben", () => {
  it("versteht deutsche Zahlen", () => {
    expect(parseNum("22,99")).toBe(22.99);
    expect(parseNum("1.000,50")).toBe(1000.5);
    expect(parseNum("abc")).toBeNull();
  });
  it("versteht Druckzeiten", () => {
    expect(parseDuration("1:35")).toBe(95);
    expect(parseDuration("1h 35m")).toBe(95);
    expect(parseDuration("2h")).toBe(120);
    expect(parseDuration("45m")).toBe(45);
    expect(parseDuration("1,5")).toBe(90);
  });
  it("vergibt fortlaufende Nummern", () => {
    expect(nextNumber("R", 2026, [])).toBe("R2026-001");
    expect(nextNumber("R", 2026, ["R2026-001", "R2026-007", "R2025-099"])).toBe("R2026-008");
  });
});
