//! Liest Vorschaubild und – falls gesliced – Gewicht/Druckzeit aus Bambu-/Orca-3MF-Dateien.

use base64::Engine;
use quick_xml::events::{BytesStart, Event};
use quick_xml::Reader;
use serde::Serialize;
use std::fs::File;
use std::io::Read;
use std::path::Path;
use zip::ZipArchive;

const THUMBNAILS: &[&str] = &[
    "Metadata/plate_1.png",
    "Metadata/thumbnail.png",
    "Metadata/top_1.png",
    "Auxiliaries/.thumbnails/thumbnail_small.png",
];

#[derive(Serialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FilamentInfo {
    pub kind: String,
    pub color: String,
    pub used_g: f64,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PlateInfo {
    pub index: u32,
    pub weight_g: f64,
    pub print_seconds: f64,
    pub filaments: Vec<FilamentInfo>,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ThreeMfInfo {
    pub thumbnail: Option<String>,
    pub printer: Option<String>,
    pub plates: Vec<PlateInfo>,
    pub filaments: Vec<FilamentInfo>,
}

fn read_entry(zip: &mut ZipArchive<File>, name: &str) -> Option<Vec<u8>> {
    let mut f = zip.by_name(name).ok()?;
    let mut buf = Vec::new();
    f.read_to_end(&mut buf).ok()?;
    Some(buf)
}

fn attr(e: &BytesStart, key: &str) -> Option<String> {
    e.attributes()
        .flatten()
        .find(|a| a.key.local_name().as_ref() == key.as_bytes())
        .and_then(|a| a.unescape_value().ok().map(|v| v.into_owned()))
}

fn num(s: Option<String>) -> f64 {
    s.and_then(|v| v.trim().parse().ok()).unwrap_or(0.0)
}

fn parse_slice_info(xml: &str) -> Vec<PlateInfo> {
    let mut reader = Reader::from_str(xml);
    let mut plates = Vec::new();
    let mut cur: Option<PlateInfo> = None;
    loop {
        let ev = reader.read_event();
        let (e, is_start) = match &ev {
            Ok(Event::Start(e)) => (e.clone(), true),
            Ok(Event::Empty(e)) => (e.clone(), false),
            Ok(Event::End(e)) => {
                if e.local_name().as_ref() == b"plate" {
                    if let Some(p) = cur.take() {
                        plates.push(p);
                    }
                }
                continue;
            }
            Ok(Event::Eof) | Err(_) => break,
            _ => continue,
        };
        match e.local_name().as_ref() {
            b"plate" if is_start => cur = Some(PlateInfo::default()),
            b"metadata" => {
                if let Some(p) = cur.as_mut() {
                    let value = attr(&e, "value");
                    match attr(&e, "key").as_deref() {
                        Some("index") => p.index = num(value) as u32,
                        Some("prediction") => p.print_seconds = num(value),
                        Some("weight") => p.weight_g = num(value),
                        _ => {}
                    }
                }
            }
            b"filament" => {
                if let Some(p) = cur.as_mut() {
                    p.filaments.push(FilamentInfo {
                        kind: attr(&e, "type").unwrap_or_default(),
                        color: attr(&e, "color").unwrap_or_default(),
                        used_g: num(attr(&e, "used_g")),
                    });
                }
            }
            _ => {}
        }
    }
    plates.retain(|p| p.weight_g > 0.0 || p.print_seconds > 0.0);
    plates
}

pub fn read(path: &Path) -> Result<ThreeMfInfo, String> {
    let file = File::open(path).map_err(|e| e.to_string())?;
    let mut zip = ZipArchive::new(file).map_err(|e| format!("Keine gültige 3MF-Datei: {e}"))?;
    let mut info = ThreeMfInfo::default();

    info.thumbnail = THUMBNAILS.iter().find_map(|n| read_entry(&mut zip, n)).map(|png| {
        format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(png))
    });

    if let Some(cfg) = read_entry(&mut zip, "Metadata/project_settings.config") {
        if let Ok(v) = serde_json::from_slice::<serde_json::Value>(&cfg) {
            info.printer = v.get("printer_model").and_then(|p| p.as_str()).map(String::from);
            let list = |k: &str| -> Vec<String> {
                v.get(k)
                    .and_then(|a| a.as_array())
                    .map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect())
                    .unwrap_or_default()
            };
            let kinds = list("filament_type");
            let colors = list("filament_colour");
            info.filaments = kinds
                .into_iter()
                .enumerate()
                .map(|(i, kind)| FilamentInfo { kind, color: colors.get(i).cloned().unwrap_or_default(), used_g: 0.0 })
                .collect();
        }
    }

    if let Some(xml) = read_entry(&mut zip, "Metadata/slice_info.config") {
        info.plates = parse_slice_info(&String::from_utf8_lossy(&xml));
    }
    Ok(info)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_bambu_slice_info() {
        let xml = r##"<config><plate>
  <metadata key="index" value="1"/>
  <metadata key="prediction" value="5700"/>
  <metadata key="weight" value="57.05"/>
  <filament id="1" type="PLA" color="#FF0000" used_m="18.9" used_g="57.05" />
</plate></config>"##;
        let p = parse_slice_info(xml);
        assert_eq!(p.len(), 1);
        assert_eq!(p[0].index, 1);
        assert_eq!(p[0].print_seconds, 5700.0);
        assert_eq!(p[0].filaments[0].color, "#FF0000");
    }
}

#[cfg(test)]
mod file_tests {
    /// DRUCKPLANER_TEST_3MF=/pfad/zur/datei.3mf cargo test real_file -- --nocapture
    #[test]
    fn real_file() {
        let Ok(path) = std::env::var("DRUCKPLANER_TEST_3MF") else { return };
        let info = super::read(std::path::Path::new(&path)).unwrap();
        println!(
            "Drucker: {:?}, Vorschaubild: {}, Platten: {}, Filamente: {}",
            info.printer,
            info.thumbnail.is_some(),
            info.plates.len(),
            info.filaments.iter().map(|f| format!("{} {}", f.kind, f.color)).collect::<Vec<_>>().join(", ")
        );
        assert!(info.thumbnail.is_some());
    }
}
