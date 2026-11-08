import "server-only";
import { cache } from "react";
import { Prisma } from "@/generated/prisma/client";
import { database } from "@/lib/db";
import { type AuthenticatedSession } from "@/lib/auth/session";
import { canManage } from "@/lib/accounts/policy";
import { scoreRole } from "@/lib/sidang/policy";

export async function dashboardIndicators(session: AuthenticatedSession) {
  const db = database(), id = session.user.id;
  const manager = canManage(session.user, session.activeRole);
  const student = session.user.role === "mahasiswa";
  const lecturer = Boolean(session.user.dosen && ["dosen", "kaprodi", "sekpro"].includes(session.user.role));
  const title: Prisma.PengajuanJudulWhereInput = manager ? {} : student ? { idMahasiswa: id } : lecturer ? {
    bimbingan: { OR: [{ idDosenPembimbing: id }, { idDosenPembimbing2: id }] },
  } : { id: -1n };
  const sempro: Prisma.PendaftaranSemproWhereInput = manager ? {} : student ? { pengajuan: { idMahasiswa: id } }
    : lecturer ? { OR: [{ idDosenPembimbingSempro: id }, { penguji: { some: { idDosenPenguji: id } } }] } : { id: -1n };
  const sidang: Prisma.PendaftaranSidangWhereInput = manager ? {} : student ? { pengajuan: { idMahasiswa: id } }
    : lecturer ? { OR: [{ pengajuan: { bimbingan: { OR: [{ idDosenPembimbing: id }, { idDosenPembimbing2: id }] } } },
      { penguji: { some: { idDosenPenguji: id, isPengganti: false } } }] } : { id: -1n };
  const [pendingTitles, guidance, sempros, sidangs, schedules, unread, accounts, lateRevisions, revisions, administration] = await Promise.all([
    db.pengajuanJudul.count({ where: { AND: [title, { status: { in: ["diajukan", "direvisi"] }, statusDraft: "diajukan", deletedAt: null, isDiarsipkan: false }] } }),
    db.bimbingan.count({ where: { pengajuan: { AND: [title, { status: "disetujui", deletedAt: null, isDiarsipkan: false }] } } }),
    db.pendaftaranSempro.count({ where: { AND: [sempro, { statusBerkas: { in: ["menunggu_verifikasi", "dikembalikan"] } }] } }),
    db.pendaftaranSidang.count({ where: { AND: [sidang, { statusBerkas: { in: ["menunggu_verifikasi", "dikembalikan"] } }] } }),
    db.jadwalSidang.findMany({ where: { sidang, status: { in: ["final", "menunggu_konfirmasi"] } },
      select: { versi: true, status: true, dewanSnapshot: true,
        konfirmasiList: { where: { dosenId: id }, select: { versi: true, status: true } },
        penilaianList: { where: { penilaiId: id }, select: { status: true } },
        beritaAcaraList: { select: { hasil: true, statusPersetujuan: true } } } }),
    db.notification.count({ where: { notifiableType: "App\\Models\\Pengguna", notifiableId: id, readAt: null } }),
    manager ? db.pengguna.count({ where: { deletedAt: null, statusAkun: "menunggu_persetujuan" } }) : Promise.resolve(0),
    db.beritaAcara.count({ where: { hasil: "lulus_revisi", statusRevisi: { not: "revisi_selesai" }, tenggatRevisi: { lt: new Date() }, jadwalSidang: { sidang } } }),
    db.revisiDokumen.findMany({ where: { tipe: "sidang", status: "menunggu_persetujuan", beritaAcara: { jadwalSidang: { sidang } } }, select: { persetujuan: true } }),
    ["admin_keuangan", "superadmin"].includes(session.user.role) ? db.verifikasiPembayaran.count({ where: { statusVerifikasi: "menunggu_verifikasi" } }) : Promise.resolve(0),
  ]);
  const confirmations = schedules.filter((j) => !j.beritaAcaraList.some((b) => b.hasil)
    && j.konfirmasiList.some((c) => c.versi === j.versi && c.status === "menunggu")).length;
  const pendingScores = lecturer ? schedules.filter((j) => j.status === "final" && !j.beritaAcaraList.some((b) => b.hasil)
    && j.dewanSnapshot && scoreRole(j.dewanSnapshot as Record<string, string>, id)
    && !j.penilaianList.some((p) => ["disimpan", "terkunci"].includes(p.status))).length : 0;
  const pendingDecisions = schedules.filter((j) => j.beritaAcaraList.some((b) => !b.hasil && b.statusPersetujuan === (manager
    ? "menunggu_persetujuan_kaprodi" : "menunggu_keputusan_penguji_1"))
    && (manager || lecturer && (j.dewanSnapshot as Record<string, string> | null)?.penguji_1 === String(id))).length;
  const pendingRevisions = revisions.filter((r) => manager || lecturer && r.persetujuan && Object.values(r.persetujuan).some((a) =>
    a && typeof a === "object" && !Array.isArray(a) && String(a.dosen_id) === String(id) && a.status === "menunggu")).length;
  return [
    { label: "Judul menunggu tindak lanjut", count: pendingTitles, href: "/judul" },
    { label: "Bimbingan aktif", count: guidance, href: "/bimbingan" },
    { label: "Berkas sempro menunggu tindakan", count: sempros, href: student ? "/sempro/status" : manager ? "/sempro/verifikasi" : "/sempro/konfirmasi-jadwal" },
    { label: "Berkas sidang menunggu tindakan", count: sidangs, href: "/sidang" },
    { label: "Konfirmasi sidang menunggu", count: confirmations, href: "/sidang" },
    ...(lecturer ? [{ label: "Nilai sidang belum dikirim", count: pendingScores, href: "/sidang" }] : []),
    ...(manager || lecturer ? [{ label: "Keputusan sidang menunggu", count: pendingDecisions, href: "/sidang" },
      { label: "Naskah revisi menunggu persetujuan", count: pendingRevisions, href: "/sidang" }] : []),
    { label: "Revisi sidang melewati tenggat", count: lateRevisions, href: "/sidang" },
    { label: "Notifikasi belum dibaca", count: unread, href: "/notifikasi" },
    ...(manager ? [{ label: "Akun menunggu persetujuan", count: accounts, href: "/akun" }] : []),
    ...(["admin_keuangan", "superadmin"].includes(session.user.role) ? [{ label: "Administrasi awal menunggu verifikasi", count: administration, href: "/administrasi" }] : []),
  ];
}

/**
 * Memoized dashboard indicators query per server request.
 */
export const getCachedDashboardIndicators = cache(async (session: AuthenticatedSession) => {
  return dashboardIndicators(session);
});
