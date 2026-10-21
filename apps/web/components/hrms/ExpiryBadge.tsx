import { Badge } from "@/components/ui";

/** "expired" / "12 days left" for a document within 30 days of expiry; nothing otherwise. */
export function ExpiryBadge({ days }: { days: number | null }) {
  if (days === null) return null;
  if (days < 0) return <Badge tone="danger">expired</Badge>;
  if (days <= 30) return <Badge tone="warning">{days === 0 ? "expires today" : `${days} days left`}</Badge>;
  return null;
}
