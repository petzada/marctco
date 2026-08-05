import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "marctco",
  description: "CRM para assessorias de revisional de juros"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className="min-h-[100dvh] bg-canvas font-sans text-ink">{children}</body>
    </html>
  );
}
