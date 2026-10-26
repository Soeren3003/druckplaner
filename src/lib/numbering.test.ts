import { describe, expect, it } from "vitest";
import { defaultSettings, newCustomer, newProject } from "./defaults";
import { assignMissingNumbers, autoTitle, nextCustomerNumber, projectLabel, projectTitle } from "./numbering";
import type { Customer, Project } from "./types";

const customer = (name: string, createdAt: string) => ({ ...newCustomer([]), name, createdAt, number: "" }) as Customer;

/** Auftrag im alten Format (vor Nummern und Beschreibung). */
const oldProject = (title: string, orderDate: string, customerId = "") => {
  const p = newProject(defaultSettings(), customerId) as Partial<Project>;
  delete p.number;
  delete p.description;
  delete p.customTitle;
  return { ...p, title, orderDate } as Project;
};

describe("Nummern und Bezeichnungen", () => {
  it("vergibt Kundennummern fortlaufend", () => {
    expect(nextCustomerNumber([])).toBe("K-001");
    expect(nextCustomerNumber(["K-001", "K-009", "X-100"])).toBe("K-010");
  });

  it("setzt die Bezeichnung aus Nummer, Kunde und Beschreibung zusammen", () => {
    expect(autoTitle({ number: "2026-001", description: "20x Kabelhalter" }, { name: "Muster, Max" })).toBe(
      "2026-001 · Muster, Max – 20x Kabelhalter",
    );
    expect(autoTitle({ number: "2026-002", description: "" }, undefined)).toBe("2026-002");
  });

  it("nutzt eine eigene Bezeichnung nur, wenn sie gesetzt ist", () => {
    const p = { ...newProject(defaultSettings()), number: "2026-003", description: "Drache" };
    expect(projectTitle({ ...p, customTitle: true, title: "Geburtstagsdrache" })).toBe("Geburtstagsdrache");
    expect(projectTitle({ ...p, customTitle: true, title: "  " })).toBe("2026-003 – Drache");
    expect(projectLabel({ ...p, customTitle: false, title: "alt" })).toBe("Drache");
  });

  it("stellt ältere Aufträge deterministisch nach Datum um", () => {
    const r = assignMissingNumbers(
      [customer("B", "2026-02-01"), customer("A", "2026-01-01")],
      [oldProject("Drache", "2026-09-14"), oldProject("Kabelhalter", "2026-04-03"), oldProject("Alt", "2025-12-01")],
    );
    expect(r.customers.map((x) => `${x.name}:${x.number}`)).toEqual(["B:K-002", "A:K-001"]);
    expect(r.projects.map((x) => `${x.description}:${x.number}:${x.customTitle}`)).toEqual([
      "Drache:2026-002:false",
      "Kabelhalter:2026-001:false",
      "Alt:2025-001:false",
    ]);
    expect(r.changedProjects).toHaveLength(3);
    // Zweiter Lauf ändert nichts mehr.
    const again = assignMissingNumbers(r.customers, r.projects);
    expect(again.changedCustomers.length + again.changedProjects.length).toBe(0);
  });

  it("nummeriert Kunden nach ihrem ersten Auftrag", () => {
    const t = "2026-10-26T10:00:00Z"; // gleicher Anlagezeitpunkt wie nach einem Import
    const [lisa, max] = [customer("Lisa", t), customer("Max", t)];
    const r = assignMissingNumbers([lisa, max], [oldProject("Drache", "2026-09-14", lisa.id), oldProject("Kabelhalter", "2026-04-03", max.id)]);
    expect(r.customers.map((x) => `${x.name}:${x.number}`)).toEqual(["Lisa:K-002", "Max:K-001"]);
  });
});
