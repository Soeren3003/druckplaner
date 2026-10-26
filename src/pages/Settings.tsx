import { useEffect, useState, type ReactNode } from "react";
import { Field, NumberInput } from "../components/ui";
import { api, inTauri, pickFolder } from "../lib/api";
import { uid } from "../lib/defaults";
import { dateTime, fixed, money } from "../lib/format";
import { useStore } from "../lib/store";
import type { LocalConfig, Material, Printer, Sender, Settings, TaxMode, WorkTemplate } from "../lib/types";

const TABS = [
  ["absender", "Absender"],
  ["steuer", "Steuer & Rechnung"],
  ["drucker", "Drucker & Strom"],
  ["filamente", "Filamente"],
  ["arbeit", "Arbeitspakete"],
  ["sync", "Daten & Sync"],
] as const;

type Tab = (typeof TABS)[number][0];

const COUNTRIES = [
  { name: "Deutschland", currency: "EUR", vat: 19 },
  { name: "Österreich", currency: "EUR", vat: 20 },
  { name: "Schweiz", currency: "CHF", vat: 8.1 },
  { name: "USA", currency: "USD", vat: 7.25 },
];

/** Bearbeitbare Liste für Drucker, Filamente, Arbeitspakete. */
function ListEditor<T extends { id: string }>({
  items,
  onChange,
  columns,
  create,
  addLabel,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  columns: { label: string; className?: string; render: (item: T, set: (patch: Partial<T>) => void) => ReactNode }[];
  create: () => T;
  addLabel: string;
}) {
  const set = (id: string, patch: Partial<T>) => onChange(items.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const copy = items.slice();
    [copy[i], copy[j]] = [copy[j], copy[i]];
    onChange(copy);
  };
  return (
    <>
      <table className="edit">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.label} className={c.className}>
                {c.label}
              </th>
            ))}
            <th className="w-act-wide" />
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={it.id}>
              {columns.map((c) => (
                <td key={c.label}>{c.render(it, (p) => set(it.id, p))}</td>
              ))}
              <td className="nowrap">
                <button className="icon" onClick={() => move(i, -1)} title="Nach oben">
                  ↑
                </button>
                <button className="icon" onClick={() => move(i, 1)} title="Nach unten">
                  ↓
                </button>
                <button className="icon danger" onClick={() => onChange(items.filter((x) => x.id !== it.id))} title="Entfernen">
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="ghost small add" onClick={() => onChange([...items, create()])}>
        {addLabel}
      </button>
    </>
  );
}

export default function SettingsPage({ tab: initial }: { tab?: string }) {
  const store = useStore();
  const s = store.settings;
  const [tab, setTab] = useState<Tab>((initial as Tab) || "absender");
  const set = (patch: Partial<Settings>) => store.saveSettings({ ...s, ...patch });
  const setSender = (patch: Partial<Sender>) => set({ sender: { ...s.sender, ...patch } });
  const setInv = (patch: Partial<Settings["invoice"]>) => set({ invoice: { ...s.invoice, ...patch } });
  const cur = s.currency;

  return (
    <div className="page">
      <header className="page-head">
        <h1>Einstellungen</h1>
      </header>
      <div className="tabs">
        {TABS.map(([id, label]) => (
          <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "absender" && (
        <section className="card">
          <p className="muted">Diese Angaben erscheinen als Absender auf Angeboten und Rechnungen.</p>
          <div className="form-grid">
            <Field label="Name">
              <input value={s.sender.name} onChange={(e) => setSender({ name: e.target.value })} />
            </Field>
            <Field label="Straße & Hausnr.">
              <input value={s.sender.street} onChange={(e) => setSender({ street: e.target.value })} />
            </Field>
            <Field label="PLZ">
              <input value={s.sender.zip} onChange={(e) => setSender({ zip: e.target.value })} />
            </Field>
            <Field label="Ort">
              <input value={s.sender.city} onChange={(e) => setSender({ city: e.target.value })} />
            </Field>
            <Field label="E-Mail">
              <input value={s.sender.email} onChange={(e) => setSender({ email: e.target.value })} />
            </Field>
            <Field label="Telefon">
              <input value={s.sender.phone} onChange={(e) => setSender({ phone: e.target.value })} />
            </Field>
            <Field label="Bank (optional)">
              <input value={s.sender.bank} onChange={(e) => setSender({ bank: e.target.value })} />
            </Field>
            <Field label="IBAN">
              <input value={s.sender.iban} onChange={(e) => setSender({ iban: e.target.value })} />
            </Field>
            <Field label="BIC (optional)">
              <input value={s.sender.bic} onChange={(e) => setSender({ bic: e.target.value })} />
            </Field>
            <Field label="Steuernummer (nur falls vorhanden)">
              <input value={s.sender.taxId} onChange={(e) => setSender({ taxId: e.target.value })} />
            </Field>
          </div>
        </section>
      )}

      {tab === "steuer" && (
        <>
          <section className="card">
            <h2>Umsatzsteuer</h2>
            <div className="radio-list">
              {(
                [
                  ["privat", "Privatverkauf", "Keine Umsatzsteuer, Hinweis „Privatverkauf“ auf der Rechnung."],
                  ["kleinunternehmer", "Kleinunternehmer (§ 19 UStG)", "Keine Umsatzsteuer, Hinweis auf § 19 UStG."],
                  ["mwst", "Mit Umsatzsteuer", "Umsatzsteuer wird berechnet und ausgewiesen."],
                ] as [TaxMode, string, string][]
              ).map(([id, label, desc]) => (
                <label key={id} className={`radio ${s.taxMode === id ? "active" : ""}`}>
                  <input type="radio" checked={s.taxMode === id} onChange={() => set({ taxMode: id })} />
                  <span>
                    <strong>{label}</strong>
                    <span className="muted small">{desc}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="form-grid">
              <Field label="Land-Vorlage">
                <select
                  value=""
                  onChange={(e) => {
                    const c = COUNTRIES.find((x) => x.name === e.target.value);
                    if (c) set({ currency: c.currency, vatRate: c.vat });
                  }}
                >
                  <option value="">Übernehmen …</option>
                  {COUNTRIES.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name} ({c.currency}, {fixed(c.vat, 2)} %)
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Währung">
                <select value={s.currency} onChange={(e) => set({ currency: e.target.value })}>
                  {["EUR", "CHF", "USD"].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Steuersatz">
                <NumberInput value={s.vatRate} onChange={(v) => set({ vatRate: v ?? 0 })} suffix="%" />
              </Field>
            </div>
          </section>
          <section className="card">
            <h2>Rechnungen & Angebote</h2>
            <div className="form-grid">
              <Field label="Präfix Rechnungsnummer" hint={`Ergibt z. B. ${s.invoice.invoicePrefix}${new Date().getFullYear()}-001`}>
                <input value={s.invoice.invoicePrefix} onChange={(e) => setInv({ invoicePrefix: e.target.value })} />
              </Field>
              <Field label="Präfix Angebotsnummer">
                <input value={s.invoice.quotePrefix} onChange={(e) => setInv({ quotePrefix: e.target.value })} />
              </Field>
              <Field label="Zahlungsziel">
                <NumberInput value={s.invoice.paymentDays} digits={0} onChange={(v) => setInv({ paymentDays: v ?? 0 })} suffix="Tage" />
              </Field>
              <Field label="Grußformel">
                <input value={s.invoice.closing} onChange={(e) => setInv({ closing: e.target.value })} />
              </Field>
              <Field label="Einleitung Rechnung" wide>
                <textarea rows={2} value={s.invoice.introInvoice} onChange={(e) => setInv({ introInvoice: e.target.value })} />
              </Field>
              <Field label="Einleitung Angebot" wide>
                <textarea rows={2} value={s.invoice.introQuote} onChange={(e) => setInv({ introQuote: e.target.value })} />
              </Field>
              <Field label="Hinweis Privatverkauf" wide>
                <input value={s.invoice.textPrivat} onChange={(e) => setInv({ textPrivat: e.target.value })} />
              </Field>
              <Field label="Hinweis Kleinunternehmer" wide>
                <input value={s.invoice.textKleinunternehmer} onChange={(e) => setInv({ textKleinunternehmer: e.target.value })} />
              </Field>
            </div>
          </section>
        </>
      )}

      {tab === "drucker" && (
        <>
          <section className="card">
            <h2>Strom</h2>
            <div className="form-grid">
              <Field label="Strompreis" hint="DE ca. 0,30 €/kWh, AT ca. 0,32 €/kWh, CH ca. 0,32 CHF/kWh">
                <NumberInput value={s.electricityPrice} onChange={(v) => set({ electricityPrice: v ?? 0 })} suffix={`${cur}/kWh`} />
              </Field>
              <Field label="Standard-Drucker">
                <select value={s.defaultPrinterId} onChange={(e) => set({ defaultPrinterId: e.target.value })}>
                  {s.printers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Standard Verpackung">
                <NumberInput value={s.defaultPackaging} onChange={(v) => set({ defaultPackaging: v ?? 0 })} suffix={cur} />
              </Field>
              <Field label="Standard Versand">
                <NumberInput value={s.defaultShipping} onChange={(v) => set({ defaultShipping: v ?? 0 })} suffix={cur} />
              </Field>
            </div>
          </section>
          <section className="card">
            <h2>Drucker</h2>
            <p className="muted small">
              Leistung = durchschnittlicher Verbrauch beim Drucken (nicht die Spitzenleistung des Netzteils). Verschleiß optional, z. B. Anschaffungspreis ÷
              erwartete Druckstunden.
            </p>
            <ListEditor<Printer>
              items={s.printers}
              onChange={(printers) => set({ printers })}
              create={() => ({ id: uid(), name: "Neuer Drucker", watts: 150, wearPerHour: 0 })}
              addLabel="+ Drucker"
              columns={[
                { label: "Name", render: (p, u) => <input value={p.name} onChange={(e) => u({ name: e.target.value })} /> },
                { label: "Leistung", className: "w-num", render: (p, u) => <NumberInput value={p.watts} digits={0} onChange={(v) => u({ watts: v ?? 0 })} suffix="W" /> },
                {
                  label: "Verschleiß",
                  className: "w-num",
                  render: (p, u) => <NumberInput value={p.wearPerHour} onChange={(v) => u({ wearPerHour: v ?? 0 })} suffix={`${cur}/h`} />,
                },
              ]}
            />
          </section>
        </>
      )}

      {tab === "filamente" && (
        <>
          <section className="card">
            <h2>Filamente</h2>
            <p className="muted small">
              Preisänderungen gelten für neue Druckteile; bestehende Aufträge behalten ihre Werte. Der Aufschlag deckt z. B. Fehldrucke und Reste ab.
            </p>
            <ListEditor<Material>
              items={s.materials}
              onChange={(materials) => set({ materials })}
              create={() => ({ id: uid(), name: "Neues Filament", spoolWeight: 1000, spoolPrice: 20, markupPercent: 0 })}
              addLabel="+ Filament"
              columns={[
                { label: "Bezeichnung", render: (m, u) => <input value={m.name} onChange={(e) => u({ name: e.target.value })} /> },
                { label: "Preis/Rolle", className: "w-num", render: (m, u) => <NumberInput value={m.spoolPrice} onChange={(v) => u({ spoolPrice: v ?? 0 })} suffix={cur} /> },
                { label: "Inhalt", className: "w-num", render: (m, u) => <NumberInput value={m.spoolWeight} digits={0} onChange={(v) => u({ spoolWeight: v ?? 0 })} suffix="g" /> },
                { label: "Aufschlag", className: "w-num", render: (m, u) => <NumberInput value={m.markupPercent} onChange={(v) => u({ markupPercent: v ?? 0 })} suffix="%" /> },
                {
                  label: "€/kg",
                  className: "w-sum r",
                  render: (m) => <span className="muted">{m.spoolWeight ? money(((m.spoolPrice * (1 + m.markupPercent / 100)) / m.spoolWeight) * 1000, cur) : "–"}</span>,
                },
              ]}
            />
          </section>
          <section className="card">
            <h2>Farbvorschläge</h2>
            <Field label="Kommagetrennt" wide>
              <ColorList colors={s.colors} onChange={(colors) => set({ colors })} />
            </Field>
          </section>
        </>
      )}

      {tab === "arbeit" && (
        <section className="card">
          <h2>Vorlagen für Arbeitspakete</h2>
          <ListEditor<WorkTemplate>
            items={s.workTemplates}
            onChange={(workTemplates) => set({ workTemplates })}
            create={() => ({ id: uid(), name: "Neues Arbeitspaket", unit: "h", price: 0 })}
            addLabel="+ Arbeitspaket"
            columns={[
              { label: "Bezeichnung", render: (w, u) => <input value={w.name} onChange={(e) => u({ name: e.target.value })} /> },
              { label: "Einheit", className: "w-unit", render: (w, u) => <input value={w.unit} onChange={(e) => u({ unit: e.target.value })} /> },
              { label: "Preis", className: "w-num", render: (w, u) => <NumberInput value={w.price} onChange={(v) => u({ price: v ?? 0 })} suffix={cur} /> },
            ]}
          />
        </section>
      )}

      {tab === "sync" && <SyncSettings />}
    </div>
  );
}

/** Kommagetrennte Liste; wird erst beim Verlassen des Feldes zerlegt, damit Kommas tippbar bleiben. */
function ColorList({ colors, onChange }: { colors: string[]; onChange: (c: string[]) => void }) {
  const [text, setText] = useState(colors.join(", "));
  return (
    <input
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const list = text
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean);
        onChange(list);
        setText(list.join(", "));
      }}
    />
  );
}

function SyncSettings() {
  const store = useStore();
  const [cfg, setCfg] = useState<LocalConfig | null>(store.config);
  const [password, setPassword] = useState("");
  const [hasPw, setHasPw] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.hasPassword().then(setHasPw);
  }, []);

  if (!cfg) return null;
  const w = cfg.webdav;
  const setW = (patch: Partial<LocalConfig["webdav"]>) => setCfg({ ...cfg, webdav: { ...w, ...patch } });
  const dirty = JSON.stringify(cfg) !== JSON.stringify(store.config) || password !== "";

  const save = async () => {
    const keychain = await api.saveConfig(cfg, password || undefined);
    const dataChanged = cfg.dataDir !== store.config?.dataDir;
    store.setConfig(cfg);
    if (password) setHasPw(true);
    setPassword("");
    if (dataChanged) await store.reload();
    setMsg({ ok: true, text: keychain ? "Gespeichert." : "Gespeichert. Hinweis: Kein Schlüsselbund verfügbar – Passwort liegt in der lokalen Konfigurationsdatei." });
  };

  const test = async () => {
    setBusy(true);
    setMsg(null);
    try {
      if (dirty) await save();
      setMsg({ ok: true, text: await api.testConnection() });
    } catch (e) {
      setMsg({ ok: false, text: String(e) });
    } finally {
      setBusy(false);
    }
  };

  const last = store.sync.last;

  return (
    <>
      <section className="card">
        <h2>Datenordner</h2>
        <p className="muted small">
          Hier liegen Aufträge, Kunden, Druckdateien und Rechnungs-PDFs. Der Ordner muss <strong>nicht</strong> im Nextcloud-Client liegen – die App
          synchronisiert selbst per WebDAV.
        </p>
        <div className="row">
          <code className="path">{cfg.dataDir}</code>
          <button className="ghost small" disabled={!inTauri} onClick={() => api.openDataDir()}>
            Öffnen
          </button>
          <button
            className="ghost small"
            disabled={!inTauri}
            onClick={async () => {
              const d = await pickFolder("Datenordner wählen");
              if (d) setCfg({ ...cfg, dataDir: d });
            }}
          >
            Ändern …
          </button>
        </div>
      </section>
      <section className="card">
        <h2>Nextcloud / WebDAV</h2>
        <label className="check">
          <input type="checkbox" checked={w.enabled} onChange={(e) => setW({ enabled: e.target.checked })} />
          Synchronisation aktivieren
        </label>
        <div className="form-grid">
          <Field label="Server-Adresse" wide hint="Nextcloud-Adresse (https://cloud.example.com) oder vollständige WebDAV-URL aus Nextcloud → Dateien → Einstellungen.">
            <input value={w.url} placeholder="https://…" onChange={(e) => setW({ url: e.target.value })} />
          </Field>
          <Field label="Benutzername">
            <input value={w.username} onChange={(e) => setW({ username: e.target.value })} autoComplete="off" />
          </Field>
          <Field label="App-Passwort" hint={hasPw ? "Gespeichert im Schlüsselbund. Nur ausfüllen zum Ändern." : "Nextcloud → Einstellungen → Sicherheit → „Neues App-Passwort erstellen“."}>
            <input type="password" value={password} placeholder={hasPw ? "••••••••" : ""} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </Field>
          <Field label="Ordner auf dem Server" hint="Wird angelegt, falls nicht vorhanden.">
            <input value={w.remoteFolder} onChange={(e) => setW({ remoteFolder: e.target.value })} />
          </Field>
          <Field label="Automatisch synchronisieren">
            <select value={w.autoSyncMinutes} onChange={(e) => setW({ autoSyncMinutes: Number(e.target.value) })}>
              <option value={0}>Nur beim Start und manuell</option>
              <option value={5}>alle 5 Minuten</option>
              <option value={15}>alle 15 Minuten</option>
              <option value={60}>stündlich</option>
            </select>
          </Field>
        </div>
        {msg && <div className={`alert ${msg.ok ? "ok" : "error"}`}>{msg.text}</div>}
        <div className="row">
          <button className="primary" disabled={!dirty} onClick={() => save().catch((e) => setMsg({ ok: false, text: String(e) }))}>
            Speichern
          </button>
          <button disabled={busy || !w.url || !inTauri} onClick={test}>
            Verbindung testen
          </button>
          <button disabled={!w.enabled || store.sync.running || dirty || !inTauri} onClick={() => store.runSync()}>
            {store.sync.running ? "Synchronisiere …" : "Jetzt synchronisieren"}
          </button>
        </div>
      </section>
      {(last || store.sync.error) && (
        <section className="card">
          <h2>Letzte Synchronisation</h2>
          {last && (
            <p>
              {dateTime(last.finishedAt)}: {last.uploaded} hochgeladen, {last.downloaded} heruntergeladen, {last.deletedLocal + last.deletedRemote} gelöscht.
            </p>
          )}
          {last && last.conflicts.length > 0 && (
            <div className="alert">
              {last.conflicts.length} Konflikt(e) – auf beiden Geräten geändert. Die neuere Version wurde behalten, die andere liegt im Datenordner unter
              „conflicts“:
              <ul>
                {last.conflicts.map((c) => (
                  <li key={c}>
                    <code>{c}</code>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {store.sync.error && <pre className="alert error">{store.sync.error}</pre>}
        </section>
      )}
    </>
  );
}
