import { useState } from "react";
import { AboutDialog, APP_VERSION } from "./components/About";
import { useStore } from "./lib/store";
import { newProject } from "./lib/defaults";
import { dateTime } from "./lib/format";
import Dashboard from "./pages/Dashboard";
import Projects from "./pages/Projects";
import ProjectDetail from "./pages/ProjectDetail";
import Customers from "./pages/Customers";
import SettingsPage from "./pages/Settings";

export type View =
  | { page: "dashboard" }
  | { page: "projects" }
  | { page: "project"; id: string }
  | { page: "customers"; id?: string }
  | { page: "settings"; tab?: string };

export type Nav = (v: View) => void;

const NAV: { page: View["page"]; label: string; icon: string }[] = [
  { page: "dashboard", label: "Übersicht", icon: "◧" },
  { page: "projects", label: "Aufträge", icon: "▤" },
  { page: "customers", label: "Kunden", icon: "☺" },
  { page: "settings", label: "Einstellungen", icon: "⚙" },
];

export default function App() {
  const store = useStore();
  const [view, setView] = useState<View>({ page: "dashboard" });
  const [about, setAbout] = useState(false);

  if (!store.ready) return <div className="loading">Lade Daten …</div>;

  const createProject = (customerId = "") => {
    const p = newProject(store.settings, customerId, store.projects.map((x) => x.number));
    store.saveProject(p);
    setView({ page: "project", id: p.id });
  };

  const active = view.page === "project" ? "projects" : view.page;
  const { sync, config } = store;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="logo">▦</span>
          <span>Druckplaner</span>
        </div>
        <button className="primary new" onClick={() => createProject()}>
          + Neuer Auftrag
        </button>
        <nav>
          {NAV.map((n) => (
            <button key={n.page} className={active === n.page ? "active" : ""} onClick={() => setView({ page: n.page } as View)}>
              <span className="nav-icon">{n.icon}</span>
              {n.label}
            </button>
          ))}
        </nav>
        <div className="sync-box">
          {config?.webdav.enabled ? (
            <>
              <button className="ghost small" disabled={sync.running} onClick={() => store.runSync()}>
                {sync.running ? "Synchronisiere …" : "⟳ Jetzt synchronisieren"}
              </button>
              {sync.error ? (
                <div className="sync-state error" title={sync.error} onClick={() => setView({ page: "settings", tab: "sync" })}>
                  Sync-Fehler – Details
                </div>
              ) : sync.last ? (
                <div className="sync-state">Zuletzt: {dateTime(sync.last.finishedAt)}</div>
              ) : null}
            </>
          ) : (
            <button className="link small" onClick={() => setView({ page: "settings", tab: "sync" })}>
              Nextcloud-Sync einrichten
            </button>
          )}
        </div>
        <button className="link small about-link" onClick={() => setAbout(true)}>
          ⓘ Über Druckplaner · v{APP_VERSION}
        </button>
      </aside>
      <main className="content">
        {store.saveError && (
          <div className="alert error banner">
            {store.saveError}
            <button className="icon" onClick={store.clearSaveError}>
              ×
            </button>
          </div>
        )}
        {view.page === "dashboard" && <Dashboard nav={setView} onNew={createProject} />}
        {view.page === "projects" && <Projects nav={setView} />}
        {view.page === "project" && <ProjectDetail id={view.id} nav={setView} />}
        {view.page === "customers" && <Customers nav={setView} selected={view.id} onNewProject={createProject} />}
        {view.page === "settings" && <SettingsPage tab={view.tab} />}
      </main>
      {about && <AboutDialog onClose={() => setAbout(false)} />}
    </div>
  );
}
