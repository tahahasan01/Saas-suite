"use client";

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

export function Input({ className = "", ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(field, className)} {...p} />;
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
