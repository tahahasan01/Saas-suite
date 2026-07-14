"use client";

import { forwardRef, useState } from "react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

function cx(...c: (string | false | undefined)[]) {
  return c.filter(Boolean).join(" ");
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
const sizes: Record<Size, string> = { sm: "px-2.5 py-1 text-xs", md: "px-4 py-2 text-sm" };

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
const field =
  "w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-fg placeholder:text-fg-subtle transition-colors focus:border-brand";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = "", ...p }, ref) {
    return <input ref={ref} className={cx(field, className)} {...p} />;
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
  return <textarea className={cx(field, "resize-none", className)} {...p} />;
}

export function Select({ className = "", ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx(field, "cursor-pointer", className)} {...p} />;
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-fg-muted">{label}</span>
      {children}
    </label>
  );
}

// ─── Surfaces ───────────────────────────────────────────────────────────────
export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={cx("rounded-xl border border-line bg-surface p-5", className)}>{children}</div>;
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
