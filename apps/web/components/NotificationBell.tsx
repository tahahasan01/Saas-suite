"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import * as R from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { api } from "@/lib/api";
import { relativeDate } from "@/lib/format";
import { useAction } from "@/lib/useAction";
import { useMediaQuery } from "@/components/shell/useMediaQuery";

interface Notif {
  id: string;
  title: string;
  body: string;
  kind: string;
  link: string | null;
  read: boolean;
  created_at: string;
}
interface Feed {
  items: Notif[];
  unread: number;
}

const dot: Record<string, string> = {
  success: "bg-success",
  warning: "bg-warning",
  alert: "bg-danger",
  info: "bg-brand",
};

const POLL_MS = 30000;

/** The bell and its feed. A popover anchored under the top bar on desktop; on
 *  a phone a bottom sheet, because a 320px-wide popover pinned to the bell
 *  hung 60px off the left edge. Either way it's a labelled dialog that closes
 *  on Escape and hands focus back to the bell (Radix, with the bell as its
 *  trigger so aria-expanded is always right). */
export function NotificationBell() {
  const [feed, setFeed] = useState<Feed>({ items: [], unread: 0 });
  const [open, setOpen] = useState(false);
  const phone = useMediaQuery("(max-width: 639px)");

  const load = useCallback(() => {
    // A failed poll keeps the last feed; the next tick tries again.
    api<Feed>("/notifications").then(setFeed).catch(() => {});
  }, []);

  // Light polling, paused while the tab is hidden: a till left open all day in
  // a background tab shouldn't hit the API every 30s for nobody.
  useEffect(() => {
    let id: ReturnType<typeof setInterval> | undefined;
    const start = () => { if (id === undefined) id = setInterval(load, POLL_MS); };
    const stop = () => { if (id !== undefined) { clearInterval(id); id = undefined; } };
    const onVisibility = () => {
      if (document.hidden) stop();
      else { load(); start(); }
    };
    load();
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => { stop(); document.removeEventListener("visibilitychange", onVisibility); };
  }, [load]);

  const markAll = useAction(() => api("/notifications/read-all", { method: "POST" }),
                            { failure: "Couldn't mark notifications read" });

  const content = (
    <>
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <R.Title className="text-sm font-semibold">Notifications</R.Title>
        <div className="flex items-center gap-1">
          {feed.unread > 0 && (
            <button
              type="button"
              disabled={markAll.busy}
              onClick={() => markAll.run().then(load)}
              className="rounded px-1.5 py-1 text-xs text-brand hover:underline disabled:opacity-50 pointer-coarse:min-h-11"
            >
              Mark all read
            </button>
          )}
          {phone && (
            <R.Close aria-label="Close" className="-mr-2 grid h-11 w-11 place-items-center rounded-lg text-fg-muted hover:bg-elevated hover:text-fg">
              <X size={18} aria-hidden />
            </R.Close>
          )}
        </div>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {feed.items.length === 0 && <li className="px-4 py-6 text-center text-sm text-fg-subtle">You&apos;re all caught up.</li>}
        {feed.items.map((n) => {
          const body = (
            <>
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot[n.kind] ?? "bg-brand"}`} aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {n.title}
                  {!n.read && <span className="sr-only"> (unread)</span>}
                </p>
                {n.body && <p className="truncate text-xs text-fg-muted">{n.body}</p>}
                <p className="mt-0.5 text-[11px] text-fg-subtle">{relativeDate(n.created_at)}</p>
              </div>
            </>
          );
          const row = `flex gap-3 px-4 py-3 ${n.read ? "" : "bg-brand-subtle/40"}`;
          return (
            <li key={n.id} className="border-b border-line/60">
              {n.link ? (
                <Link href={n.link} onClick={() => setOpen(false)} className={`${row} transition-colors hover:bg-elevated`}>
                  {body}
                </Link>
              ) : (
                <div className={row}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );

  return (
    // Modal on a phone (it covers the page anyway); non-modal on desktop, so
    // a click elsewhere just closes it and the page stays usable.
    <R.Root open={open} onOpenChange={setOpen} modal={phone}>
      <R.Trigger
        className="relative grid h-9 w-9 place-items-center rounded-lg text-fg-muted transition-colors hover:bg-elevated hover:text-fg pointer-coarse:h-11 pointer-coarse:w-11"
        aria-label={feed.unread > 0 ? `Notifications, ${feed.unread} unread` : "Notifications"}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {feed.unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-semibold text-brand-fg" aria-hidden>
            {feed.unread}
          </span>
        )}
      </R.Trigger>

      <R.Portal>
        {phone && <R.Overlay className="fixed inset-0 z-[60] bg-black/50 data-[state=open]:animate-fade-in" />}
        <R.Content
          aria-describedby={undefined}
          className={
            phone
              ? "fixed inset-x-0 bottom-0 z-[60] flex max-h-[85dvh] flex-col overflow-hidden rounded-t-2xl bg-surface pb-[env(safe-area-inset-bottom)] shadow-2xl outline-none"
              // Pinned under the top bar at the right edge, never wider than
              // the screen, and short enough to scroll inside itself.
              : "fixed right-4 top-[calc(3.5rem+env(safe-area-inset-top)+0.5rem)] z-40 flex max-h-[min(28rem,calc(100dvh-5rem))] w-80 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-xl outline-none md:right-8"
          }
        >
          {content}
        </R.Content>
      </R.Portal>
    </R.Root>
  );
}
