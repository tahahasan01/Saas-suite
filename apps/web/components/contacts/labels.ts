"use client";

import { useSession } from "@/lib/session";

/** The module's words for this industry: Customers, Students, Patients…
 *  (terminology keys `contact` / `contacts`, seeded by migration 0059). */
export function useContactLabels() {
  const { t } = useSession();
  const one = t("contact");
  const many = t("contacts");
  return {
    one: one === "contact" ? "Contact" : one,
    many: many === "contacts" ? "Contacts" : many,
  };
}

export const ROLE_LABELS: Record<string, string> = {
  customer: "Customer",
  supplier: "Supplier",
  patient: "Patient",
  student: "Student",
  parent: "Parent",
  partner: "Partner",
};

/** A tag's colour is a dot beside neutral text, so every colour keeps its
 *  contrast in both themes. The names are the API's. */
export const TAG_DOT: Record<string, string> = {
  slate: "bg-fg-subtle",
  teal: "bg-brand",
  amber: "bg-warning",
  rose: "bg-danger",
  violet: "bg-mod-hrms",
  sky: "bg-mod-inventory",
  lime: "bg-success",
};

/** A tel: link target: the E.164 key when known, else the digits typed. */
export function telHref(phone: string, e164: string | null): string {
  return `tel:${e164 ?? phone.replace(/[^\d+]/g, "")}`;
}

/** WhatsApp click-to-chat works only for a number we could place. */
export function whatsappHref(e164: string | null): string | null {
  return e164 ? `https://wa.me/${e164.replace("+", "")}` : null;
}
