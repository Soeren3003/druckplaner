import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { inTauri } from "./lib/api";
import { loadDemo } from "./lib/demo";
import { StoreProvider } from "./lib/store";
import "./styles.css";

// Browser-Vorschau: ?demo lädt erfundene Beispieldaten (für Screenshots), danach wird der Parameter entfernt.
if (!inTauri && new URLSearchParams(location.search).has("demo")) {
  loadDemo();
  const p = new URLSearchParams(location.search);
  p.delete("demo");
  history.replaceState(null, "", `${location.pathname}${p.size ? `?${p}` : ""}`);
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </React.StrictMode>,
);
