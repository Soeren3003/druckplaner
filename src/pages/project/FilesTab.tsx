import { useCallback, useEffect, useState } from "react";
import { Empty, Field, Modal } from "../../components/ui";
import { api, confirmDialog, inTauri, onFileDrop, pickFiles } from "../../lib/api";
import { partsFromThreeMf } from "../../lib/threemf";
import { bytes, dateTime, duration, num } from "../../lib/format";
import { useStore } from "../../lib/store";
import type { FileMeta, Project, ThreeMfInfo } from "../../lib/types";

const is3mf = (n: string) => n.toLowerCase().endsWith(".3mf");

export default function FilesTab({ project, update }: { project: Project; update: (p: Partial<Project>) => void }) {
  const { settings } = useStore();
  const [files, setFiles] = useState<FileMeta[]>([]);
  const [info, setInfo] = useState<Record<string, ThreeMfInfo | null>>({});
  const [hover, setHover] = useState(false);
  const [error, setError] = useState("");
  const [renaming, setRenaming] = useState<{ from: string; to: string } | null>(null);

  const load = useCallback(async () => {
    const list = await api.filesList(project.id);
    setFiles(list);
    for (const f of list.filter((f) => is3mf(f.name))) {
      api
        .threemfInfo(project.id, f.name)
        .then((i) => setInfo((s) => ({ ...s, [f.name]: i })))
        .catch(() => setInfo((s) => ({ ...s, [f.name]: null })));
    }
  }, [project.id]);

  const importPaths = useCallback(
    async (paths: string[]) => {
      if (!paths.length) return;
      try {
        setError("");
        await api.filesImport(project.id, paths);
        await load();
      } catch (e) {
        setError(String(e));
      }
    },
    [project.id, load],
  );

  useEffect(() => {
    load();
    let off: (() => void) | undefined;
    onFileDrop(importPaths, setHover).then((u) => (off = u));
    return () => off?.();
  }, [load, importPaths]);

  const remove = async (name: string) => {
    if (!(await confirmDialog(`„${name}“ löschen?`))) return;
    await api.filesDelete(project.id, name);
    load();
  };

  const rename = async () => {
    if (!renaming) return;
    const n = renaming.to.trim();
    if (!n || n === renaming.from) return setRenaming(null);
    try {
      await api.filesRename(project.id, renaming.from, n);
      setRenaming(null);
      load();
    } catch (e) {
      setError(String(e));
      setRenaming(null);
    }
  };

  /** Legt je Druckplatte ein Druckteil mit Druckzeit und einem Filament je Farbe aus dem Slicer an. */
  const takeOver = (name: string, i: ThreeMfInfo) => {
    const parts = partsFromThreeMf(settings, name, i);
    const empty = (p: Project["parts"][number]) => !p.name && !p.minutes && p.filaments.every((f) => !f.weight);
    update({ parts: [...project.parts.filter((p) => !empty(p)), ...parts] });
  };

  return (
    <section className={`card files ${hover ? "drop-hover" : ""}`}>
      <div className="card-head">
        <h2>Druckdateien & Anhänge</h2>
        <div className="row">
          <button className="ghost small" onClick={() => api.filesReveal(project.id)} disabled={!inTauri}>
            Ordner öffnen
          </button>
          <button className="primary small" onClick={async () => importPaths(await pickFiles())} disabled={!inTauri}>
            + Dateien hinzufügen
          </button>
        </div>
      </div>
      {error && <div className="alert error">{error}</div>}
      {files.length === 0 ? (
        <Empty>
          Noch keine Dateien. Ziehe 3MF-, STL-, STEP- oder Bilddateien hierher
          <br />
          oder nutze „Dateien hinzufügen“.
        </Empty>
      ) : (
        <ul className="file-list">
          {files.map((f) => {
            const i = info[f.name];
            return (
              <li key={f.name}>
                <div className="thumb">{i?.thumbnail ? <img src={i.thumbnail} alt="" /> : <span>{f.name.split(".").pop()?.toUpperCase()}</span>}</div>
                <div className="file-main">
                  <button className="link file-name" onClick={() => api.filesOpen(project.id, f.name)} title="Mit Standardprogramm öffnen">
                    {f.name}
                  </button>
                  <div className="muted small">
                    {bytes(f.size)} · {dateTime(new Date(f.modified).toISOString())}
                    {i?.printer && <> · {i.printer}</>}
                  </div>
                  {i && i.plates.length > 0 && (
                    <div className="small plates">
                      {i.plates.map((p) => (
                        <span key={p.index} className="chip">
                          Platte {p.index}: {num(p.weightG, 1)} g · {duration(p.printSeconds / 60)} h
                          {p.filaments.filter((x) => x.usedG > 0).length > 1 && <> · {p.filaments.filter((x) => x.usedG > 0).length} Filamente</>}
                        </span>
                      ))}
                      <button className="link small" onClick={() => takeOver(f.name, i)}>
                        → als Druckteile übernehmen
                      </button>
                    </div>
                  )}
                  {i && i.plates.length === 0 && is3mf(f.name) && (
                    <div className="muted small">Nicht gesliced – Gewicht/Zeit bitte manuell eintragen (oder Datei nach dem Slicen erneut speichern).</div>
                  )}
                </div>
                <div className="file-actions">
                  <button className="ghost small" onClick={() => api.filesReveal(project.id, f.name)}>
                    Zeigen
                  </button>
                  <button className="ghost small" onClick={() => setRenaming({ from: f.name, to: f.name })}>
                    Umbenennen
                  </button>
                  <button className="ghost small danger" onClick={() => remove(f.name)}>
                    Löschen
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {renaming && (
        <Modal
          title="Datei umbenennen"
          onClose={() => setRenaming(null)}
          footer={
            <>
              <button onClick={() => setRenaming(null)}>Abbrechen</button>
              <button className="primary" onClick={rename}>
                Umbenennen
              </button>
            </>
          }
        >
          <Field label="Neuer Dateiname">
            <input autoFocus value={renaming.to} onChange={(e) => setRenaming({ ...renaming, to: e.target.value })} onKeyDown={(e) => e.key === "Enter" && rename()} />
          </Field>
        </Modal>
      )}
    </section>
  );
}
