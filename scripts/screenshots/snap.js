// Nur für Screenshots in der Vorschau: Ansicht mit html2canvas in doppelter Auflösung aufnehmen und an
// scripts/screenshots/server.py schicken. Eingabefelder werden in der Kopie durch gleich gestaltete
// Elemente ersetzt, weil html2canvas deren Werte sonst teils falsch zeichnet.
window.snap = async (name) => {
  document.activeElement && document.activeElement.blur();
  await new Promise((r) => setTimeout(r, 500));
  const inputs = [...document.querySelectorAll("input")];
  const live = inputs.map((i) => i.value);
  const styles = inputs.map((i) => getComputedStyle(i));
  const areas = [...document.querySelectorAll("textarea")].map((t) => ({ v: t.value, cs: getComputedStyle(t) }));
  const muted = getComputedStyle(document.documentElement).getPropertyValue("--muted").trim() || "#888";
  const c = await html2canvas(document.body, {
    scale: 2, width: innerWidth, height: innerHeight, windowWidth: innerWidth, windowHeight: innerHeight,
    backgroundColor: getComputedStyle(document.body).backgroundColor, logging: false,
    onclone: (doc) => {
      [...doc.querySelectorAll("input")].forEach((el, i) => {
        if (el.type === "checkbox" || el.type === "radio") return;
        let v = live[i] ?? "";
        if (el.type === "date") v = v ? v.split("-").reverse().join(".") : "tt.mm.jjjj";
        const cs = styles[i];
        const d = doc.createElement("div");
        d.textContent = v || el.placeholder || "";
        d.className = el.className;
        Object.assign(d.style, { font: cs.font, color: live[i] ? cs.color : muted, background: cs.backgroundColor, border: cs.border, borderRadius: cs.borderRadius,
          padding: cs.padding, width: cs.width, height: cs.height, boxSizing: "border-box", whiteSpace: "nowrap", overflow: "hidden", display: "flex",
          alignItems: "center", justifyContent: cs.textAlign === "right" ? "flex-end" : "flex-start", lineHeight: "1.4" });
        el.replaceWith(d);
      });
      [...doc.querySelectorAll("textarea")].forEach((el, i) => {
        const { v, cs } = areas[i];
        const d = doc.createElement("div");
        d.textContent = v || el.placeholder || "";
        Object.assign(d.style, { font: cs.font, color: cs.color, background: cs.backgroundColor, border: cs.border, borderRadius: cs.borderRadius,
          padding: cs.padding, width: cs.width, height: cs.height, boxSizing: "border-box", whiteSpace: "pre-wrap", overflow: "hidden", lineHeight: cs.lineHeight });
        el.replaceWith(d);
      });
    },
  });
  const blob = await new Promise((r) => c.toBlob(r, "image/png"));
  return `${name}: ${(await fetch(`/save?name=${name}.png`, { method: "POST", body: blob })).status}`;
};
