"use client";

import { BirthdaySwitch } from "@/components/hrms/BirthdaySwitch";
import { Celebrations } from "@/components/hrms/Celebrations";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Approvals, Attendance, Employee, LeaveBalanceV2 } from "@business-os/types";
import { api } from "@/lib/api";
import { attendanceBadge, formatDay } from "@/lib/format";
import { currentFix } from "@/lib/geo";
import { isTodayPKT } from "@/lib/dates";
import { formatTime } from "@/lib/format";
import { useSession } from "@/lib/session";
import { errorText, useAction } from "@/lib/useAction";
import { Badge, Button, Card, LoadingRows } from "@/components/ui";


const timeOf = (iso: string | null) => (iso ? formatTime(iso) : "—");

export default function MySpace() {
  const { me } = useSession();
  const [profile, setProfile] = useState<Employee | null>(null);
  // undefined = still loading; null = loaded, not clocked in. "Not clocked in"
  // flashing before the answer arrived read as a lost check-in.
  const [today, setToday] = useState<Attendance | null | undefined>(undefined);
  const [balances, setBalances] = useState<LeaveBalanceV2[]>([]);
  // Each part fails on its own and says so; "Not clocked in" when the answer
  // simply never came would send people to clock in twice.
  const [todayError, setTodayError] = useState<string | null>(null);
  const [balancesError, setBalancesError] = useState<string | null>(null);
  // A manager's inbox: their reports' requests waiting for them.
  const [approvals, setApprovals] = useState<Approvals | null>(null);
  const [locating, setLocating] = useState(false);
  // Only members (or past members with money in it) get the fund link.
  const [inFund, setInFund] = useState(false);

  const load = useCallback(() => {
    setTodayError(null);
    setBalancesError(null);
    // The line under the greeting is decoration; without it the page is whole.
    api<Employee>("/me/profile").then(setProfile).catch(() => setProfile(null));
    api<Attendance[]>("/me/attendance")
      // Today is Pakistan's day: in UTC it was yesterday until 5am, so staff
      // who had clocked in saw "Not clocked in" again after midnight.
      .then((rows) => setToday(rows.find((r) => isTodayPKT(r.work_date)) ?? null))
      .catch((e) => { setToday(undefined); setTodayError(errorText(e, "Couldn't load today's attendance.")); });
    api<LeaveBalanceV2[]>("/me/leave/balances").then(setBalances)
      .catch((e) => setBalancesError(errorText(e, "Couldn't load your leave balances.")));
    api<Approvals>("/me/approvals").then(setApprovals).catch(() => setApprovals(null));
    api<{ member: boolean; employee_minor: number; employer_minor: number }>("/me/pf", { notify: false })
      .then((f) => setInFund(f.member || f.employee_minor !== 0 || f.employer_minor !== 0)).catch(() => setInFund(false));
  }, []);
  useEffect(load, [load]);

  // Busy-guarded so a double tap can't clock in twice; a refusal (outside the
  // geofence, off the office network) shows the server's reason in a toast.
  // The browser's location goes with the punch and the server judges it (D-43);
  // no location means the punch goes without one.
  const clockAction = useAction(
    async (action: "checkin" | "checkout") => {
      setLocating(true);
      const fix = await currentFix().finally(() => setLocating(false));
      return api<Attendance>(`/me/attendance/${action}`, { method: "POST", body: JSON.stringify(fix ?? {}) });
    },
    { success: (r) => ((r as Attendance).check_out ? "Clocked out" : "Clocked in"), failure: "Couldn't record that" },
  );
  async function clock(action: "checkin" | "checkout") {
    if ((await clockAction.run(action)) !== undefined) load();
  }
  const busy = clockAction.busy;
  const label = (doing: string) => (locating ? "Finding your location…" : doing);
  const waiting = (approvals?.corrections.length ?? 0) + (approvals?.leave.length ?? 0);

  const firstName = me?.user.name.split(" ")[0] ?? "there";

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Celebrations path="/me/celebrations" />
      {profile && <BirthdaySwitch initial={profile.celebrate_birthday !== false} hasDate={!!profile.date_of_birth} />}
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
          {todayError ? (
            <p role="status" className="mt-1 text-sm text-warning">
              {todayError}{" "}
              <button type="button" onClick={load} className="text-brand hover:underline">Try again</button>
            </p>
          ) : today === undefined ? (
            <div className="mt-1 w-48"><LoadingRows rows={1} label="Loading today" /></div>
          ) : today ? (
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-fg-muted">
              <Badge tone={attendanceBadge(today.status).tone}>{attendanceBadge(today.status).label}</Badge>
              In {timeOf(today.check_in)}{today.check_out && ` · Out ${timeOf(today.check_out)}`}
              {today.geo_status === "outside" && <Badge tone="warning">outside the site</Badge>}
            </p>
          ) : (
            <p className="mt-1 text-sm text-fg-subtle">Not clocked in yet.</p>
          )}
        </div>
        {today === undefined ? null : !today?.check_in ? (
          <Button onClick={() => clock("checkin")} disabled={busy}>{busy ? label("Clocking in…") : "Clock in"}</Button>
        ) : !today?.check_out || today.auto_closed ? (
          <Button variant="subtle" onClick={() => clock("checkout")} disabled={busy}>{busy ? label("Clocking out…") : "Clock out"}</Button>
        ) : (
          <span className="text-sm text-fg-subtle">Done for today 👋</span>
        )}
      </Card>

      {waiting > 0 && approvals && <ApprovalsCard approvals={approvals} onDecided={load} />}

      {balancesError && <p role="status" className="text-sm text-warning">{balancesError}</p>}
      <section className="grid gap-3 sm:grid-cols-3">
        {balances.map((b) => (
          <Card key={b.leave_type}>
            <p className="text-xs text-fg-muted">{b.name || `${b.leave_type} leave`}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {b.remaining}<span className="text-sm text-fg-subtle">/{b.quota}</span>
            </p>
            <p className="text-[11px] text-fg-subtle">
              days left{b.cycle_end ? ` until ${formatDay(b.cycle_end, { day: "numeric", month: "short" })}` : " this year"}
            </p>
          </Card>
        ))}
      </section>

      <div className="flex flex-wrap gap-x-5 gap-y-1">
        <Link href="/me/leave" className="inline-flex items-center text-sm text-brand hover:underline pointer-coarse:min-h-11">Request leave →</Link>
        <Link href="/me/payslips" className="inline-flex items-center text-sm text-brand hover:underline pointer-coarse:min-h-11">My payslips →</Link>
        <Link href="/me/attendance" className="inline-flex items-center text-sm text-brand hover:underline pointer-coarse:min-h-11">My attendance →</Link>
        {inFund && <Link href="/me/pf" className="inline-flex items-center text-sm text-brand hover:underline pointer-coarse:min-h-11">My provident fund →</Link>}
      </div>
    </div>
  );
}

/* Requests from the manager's own team, decided here. The server checks the
   manager holds the approve key and isn't deciding their own request. */
function ApprovalsCard({ approvals, onDecided }: { approvals: Approvals; onDecided: () => void }) {
  const decide = useAction(
    (path: string) => api(path, { method: "POST", body: JSON.stringify({}) }),
    { success: "Decision recorded", failure: "Couldn't record that decision" },
  );
  async function act(path: string) {
    if ((await decide.run(path)) !== undefined) onDecided();
  }
  return (
    <Card className="space-y-2">
      <h2 className="text-sm font-semibold">Waiting for you</h2>
      <ul className="divide-y divide-line">
        {approvals.leave.map((l) => (
          <li key={l.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
            <span className="min-w-0 flex-1 basis-48">
              <span className="font-medium">{l.employee_name}</span> · {l.leave_type_name || l.leave_type} ·{" "}
              <span className="tabular-nums text-fg-muted">{l.from_date}{l.to_date !== l.from_date && ` → ${l.to_date}`}</span>
            </span>
            <Button size="sm" onClick={() => act(`/hrms/leave/${l.id}/approve`)} disabled={decide.busy}>Approve</Button>
            <Button size="sm" variant="ghost" onClick={() => act(`/hrms/leave/${l.id}/reject`)} disabled={decide.busy}>Reject</Button>
          </li>
        ))}
        {approvals.corrections.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
            <span className="min-w-0 flex-1 basis-48">
              <span className="font-medium">{c.employee_name}</span> · fix {c.work_date} · <span className="text-fg-muted">{c.reason}</span>
            </span>
            <Button size="sm" onClick={() => act(`/hrms/attendance/corrections/${c.id}/approve`)} disabled={decide.busy}>Approve</Button>
            <Button size="sm" variant="ghost" onClick={() => act(`/hrms/attendance/corrections/${c.id}/reject`)} disabled={decide.busy}>Reject</Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
