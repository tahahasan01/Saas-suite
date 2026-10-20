import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, IBM_Plex_Sans } from "next/font/google";
import { SessionProvider } from "@/lib/session";
import { ToastProvider } from "@/components/Toast";
import { ConfirmProvider } from "@/components/Confirm";
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

// viewport-fit=cover lets the app use the whole screen on notched phones; the
// shell pads the sticky bar, sheets and toasts with env(safe-area-inset-*).
// Zoom is deliberately not blocked (no maximum-scale): people need it.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${plex.variable} ${bricolage.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body>
        <SessionProvider>
          <ToastProvider>
            <ConfirmProvider>{children}</ConfirmProvider>
          </ToastProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
