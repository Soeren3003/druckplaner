# Sicherheit

## Sicherheitslücken melden

Bitte melde vermutete Sicherheitslücken **nicht als öffentliches Issue**. Schreibe stattdessen eine Nachricht
an **[Soeren3003](https://github.com/Soeren3003)** über die Kontaktmöglichkeit im GitHub-Profil. Beschreibe darin kurz:

- was passiert und wie es sich nachstellen lässt,
- welche Version betroffen ist (siehe *Über Druckplaner*),
- welches Betriebssystem du nutzt.

Ich melde mich so bald wie möglich. Behobene Lücken stehen im [CHANGELOG.md](CHANGELOG.md).

## Unterstützte Versionen

Sicherheitskorrekturen gibt es für die jeweils neueste Version.

## Sicherheitskonzept

Der Druckplaner ist eine lokale Desktop-App. Daten können aber von außen hereinkommen: per Sync vom eigenen Server
oder einem anderen Gerät, als 3MF-Datei aus dem Internet oder als Antwort eines Servers. Deshalb gilt:

- **Keine Geheimnisse im Repository.** Zugangsdaten gibt es nur lokal. Das Nextcloud-App-Passwort und das
  SMTP-Passwort liegen im Schlüsselbund des Systems. Nur wenn keiner verfügbar ist, liegen sie in `config.json`, und
  diese Datei ist nur für den eigenen Benutzer lesbar. Zugangsdaten werden nie synchronisiert.
- **Strikte Content-Security-Policy:** Die Oberfläche lädt nur eigene Skripte und keine Inhalte aus dem Internet.
  Verbindungen laufen nur über die App selbst.
- **Kein HTML aus fremden Daten:** Namen, Beschreibungen und Notizen werden immer als Text dargestellt.
- **Wenig Rechte für die Oberfläche:** Sie darf nur Dateidialoge öffnen. Alles Weitere läuft über eigene Befehle,
  und die prüfen ihre Eingaben:
  - Datensätze und Dateinamen dürfen keine Pfadangaben enthalten.
  - Rechnungen werden nur als `.pdf` gespeichert.
  - Links öffnen nur, wenn sie mit `http(s)` beginnen.
  - Programme und Skripte unter den Druckdateien werden nicht direkt gestartet.
- **Slicer:** Druckdateien werden nur an Bambu Studio, OrcaSlicer oder PrusaSlicer übergeben – als bekanntes
  Programm an seinem üblichen Installationsort, ohne Shell und nur für Modelldateien (3MF, STL, STEP, OBJ, AMF).
  Ein frei wählbarer Programmpfad ist bewusst nicht möglich.
- **3MF-Dateien:** Aus dem Archiv werden nur einzelne, bekannte Einträge bis zu einer Höchstgröße gelesen.
  Nichts wird entpackt oder ausgeführt.
- **Sync:**
  - Pfade vom Server, die den Datenordner verlassen würden (`..`, Laufwerksangaben, Backslashes, versteckte
    Dateien, Steuerzeichen), werden ignoriert.
  - Verbindungen laufen über HTTPS (rustls). Unverschlüsseltes `http` ist nur für den eigenen Rechner möglich,
    z. B. für Tests.
- **E-Mail:**
  - Versand nur verschlüsselt (STARTTLS oder SSL/TLS über rustls), nie im Klartext.
  - Genau ein Empfänger pro Mail; die Adresse wird geprüft, Zeilenumbrüche im Betreff werden entfernt. So lassen
    sich keine weiteren Empfänger oder Kopfzeilen einschleusen.
  - Als Anhang kommen nur PDFs aus dem eigenen Rechnungsordner in Frage.
  - `mailto:`-Links für das Mailprogramm werden vollständig kodiert.
- **Abhängigkeiten** werden mit `npm audit` und `cargo audit` geprüft.
