import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { maskNim } from "@/lib/sempro/policy";
import { getSession } from "@/lib/auth/session";
import {
  getJenisDokumenLabel,
  getStatusInfo,
  formatWaktuTerbit,
} from "@/lib/documents/labels";

export const dynamic = "force-dynamic";

export default async function PublicVerificationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) notFound();
  const doc = await prisma.dokumenVerifikasi.findUnique({
    where: { token },
    include: {
      pengajuan: {
        include: {
          mahasiswa: {
            include: { mahasiswa: true },
          },
        },
      },
      replacement: true,
    },
  });

  if (!doc) {
    notFound();
  }

  const session = await getSession();
  const isSah = doc.status === "sah";
  const data = (doc.snapshotJson ?? {}) as Record<string, unknown>;

  const jenisLabel = getJenisDokumenLabel(doc.jenisDokumen);
  const statusInfo = getStatusInfo(doc.status, doc.jenisDokumen);

  const studentName = String(
    data.mahasiswaNama ??
      (typeof data.mahasiswa === "object" && data.mahasiswa
        ? (data.mahasiswa as Record<string, unknown>).nama
        : undefined) ??
      doc.pengajuan?.mahasiswa.nama ??
      "-",
  );

  const rawNim = String(
    data.mahasiswaNim ??
      (typeof data.mahasiswa === "object" && data.mahasiswa
        ? (data.mahasiswa as Record<string, unknown>).nim
        : undefined) ??
      doc.pengajuan?.mahasiswa.mahasiswa?.nim ??
      doc.pengajuan?.mahasiswa.email?.split("@")[0] ??
      "-",
  );
  const studentNim = maskNim(rawNim);

  const judul = String(
    data.judul ??
      doc.pengajuan?.judul ??
      "-",
  );

  const waktuTerbit = formatWaktuTerbit(doc.diterbitkanAt);

  const isSidangDoc = doc.jenisDokumen.includes("sidang");
  const downloadEndpoint = `/api/${isSidangDoc ? "sidang" : "sempro"}/dokumen/${doc.token}`;

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
            className={`flex h-16 w-16 items-center justify-center rounded-full text-2xl font-bold ${statusInfo.iconBg}`}
          >
            {statusInfo.icon}
          </div>
          <div className="mt-3 flex items-center justify-center gap-2">
            <h1 className="text-lg font-bold text-slate-800">{statusInfo.label}</h1>
            {doc.versi > 1 && (
              <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 border border-slate-200">
                Versi {doc.versi}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500 max-w-md">
            {doc.status === "dicabut" && doc.alasanPencabutan
              ? doc.alasanPencabutan
              : statusInfo.deskripsi}
          </p>
        </div>

        {doc.status === "digantikan" && doc.replacement && (
          <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3.5 text-xs text-blue-900">
            <p className="font-semibold">Perhatian: Dokumen Telah Diperbarui</p>
            <p className="mt-1 leading-relaxed">
              Dokumen ini telah digantikan oleh versi baru. Silakan periksa dokumen versi terbaru di{" "}
              <Link
                href={`/verifikasi/${doc.replacement.token}`}
                className="font-bold underline hover:text-blue-700"
              >
                tautan verifikasi ini
              </Link>.
            </p>
          </div>
        )}

        {doc.status === "dicabut" && doc.alasanPencabutan && (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-900">
            <p className="font-semibold">Alasan Pencabutan Resmi:</p>
            <p className="mt-1 leading-relaxed">{doc.alasanPencabutan}</p>
          </div>
        )}

        <div className="mt-6 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-slate-50/50 p-4 text-xs text-slate-700">
          <div className="py-2.5">
            <span className="text-slate-500 block">Jenis Dokumen:</span>
            <p className="font-semibold text-slate-900 text-sm mt-0.5">{jenisLabel}</p>
          </div>
          {doc.nomorSurat && (
            <div className="py-2.5">
              <span className="text-slate-500 block">Nomor Surat:</span>
              <p className="font-mono font-semibold text-slate-900 mt-0.5">{doc.nomorSurat}</p>
            </div>
          )}
          <div className="py-2.5">
            <span className="text-slate-500 block">Penandatangan Elektronik:</span>
            <p className="font-semibold text-slate-900 mt-0.5">{doc.namaPenandatangan ?? "-"}</p>
            <p className="text-slate-500">{doc.jabatanSnapshot ?? doc.peran ?? "-"}</p>
          </div>
          <div className="py-2.5">
            <span className="text-slate-500 block">Identitas Mahasiswa:</span>
            <p className="font-semibold text-slate-900 mt-0.5">{studentName}</p>
            <p className="text-slate-500 font-mono">NIM: {studentNim}</p>
          </div>
          <div className="py-2.5">
            <span className="text-slate-500 block">
              {isSidangDoc ? "Judul Skripsi:" : "Judul Proposal / Skripsi:"}
            </span>
            <p className="font-semibold text-slate-900 mt-0.5 leading-relaxed">{judul}</p>
          </div>
          <div className="py-2.5">
            <span className="text-slate-500 block">Waktu Penerbitan Resmi:</span>
            <p className="font-semibold text-slate-900 mt-0.5">{waktuTerbit}</p>
          </div>
          <div className="py-2.5">
            <span className="text-slate-500 block">Integritas Dokumen (SHA-256):</span>
            <p className="font-mono text-[10px] break-all text-slate-600 mt-0.5">
              {doc.hashSha256 ?? "Tercatat dan terverifikasi di SIAS"}
            </p>
          </div>
        </div>

        {isSah ? (
          session ? (
            <div className="mt-6 text-center">
              <a
                href={downloadEndpoint}
                className="inline-flex items-center gap-1.5 rounded-lg bg-sky-700 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-sky-800 transition"
              >
                📄 Unduh Salinan PDF Resmi
              </a>
              <p className="mt-2 text-[11px] text-slate-500">
                Terautentikasi sebagai {session.user.nama} ({session.activeRole}).
              </p>
            </div>
          ) : (
            <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4 text-center">
              <p className="text-xs text-slate-600">
                Dokumen ini sah dan terbukti keasliannya secara publik di basis data resmi SIAS UTS.
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                Untuk mengunduh salinan berkas PDF resmi utuh, silakan masuk menggunakan akun civitas akademika berwenang.
              </p>
              <div className="mt-3">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-100 transition"
                >
                  🔒 Masuk ke Portal SIAS
                </Link>
              </div>
            </div>
          )
        ) : (
          <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-3 text-center text-xs text-slate-500">
            Salinan berkas PDF resmi tidak tersedia untuk dokumen berstatus {doc.status}.
          </div>
        )}
      </div>
    </div>
  );
}
