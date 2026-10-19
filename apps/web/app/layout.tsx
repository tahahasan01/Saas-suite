import type { Metadata } from "next";
import { Bricolage_Grotesque, IBM_Plex_Sans } from "next/font/google";
import { SessionProvider } from "@/lib/session";
import { THEME_INIT } from "@/components/ThemeToggle";
import "./globals.css";

// IBM Plex Sans for the interface: tabular figures for money, and a sibling
// Arabic-script family for the planned Urdu UI. Bricolage Grotesque gives
// titles and big numbers their personality (D-90).
const plex = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"],
                             variable: "--font-plex", display: "swap" });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", display: "swap" });

export const metadata: Metadata = {
  title: "Business OS",
  description: "All-in-one AI-powered business platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${plex.variable} ${bricolage.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
