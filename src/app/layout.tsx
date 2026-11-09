import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "SIAS · Sistem Informasi Akademik Skripsi", template: "%s · SIAS" },
  description: "Sistem Informasi Akademik Skripsi, Universitas Teknologi Sumbawa.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="id" className={`${GeistSans.variable} ${GeistMono.variable}`}>
    <body>
      <a href="#konten" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:shadow-lg focus:ring-2 focus:ring-amber-500">Lewati ke konten</a>
      {children}
    </body>
  </html>;
}
