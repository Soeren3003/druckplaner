//! Versand von Angeboten und Rechnungen per E-Mail: direkt über SMTP oder als Entwurf im Mailprogramm.

use crate::config::SmtpConfig;
use lettre::message::header::ContentType;
use lettre::message::{Attachment, Mailbox, MultiPart, SinglePart};
use lettre::transport::smtp::authentication::Credentials;
use lettre::{AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor};
use percent_encoding::{utf8_percent_encode, NON_ALPHANUMERIC};
use std::time::Duration;

/// Eine einzelne Empfängeradresse; Name und Adresse werden von lettre geprüft und korrekt kodiert.
pub fn parse_recipient(to: &str) -> Result<Mailbox, String> {
    let to = to.trim();
    if to.is_empty() {
        return Err("Keine E-Mail-Adresse angegeben.".into());
    }
    if to.contains([',', ';', '\r', '\n']) {
        return Err("Bitte genau eine E-Mail-Adresse angeben.".into());
    }
    to.parse::<Mailbox>().map_err(|_| format!("Ungültige E-Mail-Adresse: {to}"))
}

/// Betreffzeilen dürfen keine Zeilenumbrüche enthalten (sonst ließen sich weitere Kopfzeilen einschleusen).
fn clean_subject(s: &str) -> String {
    s.chars().map(|c| if c.is_control() { ' ' } else { c }).collect::<String>().trim().to_string()
}

fn sender(cfg: &SmtpConfig) -> Result<Mailbox, String> {
    let addr = cfg.from_address.trim().parse().map_err(|_| "Absenderadresse in den E-Mail-Einstellungen ist ungültig.".to_string())?;
    let name = clean_subject(&cfg.from_name);
    Ok(Mailbox::new(if name.is_empty() { None } else { Some(name) }, addr))
}

fn transport(cfg: &SmtpConfig, password: &str) -> Result<AsyncSmtpTransport<Tokio1Executor>, String> {
    let host = cfg.host.trim();
    if host.is_empty() {
        return Err("Kein SMTP-Server eingetragen.".into());
    }
    // „ssl“: Verschlüsselung ab dem ersten Byte (meist Port 465); sonst STARTTLS (meist Port 587).
    // Unverschlüsselt wird nie gesendet.
    let builder = if cfg.security == "ssl" {
        AsyncSmtpTransport::<Tokio1Executor>::relay(host)
    } else {
        AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(host)
    }
    .map_err(|e| format!("SMTP-Server: {e}"))?;
    let port = if cfg.port == 0 { if cfg.security == "ssl" { 465 } else { 587 } } else { cfg.port };
    let user = if cfg.username.trim().is_empty() { cfg.from_address.trim() } else { cfg.username.trim() };
    Ok(builder
        .port(port)
        .credentials(Credentials::new(user.to_string(), password.to_string()))
        .timeout(Some(Duration::from_secs(30)))
        .build())
}

fn friendly(e: lettre::transport::smtp::Error) -> String {
    let msg = e.to_string();
    if msg.contains("535") || msg.to_lowercase().contains("authentication") {
        "Anmeldung am SMTP-Server fehlgeschlagen – Benutzername bzw. Passwort prüfen.".into()
    } else {
        format!("Versand fehlgeschlagen: {msg}")
    }
}

/// Prüft Verbindung und Anmeldung, ohne eine Nachricht zu senden.
pub async fn test(cfg: &SmtpConfig, password: &str) -> Result<(), String> {
    sender(cfg)?;
    match transport(cfg, password)?.test_connection().await {
        Ok(true) => Ok(()),
        Ok(false) => Err("Der SMTP-Server antwortet nicht.".into()),
        Err(e) => Err(friendly(e)),
    }
}

pub fn build_message(cfg: &SmtpConfig, to: &str, subject: &str, body: &str, attachment: Option<(&str, Vec<u8>)>) -> Result<Message, String> {
    let from = sender(cfg)?;
    let mut builder = Message::builder().from(from.clone()).to(parse_recipient(to)?).subject(clean_subject(subject));
    if cfg.copy_to_self {
        builder = builder.bcc(from);
    }
    let text = SinglePart::plain(body.replace("\r\n", "\n"));
    let msg = match attachment {
        Some((name, bytes)) => {
            let pdf = ContentType::parse("application/pdf").expect("gültiger MIME-Typ");
            builder.multipart(MultiPart::mixed().singlepart(text).singlepart(Attachment::new(name.to_string()).body(bytes, pdf)))
        }
        None => builder.singlepart(text),
    };
    msg.map_err(|e| format!("E-Mail konnte nicht erstellt werden: {e}"))
}

pub async fn send(cfg: &SmtpConfig, password: &str, message: Message) -> Result<(), String> {
    transport(cfg, password)?.send(message).await.map(|_| ()).map_err(friendly)
}

/// `mailto:`-Link für das Mailprogramm. Anhänge sind über `mailto:` nicht möglich.
pub fn mailto(to: &str, subject: &str, body: &str) -> Result<String, String> {
    let rcpt = parse_recipient(to)?;
    let enc = |s: &str| utf8_percent_encode(s, NON_ALPHANUMERIC).to_string();
    Ok(format!("mailto:{}?subject={}&body={}", enc(&rcpt.email.to_string()), enc(&clean_subject(subject)), enc(&body.replace("\r\n", "\n"))))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cfg() -> SmtpConfig {
        SmtpConfig { from_name: "Alex Beispiel".into(), from_address: "alex@example.com".into(), ..Default::default() }
    }

    #[test]
    fn accepts_only_one_valid_recipient() {
        assert!(parse_recipient("kunde@example.com").is_ok());
        assert!(parse_recipient("Jana Kowalski <jana@example.com>").is_ok());
        for bad in ["", "keine-adresse", "a@example.com, b@example.com", "a@example.com\r\nBcc: x@example.com", "a@example.com;b@example.com"] {
            assert!(parse_recipient(bad).is_err(), "{bad:?}");
        }
    }

    #[test]
    fn builds_message_with_pdf_and_safe_subject() {
        let m = build_message(&cfg(), "kunde@example.com", "Rechnung R2026-001\r\nBcc: boese@example.com", "Hallo,\nanbei die Rechnung.", Some(("R2026-001 Rechnung.pdf", b"%PDF-1.4".to_vec()))).unwrap();
        let raw = String::from_utf8(m.formatted()).unwrap();
        assert!(raw.contains("To: kunde@example.com"));
        // Der Umbruch ist entfernt: „Bcc: …“ bleibt Teil des Betreffs und wird keine eigene Kopfzeile.
        assert!(!raw.lines().any(|l| l.to_lowercase().starts_with("bcc:")), "{raw}");
        assert!(raw.lines().any(|l| l.starts_with("Subject: Rechnung R2026-001")));
        assert!(raw.contains("application/pdf"));
        assert!(raw.contains("R2026-001 Rechnung.pdf"));
    }

    #[test]
    fn adds_copy_to_sender_on_request() {
        let mut c = cfg();
        c.copy_to_self = true;
        let m = build_message(&c, "kunde@example.com", "Test", "x", None).unwrap();
        assert_eq!(m.envelope().to().len(), 2);
    }

    #[test]
    fn encodes_mailto_links() {
        let link = mailto("kunde@example.com", "Rechnung R2026-001 & mehr", "Hallo Jana,\nanbei …").unwrap();
        assert!(link.starts_with("mailto:kunde%40example%2Ecom?subject=Rechnung%20R2026%2D001%20%26%20mehr&body=Hallo%20Jana%2C%0Aanbei"));
        assert!(mailto("x@example.com?cc=boese@example.com", "s", "b").is_err());
    }
}
