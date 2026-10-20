"use client";

import { useRef, useState } from "react";
import { X } from "lucide-react";
import { api, apiUrl } from "@/lib/api";
import { useAction } from "@/lib/useAction";
import { Button } from "@/components/ui";


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

  // useAction: one import at a time, a toast either way. The failure also
  // stays on screen below (a toast is gone in seconds; "why didn't my 300 rows
  // import?" needs to be readable).
  const importer = useAction(
    async (file: File) => api<Result>(`${path}/import`, {
      method: "POST",
      headers: { "Content-Type": "text/csv" },
      body: await file.text(),
    }),
    {
      success: (r) => {
        const { created, errors } = r as Result;
        return errors.length ? `${created} imported, ${errors.length} rows need fixing` : `${created} imported`;
      },
      failure: "Import failed",
    },
  );

  async function upload(file: File) {
    setResult(null);
    const r = await importer.run(file);
    if (fileRef.current) fileRef.current.value = ""; // same file can be retried
    if (!r) return;
    setResult(r);
    onDone();
  }

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          aria-label="CSV file to import"
          tabIndex={-1}
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
        />
        <Button variant="subtle" size="sm" disabled={importer.busy} onClick={() => fileRef.current?.click()}>
          {importer.busy ? "Importing…" : "Import CSV"}
        </Button>
        <a href={apiUrl(`${path}/export`)} className="inline-flex items-center text-xs text-brand hover:underline pointer-coarse:min-h-11">
          Export CSV
        </a>
      </div>

      {importer.error && !importer.busy && <p role="alert" className="text-xs text-danger">Import failed: {importer.error}</p>}

      {result && (
        <div className="flex items-start gap-2 rounded-lg border border-line bg-elevated/40 px-3 py-2 text-xs">
          <div className="min-w-0 flex-1">
            <p>
              <span className="font-semibold text-success">{result.created} imported</span>
              {result.skipped_duplicates > 0 && (
                <span className="text-fg-muted"> · {result.skipped_duplicates} skipped as duplicates</span>
              )}
            </p>
            {result.errors.length > 0 && (
              <ul className="mt-1 space-y-0.5 break-words text-fg-muted">
                {result.errors.slice(0, 5).map((e) => (
                  <li key={e.row}>Row {e.row}: {e.error}</li>
                ))}
                {result.errors.length > 5 && <li>…and {result.errors.length - 5} more</li>}
              </ul>
            )}
          </div>
          <button
            type="button"
            onClick={() => setResult(null)}
            aria-label="Dismiss import result"
            className="-m-1 grid h-7 w-7 shrink-0 place-items-center rounded text-fg-subtle hover:text-fg"
          >
            <X size={14} aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
