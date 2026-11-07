import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PublicVerificationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const doc = await prisma.dokumenVerifikasi.findUnique({
    where: { token },
    include: {
      pengajuan: { include: { mahasiswa: true } },
      replacement: true,
    },
  });

  if (!doc) {
    notFound();
  }

  const isSah = doc.status === "sah";
  const data = (doc.snapshotJson ?? {}) as Record<string, string | number>;

  const jenisLabel =
    doc.jenisDokumen === "undangan"
      ? "Surat Undangan Seminar Proposal"
      : doc.jenisDokumen === "berita_acara"
      ? "Berita Acara Seminar Proposal"
      : doc.jenisDokumen === "acc"
      ? "Surat Persetujuan (ACC) Seminar Proposal"
      : "Dokumen Verifikasi Akademik";

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-10">
      <div className="mx-auto max-w-xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="text-center">
          <p className="text-xl font-bold tracking-wide">
            SIAS<span className="text-[#bf7600]">.</span>
          </p>
          <p className="text-xs text-slate-500">Verifikasi Dokumen Elektronik Resmi UTS</p>
        </div>

        <div className="mt-6 flex flex-col items-center text-center">
          <div
            className={`flex h-16 w-16 items-center justify-center rounded-full text-2xl ${
              isSah ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
            }`}
          >
            {isSah ? "✓" : "!"}
          </div>
          <h1 className="mt-3 text-lg font-bold text-slate-800">
            {isSah ? "DOKUMEN VALID & TERVERIFIKASI" : `DOKUMEN ${doc.status.toUpperCase()}`}
          </h1>
          <p className="text-xs text-slate-500">
            {isSah
              ? "Dokumen ini asli dan terdaftar resmi di basis data akademik SIAS UTS."
              : doc.alasanPencabutan ?? "Dokumen ini telah dicabut atau digantikan oleh versi baru."}
          </p>
        </div>

        <div className="mt-6 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-slate-50/50 p-4 text-xs text-slate-700">
          <div className="py-2">
            <span className="text-slate-500">Jenis Dokumen:</span>
            <p className="font-semibold text-slate-900">{jenisLabel}</p>
          </div>
          {doc.nomorSurat && (
            <div className="py-2">
              <span className="text-slate-500">Nomor Surat:</span>
              <p className="font-semibold text-slate-900">{doc.nomorSurat}</p>
            </div>
          )}
          <div className="py-2">
            <span className="text-slate-500">Penandatangan:</span>
            <p className="font-semibold text-slate-900">{doc.namaPenandatangan}</p>
            <p className="text-slate-500">{doc.jabatanSnapshot ?? doc.peran}</p>
          </div>
          <div className="py-2">
            <span className="text-slate-500">Mahasiswa Pemilik:</span>
            <p className="font-semibold text-slate-900">{String(data.mahasiswaNama ?? doc.pengajuan?.mahasiswa.nama ?? "-")}</p>
            <p className="text-slate-500">NIM: {String(data.mahasiswaNim ?? "-")}</p>
          </div>
          <div className="py-2">
            <span className="text-slate-500">Judul Proposal:</span>
            <p className="font-semibold text-slate-900">{String(data.judul ?? doc.pengajuan?.judul ?? "-")}</p>
          </div>
          <div className="py-2">
            <span className="text-slate-500">Tanggal Terbit:</span>
            <p className="font-semibold text-slate-900">
              {doc.diterbitkanAt
                ? new Date(doc.diterbitkanAt).toLocaleDateString("id-ID", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })
                : "-"}
            </p>
          </div>
          <div className="py-2">
            <span className="text-slate-500">Integritas Hash (SHA-256):</span>
            <p className="font-mono text-[10px] break-all text-slate-600">{doc.hashSha256}</p>
          </div>
        </div>

        <div className="mt-6 text-center">
          <a
            href={`/api/sempro/dokumen/${doc.token}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-sky-700 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-sky-800"
          >
            📄 Unduh Salinan PDF Resmi
          </a>
        </div>
      </div>
    </div>
  );
}
