"use client";

import { forwardRef, useState } from "react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

/** A caller's own width beats the field's default `w-full`. Both are plain
 *  utilities, so whichever Tailwind emits later wins regardless of class
 *  order — `w-24` silently lost before. Drop the default when one is given. */
function withWidth(base: string, className: string) {
  return /(^|\s)(w-|max-w-|flex-1|basis-)/.test(className) ? base.replace("w-full ", "") : base;
}

// ─── Button ─────────────────────────────────────────────────────────────────
type Variant = "primary" | "ghost" | "subtle" | "danger";
type Size = "sm" | "md";

const variants: Record<Variant, string> = {
  primary: "bg-brand text-brand-fg hover:bg-brand-hover shadow-sm",
  ghost: "text-fg-muted hover:bg-elevated hover:text-fg",
  subtle: "bg-elevated text-fg border border-line hover:border-line-strong",
  danger: "bg-danger/90 text-white hover:bg-danger",
};
// On touch screens every button grows to a 44px target (WCAG 2.5.5); with a
// mouse the compact sizes stay, so dense tables don't balloon on desktop.
const sizes: Record<Size, string> = {
  sm: "px-2.5 py-1 text-xs pointer-coarse:min-h-11 pointer-coarse:px-3.5 pointer-coarse:text-sm",
  md: "px-4 py-2 text-sm pointer-coarse:min-h-11",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none",
        variants[variant], sizes[size], className,
      )}
      {...p}
    />
  );
}

// ─── Inputs ─────────────────────────────────────────────────────────────────
// 16px on phones: iOS Safari zooms the page into any field smaller than that
// and leaves it zoomed. 14px from `sm` up, where there's no zoom.
const field =
  "w-full rounded-lg border border-line bg-canvas px-3 py-2 text-base sm:text-sm text-fg placeholder:text-fg-subtle transition-colors focus:border-brand pointer-coarse:min-h-11";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = "", ...p }, ref) {
    return <input ref={ref} className={cx(withWidth(field, className), className)} {...p} />;
  },
);

/** Password field with a reveal toggle. Typing a password blind is the single
 *  biggest cause of failed sign-ins, and on a phone keyboard it's brutal.
 *
 *  The toggle is a real <button type="button"> — not a div — so it's reachable
 *  by keyboard and announces its state. type="button" matters: inside a form a
 *  bare <button> defaults to submit, and clicking the eye would post the form. */
export function PasswordInput({ className = "", ...p }: InputHTMLAttributes<HTMLInputElement>) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input
        type={shown ? "text" : "password"}
        className={cx(field, "pr-10", className)}
        {...p}
      />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-pressed={shown}
        aria-label={shown ? "Hide password" : "Show password"}
        title={shown ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 grid w-10 place-items-center rounded-r-lg text-fg-subtle transition-colors hover:text-fg"
      >
        {shown ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function EyeOffIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.4 0 10 7 10 7a17.3 17.3 0 0 1-2.2 3.2M6.6 6.6A17.3 17.3 0 0 0 2 11s3.6 7 10 7a9.1 9.1 0 0 0 4.2-1M2 2l20 20" />
      <path d="M14.1 14.1a3 3 0 1 1-4.2-4.2" />
    </svg>
  );
}

export function Textarea({ className = "", ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(withWidth(field, className), "resize-none", className)} {...p} />;
}

export function Select({ className = "", ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx(withWidth(field, className), "cursor-pointer", className)} {...p} />;
}

/** An on/off control that says what it controls and whether it's on. A bare
 *  <button> with a sliding dot read as just "button" to a screen reader. */
export function Switch({ checked, onChange, label, disabled }: {
  checked: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      // The visible track is 40×24; the padding makes the hit area 44px tall.
      className="group grid h-11 w-12 shrink-0 place-items-center disabled:opacity-50"
    >
      <span className={cx("relative h-6 w-10 rounded-full transition-colors", checked ? "bg-brand" : "bg-line-strong")}>
        <span className={cx("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left]", checked ? "left-[18px]" : "left-0.5")} />
      </span>
    </button>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-xs font-medium text-fg-muted">{label}</span>
      {children}
    </label>
  );
}

// ─── Surfaces ───────────────────────────────────────────────────────────────
export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  // Same trap as widths: `p-0` can't beat the built-in `p-5` by order, so a
  // caller's own padding replaces it instead of competing with it.
  const pad = /(^|\s)p[xytrbl]?-/.test(className) ? "" : "p-5";
  return <div className={cx("min-w-0 rounded-xl border border-line bg-surface", pad, className)}>{children}</div>;
}

// ─── Page states ────────────────────────────────────────────────────────────
// Loading, empty and failed are three different answers; showing "No leads
// yet" while the list is still loading told people their data was gone.

export function LoadingRows({ rows = 3, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-2">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-10 animate-pulse rounded-lg bg-elevated" />
      ))}
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="grid place-items-center gap-1.5 rounded-xl border border-dashed border-line px-6 py-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="max-w-sm text-sm text-fg-muted">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm">
      <span className="text-fg">{message}</span>
      {onRetry && <Button size="sm" variant="subtle" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

// ─── Badge ──────────────────────────────────────────────────────────────────
const tones: Record<string, string> = {
  neutral: "bg-elevated text-fg-muted",
  brand: "bg-brand-subtle text-brand",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  danger: "bg-danger/15 text-danger",
};

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: keyof typeof tones }) {
  return <span className={cx("rounded-md px-1.5 py-0.5 text-[10px] font-medium", tones[tone])}>{children}</span>;
}

// ─── Brand wordmark ─────────────────────────────────────────────────────────
export function Wordmark() {
  return (
    <div className="flex items-center gap-2">
      <div className="grid h-7 w-7 place-items-center rounded-lg bg-brand text-sm font-bold text-brand-fg">B</div>
      <span className="text-sm font-semibold tracking-tight">Business OS</span>
    </div>
  );
}
