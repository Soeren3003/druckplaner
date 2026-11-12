import { useEffect, useState } from "react";
import { api } from "./api";

/** Dateiendungen, die ein Slicer öffnen kann (wie im Rust-Teil). */
const MODEL = ["3mf", "stl", "step", "stp", "obj", "amf"];

export const isModelFile = (name: string) => MODEL.includes(name.split(".").pop()?.toLowerCase() ?? "");

export interface SlicerInfo {
  name: string;
  available: boolean;
}

let cached: Promise<SlicerInfo> | null = null;

/** Eingestellter Slicer; `refreshSlicer()` nach dem Ändern der Einstellung. */
export function useSlicer() {
  const [info, setInfo] = useState<SlicerInfo>({ name: "Bambu Studio", available: false });
  useEffect(() => {
    cached ??= api.slicerInfo().catch(() => ({ name: "Bambu Studio", available: false }));
    let alive = true;
    cached.then((i) => alive && setInfo(i));
    return () => {
      alive = false;
    };
  }, []);
  return info;
}

export function refreshSlicer() {
  cached = null;
}
