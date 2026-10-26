import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, type Collection } from "./api";
import { defaultSettings, migrateProject, migrateSettings, now } from "./defaults";
import type { Customer, LocalConfig, Project, Settings, SyncReport } from "./types";

type Entity = { id: string; updatedAt: string };

interface SyncStatus {
  running: boolean;
  last: SyncReport | null;
  error: string;
}

interface Store {
  ready: boolean;
  settings: Settings;
  customers: Customer[];
  projects: Project[];
  config: LocalConfig | null;
  sync: SyncStatus;
  saveError: string;
  clearSaveError: () => void;
  saveSettings: (s: Settings) => void;
  saveCustomer: (c: Customer) => void;
  deleteCustomer: (id: string) => Promise<void>;
  saveProject: (p: Project) => void;
  deleteProject: (id: string) => Promise<void>;
  reload: () => Promise<void>;
  runSync: () => Promise<void>;
  setConfig: (c: LocalConfig) => void;
  flush: () => Promise<void>;
}

const Ctx = createContext<Store | null>(null);

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("StoreProvider fehlt");
  return s;
}

const SAVE_DELAY = 400;

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [config, setConfig] = useState<LocalConfig | null>(null);
  const [sync, setSync] = useState<SyncStatus>({ running: false, last: null, error: "" });
  const [saveError, setSaveError] = useState("");

  // Verzögertes Speichern: Tippen erzeugt nicht für jeden Buchstaben einen Schreibvorgang.
  const pending = useRef(new Map<string, { collection: Collection; value: Entity; timer: number }>());

  const persist = useCallback(async (collection: Collection, value: Entity) => {
    try {
      await api.dbPut(collection, value.id, value);
    } catch (e) {
      console.error(e);
      setSaveError(`Speichern fehlgeschlagen: ${e}`);
    }
  }, []);

  const schedule = useCallback(
    (collection: Collection, value: Entity) => {
      const k = `${collection}/${value.id}`;
      const prev = pending.current.get(k);
      if (prev) clearTimeout(prev.timer);
      const timer = window.setTimeout(() => {
        pending.current.delete(k);
        persist(collection, value);
      }, SAVE_DELAY);
      pending.current.set(k, { collection, value, timer });
    },
    [persist],
  );

  const cancel = (k: string) => {
    const it = pending.current.get(k);
    if (it) clearTimeout(it.timer);
    pending.current.delete(k);
  };

  const flush = useCallback(async () => {
    const items = [...pending.current.values()];
    pending.current.clear();
    for (const it of items) {
      clearTimeout(it.timer);
      await persist(it.collection, it.value);
    }
  }, [persist]);

  const reload = useCallback(async () => {
    const [s, c, p] = await Promise.all([
      api.dbList<Settings>("settings"),
      api.dbList<Customer>("customers"),
      api.dbList<Project>("projects"),
    ]);
    const stored = s.find((x) => x.id === "settings");
    if (stored) setSettings(migrateSettings(stored));
    else {
      const d = defaultSettings();
      setSettings(d);
      await api.dbPut("settings", d.id, d);
    }
    setCustomers(c.sort((a, b) => a.name.localeCompare(b.name, "de")));
    setProjects(p.map(migrateProject));
  }, []);

  const runSync = useCallback(async () => {
    setSync((s) => ({ ...s, running: true, error: "" }));
    try {
      await flush();
      const report = await api.syncNow();
      setSync({ running: false, last: report, error: report.errors.length ? report.errors.join("\n") : "" });
      if (report.downloaded || report.deletedLocal || report.conflicts.length) await reload();
    } catch (e) {
      setSync((s) => ({ ...s, running: false, error: String(e) }));
    }
  }, [flush, reload]);

  useEffect(() => {
    (async () => {
      const cfg = await api.getConfig();
      setConfig(cfg);
      await reload();
      setReady(true);
      if (cfg.webdav.enabled) runSync();
    })();
    const onClose = () => void flush();
    window.addEventListener("beforeunload", onClose);
    return () => window.removeEventListener("beforeunload", onClose);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Automatischer Abgleich im eingestellten Intervall.
  useEffect(() => {
    const min = config?.webdav.enabled ? config.webdav.autoSyncMinutes : 0;
    if (!min) return;
    const t = window.setInterval(() => runSync(), min * 60_000);
    return () => clearInterval(t);
  }, [config, runSync]);

  const upsert = <T extends Entity>(list: T[], item: T) => {
    const i = list.findIndex((x) => x.id === item.id);
    if (i < 0) return [...list, item];
    const copy = list.slice();
    copy[i] = item;
    return copy;
  };

  const value: Store = useMemo(
    () => ({
      ready,
      settings,
      customers,
      projects,
      config,
      sync,
      saveError,
      clearSaveError: () => setSaveError(""),
      reload,
      runSync,
      flush,
      setConfig,
      saveSettings: (s) => {
        const v = { ...s, updatedAt: now() };
        setSettings(v);
        schedule("settings", v);
      },
      saveCustomer: (c) => {
        const v = { ...c, updatedAt: now() };
        setCustomers((l) => upsert(l, v));
        schedule("customers", v);
      },
      deleteCustomer: async (id) => {
        cancel(`customers/${id}`);
        await api.dbDelete("customers", id);
        setCustomers((l) => l.filter((c) => c.id !== id));
      },
      saveProject: (p) => {
        const v = { ...p, updatedAt: now() };
        setProjects((l) => upsert(l, v));
        schedule("projects", v);
      },
      deleteProject: async (id) => {
        const p = projects.find((x) => x.id === id);
        cancel(`projects/${id}`);
        await api.dbDelete("projects", id);
        await api.filesDeleteAll(id);
        for (const inv of p?.invoices ?? []) await api.invoiceDelete(inv.fileName);
        setProjects((l) => l.filter((x) => x.id !== id));
      },
    }),
    [ready, settings, customers, projects, config, sync, saveError, reload, runSync, flush, schedule],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
