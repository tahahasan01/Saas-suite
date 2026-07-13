"use client";

import type { ButtonHTMLAttributes, InputHTMLAttributes } from "react";

export function Button({ className = "", ...p }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 ${className}`}
      {...p}
    />
  );
}

export function Input({ className = "", ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm outline-none focus:border-indigo-500 ${className}`}
      {...p}
    />
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-gray-400">{label}</span>
      {children}
    </label>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-gray-800 bg-[#121826] p-6 ${className}`}>{children}</div>;
}
