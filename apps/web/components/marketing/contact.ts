/** Where "Contact sales" and "Talk to us" go — one address for the landing
 *  page, /pricing and Settings → Billing, on the same domain the API already
 *  sends mail from (no-reply@businessos.pk). A mailto: works without a contact
 *  form or a backend, and opens the user's own mail app on a phone. */
export const SALES_EMAIL = "sales@businessos.pk";

export function salesMailto(subject = "Business OS Enterprise"): string {
  return `mailto:${SALES_EMAIL}?subject=${encodeURIComponent(subject)}`;
}
