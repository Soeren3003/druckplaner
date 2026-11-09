import { useState } from "react";
import pkg from "../../package.json";
import licenseText from "../../LICENSE?raw";
import { api } from "../lib/api";
import { ThirdPartyDialog } from "./ThirdParty";
import { Modal } from "./ui";

export const APP_VERSION = pkg.version;
export const AUTHOR = "Soeren3003";

const CREDITS: [string, string, string][] = [
  ["Tauri", "https://tauri.app/", "Desktop-Hülle für macOS, Windows und Linux"],
  ["React", "https://react.dev/", "Oberfläche"],
  ["jsPDF & AutoTable", "https://github.com/parallax/jsPDF", "Angebote und Rechnungen als PDF"],
  ["reqwest & rustls", "https://github.com/seanmonstar/reqwest", "verschlüsselte WebDAV-Verbindung"],
  ["quick-xml", "https://github.com/tafia/quick-xml", "WebDAV-Antworten und 3MF-Metadaten"],
  ["zip", "https://github.com/zip-rs/zip2", "Vorschaubilder und Slicer-Daten aus 3MF-Dateien"],
  ["lettre", "https://github.com/lettre/lettre", "Versand von Angeboten und Rechnungen per E-Mail"],
  ["keyring", "https://github.com/hwchen/keyring-rs", "Passwörter im System-Schlüsselbund"],
];

function Link({ href, children }: { href: string; children: string }) {
  return (
    <button className="link" onClick={() => api.openUrl(href)}>
      {children}
    </button>
  );
}

/** Informationsfenster: Version, Autor, Entstehung mit KI, Lizenz und Komponenten. */
export function AboutDialog({ onClose }: { onClose: () => void }) {
  const [showLicense, setShowLicense] = useState(false);
  const [thirdParty, setThirdParty] = useState(false);
  if (thirdParty) return <ThirdPartyDialog onClose={() => setThirdParty(false)} />;
  return (
    <Modal
      title="Über Druckplaner"
      onClose={onClose}
      footer={
        <button className="primary" onClick={onClose}>
          Schließen
        </button>
      }
    >
      <div className="about">
        <div className="about-head">
          <span className="logo big">▦</span>
          <div>
            <div className="about-name">Druckplaner</div>
            <div className="muted">Version {APP_VERSION}</div>
          </div>
        </div>
        <p>{pkg.description}.</p>

        <dl className="kv-list about-facts">
          <dt>Autor</dt>
          <dd>{AUTHOR}</dd>
          <dt>Lizenz</dt>
          <dd>MIT – freie Open-Source-Software</dd>
        </dl>

        <h3>Entstanden mit KI</h3>
        <p>
          Der Druckplaner ist in Zusammenarbeit von {AUTHOR} mit der KI <Link href="https://claude.ai">Claude</Link> von Anthropic entstanden. Idee,
          Anforderungen und Entscheidungen kamen vom Menschen – als Vorlage diente seine eigene Kalkulationstabelle für 3D-Druckaufträge. Den Großteil von
          Code, Tests und Dokumentation hat Claude geschrieben. Hinweise und Verbesserungen sind willkommen.
        </p>

        <h3>Lizenz</h3>
        <p>
          Jeder darf die Software nutzen, verändern und weitergeben, auch kommerziell, solange der Copyright- und Lizenzhinweis erhalten bleibt. Sie wird
          ohne Gewährleistung bereitgestellt. Die erzeugten Angebote und Rechnungen ersetzen keine steuerliche Beratung.
        </p>
        <button className="ghost small" onClick={() => setShowLicense(!showLicense)}>
          {showLicense ? "Lizenztext ausblenden" : "Lizenztext anzeigen"}
        </button>
        {showLicense && <pre className="license-text">{licenseText}</pre>}

        <h3>Verwendete Komponenten</h3>
        <ul className="plain credits">
          {CREDITS.map(([name, url, what]) => (
            <li key={name}>
              <Link href={url}>{name}</Link> <span className="muted">– {what}</span>
            </li>
          ))}
        </ul>
        <button className="ghost small" onClick={() => setThirdParty(true)}>
          Lizenzen aller Komponenten anzeigen …
        </button>
      </div>
    </Modal>
  );
}
