import { useState } from "react";
import { MailDialog } from "../../components/MailDialog";
import { Empty, Field, Modal } from "../../components/ui";
import { api, confirmDialog, pickSavePath } from "../../lib/api";
import { calcProject, documentLines, documentTotals, nextNumber, vatRateFor, type DetailLevel } from "../../lib/calc";
import { today, uid } from "../../lib/defaults";
import { date, money, safeFileName } from "../../lib/format";
import { buildPdf } from "../../lib/invoice";
import { projectLabel } from "../../lib/numbering";
import { useStore } from "../../lib/store";
import type { InvoiceRecord, Project } from "../../lib/types";

type Kind = InvoiceRecord["kind"];

export default function DocsTab({ project, update }: { project: Project; update: (p: Partial<Project>) => void }) {
  const { settings, customers, projects } = useStore();
  const [draft, setDraft] = useState<{ kind: Kind; number: string; date: string; detail: DetailLevel; note: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mailing, setMailing] = useState<InvoiceRecord | null>(null);
  const customer = customers.find((c) => c.id === project.customerId);
  const cur = settings.currency;

  const start = (kind: Kind) => {
    const prefix = kind === "rechnung" ? settings.invoice.invoicePrefix : settings.invoice.quotePrefix;
    const all = projects.flatMap((p) => p.invoices).filter((i) => i.kind === kind).map((i) => i.number);
    setDraft({ kind, number: nextNumber(prefix, new Date().getFullYear(), all), date: today(), detail: "einzeln", note: "" });
    setError("");
  };

  const create = async () => {
    if (!draft) return;
    const taken = projects.flatMap((p) => p.invoices).some((i) => i.number === draft.number && i.kind === draft.kind);
    if (taken) return setError(`Die Nummer ${draft.number} ist bereits vergeben.`);
    setBusy(true);
    try {
      const lines = documentLines(project, settings, draft.detail);
      const totals = documentTotals(lines, vatRateFor(settings));
      const label = draft.kind === "rechnung" ? "Rechnung" : "Angebot";
      const fileName = safeFileName(`${draft.number} ${label} ${customer?.name ?? ""} ${projectLabel(project)}`) + ".pdf";
      const rec: InvoiceRecord = { id: uid(), kind: draft.kind, number: draft.number, date: draft.date, fileName, lines, ...totals, paidAt: "" };
      const pdf = buildPdf(rec, project, customer, settings, draft.note);
      await api.invoiceSave(fileName, pdf);
      const status =
        draft.kind === "angebot" && project.status === "anfrage" ? "angebot" : project.status;
      update({ invoices: [...project.invoices, rec], status });
      setDraft(null);
      await api.invoiceOpen(fileName);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const setRec = (id: string, patch: Partial<InvoiceRecord>, extra: Partial<Project> = {}) =>
    update({ invoices: project.invoices.map((i) => (i.id === id ? { ...i, ...patch } : i)), ...extra });

  const togglePaid = (rec: InvoiceRecord) => {
    const paidAt = rec.paidAt ? "" : today();
    setRec(rec.id, { paidAt }, paidAt ? { status: "bezahlt" } : {});
  };

  const remove = async (rec: InvoiceRecord) => {
    if (!(await confirmDialog(`${rec.number} samt PDF löschen?`))) return;
    await api.invoiceDelete(rec.fileName);
    update({ invoices: project.invoices.filter((i) => i.id !== rec.id) });
  };

  const exportPdf = async (rec: InvoiceRecord) => {
    const target = await pickSavePath(rec.fileName);
    if (target) await api.invoiceExport(rec.fileName, target).catch((e) => setError(String(e)));
  };

  const preview = draft ? documentLines(project, settings, draft.detail) : [];
  const previewTotals = documentTotals(preview, vatRateFor(settings));
  const calcTotal = calcProject(project, settings).total;

  return (
    <section className="card">
      <div className="card-head">
        <h2>Angebote & Rechnungen</h2>
        <div className="row">
          <button className="ghost small" onClick={() => start("angebot")}>
            + Angebot
          </button>
          <button className="primary small" onClick={() => start("rechnung")}>
            + Rechnung
          </button>
        </div>
      </div>
      {!settings.sender.name && (
        <div className="alert">Tipp: Trage unter Einstellungen → Absender deinen Namen und deine Bankverbindung ein – sie erscheinen auf dem PDF.</div>
      )}
      {error && !draft && <div className="alert error">{error}</div>}
      {project.invoices.length === 0 ? (
        <Empty>Noch keine Dokumente für diesen Auftrag.</Empty>
      ) : (
        <table className="list">
          <thead>
            <tr>
              <th>Nummer</th>
              <th>Art</th>
              <th>Datum</th>
              <th className="r">Betrag</th>
              <th>Bezahlt</th>
              <th>Versendet</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {project.invoices.map((r) => (
              <tr key={r.id} className="static">
                <td>
                  <button className="link" onClick={() => api.invoiceOpen(r.fileName).catch((e) => setError(String(e)))}>
                    {r.number}
                  </button>
                </td>
                <td>{r.kind === "rechnung" ? "Rechnung" : "Angebot"}</td>
                <td>{date(r.date)}</td>
                <td className="r">{money(r.total, cur)}</td>
                <td>
                  {r.kind === "rechnung" && (
                    <label className="check">
                      <input type="checkbox" checked={!!r.paidAt} onChange={() => togglePaid(r)} />
                      {r.paidAt ? date(r.paidAt) : "offen"}
                    </label>
                  )}
                </td>
                <td className="small">
                  {r.sentAt ? (
                    <span title={r.sentTo}>✉ {date(r.sentAt.slice(0, 10))}</span>
                  ) : (
                    <span className="muted">–</span>
                  )}
                </td>
                <td className="r nowrap">
                  <button className="ghost small" onClick={() => setMailing(r)} title="Per E-Mail an den Kunden senden">
                    ✉ E-Mail …
                  </button>
                  <button className="ghost small" onClick={() => exportPdf(r)}>
                    Speichern unter …
                  </button>
                  <button className="ghost small danger" onClick={() => remove(r)}>
                    Löschen
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {mailing && (
        <MailDialog
          rec={mailing}
          project={project}
          customer={customer}
          onClose={() => setMailing(null)}
          onSent={(to) =>
            setRec(mailing.id, { sentAt: new Date().toISOString(), sentTo: to }, mailing.kind === "angebot" && project.status === "anfrage" ? { status: "angebot" } : {})
          }
        />
      )}

      {draft && (
        <Modal
          title={draft.kind === "rechnung" ? "Rechnung erstellen" : "Angebot erstellen"}
          onClose={() => setDraft(null)}
          footer={
            <>
              <button onClick={() => setDraft(null)}>Abbrechen</button>
              <button className="primary" onClick={create} disabled={busy || !draft.number.trim()}>
                PDF erstellen
              </button>
            </>
          }
        >
          {!customer && <div className="alert">Diesem Auftrag ist noch kein Kunde zugeordnet.</div>}
          {error && <div className="alert error">{error}</div>}
          <div className="form-grid">
            <Field label="Nummer">
              <input value={draft.number} onChange={(e) => setDraft({ ...draft, number: e.target.value })} />
            </Field>
            <Field label="Datum">
              <input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
            </Field>
            <Field label="Positionen" wide>
              <select value={draft.detail} onChange={(e) => setDraft({ ...draft, detail: e.target.value as DetailLevel })}>
                <option value="einzeln">Einzeln aufführen (Druckteile, Arbeit, Versand …)</option>
                <option value="pauschal">Eine Pauschalposition</option>
              </select>
            </Field>
            <Field label="Zusätzlicher Hinweis (optional)" wide>
              <textarea rows={2} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
            </Field>
          </div>
          <table className="list compact">
            <tbody>
              {preview.map((l, i) => (
                <tr key={i} className="static">
                  <td className="pre-line">{l.description}</td>
                  <td className="r nowrap">
                    {l.quantity} {l.unit}
                  </td>
                  <td className="r nowrap">{money(l.total, cur)}</td>
                </tr>
              ))}
              <tr className="static total-row">
                <td>Gesamt</td>
                <td />
                <td className="r">{money(previewTotals.total, cur)}</td>
              </tr>
            </tbody>
          </table>
          {Math.abs(previewTotals.total - calcTotal) >= 0.01 && (
            <p className="muted small">
              Abweichung zur Kalkulation ({money(calcTotal, cur)}) durch Rundung der Stückpreise auf volle Cent: {money(previewTotals.total - calcTotal, cur)}
            </p>
          )}
        </Modal>
      )}
    </section>
  );
}
