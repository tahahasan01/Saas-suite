"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Attendance, Employee } from "@business-os/types";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Badge, Button, Card } from "@/components/ui";

interface Balance { leave_type: string; quota: number; used: number; remaining: number }

const timeOf = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" }) : "—";

export default function MySpace() {
  const { me } = useSession();
  const [profile, setProfile] = useState<Employee | null>(null);
  const [today, setToday] = useState<Attendance | null>(null);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<Employee>("/me/profile").then(setProfile).catch(() => {});
    api<Attendance[]>("/me/attendance")
      .then((rows) => setToday(rows.find((r) => isToday(r.work_date)) ?? null))
      .catch(() => {});
    api<Balance[]>("/me/leave/balances").then(setBalances).catch(() => {});
  }, []);
  useEffect(load, [load]);

  async function clock(action: "checkin" | "checkout") {
    setBusy(true);
    setErr(null);
    try {
      await api(`/me/attendance/${action}`, { method: "POST" });
      load();
    } catch (e) {
      setErr(e instanceof ApiError && typeof e.detail === "string" ? e.detail : "Couldn't record that.");
    } finally {
      setBusy(false);
    }
  }

  const firstName = me?.user.name.split(" ")[0] ?? "there";

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Hi, {firstName}</h1>
        {profile && (
          <p className="mt-1 text-sm text-fg-muted">
            {profile.designation || "Team member"}{profile.department && ` · ${profile.department}`}
          </p>
        )}
      </header>

      {/* Clock — the thing an employee does every day, made one tap. */}
      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium">Today</p>
          {today ? (
            <p className="mt-1 flex items-center gap-2 text-sm text-fg-muted">
              <Badge tone={today.status === "late" ? "warning" : "success"}>{today.status}</Badge>
              In {timeOf(today.check_in)}{today.check_out && ` · Out ${timeOf(today.check_out)}`}
            </p>
          ) : (
            <p className="mt-1 text-sm text-fg-subtle">Not clocked in yet.</p>
          )}
        </div>
        {!today?.check_in ? (
          <Button onClick={() => clock("checkin")} disabled={busy}>Clock in</Button>
        ) : !today?.check_out ? (
          <Button variant="subtle" onClick={() => clock("checkout")} disabled={busy}>Clock out</Button>
        ) : (
          <span className="text-sm text-fg-subtle">Done for today 👋</span>
        )}
      </Card>
      {err && <p className="text-xs text-danger">{err}</p>}

      <section className="grid gap-3 sm:grid-cols-3">
        {balances.map((b) => (
          <Card key={b.leave_type}>
            <p className="text-xs capitalize text-fg-muted">{b.leave_type} leave</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {b.remaining}<span className="text-sm text-fg-subtle">/{b.quota}</span>
            </p>
            <p className="text-[11px] text-fg-subtle">days left this year</p>
          </Card>
        ))}
      </section>

      <div className="flex flex-wrap gap-3">
        <Link href="/me/leave" className="text-sm text-brand hover:underline">Request leave →</Link>
        <Link href="/me/payslips" className="text-sm text-brand hover:underline">My payslips →</Link>
        <Link href="/me/attendance" className="text-sm text-brand hover:underline">My attendance →</Link>
      </div>
    </div>
  );
}

function isToday(d: string) {
  return d === new Date().toISOString().slice(0, 10);
}
