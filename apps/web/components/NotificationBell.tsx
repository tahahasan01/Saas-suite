"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { relativeDate } from "@/lib/format";

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

export function NotificationBell() {
  const [feed, setFeed] = useState<Feed>({ items: [], unread: 0 });
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    api<Feed>("/notifications").then(setFeed).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30000); // light polling
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function markAll() {
    await api("/notifications/read-all", { method: "POST" }).catch(() => {});
    load();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative grid h-9 w-9 place-items-center rounded-lg text-fg-muted transition-colors hover:bg-elevated hover:text-fg"
        aria-label="Notifications"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {feed.unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-semibold text-brand-fg">
            {feed.unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 overflow-hidden rounded-xl border border-line bg-surface shadow-xl">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <span className="text-sm font-semibold">Notifications</span>
            {feed.unread > 0 && (
              <button onClick={markAll} className="text-xs text-brand hover:underline">Mark all read</button>
            )}
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {feed.items.length === 0 && <li className="px-4 py-6 text-center text-sm text-fg-subtle">You&apos;re all caught up.</li>}
            {feed.items.map((n) => (
              <li key={n.id} className={`flex gap-3 border-b border-line/60 px-4 py-3 ${n.read ? "" : "bg-brand-subtle/40"}`}>
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot[n.kind] ?? "bg-brand"}`} />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{n.title}</p>
                  {n.body && <p className="truncate text-xs text-fg-muted">{n.body}</p>}
                  <p className="mt-0.5 text-[11px] text-fg-subtle">{relativeDate(n.created_at)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
