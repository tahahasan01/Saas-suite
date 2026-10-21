"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Contact } from "@business-os/types";
import { api } from "@/lib/api";
import { useCan } from "@/lib/can";
import { Button } from "@/components/ui";
import { useContactLabels } from "./labels";
import { QualifyDialog } from "./QualifyDialog";

/** The lead drawer's contact card: who this lead is (linked), or a Qualify
 *  call to action. Self-contained so the drawer only has to place it. */
export function LeadContactCard({ lead, onChanged }: {
  lead: { id: string; name: string; phone: string; email: string; company: string };
  onChanged?: () => void;
}) {
  const { one } = useContactLabels();
  const can = useCan();
  // undefined = loading; null = not qualified yet.
  const [contact, setContact] = useState<Contact | null | undefined>(undefined);
  const [qualifying, setQualifying] = useState(false);

  const load = useCallback(() => {
    api<Contact | null>(`/crm/leads/${lead.id}/contact`).then(setContact).catch(() => setContact(null));
  }, [lead.id]);
  useEffect(load, [load]);

  if (contact === undefined) return null;
  return (
    <section aria-label={one} className="mb-6 rounded-lg border border-line p-3 text-sm">
      {contact ? (
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-fg-subtle">{one}</p>
            {can("contacts.contact.read") ? (
              <Link href={`/contacts/${contact.id}`} className="block truncate font-medium text-brand hover:underline">{contact.name}</Link>
            ) : <p className="truncate font-medium">{contact.name}</p>}
          </div>
          {contact.company_name && <span className="truncate text-xs text-fg-muted">{contact.company_name}</span>}
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-fg-muted">Not linked to a {one.toLowerCase()} yet.</p>
          {can("contacts.contact.create") && can("crm.lead.update") && (
            <Button size="sm" onClick={() => setQualifying(true)}>Qualify</Button>
          )}
        </div>
      )}
      {qualifying && (
        <QualifyDialog
          lead={lead}
          onClose={() => setQualifying(false)}
          onQualified={(c) => { setQualifying(false); setContact(c); onChanged?.(); }}
        />
      )}
    </section>
  );
}
