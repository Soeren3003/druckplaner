import { newFilament, newPart } from "./defaults";
import type { FilamentUse, PartLine, Settings, ThreeMfInfo } from "./types";

/** Grobe Farbnamen für die Hex-Farben aus dem Slicer. */
const NAMED: [string, number, number, number][] = [
  ["schwarz", 0, 0, 0],
  ["weiß", 255, 255, 255],
  ["grau", 128, 128, 128],
  ["silber", 192, 192, 192],
  ["rot", 200, 30, 40],
  ["orange", 245, 130, 30],
  ["gelb", 245, 225, 40],
  ["gold", 212, 175, 55],
  ["grün", 40, 160, 70],
  ["hellblau", 120, 190, 235],
  ["blau", 30, 80, 200],
  ["violett", 130, 60, 170],
  ["pink", 240, 120, 180],
  ["braun", 120, 75, 40],
  ["beige", 225, 205, 160],
];

/** „#F4EE2A“ → „gelb“; unbekannte Werte bleiben unverändert. */
export function colorName(hex: string) {
  const m = hex.trim().match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
  if (!m) return hex.trim();
  const [r, g, b] = m.slice(1, 4).map((x) => parseInt(x, 16));
  let best = NAMED[0];
  let dist = Infinity;
  for (const n of NAMED) {
    // gewichtete Distanz, grob an die Helligkeitswahrnehmung angelehnt
    const d = 2 * (r - n[1]) ** 2 + 4 * (g - n[2]) ** 2 + 3 * (b - n[3]) ** 2;
    if (d < dist) [best, dist] = [n, d];
  }
  return best[0];
}

/** Filament aus den Einstellungen zum Typ aus dem Slicer („PLA“, „PETG“ …), sonst der Typ selbst. */
export function matchMaterial(settings: Settings, kind: string) {
  const k = kind.trim().toLowerCase();
  if (!k) return settings.materials[0]?.name ?? "";
  return (
    settings.materials.find((m) => m.name.toLowerCase() === k)?.name ??
    settings.materials.find((m) => m.name.toLowerCase().split(/\s+/)[0] === k)?.name ??
    kind.trim()
  );
}

/** Ein Druckteil je Druckplatte, mit einem Filament je verwendeter Farbe. */
export function partsFromThreeMf(settings: Settings, fileName: string, info: ThreeMfInfo): PartLine[] {
  const printer = settings.printers.find((p) => info.printer && p.name.toLowerCase().includes(info.printer.toLowerCase().replace("bambu lab ", "")));
  const base = fileName.replace(/\.3mf$/i, "");
  return info.plates.map((pl) => {
    const used = pl.filaments.filter((f) => f.usedG > 0);
    const filaments: FilamentUse[] = used.length
      ? used.map((f) => newFilament(settings, matchMaterial(settings, f.kind), colorName(f.color), Math.round(f.usedG * 100) / 100))
      : [newFilament(settings, undefined, "", Math.round(pl.weightG * 100) / 100)];
    return {
      ...newPart(settings),
      name: `${base}${info.plates.length > 1 ? ` – Platte ${pl.index}` : ""}`,
      filaments,
      minutes: Math.round(pl.printSeconds / 60),
      printerId: printer?.id ?? settings.defaultPrinterId,
      fileName,
    };
  });
}

/** CSS-Farbe zu einem Farbnamen („grün“) oder Hex-Wert, für Farbpunkte; unbekannt → null. */
export function colorCss(name: string): string | null {
  const t = name.trim().toLowerCase();
  if (/^#?[0-9a-f]{6}$/.test(t)) return t.startsWith("#") ? t : `#${t}`;
  const hit = NAMED.find(([n]) => t === n || t.startsWith(n));
  if (hit) return `rgb(${hit[1]}, ${hit[2]}, ${hit[3]})`;
  if (t.startsWith("weiss")) return "rgb(255, 255, 255)";
  if (t === "transparent") return "rgba(200, 220, 235, 0.6)";
  return null;
}
