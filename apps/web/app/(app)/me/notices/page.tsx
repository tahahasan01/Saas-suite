"use client";

import { useCallback, useEffect, useState } from "react";
import type { Schema } from "@business-os/api-client";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { fileUrl } from "@/lib/org";
import { errorText, useAction } from "@/lib/useAction";
import { Badge, Button, Card, EmptyState, ErrorState, LoadingRows } from "@/components/ui";

type Notice = Schema<"NoticeOut">;

/** The employee's notice board (wave A, H18/H19): what HR posted for them,
 *  with policies still to acknowledge first. */
export default function MyNotices() {
  const [rows, setRows] = useState<Notice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    api<Notice[]>("/me/notices").then(setRows).catch((e) => setError(errorText(e)));
  }, []);
  useEffect(load, [load]);

  const ack = useAction(
    (n: Notice) => api(`/me/notices/${n.id}/acknowledge`, { method: "POST" }),
    { success: "Thanks, recorded", failure: "Couldn't record it" },
  );

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (rows === null) return <LoadingRows rows={3} label="Loading notices" />;
  if (rows.length === 0) return <EmptyState title="No notices" hint="Notices and policies from HR show up here." />;
  const waiting = rows.filter((n) => n.requires_ack && !n.acknowledged_at).length;
  return (
    <div className="space-y-4">
      {waiting > 0 && (
        <p role="status" className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm">
          {waiting} {waiting === 1 ? "policy needs" : "policies need"} your acknowledgement.
        </p>
      )}
      <ul className="space-y-3" aria-label="Notices">
        {rows.map((n) => (
          <li key={n.id}>
            <Card className="space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="font-semibold">{n.title}</h2>
                  <p className="text-xs text-fg-muted">{formatDateTime(n.published_at)}</p>
                </div>
                {n.pinned && <Badge tone="brand">pinned</Badge>}
              </div>
              {n.body && <p className="whitespace-pre-line text-sm">{n.body}</p>}
              {n.file_id && <a href={fileUrl(n.file_id)} className="text-sm text-brand hover:underline">Open the attachment</a>}
              {n.requires_ack && (
                <div className="flex justify-end">
                  {n.acknowledged_at ? (
                    <span className="text-xs text-success">You acknowledged this on {formatDateTime(n.acknowledged_at)}</span>
                  ) : (
                    <Button disabled={ack.busy} onClick={async () => { if ((await ack.run(n)) !== undefined) load(); }}
                            aria-label={`I have read and accept ${n.title}`}>
                      I have read and accept
                    </Button>
                  )}
                </div>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
