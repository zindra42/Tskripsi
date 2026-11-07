import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  agentRules: false,
  turbopack: { root: __dirname },
  outputFileTracingRoot: __dirname,
  outputFileTracingIncludes: { "/sidang/templates/[kind]": ["./assets/sidang/*.pdf"] },
  serverExternalPackages: ["@node-rs/argon2"],
  experimental: { serverActions: { bodySizeLimit: "22mb" } },
  async redirects() {
    return [
      { source: "/sidang/:section(pendaftaran|status|jadwal|revisi|pembayaran|konfirmasi-jadwal|penilaian|hasil|penjadwalan|verifikasi-berkas)", destination: "/sidang", permanent: false },
      { source: "/dosen/sidang/:path*", destination: "/sidang", permanent: false },
      { source: "/kaprodi/sidang/:path*", destination: "/sidang", permanent: false },
      { source: "/sekpro/sidang/:path*", destination: "/sidang", permanent: false },
      { source: "/sidang/checklist/file/:id", destination: "/api/sidang/file/checklist/:id", permanent: false },
      { source: "/sidang/revisi-draft/:id", destination: "/api/sidang/file/revisi/:id", permanent: false },
      { source: "/pengumuman/publik", destination: "/pengumuman-publik", permanent: false },
    ];
  },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Cache-Control", value: "private, no-store" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "same-origin" },
      ],
    }];
  },
};

export default config;
