"use client";

import { useState } from "react";
import type { Schema } from "@business-os/api-client";
import { api } from "@/lib/api";
import { useAction } from "@/lib/useAction";
import { Button, Card, Field, Input } from "@/components/ui";

type Result = Schema<"BiometricImportOut">;

/** Import a biometric device's attendance log (wave A, H6): ZKTeco and
 *  similar export CSV with the employee's code (AC-No. / User ID) and the
 *  time. Matched by each employee's code on their profile; importing the
 *  same file twice adds nothing. */
export function BiometricImport({ onImported }: { onImported: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const run = useAction(
    async () => api<Result>("/hrms/attendance/import", { method: "POST", body: file!, headers: { "Content-Type": "text/csv" } }),
    { failure: "Couldn't import that file" },
  );
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = await run.run();
    if (r !== undefined) { setResult(r); onImported(); }
  }
  return (
    <Card className="space-y-3">
      <h2 className="text-sm font-semibold">Import from a biometric device</h2>
      <p className="text-xs text-fg-muted">
        Export the attendance log as CSV (columns like AC-No. or User ID, and Time). Each person&apos;s code on their
        profile must match the device&apos;s ID. Importing the same file again adds nothing.
      </p>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-2" aria-label="Import a device log">
        <Field label="Attendance log (CSV)">
          <Input type="file" accept=".csv,text/csv" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); }} />
        </Field>
        <Button type="submit" disabled={!file || run.busy}>{run.busy ? "Importing…" : "Import"}</Button>
      </form>
      {result && (
        <div role="status" className="space-y-1 text-sm">
          <p>{result.imported} punch{result.imported === 1 ? "" : "es"} imported{result.duplicates ? `, ${result.duplicates} already there` : ""}.</p>
          {result.unknown_codes.length > 0 && (
            <p className="text-warning">No employee has these codes: {result.unknown_codes.join(", ")}. Set them on each profile, then import again.</p>
          )}
          {result.errors.length > 0 && (
            <ul className="text-xs text-danger">
              {result.errors.slice(0, 10).map((e, i) => <li key={i}>Row {e.row}: {e.error}</li>)}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
