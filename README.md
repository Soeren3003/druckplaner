<p align="center">
  <img src="app-icon.svg" alt="Druckplaner" width="120">
</p>

<h1 align="center">Druckplaner</h1>

<p align="center">
  Projekt- und Kostenplanung für 3D-Druckaufträge: Kalkulation, Kunden, Druckdateien, Angebote und Rechnungen.<br>
  Für macOS, Windows und Linux, mit Abgleich über Nextcloud bzw. WebDAV.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/Lizenz-MIT-green" alt="Lizenz: MIT"></a>
  <a href="#entstanden-mit-ki"><img src="https://img.shields.io/badge/entwickelt%20mit-Claude%20%28KI%29-d97757" alt="Entwickelt mit Claude (KI)"></a>
</p>

---

## Inhalt

- [Worum geht es?](#worum-geht-es)
- [Funktionen](#funktionen)
- [Installation](#installation)
- [Gemeinsam nutzen mit Nextcloud](#gemeinsam-nutzen-mit-nextcloud)
- [Wo liegen die Daten?](#wo-liegen-die-daten)
- [Entwicklung](#entwicklung)
- [Bauen](#bauen)
- [Sicherheit](#sicherheit)
- [Hinweise zur Nutzung](#hinweise-zur-nutzung)
- [Entstanden mit KI](#entstanden-mit-ki)
- [Lizenz und Quellen](#lizenz-und-quellen)

## Worum geht es?

Wer einen 3D-Drucker hat, bekommt schnell Anfragen aus dem Freundeskreis: „Kannst du mir das drucken?“ Damit der Preis
fair ist und nichts verloren geht, ersetzt der Druckplaner eine Kalkulationstabelle: Filament, Strom, Arbeitszeit,
Verpackung und Versand werden je Auftrag berechnet, Kunden und Druckdateien liegen an einem Ort, und Angebot und
Rechnung entstehen auf Knopfdruck als PDF.

## Funktionen

- **Aufträge** mit Auftragsnummer (`2026-001`), Status (Anfrage → Angebot → Beauftragt → Im Druck → Fertig →
  Geliefert → Bezahlt), Auftragsdatum und Liefertermin. Die Bezeichnung setzt sich automatisch aus Nummer, Kunde und
  Beschreibung zusammen und lässt sich überschreiben.
- **Kalkulation:**
  - Filament: Rollenpreis ÷ Rolleninhalt × Gewicht × Anzahl, mit Filamentaufschlag
  - Strom: Drucker-Watt × Druckzeit × Strompreis
  - optional Verschleiß pro Druckstunde
  - Arbeitspakete aus Vorlagen, Verpackung, Versand, Nachlass und Umsatzsteuer
- **Kunden** mit Kundennummer (`K-001`), Adresse, Kontakt, Notizen und Auftragsübersicht.
- **Druckdateien** je Auftrag (per Drag & Drop):
  - Bei Bambu-/Orca-3MF-Dateien erscheint das Vorschaubild.
  - Gesliced gespeicherte Dateien liefern Gewicht und Druckzeit je Platte; diese lassen sich als Druckteile übernehmen.
- **Notizen** je Auftrag.
- **Angebote und Rechnungen** als PDF:
  - fortlaufende Nummer (`R2026-001`), Auftrags- und Kundennummer
  - Steuerhinweis wahlweise Privatverkauf, Kleinunternehmer (§ 19 UStG) oder mit Umsatzsteuer
- **Übersicht** mit Auftragswert pro Monat, Zusammensetzung der Kosten, Filament nach Material und Top-Kunden.
- **Nextcloud-Sync** per WebDAV, automatisch oder auf Knopfdruck. Das App-Passwort liegt im Schlüsselbund des Systems.

## Installation

Fertige Pakete für macOS (`.dmg`), Windows (`.msi`/`.exe`) und Linux (`.deb`/`.AppImage`) entstehen über
GitHub Actions (siehe [Bauen](#bauen)).

Die App ist nicht signiert. Beim ersten Start unter macOS: Rechtsklick auf die App → *Öffnen*. Bei einer
heruntergeladenen App hilft alternativ:

```bash
xattr -dr com.apple.quarantine /Applications/Druckplaner.app
```

## Gemeinsam nutzen mit Nextcloud

1. In Nextcloud unter *Einstellungen → Sicherheit* ein **App-Passwort** erstellen.
2. Im Druckplaner unter *Einstellungen → Daten & Sync* Folgendes eintragen und „Verbindung testen“ klicken:
   - die Server-Adresse (`https://…`) oder die WebDAV-Adresse aus Nextcloud → Dateien → Einstellungen
   - Benutzername und App-Passwort
   - den Ordner auf dem Server (Standard `Druckplaner`)
3. Auf weiteren Rechnern genauso einrichten.

Ändern zwei Geräte denselben Datensatz, gewinnt der neuere Stand. Der andere bleibt im Ordner `conflicts/` erhalten.
Ist eine Seite komplett leer (neuer Rechner, neuer Server-Ordner), wird nichts gelöscht, sondern alles übernommen.
Verbindungen laufen nur über HTTPS.

## Wo liegen die Daten?

Alles liegt als einfache Dateien im Datenordner (Standard unter macOS:
`~/Library/Application Support/de.soeren3003.druckplaner/data`):

```
db/customers/<id>.json      Kunden
db/projects/<id>.json       Aufträge
db/settings/settings.json   Einstellungen (Absender, Filamente, Drucker …)
files/<auftrag-id>/…        Druckdateien und Anhänge
invoices/*.pdf              Angebote und Rechnungen
conflicts/                  (nur lokal) ältere Version bei Sync-Konflikten
```

Der Datenordner lässt sich in den Einstellungen ändern. Zugangsdaten werden nie synchronisiert.

## Entwicklung

Voraussetzungen: [Node.js](https://nodejs.org) und [Rust](https://rustup.rs), unter macOS z. B. `brew install node rust`.

```bash
npm install
npm run tauri dev      # App mit Hot-Reload starten
npm test               # Tests der Oberfläche (Kalkulation, Nummern)
cd src-tauri && cargo test
```

`npm run dev` startet nur die Oberfläche im Browser. Die Daten liegen dann im Browser-Speicher.

Sync-Integrationstest gegen einen lokalen WebDAV-Server:

```bash
pip install wsgidav cheroot
mkdir -p /tmp/dav/remote.php/dav/files/test
wsgidav --host=127.0.0.1 --port=8765 --root=/tmp/dav --auth=anonymous &
cd src-tauri && DRUCKPLANER_TEST_DAV=http://127.0.0.1:8765 cargo test --test sync_dav
```

Weitere Befehle:

```bash
npm run licenses              # THIRD_PARTY_LICENSES.md und Lizenzliste der App neu erzeugen
npm run set-version -- 1.1.0  # Versionsnummer überall setzen
```

## Bauen

```bash
npm run tauri build    # macOS: .app und .dmg unter src-tauri/target/release/bundle/
```

Windows- und Linux-Pakete müssen auf dem jeweiligen System gebaut werden. Am einfachsten geht das über GitHub Actions:
Workflow *Build* manuell starten oder einen Tag `v*` pushen. Die Installer liegen danach als Artefakte am Workflow-Lauf.

Die Versionsnummern folgen der [semantischen Versionierung](https://semver.org/lang/de/), Änderungen stehen im
[CHANGELOG.md](CHANGELOG.md).

## Sicherheit

Das Sicherheitskonzept und der Weg zum Melden von Lücken stehen in **[SECURITY.md](SECURITY.md)**. Kurz gesagt:

- **Zugangsdaten nur lokal:** Es gibt keine Zugangsdaten im Repository. Das Nextcloud-App-Passwort liegt im Schlüsselbund.
- **Abgeschottete Oberfläche:** Eine strikte Content-Security-Policy gilt, und fremde Daten werden nie als HTML eingesetzt.
- **Geprüfte Befehle:**
  - Was die Oberfläche anstoßen kann, ist eng begrenzt (Dateinamen, Dateitypen, Links).
  - Programme und Skripte werden nicht direkt geöffnet.
  - Sync-Pfade können den Datenordner nicht verlassen.
- **Abhängigkeiten ohne bekannte Lücken** (`npm audit`, `cargo audit`):

```bash
npm audit
cargo install cargo-audit && (cd src-tauri && cargo audit)
```

Die Warnungen von `cargo audit` zu „unmaintained“ bzw. „unsound“ (z. B. `zvariant`, `glib`, `proc-macro-error`)
betreffen nur den Linux-Unterbau von Tauri (GTK, D-Bus). Sie sind keine bekannten Sicherheitslücken und werden mit
Tauri-Updates behoben.

## Hinweise zur Nutzung

- Die Kalkulation ist eine Hilfe für faire Preise, keine Buchhaltung.
- Die Rechnungsvorlagen ersetzen keine steuerliche Beratung. Ob du privat verkaufen darfst, Kleinunternehmer bist oder
  Umsatzsteuer ausweisen musst, hängt von deiner Situation ab.
- Kundendaten sind personenbezogene Daten. Speichere nur, was du für den Auftrag brauchst, und synchronisiere nur
  mit einem Server, dem du vertraust.

## Entstanden mit KI

Der Druckplaner ist in **Zusammenarbeit mit der KI [Claude](https://claude.ai) von Anthropic** entstanden.
Genutzt wurde dafür [Claude Code](https://claude.com/claude-code).

Die Aufgaben waren so verteilt:

- **Mensch (Soeren3003):**
  - Idee und Anforderungen aus der Praxis, mit der eigenen Kalkulationstabelle als Vorlage
  - Entscheidungen über Funktionen, Aufbau, Lizenz und Veröffentlichung
  - Prüfen und Ausprobieren der Ergebnisse
- **KI (Claude):**
  - Entwurf der Architektur
  - der Großteil des Quellcodes, der Tests und dieser Dokumentation
  - Vorschläge für zusätzliche Funktionen, z. B. 3MF-Auswertung, Übersicht mit Diagrammen und Nummernkreise

Commits, an denen die KI mitgearbeitet hat, sind in der Versionsgeschichte mit `Co-Authored-By: Claude …`
gekennzeichnet.

Der Code ist mit automatischen Tests abgesichert und wurde während der Entwicklung in der App ausprobiert. Wie bei
jeder Software können trotzdem Fehler enthalten sein. Hinweise und Verbesserungen sind ausdrücklich willkommen.

## Lizenz und Quellen

Der Druckplaner ist freie Software unter der **[MIT-Lizenz](LICENSE)**. Jeder darf ihn nutzen, verändern und
weitergeben, auch kommerziell, solange der Copyright- und Lizenzhinweis erhalten bleibt. Die Software wird ohne
Gewährleistung bereitgestellt.

### Verwendete Komponenten

Die App enthält rund 500 Komponenten anderer Autorinnen und Autoren: npm-Pakete für die Oberfläche und Rust-Crates
für die Desktop-Hülle. Alle stehen unter freien Lizenzen, die mit der MIT-Lizenz vereinbar sind:

- MIT, Apache-2.0, BSD, ISC, Zlib und Unicode-3.0
- MPL-2.0 nur für wenige, unveränderte Tauri-Abhängigkeiten
- LGPL nur als Wahloption

Bei Wahlmöglichkeit wird MIT genutzt. Alle Lizenztexte stehen in **[THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md)**
und in der App unter *Über Druckplaner → Lizenzen aller Komponenten*.

Die wichtigsten Komponenten sind:
- [Tauri](https://tauri.app/) (Desktop-Hülle)
- [React](https://react.dev/) (Oberfläche)
- [jsPDF](https://github.com/parallax/jsPDF) mit AutoTable (PDF)
- [reqwest](https://github.com/seanmonstar/reqwest) mit rustls (HTTPS)
- [quick-xml](https://github.com/tafia/quick-xml) und [zip](https://github.com/zip-rs/zip2) (WebDAV, 3MF)
- [keyring](https://github.com/hwchen/keyring-rs) (Schlüsselbund)
