import { describe, expect, it } from "vitest";
import { calcProject, documentLines, documentTotals, nextNumber, partDescription, round2 } from "./calc";
import { defaultSettings, migrateProject, newFilament, newProject } from "./defaults";
import { addDays, isoDate, parseDuration, parseNum } from "./format";
import type { FilamentUse, PartLine } from "./types";

const fil = (weight: number, extra: Partial<FilamentUse> = {}): FilamentUse => ({ ...newFilament(defaultSettings()), weight, ...extra });

describe("Kalkulation wie in der ODS-Tabelle", () => {
  const settings = defaultSettings();
  const a1mini = settings.printers.find((p) => p.name === "Bambu Lab A1 mini")!;

  it("rechnet die Vorlage nach", () => {
    // Vorlage: 5 Stk., 11,24 g, 0:26 h, PLA 22,99 €/1000 g, A1 mini 150 W, 0,23 €/kWh,
    // Arbeitspakete Recherche 5 € + Energie (separat erfasst) → Summe 6,38 €.
    const p = newProject(settings);
    p.electricityPrice = 0.23;
    p.parts = [{ ...p.parts[0], quantity: 5, filaments: [fil(11.24, { spoolPrice: 22.99, spoolWeight: 1000 })], minutes: 26, printerId: a1mini.id }];
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
    p.parts = [{ ...p.parts[0], quantity: 1, filaments: [fil(100, { spoolPrice: 20, spoolWeight: 1000, markupPercent: 50 })], minutes: 0 }];
    const c = calcProject(p, s);
    expect(c.filament).toBeCloseTo(3);
    expect(c.vat).toBeCloseTo(0.57);
  });

  it("rechnet mehrfarbige Teile je Filament, die Druckzeit zählt einmal pro Teil", () => {
    const p = newProject(settings);
    p.parts = [
      {
        ...p.parts[0],
        quantity: 2,
        minutes: 60,
        printerId: a1mini.id,
        filaments: [fil(40, { spoolPrice: 20, spoolWeight: 1000 }), fil(10, { material: "PETG Bambulab", spoolPrice: 30, spoolWeight: 1000 })],
      },
    ];
    const c = calcProject(p, settings);
    expect(c.parts[0].filaments.map(round2)).toEqual([1.6, 0.6]);
    expect(c.filament).toBeCloseTo(2.2);
    expect(c.grams).toBe(100);
    expect(c.kwh).toBeCloseTo((150 * 2) / 1000);
  });

  it("erzeugt Rechnungszeilen, deren Summe aufgeht", () => {
    const p = newProject(settings);
    p.parts = [{ ...p.parts[0], name: "Halter", quantity: 3, filaments: [fil(10)], minutes: 30, printerId: a1mini.id }];
    p.shipping = 4.5;
    p.discount = 1;
    const lines = documentLines(p, settings, "einzeln");
    expect(lines.map((l) => l.description)).toEqual(["Halter (PLA Bambulab)", "Versand", "Nachlass"]);
    const t = documentTotals(lines, 0);
    expect(t.total).toBe(round2(lines.reduce((s, l) => s + l.total, 0)));
  });

  it("führt die Filamente mehrfarbiger Teile auf der Rechnung auf", () => {
    const part = { ...newProject(settings).parts[0], name: "Drache", filaments: [fil(52.3, { color: "grün" }), fil(8.1, { color: "gelb" }), fil(0, { color: "rot" })] };
    expect(partDescription(part)).toBe("Drache (mehrfarbig, je Stück)\n– PLA Bambulab, grün: 52,3 g\n– PLA Bambulab, gelb: 8,1 g");
    expect(partDescription({ ...part, filaments: [fil(5, { color: "rot" })] })).toBe("Drache (PLA Bambulab, rot)");
  });
});

describe("Umstellung älterer Aufträge", () => {
  it("macht aus dem einen Filament eines Teils aus Version 1.0 die Filamentliste", () => {
    const old = { id: "p1", name: "Halter", quantity: 2, material: "PETG Bambulab", color: "schwarz", spoolWeight: 1000, spoolPrice: 22.99, markupPercent: 0, weight: 12.5, minutes: 40, printerId: "x", fileName: "" };
    const p = migrateProject({ ...newProject(defaultSettings()), parts: [old as unknown as PartLine] });
    const part = p.parts[0];
    expect(part.filaments).toEqual([{ id: "p1-f0", material: "PETG Bambulab", color: "schwarz", spoolWeight: 1000, spoolPrice: 22.99, markupPercent: 0, weight: 12.5 }]);
    expect(part).not.toHaveProperty("weight");
    expect(part.minutes).toBe(40);
    // erneutes Umstellen ändert nichts
    expect(migrateProject(p).parts[0]).toEqual(part);
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
  it("rechnet Fristen in lokaler Zeit", () => {
    expect(addDays("2026-10-26", 14)).toBe("2026-11-09");
    expect(addDays("2026-10-28", 30)).toBe("2026-11-27");
    expect(addDays("2026-03-28", 1)).toBe("2026-03-29"); // Zeitumstellung
    expect(isoDate(new Date(2026, 0, 1, 0, 30))).toBe("2026-01-01");
  });
  it("vergibt fortlaufende Nummern", () => {
    expect(nextNumber("R", 2026, [])).toBe("R2026-001");
    expect(nextNumber("R", 2026, ["R2026-001", "R2026-007", "R2025-099"])).toBe("R2026-008");
  });
});
