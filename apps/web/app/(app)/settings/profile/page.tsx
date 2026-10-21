"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { errorText, useAction } from "@/lib/useAction";
import type { Profile } from "@/lib/org";
import { Button, Card, ErrorState, Field, Input, LoadingRows, PasswordInput, Select } from "@/components/ui";

export default function ProfilePage() {
  const { refresh } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [form, setForm] = useState({ name: "", locale: "en" });
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const p = await api<Profile>("/profile");
      setProfile(p);
      setForm({ name: p.name, locale: p.locale });
    } catch (e) {
      setLoadError(errorText(e));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = useAction(async () => {
    const p = await api<Profile>("/profile", { method: "PATCH", body: JSON.stringify(form) });
    setProfile(p);
    await refresh(); // the shell shows your name
    return p;
  }, { success: "Profile saved", failure: "Couldn't save your profile" });

  if (!profile) {
    return loadError ? <ErrorState message={`Couldn't load your profile. ${loadError}`} onRetry={load} />
      : <LoadingRows label="Loading your profile" />;
  }

  return (
    <div className="max-w-xl space-y-5">
      <header>
        <h2 className="text-lg font-semibold">My profile</h2>
        <p className="mt-1 text-sm text-fg-muted">Signed in as {profile.email}</p>
      </header>

      <Card>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.run(); }}>
          <fieldset disabled={save.busy} className="grid gap-3 sm:grid-cols-2">
            <legend className="sr-only">Your details</legend>
            <Field label="Your name">
              <Input value={form.name} required maxLength={120} autoComplete="name"
                     onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </Field>
            <Field label="Language">
              <Select value={form.locale} onChange={(e) => setForm((f) => ({ ...f, locale: e.target.value }))}>
                <option value="en">English</option>
                <option value="ur">اردو (Urdu)</option>
              </Select>
            </Field>
          </fieldset>
          {save.error && <p role="alert" className="text-xs text-danger">{save.error}</p>}
          <Button type="submit" disabled={save.busy || !form.name.trim()}>{save.busy ? "Saving…" : "Save profile"}</Button>
        </form>
      </Card>

      <PasswordCard />
    </div>
  );
}

function PasswordCard() {
  const empty = { current: "", next: "", confirm: "" };
  const [pw, setPw] = useState(empty);
  const mismatch = pw.confirm !== "" && pw.next !== pw.confirm;
  const change = useAction(
    // 204: the server signs out every other device and re-issues this session's cookie.
    () => api("/auth/password", {
      method: "POST",
      body: JSON.stringify({ current_password: pw.current, new_password: pw.next }),
    }),
    { success: "Password changed. You were signed out on your other devices.", failure: "Couldn't change your password" },
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mismatch) return;
    if (await change.run()) setPw(empty);
  }

  return (
    <Card>
      <form className="space-y-4" onSubmit={submit}>
        <div>
          <h3 className="text-sm font-semibold">Change password</h3>
          <p className="text-xs text-fg-subtle">At least 8 characters. Changing it signs you out everywhere else.</p>
        </div>
        <fieldset disabled={change.busy} className="space-y-3">
          <legend className="sr-only">Password</legend>
          <Field label="Current password">
            <PasswordInput value={pw.current} required autoComplete="current-password"
                           onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))} />
          </Field>
          <Field label="New password">
            <PasswordInput value={pw.next} required minLength={8} autoComplete="new-password"
                           onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))} />
          </Field>
          <Field label="Confirm new password">
            <PasswordInput value={pw.confirm} required minLength={8} autoComplete="new-password"
                           aria-invalid={mismatch || undefined}
                           onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))} />
          </Field>
        </fieldset>
        {mismatch && <p role="alert" className="text-xs text-danger">The new passwords don&apos;t match.</p>}
        {change.error && <p role="alert" className="text-xs text-danger">{change.error}</p>}
        <Button type="submit" disabled={change.busy || mismatch || pw.next.length < 8 || !pw.current}>
          {change.busy ? "Changing…" : "Change password"}
        </Button>
      </form>
    </Card>
  );
}
