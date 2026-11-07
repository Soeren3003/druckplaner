import { describe, expect, it } from "vitest";
import { calcProject } from "./calc";
import { demoData } from "./demo";

describe("Demo-Daten", () => {
  const { settings, customers, projects } = demoData();

  it("sind vollständig und verweisen auf vorhandene Kunden und Drucker", () => {
    expect(customers.length).toBeGreaterThanOrEqual(5);
    expect(projects.length).toBeGreaterThanOrEqual(10);
    for (const p of projects) {
      expect(customers.some((c) => c.id === p.customerId)).toBe(true);
      for (const part of p.parts) expect(settings.printers.some((pr) => pr.id === part.printerId)).toBe(true);
      expect(calcProject(p, settings).total).toBeGreaterThan(0);
    }
  });

  it("haben eindeutige, fortlaufende Nummern", () => {
    const numbers = projects.map((p) => p.number);
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(new Set(customers.map((c) => c.number)).size).toBe(customers.length);
    const invoices = projects.flatMap((p) => p.invoices).map((i) => i.number);
    expect(new Set(invoices).size).toBe(invoices.length);
  });

  it("nutzen nur Beispieladressen", () => {
    for (const c of customers) expect(c.email.endsWith("@example.com")).toBe(true);
    expect(settings.sender.email.endsWith("@example.com")).toBe(true);
  });
});
