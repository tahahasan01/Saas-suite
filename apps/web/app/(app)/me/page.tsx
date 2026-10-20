"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Attendance, Employee } from "@business-os/types";
import { api } from "@/lib/api";
import { attendanceBadge } from "@/lib/format";
import { isTodayPKT } from "@/lib/dates";
import { useSession } from "@/lib/session";
import { useAction } from "@/lib/useAction";
import { Badge, Button, Card, LoadingRows } from "@/components/ui";

interface Balance { leave_type: string; quota: number; used: number; remaining: number }

const timeOf = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" }) : "—";

export default function MySpace() {
  const { me } = useSession();
  const [profile, setProfile] = useState<Employee | null>(null);
  // undefined = still loading; null = loaded, not clocked in. "Not clocked in"
  // flashing before the answer arrived read as a lost check-in.
  const [today, setToday] = useState<Attendance | null | undefined>(undefined);
  const [balances, setBalances] = useState<Balance[]>([]);

  const load = useCallback(() => {
    api<Employee>("/me/profile").then(setProfile).catch(() => {});
    api<Attendance[]>("/me/attendance")
      // Today is Pakistan's day: in UTC it was yesterday until 5am, so staff
      // who had clocked in saw "Not clocked in" again after midnight.
      .then((rows) => setToday(rows.find((r) => isTodayPKT(r.work_date)) ?? null))
      .catch(() => setToday(null));
    api<Balance[]>("/me/leave/balances").then(setBalances).catch(() => {});
  }, []);
  useEffect(load, [load]);

  // Busy-guarded so a double tap can't clock in twice; a refusal (geofence,
  // no check-in to close) shows the server's reason in a toast.
  const clockAction = useAction(
    (action: "checkin" | "checkout") => api(`/me/attendance/${action}`, { method: "POST" }),
    { success: (r) => ((r as Attendance).check_out ? "Clocked out" : "Clocked in"), failure: "Couldn't record that" },
  );
  async function clock(action: "checkin" | "checkout") {
    if ((await clockAction.run(action)) !== undefined) load();
  }
  const busy = clockAction.busy;

  const firstName = me?.user.name.split(" ")[0] ?? "there";

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header>
        <h1 className="font-display text-[28px] font-bold tracking-tight">Hi, {firstName}</h1>
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
          {today === undefined ? (
            <div className="mt-1 w-48"><LoadingRows rows={1} label="Loading today" /></div>
          ) : today ? (
            <p className="mt-1 flex items-center gap-2 text-sm text-fg-muted">
              <Badge tone={attendanceBadge(today.status).tone}>{attendanceBadge(today.status).label}</Badge>
              In {timeOf(today.check_in)}{today.check_out && ` · Out ${timeOf(today.check_out)}`}
            </p>
          ) : (
            <p className="mt-1 text-sm text-fg-subtle">Not clocked in yet.</p>
          )}
        </div>
        {today === undefined ? null : !today?.check_in ? (
          <Button onClick={() => clock("checkin")} disabled={busy}>{busy ? "Clocking in…" : "Clock in"}</Button>
        ) : !today?.check_out ? (
          <Button variant="subtle" onClick={() => clock("checkout")} disabled={busy}>{busy ? "Clocking out…" : "Clock out"}</Button>
        ) : (
          <span className="text-sm text-fg-subtle">Done for today 👋</span>
        )}
      </Card>

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

      <div className="flex flex-wrap gap-x-5 gap-y-1">
        <Link href="/me/leave" className="inline-flex items-center text-sm text-brand hover:underline pointer-coarse:min-h-11">Request leave →</Link>
        <Link href="/me/payslips" className="inline-flex items-center text-sm text-brand hover:underline pointer-coarse:min-h-11">My payslips →</Link>
        <Link href="/me/attendance" className="inline-flex items-center text-sm text-brand hover:underline pointer-coarse:min-h-11">My attendance →</Link>
      </div>
    </div>
  );
}
