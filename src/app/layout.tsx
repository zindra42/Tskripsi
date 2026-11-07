import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "SIAS · Sistem Informasi Akademik Skripsi", template: "%s · SIAS" },
  description: "Sistem Informasi Akademik Skripsi, Universitas Teknologi Sumbawa.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="id"><body>
    <a href="#konten" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:p-3">Lewati ke konten</a>
    {children}
  </body></html>;
}
