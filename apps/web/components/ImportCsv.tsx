"use client";

import { useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface Result {
  created: number;
  skipped_duplicates: number;
  errors: { row: number; error: string }[];
}

/** CSV import + export for a list page. `path` is the resource base, e.g.
 *  "/crm/leads" — import POSTs to `${path}/import`, export links to
 *  `${path}/export` (a plain navigation: the cookie rides along and the
 *  Content-Disposition header makes it a download). */
export function ImportCsv({ path, onDone }: { path: string; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      const text = await file.text();
      setResult(await api<Result>(`${path}/import`, {
        method: "POST",
        headers: { "Content-Type": "text/csv" },
        body: text,
      }));
      onDone();
    } catch (e) {
      setErr(e instanceof ApiError && typeof e.detail === "string" ? e.detail : "Import failed.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = ""; // same file can be retried
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
        />
        <Button variant="subtle" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? "Importing…" : "Import CSV"}
        </Button>
        <a href={`${API}${path}/export`} className="text-xs text-brand hover:underline">
          Export CSV
        </a>
      </div>

      {err && <p className="text-xs text-danger">{err}</p>}

      {result && (
        <div className="rounded-lg border border-line bg-elevated/40 px-3 py-2 text-xs">
          <p>
            <span className="font-semibold text-success">{result.created} imported</span>
            {result.skipped_duplicates > 0 && (
              <span className="text-fg-muted"> · {result.skipped_duplicates} skipped as duplicates</span>
            )}
          </p>
          {result.errors.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-fg-muted">
              {result.errors.slice(0, 5).map((e) => (
                <li key={e.row}>Row {e.row}: {e.error}</li>
              ))}
              {result.errors.length > 5 && <li>…and {result.errors.length - 5} more</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
