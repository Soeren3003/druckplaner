import { useEffect, useRef, type ReactNode } from "react";

export interface MenuItem {
  label: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  title?: string;
}

/** Kontextmenü an der Mausposition; schließt bei Klick daneben, Escape, Scrollen oder Fensterwechsel. */
export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: (MenuItem | "sep")[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: Event) => {
      if (e.type === "mousedown" && ref.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("mousedown", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("blur", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("blur", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  // nicht über den Fensterrand hinaus
  const left = Math.min(x, window.innerWidth - 240);
  const top = Math.min(y, window.innerHeight - 36 * items.length - 12);
  return (
    <div ref={ref} className="context-menu" style={{ left, top }} role="menu">
      {items.map((it, i) =>
        it === "sep" ? (
          <div key={i} className="context-sep" />
        ) : (
          <button
            key={i}
            role="menuitem"
            className={it.danger ? "danger" : ""}
            disabled={it.disabled}
            title={it.title}
            onClick={() => {
              onClose();
              it.onClick();
            }}
          >
            {it.label}
          </button>
        ),
      )}
    </div>
  );
}
