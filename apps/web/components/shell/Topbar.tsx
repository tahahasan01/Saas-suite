"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Menu, Search } from "lucide-react";
import { useSession } from "@/lib/session";
import { NotificationBell } from "@/components/NotificationBell";
import { ThemeToggle } from "@/components/ThemeToggle";

export function Topbar({ menuOpen, onOpenMenu, onOpenPalette }:
  { menuOpen: boolean; onOpenMenu: () => void; onOpenPalette: () => void }) {
  return (
    // The safe-area top inset is added to the bar's height (viewport-fit=cover
    // lets the page run under the notch), so the controls keep their 56px.
    <header className="sticky top-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center gap-3 border-b border-line bg-surface/90 px-4 pt-[env(safe-area-inset-top)] backdrop-blur md:px-8">
      {/* shrink-0: in a full row the flex layout squeezed this to 20px wide —
          and on a phone it's the only way to navigate. */}
      <button
        onClick={onOpenMenu}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-fg-muted hover:bg-elevated md:hidden pointer-coarse:h-11 pointer-coarse:w-11"
        aria-label="Open menu"
        aria-expanded={menuOpen}
        aria-controls="mobile-nav"
      >
        <Menu size={20} aria-hidden />
      </button>

      <button
        onClick={onOpenPalette}
        aria-label="Go to a screen"
        aria-keyshortcuts="Control+K"
        className="flex h-9 w-full min-w-0 max-w-md items-center gap-2.5 rounded-xl border border-line bg-canvas px-3 text-sm text-fg-subtle transition-colors hover:border-line-strong pointer-coarse:h-11"
      >
        <Search size={16} aria-hidden />
        <span className="flex-1 truncate text-left" aria-hidden>Go to…</span>
        <kbd className="hidden rounded-md border border-line bg-surface px-1.5 py-0.5 text-[11px] font-medium text-fg-muted sm:inline">
          Ctrl K
        </kbd>
      </button>

      <div className="ml-auto flex shrink-0 items-center gap-1">
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
        className="ml-1 grid h-9 w-9 place-items-center rounded-full bg-brand text-sm font-semibold text-brand-fg pointer-coarse:h-11 pointer-coarse:w-11"
        aria-label="Account menu"
      >
        {initials}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-2 w-64 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-line bg-surface shadow-xl">
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
            onClick={() => logout().then((ok) => { if (ok) router.replace("/login"); })}
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-fg-muted hover:bg-elevated hover:text-fg"
          >
            <LogOut size={16} aria-hidden /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
