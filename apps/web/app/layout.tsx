import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

/**
 * The one face of the system (DESIGN.md "Typography > Font Family"), loaded
 * rather than merely named: `--font-sans` in globals.css points at the
 * variable this defines. `display: "swap"` keeps first paint readable, and
 * next/font self-hosts the file, so no third-party request stands between the
 * page and its type.
 */
const inter = Inter({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-inter"
});

export const metadata: Metadata = {
  title: "marctco",
  description: "CRM para assessorias de revisional de juros"
};

/**
 * `viewport-fit=cover` pairs with the `pb-safe`-style insets the shells use:
 * a CRM read on a phone in the field should not put its primary action under
 * the home indicator. `maximum-scale` is deliberately absent — capping zoom
 * is an accessibility failure, and the 16px input type below already stops
 * iOS from zooming on focus.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body className="min-h-[100dvh] bg-canvas font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
