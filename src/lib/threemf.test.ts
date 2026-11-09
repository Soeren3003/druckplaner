import { describe, expect, it } from "vitest";
import { defaultSettings } from "./defaults";
import { colorName, matchMaterial, partsFromThreeMf } from "./threemf";

describe("3MF-Übernahme", () => {
  const settings = defaultSettings();

  it("ordnet Slicer-Farben und -Typen zu", () => {
    expect(colorName("#000000")).toBe("schwarz");
    expect(colorName("#FFFFFF")).toBe("weiß");
    expect(colorName("#F4EE2A")).toBe("gelb");
    expect(colorName("#9D2235")).toBe("rot");
    expect(colorName("Galaxy Black")).toBe("Galaxy Black");
    expect(matchMaterial(settings, "PETG")).toBe("PETG Bambulab");
    expect(matchMaterial(settings, "PLA")).toBe("PLA Bambulab");
    expect(matchMaterial(settings, "PA6-CF")).toBe("PA6-CF");
  });

  it("legt je Platte ein Teil mit einem Filament je Farbe an", () => {
    const parts = partsFromThreeMf(settings, "Figur.3mf", {
      thumbnail: null,
      printer: "Bambu Lab A1 mini",
      filaments: [],
      plates: [
        { index: 1, weightG: 60.4, printSeconds: 7200, filaments: [{ kind: "PLA", color: "#00AE42", usedG: 52.3 }, { kind: "PLA", color: "#F4EE2A", usedG: 8.1 }, { kind: "PLA", color: "#000000", usedG: 0 }] },
        { index: 2, weightG: 12, printSeconds: 1800, filaments: [] },
      ],
    });
    expect(parts.map((p) => p.name)).toEqual(["Figur – Platte 1", "Figur – Platte 2"]);
    expect(parts[0].minutes).toBe(120);
    expect(parts[0].filaments.map((f) => `${f.material}/${f.color}/${f.weight}`)).toEqual(["PLA Bambulab/grün/52.3", "PLA Bambulab/gelb/8.1"]);
    expect(parts[0].printerId).toBe(settings.printers.find((p) => p.name === "Bambu Lab A1 mini")!.id);
    // ohne Filamentangaben: Gesamtgewicht der Platte
    expect(parts[1].filaments.map((f) => f.weight)).toEqual([12]);
  });
});
