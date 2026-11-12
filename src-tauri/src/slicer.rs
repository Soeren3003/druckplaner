//! Druckdateien im Slicer öffnen (Bambu Studio, OrcaSlicer, PrusaSlicer).
//!
//! Gestartet wird direkt das bekannte Programm mit der Datei als Argument – ohne Shell, ohne frei
//! wählbaren Programmpfad und nur für Modelldateien.

use std::path::{Path, PathBuf};
use std::process::Command;

/// Dateiendungen, die ein Slicer öffnen kann.
const MODEL_EXTENSIONS: &[&str] = &["3mf", "stl", "step", "stp", "obj", "amf"];

pub fn is_model_file(name: &str) -> bool {
    Path::new(name)
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| MODEL_EXTENSIONS.contains(&e.to_lowercase().as_str()))
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Slicer {
    Bambu,
    Orca,
    Prusa,
}

impl Slicer {
    /// „bambu“ (Standard), „orca“ oder „prusa“
    pub fn from_setting(s: &str) -> Slicer {
        match s {
            "orca" => Slicer::Orca,
            "prusa" => Slicer::Prusa,
            _ => Slicer::Bambu,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Slicer::Bambu => "Bambu Studio",
            Slicer::Orca => "OrcaSlicer",
            Slicer::Prusa => "PrusaSlicer",
        }
    }

    /// Name des Programmpakets unter macOS
    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    fn mac_app(self) -> &'static str {
        match self {
            Slicer::Bambu => "BambuStudio",
            Slicer::Orca => "OrcaSlicer",
            Slicer::Prusa => "PrusaSlicer",
        }
    }

    /// Übliche Installationspfade unter Windows (unterhalb von „Program Files“)
    #[cfg_attr(not(target_os = "windows"), allow(dead_code))]
    fn windows_exe(self) -> &'static str {
        match self {
            Slicer::Bambu => r"Bambu Studio\bambu-studio.exe",
            Slicer::Orca => r"OrcaSlicer\orca-slicer.exe",
            Slicer::Prusa => r"Prusa3D\PrusaSlicer\prusa-slicer.exe",
        }
    }

    /// Programmname und Flatpak-Kennung unter Linux
    #[cfg_attr(not(target_os = "linux"), allow(dead_code))]
    fn linux(self) -> (&'static str, &'static str) {
        match self {
            Slicer::Bambu => ("bambu-studio", "com.bambulab.BambuStudio"),
            Slicer::Orca => ("orca-slicer", "io.github.softfever.OrcaSlicer"),
            Slicer::Prusa => ("prusa-slicer", "com.prusa3d.PrusaSlicer"),
        }
    }
}

#[cfg(target_os = "macos")]
fn find(slicer: Slicer) -> Option<PathBuf> {
    let name = format!("{}.app", slicer.mac_app());
    let home = std::env::var_os("HOME").map(PathBuf::from);
    [Some(PathBuf::from("/Applications")), home.map(|h| h.join("Applications"))]
        .into_iter()
        .flatten()
        .map(|d| d.join(&name))
        .find(|p| p.is_dir())
}

#[cfg(target_os = "windows")]
fn find(slicer: Slicer) -> Option<PathBuf> {
    ["ProgramFiles", "ProgramW6432", "LOCALAPPDATA"]
        .iter()
        .filter_map(|v| std::env::var_os(v))
        .map(|d| {
            let base = PathBuf::from(d);
            // per Benutzer installierte Programme liegen unter %LOCALAPPDATA%\Programs
            if base.ends_with("Local") { base.join("Programs").join(slicer.windows_exe()) } else { base.join(slicer.windows_exe()) }
        })
        .find(|p| p.is_file())
}

#[cfg(target_os = "linux")]
fn find(slicer: Slicer) -> Option<PathBuf> {
    let (bin, _) = slicer.linux();
    std::env::var_os("PATH").and_then(|paths| std::env::split_paths(&paths).map(|d| d.join(bin)).find(|p| p.is_file()))
}

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
fn find(_: Slicer) -> Option<PathBuf> {
    None
}

/// Ist der Slicer auf diesem Rechner installiert?
pub fn available(slicer: Slicer) -> bool {
    if find(slicer).is_some() {
        return true;
    }
    #[cfg(target_os = "linux")]
    {
        let (_, flatpak) = slicer.linux();
        return Command::new("flatpak").args(["info", flatpak]).output().map(|o| o.status.success()).unwrap_or(false);
    }
    #[allow(unreachable_code)]
    false
}

/// Öffnet die Datei im Slicer. Prüft Dateityp und Existenz, startet ohne Shell.
pub fn open(slicer: Slicer, file: &Path) -> Result<(), String> {
    let name = file.file_name().and_then(|n| n.to_str()).unwrap_or("");
    if !is_model_file(name) {
        return Err(format!("{} öffnet nur Modelldateien (3MF, STL, STEP, OBJ, AMF).", slicer.label()));
    }
    if !file.is_file() {
        return Err("Datei nicht gefunden – evtl. noch nicht synchronisiert.".into());
    }
    let not_found = || format!("{} wurde auf diesem Rechner nicht gefunden.", slicer.label());

    #[cfg(target_os = "macos")]
    let mut cmd = {
        let app = find(slicer).ok_or_else(not_found)?;
        let mut c = Command::new("/usr/bin/open");
        c.arg("-a").arg(app).arg(file);
        c
    };
    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut c = Command::new(find(slicer).ok_or_else(not_found)?);
        c.arg(file);
        c
    };
    #[cfg(target_os = "linux")]
    let mut cmd = match find(slicer) {
        Some(bin) => {
            let mut c = Command::new(bin);
            c.arg(file);
            c
        }
        None => {
            if !available(slicer) {
                return Err(not_found());
            }
            let mut c = Command::new("flatpak");
            c.args(["run", slicer.linux().1]).arg(file);
            c
        }
    };
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    let mut cmd: Command = return Err(not_found());

    cmd.spawn().map(|_| ()).map_err(|e| format!("{} konnte nicht gestartet werden: {e}", slicer.label()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn opens_only_model_files() {
        for ok in ["Teil.3mf", "halter.STL", "gehaeuse.step", "x.stp", "figur.obj", "a.amf"] {
            assert!(is_model_file(ok), "{ok}");
        }
        for bad in ["rechnung.pdf", "start.command", "modell.3mf.exe", "README", "bild.png", "x.scad"] {
            assert!(!is_model_file(bad), "{bad}");
        }
    }

    #[test]
    fn refuses_other_files_before_starting_anything() {
        let err = open(Slicer::Bambu, Path::new("/tmp/irgendwas.pdf")).unwrap_err();
        assert!(err.contains("nur Modelldateien"));
        let err = open(Slicer::Bambu, Path::new("/nicht/vorhanden/teil.3mf")).unwrap_err();
        assert!(err.contains("nicht gefunden"));
    }

    #[test]
    fn reads_setting() {
        assert_eq!(Slicer::from_setting(""), Slicer::Bambu);
        assert_eq!(Slicer::from_setting("orca"), Slicer::Orca);
        assert_eq!(Slicer::from_setting("prusa").label(), "PrusaSlicer");
    }
}
