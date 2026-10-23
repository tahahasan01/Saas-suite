"use client";

import { useCallback, useEffect, useState } from "react";
import type { Schema } from "@business-os/api-client";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useCan } from "@/lib/can";
import { useAction } from "@/lib/useAction";
import { Card, Select } from "@/components/ui";

type Consent = Schema<"ConsentOut">;
type Channel = Consent["channel"];

const CHANNELS: { key: Channel; label: string }[] = [
  { key: "email", label: "Email" }, { key: "sms", label: "SMS" }, { key: "whatsapp", label: "WhatsApp" },
];

/** Whether this contact agreed to marketing, per channel (wave D). Campaigns
 *  only reach "Yes"; "No" always wins, even over a merged duplicate's yes. */
export function ConsentCard({ contactId }: { contactId: string }) {
  const can = useCan();
  const [rows, setRows] = useState<Consent[] | null>(null);
  const load = useCallback(() => {
    api<Consent[]>(`/contacts/${contactId}/consents`).then(setRows).catch(() => setRows([]));
  }, [contactId]);
  useEffect(load, [load]);

  const save = useAction(
    (channel: Channel, status: string) => api(`/contacts/${contactId}/consents`, {
      method: "PUT", body: JSON.stringify({ channel, status, source: "Recorded by staff" }),
    }),
    { success: "Saved", failure: "Couldn't save that" },
  );

  return (
    <Card>
      <h3 className="mb-1 text-sm font-semibold">Marketing</h3>
      <p className="mb-3 text-xs text-fg-muted">Campaigns only go to channels marked Yes.</p>
      <ul className="space-y-2 text-sm">
        {CHANNELS.map(({ key, label }) => {
          const row = rows?.find((r) => r.channel === key);
          return (
            <li key={key} className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {label}
                {row && <span className="block text-xs text-fg-subtle">{row.source} · {formatDate(row.updated_at)}</span>}
              </span>
              <span className="w-36">
                <Select aria-label={`${label} marketing`} value={row?.status ?? ""}
                        disabled={!can("contacts.contact.update") || save.busy || rows === null}
                        onChange={async (e) => { if (e.target.value && await save.run(key, e.target.value)) load(); }}>
                  <option value="" disabled>Not asked</option>
                  <option value="opted_in">Yes</option>
                  <option value="opted_out">No</option>
                </Select>
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
