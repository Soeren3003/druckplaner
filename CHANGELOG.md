# Änderungsprotokoll

Alle nennenswerten Änderungen am Druckplaner stehen hier, die neueste Version oben.

Die Versionsnummern folgen der [semantischen Versionierung](https://semver.org/lang/de/): `MAJOR.MINOR.PATCH`

- **MAJOR** steigt bei Änderungen, nach denen alte Daten oder Abläufe nicht mehr ohne Weiteres funktionieren.
- **MINOR** steigt bei neuen Funktionen, die bestehende Daten weiter lesen können.
- **PATCH** steigt bei Fehlerbehebungen und kleinen Verbesserungen ohne neue Funktion.

## [1.0.0] – 2026-11-07

Erste veröffentlichte Version.

### Funktionen
- Aufträge mit Auftragsnummer, Status, Kalkulation (Filament, Strom, Verschleiß, Arbeitspakete, Verpackung,
  Versand, Nachlass, Umsatzsteuer), Druckdateien und Notizen
- Automatische Auftragsbezeichnung aus Nummer, Kunde und Beschreibung, überschreibbar
- Kunden mit Kundennummer, Adresse und Auftragsübersicht
- 3MF-Auswertung: Vorschaubild, Gewicht und Druckzeit je Platte aus geslicten Bambu-/Orca-Dateien
- Angebote und Rechnungen als PDF mit Auftrags- und Kundennummer, Steuerhinweis wählbar
- Übersicht mit Kennzahlen und Diagrammen
- Zwei-Wege-Sync per WebDAV (Nextcloud), App-Passwort im Schlüsselbund
- Informationsfenster „Über Druckplaner“ mit Autor, Entstehung mit KI, Lizenz und den Lizenzen aller
  Komponenten

### Lizenzen
- Der Druckplaner steht unter der MIT-Lizenz.
- Alle mitgelieferten Komponenten sind erfasst (`npm run licenses` → `THIRD_PARTY_LICENSES.md`). Ihre Lizenzen
  sind ausschließlich freie, mit MIT vereinbare Lizenzen.

### Sicherheit
Vor der Veröffentlichung geprüft und behoben:
- **Sync:** Server-Pfade mit `..`, Laufwerksangaben, Backslashes, versteckten Teilen oder Steuerzeichen werden
  ignoriert. Unter Windows hätten Backslashes sonst aus dem Datenordner herausführen können.
- **Dateien öffnen:** Programme und Skripte (auch getarnt wie `rechnung.pdf.exe`) werden nicht direkt gestartet.
  Solche Dateien könnten per Sync hereinkommen.
- **Content-Security-Policy** für das App-Fenster. Die Oberfläche darf nur noch Dateidialoge öffnen, das
  Opener-Plugin läuft nur intern.
- **3MF-Dateien:** Einträge werden höchstens bis 16 MB gelesen; das schützt vor präparierten Archiven.
- **WebDAV nur über HTTPS:** Über `http` würde das App-Passwort unverschlüsselt übertragen. Erlaubt ist das nur
  noch für den eigenen Rechner.
- Rechnungen lassen sich nur als `.pdf` speichern. `config.json` ist nur für den eigenen Benutzer lesbar.
- **Abhängigkeiten ohne bekannte Lücken:**
  - jsPDF 4.2 und AutoTable 5 (vorher DOMPurify mit kritischen Lücken)
  - Vite 7 und Vitest 5 (esbuild, tinypool)
  - quick-xml 0.41 (DoS über präparierte Serverantworten)
  - zip 9 (Lücken beim Entpacken)
  - `npm audit` und `cargo audit` ohne Befund
- Build-Workflow nur mit Leserechten.

### Dokumentation
- Ausführliche README mit Screenshots (erfundene Beispieldaten), Rechenweg, Sync, Datenablage, Entwicklung,
  Projektstruktur, Sicherheit, Hinweisen und bekannten Einschränkungen
- Demo-Modus in der Browser-Vorschau (`?demo`) und Startansicht per URL, z. B. `?project=…&tab=…`
- Release-Workflow: Ein Versions-Tag `v*` baut Installer für macOS, Windows und Linux und veröffentlicht sie als
  GitHub-Release mit den Notizen aus diesem Änderungsprotokoll

### Datenschutz
- Neue App-Kennung `de.soeren3003.druckplaner`. Ordner und Schlüsselbund-Eintrag einer früheren Kennung werden
  beim ersten Start automatisch übernommen.
- Tests, Beispiele und Screenshots ohne echte Namen oder Auftragsdaten.
