import { describe, expect, it } from "vitest";
import { defaultSettings, newProject } from "./defaults";
import { buildQueue, rankPatches, setPrinted, statusAfterPrint } from "./queue";
import type { Project } from "./types";

const settings = { ...defaultSettings(), printHoursPerDay: 10 };
const [p1, p2] = settings.printers;

function project(id: string, due: string, parts: [string, number, number, string][], status: Project["status"] = "auftrag"): Project {
  const p = newProject(settings);
  return {
    ...p,
    id,
    number: `2026-${id}`,
    status,
    orderDate: "2026-11-01",
    dueDate: due,
    parts: parts.map(([name, quantity, minutes, printerId], i) => ({ ...p.parts[0], id: `${id}-${i}`, name, quantity, minutes, printerId })),
  };
}

describe("Druckwarteschlange", () => {
  const a = project("a", "2026-11-20", [["Halter", 2, 120, p1.id]]);
  const b = project("b", "2026-11-12", [["Clip", 4, 30, p1.id], ["Deckel", 1, 300, p2.id]]);
  const c = project("c", "", [["Figur", 1, 600, p1.id]]);
  const angebot = project("d", "2026-11-10", [["Teil", 1, 60, p1.id]], "angebot");

  it("nimmt nur beauftragte Aufträge, sortiert nach Liefertermin", () => {
    const q = buildQueue([a, b, c, angebot], [], settings, { today: "2026-11-10" });
    expect(q.open.map((e) => e.part.name)).toEqual(["Clip", "Deckel", "Halter", "Figur"]);
  });

  it("plant je Drucker getrennt und erkennt verspätete Teile", () => {
    const q = buildQueue([a, b, c], [], settings, { today: "2026-11-10" });
    const by = Object.fromEntries(q.open.map((e) => [e.part.name, e]));
    expect(by.Clip.endHours).toBe(2); // 4 × 30 min auf Drucker 1
    expect(by.Deckel.startHours).toBe(0); // Drucker 2 läuft parallel
    expect(by.Halter.endHours).toBe(6);
    expect(by.Figur.endHours).toBe(16); // 10 h/Tag → zweiter Tag
    expect(by.Figur.estimate).toBe("2026-11-11");
    expect(by.Halter.late).toBe(false);
    const eng = { ...settings, printHoursPerDay: 0.25 }; // 6 h Arbeit → 24 Tage
    expect(buildQueue([a, b], [], eng, { today: "2026-11-10" }).open.find((e) => e.part.name === "Halter")!.late).toBe(true);
  });

  it("zählt nur offene Stück und blendet Fertiges aus", () => {
    const half = setPrinted(b, "b-0", 3);
    const q = buildQueue([half], [], settings, { today: "2026-11-10" });
    expect(q.open[0].remaining).toBe(1);
    expect(q.open[0].minutes).toBe(30);
    const done = setPrinted(half, "b-0", 4);
    expect(buildQueue([done], [], settings).open.map((e) => e.part.name)).toEqual(["Deckel"]);
    expect(buildQueue([done], [], settings, { includeDone: true }).done.map((e) => e.part.name)).toEqual(["Clip"]);
    // fertige Aufträge erscheinen nur unter „Gedruckte“, damit sich Abhaken zurücknehmen lässt
    const fertig = setPrinted(done, "b-1", 1);
    expect(fertig.status).toBe("fertig");
    expect(buildQueue([fertig], [], settings).open).toEqual([]);
    expect(buildQueue([fertig], [], settings, { includeDone: true }).done.map((e) => e.part.name)).toEqual(["Clip", "Deckel"]);
    expect(setPrinted(fertig, "b-1", 0).status).toBe("druck");
  });

  it("behält eigene Reihenfolge, neue Teile ordnen sich nach Termin ein", () => {
    const q = buildQueue([a, b, c], [], settings).open;
    const patches = rankPatches(q, 3, 0); // „Figur“ ganz nach vorn
    const apply = (p: Project) => ({ ...p, parts: p.parts.map((x) => ({ ...x, queueRank: patches.find((r) => r.partId === x.id)?.rank })) });
    const ranked = [a, b, c].map(apply);
    expect(buildQueue(ranked, [], settings).open.map((e) => e.part.name)).toEqual(["Figur", "Clip", "Deckel", "Halter"]);
    const eilig = project("e", "2026-11-11", [["Eilteil", 1, 30, p1.id]]);
    expect(buildQueue([...ranked, eilig], [], settings).open.map((e) => e.part.name)).toEqual(["Figur", "Eilteil", "Clip", "Deckel", "Halter"]);
  });

  it("setzt den Status beim Drucken", () => {
    expect(setPrinted(b, "b-0", 1).status).toBe("druck");
    expect(setPrinted(setPrinted(b, "b-0", 4), "b-1", 1).status).toBe("fertig");
    expect(setPrinted(b, "b-0", 99).parts[0].printed).toBe(4);
    const zurueck = setPrinted({ ...setPrinted(setPrinted(b, "b-0", 4), "b-1", 1) }, "b-1", 0);
    expect(zurueck.status).toBe("druck");
    expect(statusAfterPrint({ ...b, status: "geliefert" })).toBe("geliefert");
  });
});
