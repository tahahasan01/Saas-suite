"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Menu, Search } from "lucide-react";
import { useSession } from "@/lib/session";
import { NotificationBell } from "@/components/NotificationBell";
import { ThemeToggle } from "@/components/ThemeToggle";

export function Topbar({ onOpenMenu, onOpenPalette }: { onOpenMenu: () => void; onOpenPalette: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur md:px-8">
      <button
        onClick={onOpenMenu}
        className="grid h-9 w-9 place-items-center rounded-lg text-fg-muted hover:bg-elevated md:hidden"
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>

      <button
        onClick={onOpenPalette}
        className="flex h-9 w-full max-w-md items-center gap-2.5 rounded-xl border border-line bg-canvas px-3 text-sm text-fg-subtle transition-colors hover:border-line-strong"
      >
        <Search size={16} aria-hidden />
        <span className="flex-1 text-left">Go to…</span>
        <kbd className="hidden rounded-md border border-line bg-surface px-1.5 py-0.5 text-[11px] font-medium text-fg-muted sm:inline">
          Ctrl K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
        <NotificationBell />
        <UserMenu />
      </div>
    </header>
  );
}

function UserMenu() {
  const { me, logout } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  if (!me) return null;
  const initials = me.user.name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="ml-1 grid h-9 w-9 place-items-center rounded-full bg-brand text-sm font-semibold text-brand-fg"
        aria-label="Account menu"
      >
        {initials}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-2 w-64 overflow-hidden rounded-2xl border border-line bg-surface shadow-xl">
          <div className="border-b border-line px-4 py-3">
            <p className="truncate font-medium">{me.user.name}</p>
            <p className="truncate text-sm text-fg-subtle">{me.user.email}</p>
            <p className="mt-2 truncate text-sm">
              {me.tenant.name}
              <span className="text-fg-subtle"> · {me.user.role}</span>
            </p>
          </div>
          <button
            role="menuitem"
            onClick={() => logout().then(() => router.replace("/login"))}
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-fg-muted hover:bg-elevated hover:text-fg"
          >
            <LogOut size={16} aria-hidden /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
