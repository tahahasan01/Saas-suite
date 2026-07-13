import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { SessionProvider } from "@/lib/session";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "Business OS",
  description: "All-in-one AI-powered business platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
