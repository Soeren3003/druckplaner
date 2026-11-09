import { useEffect, useState } from "react";
import { api, inTauri } from "../lib/api";
import { mailDraft } from "../lib/mailtext";
import { useStore } from "../lib/store";
import type { Customer, InvoiceRecord, Project } from "../lib/types";
import { Field, Modal } from "./ui";

const looksLikeEmail = (s: string) => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(s.trim());

/**
 * Angebot/Rechnung per E-Mail: direkt über SMTP (wenn eingerichtet) oder als Entwurf im Mailprogramm.
 * Nach dem Versand wird Zeitpunkt und Empfänger am Dokument vermerkt.
 */
export function MailDialog({
  rec,
  project,
  customer,
  onClose,
  onSent,
}: {
  rec: InvoiceRecord;
  project: Project;
  customer: Customer | undefined;
  onClose: () => void;
  onSent: (to: string) => void;
}) {
  const store = useStore();
  const { settings, config } = store;
  const initial = mailDraft(rec, project, customer, settings);
  const [to, setTo] = useState(initial.to);
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const [saveAddress, setSaveAddress] = useState(true);
  const [hasPw, setHasPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.hasSmtpPassword().then(setHasPw);
  }, []);

  const smtpReady = inTauri && !!config?.smtp.enabled && hasPw;
  const valid = looksLikeEmail(to);
  const newAddress = !!customer && valid && to.trim() !== customer.email.trim();

  const rememberAddress = () => {
    if (customer && newAddress && saveAddress) store.saveCustomer({ ...customer, email: to.trim() });
  };

  const send = async () => {
    setBusy(true);
    setError("");
    try {
      await api.mailSend(to.trim(), subject, body, rec.fileName);
      rememberAddress();
      onSent(to.trim());
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const openClient = async () => {
    setError("");
    try {
      await api.mailOpen(to.trim(), subject, body, rec.fileName);
      rememberAddress();
      onSent(to.trim());
      onClose();
    } catch (e) {
      setError(String(e));
    }
  };

  const label = rec.kind === "rechnung" ? "Rechnung" : "Angebot";

  return (
    <Modal
      title={`${label} ${rec.number} per E-Mail`}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose}>Abbrechen</button>
          <button className={smtpReady ? "" : "primary"} onClick={openClient} disabled={!valid || busy}>
            Im Mailprogramm öffnen
          </button>
          {smtpReady && (
            <button className="primary" onClick={send} disabled={!valid || busy || !subject.trim()}>
              {busy ? "Sende …" : "Senden"}
            </button>
          )}
        </>
      }
    >
      {error && <div className="alert error">{error}</div>}
      {!smtpReady && (
        <div className="alert">
          Der direkte Versand ist nicht eingerichtet (Einstellungen → E-Mail). „Im Mailprogramm öffnen“ legt einen Entwurf an und zeigt das PDF im
          Ordner – bitte dort anhängen.
        </div>
      )}
      <div className="form-grid">
        <Field label="An" wide hint={!customer?.email ? "Beim Kunden ist noch keine E-Mail-Adresse hinterlegt." : undefined}>
          <input type="email" value={to} onChange={(e) => setTo(e.target.value)} className={to && !valid ? "invalid" : ""} autoFocus={!to} />
        </Field>
        {newAddress && (
          <label className="check wide-check">
            <input type="checkbox" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} />
            Adresse beim Kunden {customer?.name} speichern
          </label>
        )}
        <Field label="Betreff" wide>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} />
        </Field>
        <Field label="Text" wide>
          <textarea rows={9} value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
      </div>
      <p className="muted small">
        Anhang: {rec.fileName}
        {config?.smtp.copyToSelf && smtpReady && <> · Kopie an {config.smtp.fromAddress}</>}
        {rec.sentAt && <> · zuletzt versendet am {new Date(rec.sentAt).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}</>}
      </p>
    </Modal>
  );
}
