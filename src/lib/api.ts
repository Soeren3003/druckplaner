import type { FileMeta, LocalConfig, SyncReport, ThreeMfInfo } from "./types";

/** Läuft die Oberfläche in der App (Tauri) oder nur im Browser (Entwicklung)? */
export const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function call<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!inTauri) return mock(cmd, args) as T;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

export type Collection = "customers" | "projects" | "settings";

export const api = {
  getConfig: () => call<LocalConfig>("get_config"),
  saveConfig: (config: LocalConfig, password?: string) => call<boolean>("save_config", { config, password }),
  hasPassword: () => call<boolean>("has_password"),
  testConnection: () => call<string>("test_connection"),
  syncNow: () => call<SyncReport>("sync_now"),

  dbList: <T>(collection: Collection) => call<T[]>("db_list", { collection }),
  dbPut: (collection: Collection, id: string, value: unknown) => call<void>("db_put", { collection, id, value }),
  dbDelete: (collection: Collection, id: string) => call<void>("db_delete", { collection, id }),

  filesList: (projectId: string) => call<FileMeta[]>("files_list", { projectId }),
  filesImport: (projectId: string, paths: string[]) => call<FileMeta[]>("files_import", { projectId, paths }),
  filesDelete: (projectId: string, name: string) => call<void>("files_delete", { projectId, name }),
  filesDeleteAll: (projectId: string) => call<void>("files_delete_all", { projectId }),
  filesRename: (projectId: string, name: string, newName: string) => call<void>("files_rename", { projectId, name, newName }),
  filesOpen: (projectId: string, name: string) => call<void>("files_open", { projectId, name }),
  filesReveal: (projectId: string, name?: string) => call<void>("files_reveal", { projectId, name }),
  threemfInfo: (projectId: string, name: string) => call<ThreeMfInfo>("threemf_info", { projectId, name }),

  invoiceSave: (name: string, bytes: Uint8Array) => call<string>("invoice_save", { name, bytes: Array.from(bytes) }),
  invoiceOpen: (name: string) => call<void>("invoice_open", { name }),
  invoiceExport: (name: string, target: string) => call<void>("invoice_export", { name, target }),
  invoiceDelete: (name: string) => call<void>("invoice_delete", { name }),
  openDataDir: () => call<void>("open_data_dir"),
};

export async function pickFiles(): Promise<string[]> {
  if (!inTauri) return [];
  const { open } = await import("@tauri-apps/plugin-dialog");
  const r = await open({ multiple: true, title: "Dateien zum Auftrag hinzufügen" });
  return r ? (Array.isArray(r) ? r : [r]) : [];
}

export async function pickFolder(title: string): Promise<string | null> {
  if (!inTauri) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const r = await open({ directory: true, title });
  return typeof r === "string" ? r : null;
}

export async function pickSavePath(defaultPath: string): Promise<string | null> {
  if (!inTauri) return null;
  const { save } = await import("@tauri-apps/plugin-dialog");
  return save({ defaultPath, filters: [{ name: "PDF", extensions: ["pdf"] }] });
}

export async function confirmDialog(message: string, title = "Druckplaner"): Promise<boolean> {
  if (!inTauri) return window.confirm(message);
  const { ask } = await import("@tauri-apps/plugin-dialog");
  return ask(message, { title, kind: "warning", okLabel: "Ja", cancelLabel: "Abbrechen" });
}

/** Dateien, die auf das Fenster gezogen werden. */
export async function onFileDrop(handler: (paths: string[]) => void, hover?: (over: boolean) => void) {
  if (!inTauri) return () => {};
  const { getCurrentWebview } = await import("@tauri-apps/api/webview");
  return getCurrentWebview().onDragDropEvent((e) => {
    const p = e.payload;
    if (p.type === "over" || p.type === "enter") hover?.(true);
    else if (p.type === "leave") hover?.(false);
    else if (p.type === "drop") {
      hover?.(false);
      handler(p.paths);
    }
  });
}

// ---------- Browser-Ersatz für die Entwicklung ohne Tauri ----------

function mock(cmd: string, args: Record<string, unknown>): unknown {
  const key = (c: unknown) => `druckplaner:${c}`;
  const read = (c: unknown): Record<string, unknown> => JSON.parse(localStorage.getItem(key(c)) || "{}");
  const write = (c: unknown, v: Record<string, unknown>) => localStorage.setItem(key(c), JSON.stringify(v));
  switch (cmd) {
    case "get_config":
      return { dataDir: "(Browser-Vorschau)", webdav: { enabled: false, url: "", username: "", remoteFolder: "Druckplaner", autoSyncMinutes: 0 } };
    case "db_list":
      return Object.values(read(args.collection));
    case "db_put": {
      const all = read(args.collection);
      all[args.id as string] = args.value;
      write(args.collection, all);
      return;
    }
    case "db_delete": {
      const all = read(args.collection);
      delete all[args.id as string];
      write(args.collection, all);
      return;
    }
    case "files_list":
      return [];
    case "has_password":
      return false;
    case "invoice_save": {
      const blob = new Blob([new Uint8Array(args.bytes as number[])], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob));
      return args.name;
    }
    default:
      return undefined;
  }
}
