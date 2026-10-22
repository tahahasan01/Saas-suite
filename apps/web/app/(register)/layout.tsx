import type { Metadata } from "next";
import { RegisterShell } from "@/components/pos/RegisterShell";

/* The full-screen till (3D, F16, D-22): its own route group, without the
 * back-office shell, and its own manifest whose scope is /register, so an
 * installed till opens here and stays here. */
export const metadata: Metadata = {
  title: "Till · Business OS",
  manifest: "/register.webmanifest",
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return <RegisterShell>{children}</RegisterShell>;
}
