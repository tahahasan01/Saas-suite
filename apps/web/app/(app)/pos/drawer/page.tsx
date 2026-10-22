"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { formatDateTime, money, relativeDate } from "@/lib/format";
import { BUSINESS_TZ } from "@/lib/dates";
import { useAction } from "@/lib/useAction";
import { Can } from "@/lib/can";
import { encodeReceipt, type Paper, type ReceiptDoc } from "@/lib/escpos";
import { pairPrinter, printerSettings, printerSupport, savePrinterSettings, sendToPrinter, type PrinterKind } from "@/lib/printer";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, LoadingRows, Select } from "@/components/ui";
import { Dialog } from "@/components/Dialog";
import { useToast } from "@/components/Toast";
import { DataTable, type Column } from "@/components/DataTable";
import { blurOnWheel, methodLabel } from "@/components/pos/labels";
import { ApprovalPrompt, type Approval } from "@/components/pos/ApprovalPrompt";

/* Registers and their sessions (3C, 0076): open with a float, move cash in
 * and out, count every payment method at close (a big difference needs a
 * manager's PIN), then the Z-report. The old single drawer is register R1. */

interface Register {
  id: string; code: string; name: string; payment_methods: string[];
  max_variance_minor: number; is_default: boolean; active: boolean; open_session_id: string | null;
}
interface MethodFigures {
  method: string; taken_minor: number; refunds_minor: number; expected_minor: number;
  counted_minor: number | null; variance_minor: number | null;
}
interface Session {
  id: string; register_id: string; register_code: string; register_name: string; status: string;
  opened_at: string; opened_by: string | null; closed_at: string | null; closed_by: string | null;
  opening_float_minor: number; methods: MethodFigures[]; pay_in_minor: number; pay_out_minor: number;
  drop_minor: number; variance_approved_by: string | null; notes: string; warnings: string[];
}
interface ZReport {
  session: Session; sales_count: number; gross_minor: number; discount_minor: number; tax_minor: number;
  net_minor: number; rounding_minor: number; refunds_count: number; refunds_minor: number;
  methods: MethodFigures[]; cashiers: { name: string; sales_count: number; total_minor: number }[];
  late_synced: { sale_id: string; total_minor: number; created_at: string }[];
}

const pkr = (s: string) => Math.round(Number(s || 0) * 100);
const when = (iso: string) => formatDateTime(iso, BUSINESS_TZ);

export default function RegistersPage() {
  const [registers, setRegisters] = useState<Register[] | null>(null);
  const [regId, setRegId] = useState("");
  const [session, setSession] = useState<Session | null | undefined>(undefined); // null = none open
  const [history, setHistory] = useState<Session[] | null>(null);
  const [error, setError] = useState(false);
  const [zReport, setZReport] = useState<ZReport | null>(null);

  const register = registers?.find((r) => r.id === regId) ?? null;

  const load = useCallback(async (keep?: string) => {
    setError(false);
    try {
      const regs = (await api<Register[]>("/pos/registers")).filter((r) => r.active);
      setRegisters(regs);
      const pick = regs.find((r) => r.id === keep) ?? regs.find((r) => r.is_default) ?? regs[0];
      setRegId(pick?.id ?? "");
      if (!pick) { setSession(null); setHistory([]); return; }
      const [s, h] = await Promise.all([
        pick.open_session_id ? api<Session>(`/pos/sessions/${pick.open_session_id}`) : Promise.resolve(null),
        api<Session[]>(`/pos/sessions?register_id=${pick.id}&status=closed&limit=20`),
      ]);
      setSession(s);
      setHistory(h);
    } catch {
      setError(true);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function showZ(id: string) {
    try { setZReport(await api<ZReport>(`/pos/sessions/${id}/z-report`)); } catch { /* the toast says why */ }
  }

  if (error) return <ErrorState message="Couldn't load the registers." onRetry={() => void load(regId)} />;
  if (registers === null || session === undefined) return <LoadingRows label="Loading registers" />;

  const historyColumns: Column<Session>[] = [
    { key: "closed", header: "Closed", primary: true, cell: (s) => (s.closed_at ? relativeDate(s.closed_at) : "—") },
    { key: "by", header: "Closed by", cell: (s) => s.closed_by ?? "—" },
    { key: "expected", header: "Expected cash", align: "right", cell: (s) => money(cash(s).expected_minor) },
    { key: "variance", header: "Over / short", align: "right", cell: (s) => <Variance v={totalVariance(s)} /> },
    { key: "z", header: "", align: "right", cell: (s) => <Button size="sm" variant="subtle" onClick={() => void showZ(s.id)}>Z-report</Button> },
  ];

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-fg-muted">Open with a float, count every payment method at close, print the Z-report.</p>
        {registers.length > 1 && (
          <label className="flex items-center gap-2 text-sm">
            <span className="text-fg-muted">Register</span>
            <Select value={regId} onChange={(e) => void load(e.target.value)} className="w-auto">
              {registers.map((r) => <option key={r.id} value={r.id}>{r.code} · {r.name}</option>)}
            </Select>
          </label>
        )}
      </div>

      {!register ? (
        <EmptyState title="No register is switched on." />
      ) : session ? (
        <OpenSession register={register} session={session} onChanged={setSession}
                     onClosed={(s) => { void load(regId); void showZ(s.id); }} />
      ) : (
        <Can perm="pos.session.open" fallback={<EmptyState title="This register is closed." />}>
          <OpenForm register={register} onOpened={() => void load(regId)} />
        </Can>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <PrinterCard />
        <PinCard />
      </div>

      <section className="mt-6 space-y-2">
        <h2 className="text-sm font-semibold">Past sessions</h2>
        <DataTable columns={historyColumns} rows={history ?? []} rowKey={(s) => s.id} loading={history === null}
                   caption="Past sessions" empty={<EmptyState title="No closed sessions yet." />} />
      </section>

      <ZReportDialog report={zReport} onClose={() => setZReport(null)} />
    </>
  );
}

const cash = (s: Session) => s.methods.find((m) => m.method === "cash")
  ?? { method: "cash", taken_minor: 0, refunds_minor: 0, expected_minor: 0, counted_minor: null, variance_minor: null };
const totalVariance = (s: Session) =>
  s.methods.some((m) => m.variance_minor !== null) ? s.methods.reduce((t, m) => t + (m.variance_minor ?? 0), 0) : null;

function OpenForm({ register, onOpened }: { register: Register; onOpened: () => void }) {
  const [float_, setFloat] = useState("");
  const open = useAction(
    () => api("/pos/sessions", { method: "POST", body: JSON.stringify({ register_id: register.id, opening_float_minor: pkr(float_) }) }),
    { success: "Register opened", failure: "Couldn't open the register" });
  return (
    <Card className="max-w-sm space-y-3">
      <h2 className="text-sm font-semibold">Open {register.name}</h2>
      <form onSubmit={async (e) => { e.preventDefault(); if (await open.run() !== undefined) { setFloat(""); onOpened(); } }}
            className="space-y-3">
        <Field label="Opening float (PKR)">
          <Input type="number" inputMode="decimal" min={0} step="0.01" value={float_} placeholder="e.g. 5000"
                 onWheel={blurOnWheel} onChange={(e) => setFloat(e.target.value)} />
        </Field>
        <Button type="submit" className="w-full" disabled={open.busy}>{open.busy ? "Opening…" : "Open register"}</Button>
      </form>
    </Card>
  );
}

function OpenSession({ register, session, onChanged, onClosed }: {
  register: Register; session: Session; onChanged: (s: Session) => void; onClosed: (s: Session) => void;
}) {
  const [kind, setKind] = useState("pay_out");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [askPin, setAskPin] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

  const move = useAction(
    () => api<Session>(`/pos/sessions/${session.id}/cash-moves`, {
      method: "POST", body: JSON.stringify({ kind, amount_minor: pkr(amount), reason }) }),
    { success: "Cash move recorded", failure: "Couldn't record that" });

  // Every method this register takes is counted; the server works out each difference.
  const methods = register.payment_methods.filter((m) => m !== "khata");
  const figures = (m: string) => session.methods.find((x) => x.method === m);

  async function close(approval?: Approval): Promise<string | null> {
    setClosing(true);
    setCloseError(null);
    try {
      const body = { counted: Object.fromEntries(methods.map((m) => [m, pkr(counted[m] ?? "")])), notes, ...approval };
      const s = await api<Session>(`/pos/sessions/${session.id}/close`, { method: "POST", body: JSON.stringify(body), notify: false });
      setAskPin(false);
      onClosed(s);
      return null;
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Couldn't close the register";
      if (!approval && e instanceof ApiError && e.status === 403 && /manager/i.test(msg)) { setAskPin(true); return null; }
      if (approval) return e instanceof ApiError && e.status === 423 ? "That PIN is switched off for now. Ask another manager." : msg;
      setCloseError(msg);
      return null;
    } finally {
      setClosing(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold">{session.register_name} is open</p>
            <p className="text-xs text-fg-subtle">Since {relativeDate(session.opened_at)}{session.opened_by && ` · ${session.opened_by}`}</p>
          </div>
          <Badge tone="success">open</Badge>
        </div>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Opening float" value={money(session.opening_float_minor)} />
          <Stat label="Paid in" value={money(session.pay_in_minor)} />
          <Stat label="Paid out" value={`−${money(session.pay_out_minor + session.drop_minor)}`} />
          <Stat label="Expected cash" value={money(cash(session).expected_minor)} accent />
        </dl>
        <table className="w-full text-sm">
          <caption className="sr-only">Takings by payment method</caption>
          <thead><tr className="text-xs text-fg-muted">
            <th className="py-1 text-start font-medium">Method</th><th className="text-end font-medium">Taken</th>
            <th className="text-end font-medium">Refunds</th><th className="text-end font-medium">Expected</th>
          </tr></thead>
          <tbody>
            {session.methods.map((m) => (
              <tr key={m.method} className="border-t border-line">
                <td className="py-1.5">{methodLabel(m.method)}</td>
                <td className="text-end tabular-nums">{money(m.taken_minor)}</td>
                <td className="text-end tabular-nums">{m.refunds_minor ? `−${money(m.refunds_minor)}` : "—"}</td>
                <td className="text-end font-medium tabular-nums">{money(m.expected_minor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Can perm="pos.cash.move">
          <form className="grid gap-2 border-t border-line pt-3 sm:grid-cols-[auto_8rem_minmax(0,1fr)_auto] sm:items-end"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const s = await move.run();
                  if (s) { onChanged(s); setAmount(""); setReason(""); }
                }}>
            <Field label="Cash move">
              <Select value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="pay_out">Pay out</option>
                <option value="pay_in">Pay in</option>
                <option value="drop">Safe drop</option>
              </Select>
            </Field>
            <Field label="Amount (PKR)">
              <Input type="number" inputMode="decimal" min={0.01} step="0.01" required value={amount}
                     onWheel={blurOnWheel} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field label="Reason">
              <Input required maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Milk for the shop" />
            </Field>
            <Button type="submit" variant="subtle" disabled={move.busy}>Record</Button>
          </form>
        </Can>
      </Card>

      <Can perm="pos.session.close">
        <Card className="h-fit space-y-3">
          <h2 className="text-sm font-semibold">Count and close</h2>
          <form onSubmit={(e) => { e.preventDefault(); void close(); }} className="space-y-3">
            {methods.map((m) => (
              <Field key={m} label={`${methodLabel(m)} counted (PKR)`}>
                <Input type="number" inputMode="decimal" min={0} step="0.01" required value={counted[m] ?? ""}
                       placeholder={money(figures(m)?.expected_minor ?? 0)} onWheel={blurOnWheel}
                       onChange={(e) => setCounted((c) => ({ ...c, [m]: e.target.value }))} />
              </Field>
            ))}
            <Field label="Notes">
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
            </Field>
            {closeError && <p role="alert" className="text-sm text-danger">{closeError}</p>}
            <Button type="submit" className="w-full" disabled={closing}>{closing ? "Closing…" : "Close & print Z-report"}</Button>
          </form>
        </Card>
      </Can>

      <ApprovalPrompt open={askPin} need="pos.session.approve"
                      reason={`The count is off by more than ${money(register.max_variance_minor)}. A manager approves the difference.`}
                      onApprove={(a) => close(a)} onCancel={() => setAskPin(false)} />
    </div>
  );
}

function zDoc(z: ZReport): ReceiptDoc {
  const s = z.session;
  return {
    header: [`Z-report · ${s.register_code}`],
    meta: [`${when(s.opened_at)} to ${s.closed_at ? when(s.closed_at) : "now"}`, s.closed_by ? `Closed by ${s.closed_by}` : ""].filter(Boolean),
    lines: [
      { left: `Sales (${z.sales_count})`, right: money(z.gross_minor) },
      { left: "Discounts", right: `-${money(z.discount_minor)}` },
      { left: `Refunds (${z.refunds_count})`, right: `-${money(z.refunds_minor)}` },
      { left: "incl. sales tax", right: money(z.tax_minor) },
      ...z.methods.map((m) => ({
        left: `${methodLabel(m.method)} exp ${money(m.expected_minor)}`,
        right: m.counted_minor === null ? "-" : `${money(m.counted_minor)} (${m.variance_minor! >= 0 ? "+" : ""}${money(m.variance_minor ?? 0)})`,
      })),
      ...z.cashiers.map((c) => ({ left: `${c.name} (${c.sales_count})`, right: money(c.total_minor) })),
    ],
    totals: [{ left: "Net sales", right: money(z.net_minor), bold: true }],
    footer: z.late_synced.length ? [`${z.late_synced.length} sale(s) synced after close`] : [],
  };
}

function ZReportDialog({ report, onClose }: { report: ZReport | null; onClose: () => void }) {
  const toast = useToast();
  async function print() {
    if (!report) return;
    const { kind, paper } = printerSettings();
    if (kind === "browser") { window.print(); return; }
    try { await sendToPrinter(encodeReceipt(zDoc(report), paper)); }
    catch { toast.error("The printer didn't answer. Printing with the browser instead."); window.print(); }
  }
  return (
    <Dialog open={report !== null} onOpenChange={(o) => { if (!o) onClose(); }} title="Z-report" size="sm"
            footer={<><Button variant="subtle" onClick={() => void print()} className="flex-1">Print</Button>
                      <Button onClick={onClose} className="flex-1">Done</Button></>}>
      {report && (
        <div className="receipt-print space-y-2 text-sm">
          {(() => {
            const d = zDoc(report);
            return (
              <>
                <div className="text-center">
                  <p className="font-semibold">{d.header[0]}</p>
                  {d.meta.map((m) => <p key={m} className="text-xs text-fg-muted">{m}</p>)}
                </div>
                <div className="space-y-0.5 border-t border-line pt-2">
                  {d.lines.map((l, i) => (
                    <div key={i} className="flex justify-between gap-3"><span className="min-w-0 break-words">{l.left}</span>
                      <span className="shrink-0 tabular-nums">{l.right}</span></div>
                  ))}
                </div>
                <div className="flex justify-between gap-3 border-t border-line pt-2 font-semibold">
                  <span>{d.totals[0].left}</span><span className="tabular-nums">{d.totals[0].right}</span>
                </div>
                {d.footer.map((f) => <p key={f} className="text-xs text-warning">{f}</p>)}
                {report.session.warnings.map((w) => <p key={w} className="text-xs text-warning">{w}</p>)}
              </>
            );
          })()}
        </div>
      )}
    </Dialog>
  );
}

/** This till's receipt printer. Stays on this device. */
function PrinterCard() {
  const [s, setS] = useState(() => ({ kind: "browser" as PrinterKind, paper: 80 as Paper }));
  const [support, setSupport] = useState({ serial: false, usb: false });
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { setS(printerSettings()); setSupport(printerSupport()); }, []);

  async function pair() {
    if (s.kind === "browser") return;
    try { await pairPrinter(s.kind); setMsg("Printer paired."); }
    catch { setMsg("No printer was chosen."); }
  }
  async function test() {
    try {
      await sendToPrinter(encodeReceipt({ header: ["Test print"], meta: [when(new Date().toISOString())],
                                          lines: [{ left: "Paper width", right: `${s.paper}mm` }], totals: [], footer: ["It works."] }, s.paper));
      setMsg("Sent a test print.");
    } catch (e) {
      setMsg(e instanceof Error ? `${e.message}.` : "The printer didn't answer.");
    }
  }
  return (
    <Card className="space-y-3">
      <h2 className="text-sm font-semibold">This till&apos;s printer</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Print with">
          <Select value={s.kind} onChange={(e) => setS(savePrinterSettings({ kind: e.target.value as PrinterKind }))}>
            <option value="browser">The browser (any printer)</option>
            <option value="usb" disabled={!support.usb}>USB receipt printer{support.usb ? "" : " (Chrome or Edge only)"}</option>
            <option value="serial" disabled={!support.serial}>Serial receipt printer{support.serial ? "" : " (Chrome or Edge only)"}</option>
          </Select>
        </Field>
        <Field label="Paper">
          <Select value={s.paper} onChange={(e) => setS(savePrinterSettings({ paper: Number(e.target.value) as Paper }))}>
            <option value={80}>80mm roll</option>
            <option value={58}>58mm roll</option>
          </Select>
        </Field>
      </div>
      {s.kind !== "browser" && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="subtle" onClick={() => void pair()}>Pair printer</Button>
          <Button size="sm" variant="subtle" onClick={() => void test()}>Test print</Button>
        </div>
      )}
      {msg && <p role="status" className="text-xs text-fg-muted">{msg}</p>}
      <p className="text-xs text-fg-subtle">A USB or serial printer opens the cash drawer with each cash sale.</p>
    </Card>
  );
}

/** A manager's own 6-digit PIN for approving at any till. */
function PinCard() {
  const [pin, setPin] = useState("");
  const save = useAction(() => api("/pos/pin", { method: "PUT", body: JSON.stringify({ pin }) }),
                         { success: "Your approval PIN is set", failure: "Couldn't set your PIN" });
  return (
    <Card className="space-y-3">
      <h2 className="text-sm font-semibold">Your approval PIN</h2>
      <p className="text-xs text-fg-muted">Managers enter it at a till to approve discounts and big differences at close.</p>
      <form className="flex items-end gap-2" onSubmit={async (e) => { e.preventDefault(); if (await save.run() !== undefined) setPin(""); }}>
        <Field label="New PIN (6 digits)">
          <Input type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} pattern="\d{6}" required
                 value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} />
        </Field>
        <Button type="submit" variant="subtle" disabled={save.busy || pin.length !== 6}>Save</Button>
      </form>
    </Card>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-fg-subtle">{label}</dt>
      <dd className={`text-lg font-semibold tabular-nums break-words ${accent ? "text-brand" : ""}`}>{value}</dd>
    </div>
  );
}

function Variance({ v }: { v: number | null }) {
  if (v === null) return <span className="text-fg-subtle">—</span>;
  if (v === 0) return <Badge tone="success">exact</Badge>;
  return <span className={`font-medium tabular-nums ${v > 0 ? "text-success" : "text-danger"}`}>{v > 0 ? "+" : "−"}{money(Math.abs(v))}</span>;
}
