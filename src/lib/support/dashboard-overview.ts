import "server-only";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { database } from "@/lib/db";
import type { AuthenticatedSession } from "@/lib/auth/session";
import { canManage } from "@/lib/accounts/policy";
import type { Prisma } from "@/generated/prisma/client";
import { activeGuidanceWhere } from "@/lib/academic/store";
import { revisionComplete, witaToday } from "@/lib/sidang/policy";
import { announcementVisible } from "@/lib/support/policy";
import { getCachedSystemSettings, getCachedActiveLecturersWithSupervisions } from "@/lib/support/master-data";

export async function commonOverview(session: AuthenticatedSession) {
  const db = database(), now = new Date();
  const [values, rows] = await Promise.all([
    getCachedSystemSettings(),
    db.pengumuman.findMany({ where: { deletedAt: null, status: "terbit", AND: [
      { OR: [{ tampilMulai: null }, { tampilMulai: { lte: now } }] },
      { OR: [{ tampilSelesai: null }, { tampilSelesai: { gte: now } }] },
      { OR: [{ isPublik: true }, { targetPeran: { array_contains: [session.user.role] } },
        ...(session.user.role === "sekpro" ? [{ targetPeran: { array_contains: ["sekprodi"] } }] : [])] },
    ] }, orderBy: [{ disematkan: "desc" }, { terbitAt: "desc" }, { id: "desc" }], take: 3 }),
  ]);
  return { period: `${values.periode_akademik_mulai ?? "Belum diatur"} s/d ${values.periode_akademik_selesai ?? "Belum diatur"}`,
    announcements: rows.filter((r) => announcementVisible(r, session.user.role)) };
}

export async function studentOverview(session: AuthenticatedSession) {
  if (session.user.role !== "mahasiswa") return null;
  const db = database();
  const title = await db.pengajuanJudul.findFirst({ where: { idMahasiswa: session.user.id, deletedAt: null, isDiarsipkan: false },
    orderBy: [{ statusDraft: "asc" }, { id: "desc" }], include: { bimbingan: { include: { documents: true } },
      sempro: { include: { jadwal: { include: { beritaAcara: true } } } } } });
  const defense = title ? await db.pendaftaranSidang.findFirst({ where: { idPengajuan: title.id, siklusKe: title.siklusKe },
    orderBy: { id: "desc" }, include: { jadwalList: { orderBy: { id: "desc" }, take: 1, include: { beritaAcaraList: true } } } }) : null;
  const guidance = title?.bimbingan, sempro = title?.sempro?.jadwal?.beritaAcara;
  const result = defense?.jadwalList[0]?.beritaAcaraList[0];
  const supervisors = [guidance?.idDosenPembimbing, guidance?.idDosenPembimbing2].filter((id): id is bigint => Boolean(id));
  const acc = supervisors.length > 0 && supervisors.every((id) => guidance?.documents.some((d) =>
    d.jenisDokumen === "acc_sidang" && d.status === "sah" && d.penandatanganUserId === id));
  const passed = Boolean(result && revisionComplete(result));
  const done = [title?.status === "disetujui", Boolean(guidance?.idDosenPembimbing), Boolean(sempro && revisionComplete(sempro)),
    acc, Boolean(defense && defense.statusDraft === "diajukan"), Boolean(result?.hasil), passed];
  const labels = ["Pengajuan Judul", "Penetapan Pembimbing", "Seminar Proposal", "Bimbingan Skripsi", "Pendaftaran Sidang", "Sidang Skripsi", "Revisi Akhir"];
  const urls = [title ? `/judul/${title.id}` : "/judul", "/bimbingan", "/sempro/status", guidance ? `/bimbingan/${guidance.id}` : "/bimbingan",
    defense ? `/sidang/${defense.id}` : "/sidang", defense ? `/sidang/${defense.id}` : "/sidang", defense ? `/sidang/${defense.id}` : "/sidang"];
  const active = done.findIndex((value) => !value);
  let next = !title ? "Ajukan Usulan Judul Skripsi" : active === 0 ? "Tinjau status dan perbaikan judul" : active === 1 ? "Menunggu Penetapan Dosen Pembimbing"
    : active === 2 ? "Lakukan bimbingan proposal, seminar dan revisi sempro" : active === 3 ? "Lakukan Bimbingan Skripsi dan lengkapi ACC Sidang"
    : active === 4 ? "Lengkapi dan ajukan pendaftaran sidang" : active === 5 ? "Tinjau jadwal dan hasil sidang" : "Ajukan dan pantau revisi akhir";
  if (result?.hasil === "tidak_lulus") next = "Sidang ulang memerlukan administrasi awal pada periode dan siklus berikutnya";
  if (passed) next = "Seluruh tahapan skripsi selesai; buka hasil dan dokumen resmi";
  return { steps: labels.map((label, i) => ({ label, href: urls[i], status: done[i] ? "selesai" : i === active ? "aktif" : "terkunci" })),
    next, href: urls[active < 0 ? 6 : active] };
}

export async function lecturerOverview(session: AuthenticatedSession) {
  if (!session.user.dosen || !["dosen", "kaprodi", "sekpro"].includes(session.user.role)) return null;
  const db = database(), id = session.user.id, today = new Date(witaToday());
  const assigned = { ...activeGuidanceWhere, OR: [{ idDosenPembimbing: id }, { idDosenPembimbing2: id }] };
  const [total, students, logs, confirmations, revisions, schedules, profile, sempros] = await Promise.all([
    db.bimbingan.count({ where: assigned }),
    db.bimbingan.findMany({ where: assigned, include: { pengajuan: { include: { mahasiswa: true } } }, orderBy: { updatedAt: "desc" }, take: 10 }),
    db.logbookBimbingan.count({ where: { bimbingan: assigned, statusSelesai: false, isDibatalkan: false,
      OR: [{ idDosen: id }, { idDosen: null }] } }),
    db.jadwalSempro.findMany({ where: { status: { in: ["menunggu_konfirmasi", "final"] },
      konfirmasiList: { some: { dosenId: id, status: "menunggu" } } }, include: { konfirmasiList: true } }),
    db.revisiDokumen.findMany({ where: { tipe: "sempro", status: "menunggu_persetujuan", beritaAcara: { jadwal: { sempro: {
      OR: [{ idDosenPembimbingSempro: id }, { penguji: { some: { idDosenPenguji: id, nomorPenguji: 1, isPengganti: false } } }] } } } }, select: { id: true } }),
    db.jadwalSidang.findMany({ where: { tanggal: { gte: today }, status: { in: ["final", "menunggu_konfirmasi"] },
      konfirmasiList: { some: { dosenId: id, status: { not: "diganti" } } } }, include: { konfirmasiList: true, sidang: { include: { pengajuan: true } } },
      orderBy: [{ tanggal: "asc" }, { waktuMulai: "asc" }], take: 5 }),
    db.pengguna.findUnique({ where: { id }, select: { dosen: true } }),
    db.jadwalSempro.findMany({ where: { status: { in: ["final", "menunggu_konfirmasi"] }, sempro: {
      OR: [{ idDosenPembimbingSempro: id }, { penguji: { some: { idDosenPenguji: id, isPengganti: false } } }] } },
      include: { beritaAcara: true, sempro: { include: { pengajuan: true, penguji: true } } }, orderBy: [{ tanggal: "asc" }, { waktuMulai: "asc" }] }),
  ]);
  return { total, quota: profile?.dosen?.kuotaBimbingan ?? 10, students, logs,
    confirmations: confirmations.filter((j) => j.konfirmasiList.some((c) => c.versi === j.versi && c.dosenId === id && c.status === "menunggu")).length,
    revisions: revisions.length,
    semproScores: sempros.filter((j) => {
      if (j.status !== "final" || !j.tanggal || j.tanggal > today || j.beritaAcara?.hasil) return false;
      if (j.sempro?.idDosenPembimbingSempro === id) return !j.beritaAcara?.statusDinilaiPembimbing;
      const assignment = j.sempro?.penguji.find((p) => p.idDosenPenguji === id && !p.isPengganti);
      return Boolean(assignment && (assignment.nomorPenguji === 1 ? j.beritaAcara?.nilaiPenguji1 == null : j.beritaAcara?.nilaiPenguji2 == null));
    }).length,
    semproSchedules: sempros.filter((j) => j.tanggal && j.tanggal >= today).slice(0, 5),
    schedules: schedules.filter((j) => j.konfirmasiList.some((c) => c.versi === j.versi && c.dosenId === id && c.status !== "diganti")) };
}

export async function managementOverview(session: AuthenticatedSession) {
  if (!canManage(session.user, session.activeRole)) return null;
  const db = database();
  const [critical, lecturers, approved, sempro, sidang, finished] = await Promise.all([
    db.pengguna.findMany({ where: { role: "mahasiswa", statusAkun: "aktif", deletedAt: null, mahasiswa: { semester: { gte: 13 } } },
      select: { id: true, nama: true, mahasiswa: true }, orderBy: { nama: "asc" }, take: 20 }),
    getCachedActiveLecturersWithSupervisions(),
    db.pengajuanJudul.count({ where: { status: "disetujui", deletedAt: null, isDiarsipkan: false } }),
    db.beritaAcara.count({ where: { jenis: "sempro", hasil: { in: ["lulus", "lulus_revisi"] } } }),
    db.pendaftaranSidang.count({ where: { statusDraft: "diajukan" } }),
    db.beritaAcara.count({ where: { jenis: "sidang", OR: [{ hasil: "lulus" }, { hasil: "lulus_revisi", statusRevisi: "revisi_selesai" }] } }),
  ]);
  return { critical, lecturers, funnel: [{ label: "Judul disetujui", count: approved }, { label: "Lulus sempro", count: sempro },
    { label: "Pendaftaran sidang", count: sidang }, { label: "Sidang dan revisi selesai", count: finished }] };
}

// Ignore symbolic links; storage stays outside the public web directory.
export async function privateStorageUsage() {
  const base = path.join(path.resolve(/* turbopackIgnore: true */ process.env.SIAS_STORAGE_ROOT || ".sias-storage"), "private");
  let bytes = 0, files = 0;
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(/* turbopackIgnore: true */ directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile()) { bytes += (await stat(/* turbopackIgnore: true */ file)).size; files++; }
    }
  }
  try { await visit(base); return { bytes, files, available: true }; }
  catch { return { bytes, files, available: false }; }
}

export async function systemOverview(session: AuthenticatedSession) {
  if (session.user.role !== "superadmin") return null;
  const db = database();
  const [settings, logs, storage, users] = await Promise.all([
    db.pengaturanSistem.findUnique({ where: { kunci: "scheduler_last_heartbeat" } }),
    db.logAktivitas.findMany({ orderBy: { waktu: "desc" }, take: 10 }), privateStorageUsage(),
    Promise.all((["mahasiswa", "dosen", "kaprodi", "sekpro", "admin_keuangan", "superadmin"] as const).map(async (role) => {
      const filter: Prisma.PenggunaWhereInput = role === "kaprodi" ? { OR: [{ role }, { role: "dosen", dosen: { isKaprodi: true } }] }
        : role === "sekpro" ? { OR: [{ role }, { role: "dosen", dosen: { isSekpro: true } }] }
        : role === "dosen" ? { role, dosen: { isKaprodi: false, isSekpro: false } } : { role };
      const [active, pending, inactive] = await Promise.all((["aktif", "menunggu_persetujuan", "nonaktif"] as const).map((statusAkun) =>
        db.pengguna.count({ where: { ...filter, statusAkun, deletedAt: null } })));
      return { role, active, pending, inactive };
    })),
  ]);
  const heartbeat = settings?.nilai ? new Date(settings.nilai) : null;
  return { users, logs, storage, heartbeat: heartbeat && Number.isFinite(heartbeat.getTime()) ? heartbeat : null,
    healthy: Boolean(heartbeat && heartbeat.getTime() <= Date.now() && Date.now() - heartbeat.getTime() <= 86400000) };
}

export async function administrationOverview(session: AuthenticatedSession) {
  if (!["admin_keuangan", "superadmin"].includes(session.user.role)) return null;
  const db = database();
  const settings = await getCachedSystemSettings();
  if (!settings.periode_akademik_mulai || !settings.periode_akademik_selesai) return null;
  const periode = `${settings.periode_akademik_mulai} s/d ${settings.periode_akademik_selesai}`;
  const [verified, rejected, pending] = await Promise.all(["terverifikasi", "ditolak", "menunggu_verifikasi"].map((statusVerifikasi) =>
    db.verifikasiPembayaran.count({ where: { periode, statusVerifikasi } })));
  return { verified, rejected, pending };
}
