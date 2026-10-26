# Druckplaner

Projekt- und Kostenplanung für 3D-Druckaufträge – Nachfolger der Tabelle `Druckkostenrechner_Projekt.ods`.
Läuft auf macOS, Windows und Linux (Tauri 2 + React) und synchronisiert per WebDAV mit Nextcloud.

## Funktionen

- **Aufträge** mit Status (Anfrage → Angebot → Beauftragt → Im Druck → Fertig → Geliefert → Bezahlt), Auftragsdatum und Liefertermin
- **Kalkulation** wie in der Tabelle: Filament (Rollenpreis ÷ Rolleninhalt × Gewicht × Anzahl, inkl. Filamentaufschlag),
  Strom (Drucker-Watt × Druckzeit × Strompreis), optional Verschleiß pro Druckstunde, Arbeitspakete, Verpackung, Versand, Nachlass, USt.
- **Kunden** mit Adresse, Kontakt, Notizen und Auftragsübersicht
- **Druckdateien** je Auftrag (Drag & Drop). Bei Bambu-/Orca-3MF wird das Vorschaubild angezeigt; gesliced gespeicherte
  Dateien liefern Gewicht und Druckzeit je Platte, die sich als Druckteile übernehmen lassen.
- **Notizen** je Auftrag
- **Angebote & Rechnungen** als PDF mit fortlaufender Nummer (z. B. `R2026-001`), Steuerhinweis wahlweise
  Privatverkauf, Kleinunternehmer (§ 19 UStG) oder mit USt. Bezahlt-Status wird in der Übersicht ausgewertet.
- **Nextcloud-Sync** per WebDAV (App-Passwort im System-Schlüsselbund), automatisch oder auf Knopfdruck

## Datenablage

Alles liegt als einfache Dateien im Datenordner (Standard: `~/Library/Application Support/de.soeren3003.druckplaner/data`):

```
db/customers/<id>.json
db/projects/<id>.json
db/settings/settings.json
files/<auftrag-id>/...      Druckdateien
invoices/*.pdf              Angebote und Rechnungen
conflicts/                  (nur lokal) ältere Version bei Sync-Konflikten
```

Der Sync gleicht diesen Ordner mit einem Ordner auf dem Server ab (Standard `Druckplaner`).
Ändern zwei Geräte denselben Datensatz, gewinnt der neuere Stand; der andere landet in `conflicts/`.
Ist eine Seite komplett leer (neuer Rechner, neuer Server-Ordner), wird nichts gelöscht, sondern alles übernommen.

## Entwicklung

Voraussetzungen: Node.js und Rust (`brew install node rust`).

```bash
npm install
npm run tauri dev      # App mit Hot-Reload starten
npm test               # Kalkulations-Tests
cd src-tauri && cargo test
```

Sync-Integrationstest gegen einen lokalen WebDAV-Server:

```bash
pip install wsgidav cheroot
mkdir -p /tmp/dav/remote.php/dav/files/test
wsgidav --host=127.0.0.1 --port=8765 --root=/tmp/dav --auth=anonymous &
cd src-tauri && DRUCKPLANER_TEST_DAV=http://127.0.0.1:8765 cargo test --test sync_dav
```

## Bauen

```bash
npm run tauri build                 # macOS: .app und .dmg unter src-tauri/target/release/bundle/
```

Windows- und Linux-Pakete müssen auf dem jeweiligen System gebaut werden. Am einfachsten über GitHub Actions:
Repository auf GitHub anlegen, pushen und unter *Actions → Build* den Workflow starten
(`.github/workflows/build.yml`). Die Installer liegen danach als Artefakte am Workflow-Lauf.

Die App ist nicht signiert. Beim ersten Start unter macOS: Rechtsklick → Öffnen
(oder `xattr -dr com.apple.quarantine /Applications/Druckplaner.app`, falls sie heruntergeladen wurde).
