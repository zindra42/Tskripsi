import "server-only";
import { z } from "zod";
import { academicPeriod, semesterFromNim } from "@/lib/accounts/policy";
import { ensure, jsonValue, settingsValues } from "@/lib/accounts/store";
import { idSchema } from "@/lib/accounts/validation";
import { administrationValid, currentTitle, periodCode, witaDate } from "./policy";
import { readStoredFile, storeUpload } from "./files";
import { similarity, similarityColumns, similarityWarning } from "./similarity";
import { draftSchema, reason, titleSchema } from "./validation";
import { cancelSupervisor, event, managers, requireFinance, requireManager, requireStudent, supervisorLoad, titleRecord, type Context, type Input, type Uploads } from "./store";

async function validateReferences(context: Context, fields: (bigint | null | undefined)[], preferences: bigint[]) {
  const ids = [...new Set(fields.filter((id): id is bigint => id != null))];
  ensure(await context.tx.bidangKeahlian.count({ where: { id: { in: ids } } }) === ids.length, "Bidang keahlian tidak ditemukan.");
  ensure(await context.tx.dosen.count({ where: { penggunaId: { in: preferences }, pengguna: { statusAkun: "aktif", deletedAt: null, role: { in: ["dosen", "kaprodi", "sekpro"] } },
    OR: [{ nidn: null }, { NOT: { nidn: { contains: "_DEL_" } } }],
  } }) === preferences.length, "Dosen preferensi tidak aktif.");
}

export async function saveTitle(context: Context, input: Input, uploads: Uploads, draft: boolean) {
  const profile = requireStudent(context);
  const parsed = (draft ? draftSchema : titleSchema).parse(input);
  await validateReferences(context, parsed.matriks.flatMap((row) => [row.bidang_keahlian_id, row.bidang_keahlian_2_id]), parsed.preferensi);
  const { tx, actor } = context;
  const existing = await tx.pengajuanJudul.findFirst({ where: { idMahasiswa: actor.id, deletedAt: null, isDiarsipkan: false }, orderBy: { id: "desc" } });
  // A newer draft must never hide an older submission approved while the student was editing.
  const active = await tx.pengajuanJudul.findFirst({ where: { idMahasiswa: actor.id, deletedAt: null,
    isDiarsipkan: false, statusDraft: "diajukan", status: { in: ["diajukan", "disetujui"] } } });
  ensure(!active, "Pengajuan aktif masih menunggu review atau sudah disetujui.");
  const [first] = parsed.matriks;
  const values = { judul: parsed.judul || "Draft Judul", bidangKeahlianId: first.bidang_keahlian_id ?? null,
    bidangKeahlian2Id: first.bidang_keahlian_2_id ?? null, matriksPenelitian: jsonValue(parsed.matriks),
    preferensiDosenIds: jsonValue(parsed.preferensi), updatedAt: new Date(),
  };
  if (draft) {
    const draftRow = existing?.statusDraft === "draft" ? existing : await tx.pengajuanJudul.findFirst({ where: { idMahasiswa: actor.id, statusDraft: "draft", deletedAt: null } });
    const data = { ...values, draftData: jsonValue(parsed), statusDraft: "draft", status: "diajukan" };
    const row = draftRow ? await tx.pengajuanJudul.update({ where: { id: draftRow.id }, data })
      : await tx.pengajuanJudul.create({ data: { ...data, idMahasiswa: actor.id, fileProposal: "", createdAt: new Date() } });
    await event(context, "simpan_draft_judul", `judul:${row.id}`, draftRow, row, [], "", "/judul");
    return;
  }
  const settings = await settingsValues(tx);
  const payment = await tx.verifikasiPembayaran.findFirst({ where: { idMahasiswa: actor.id }, orderBy: { id: "desc" } });
  ensure(administrationValid(payment, settings), "Administrasi belum terverifikasi, perlu verifikasi ulang, atau periode sudah berakhir.");
  const today = witaDate();
  ensure(today >= (settings.periode_pengajuan_judul_mulai || "2026-08-29") && today <= (settings.periode_pengajuan_judul_selesai || "2026-10-31"), "Periode pengajuan judul sedang ditutup. Hubungi pengelola program studi.");
  ensure(uploads.proposal, "Unggah proposal PDF maksimal 10 MB.");
  const result = similarity(parsed.judul, await tx.arsipJudulSkripsi.findMany({ orderBy: { id: "asc" } }));
  const previous = await tx.pengajuanJudul.findFirst({ where: { idMahasiswa: actor.id, statusDraft: "diajukan" }, orderBy: { id: "desc" } });
  await tx.pengajuanJudul.updateMany({ where: { idMahasiswa: actor.id, deletedAt: null, statusDraft: "draft" }, data: { deletedAt: new Date(), updatedAt: new Date() } });
  await tx.pengajuanJudul.updateMany({ where: { idMahasiswa: actor.id, status: "direvisi", isDiarsipkan: false, deletedAt: null }, data: {
    isDiarsipkan: true, diarsipkanAt: new Date(), diarsipkanOlehId: actor.id, alasanArsip: "Digantikan pengajuan revisi", updatedAt: new Date(),
  } });
  const period = academicPeriod(settings);
  const row = await tx.pengajuanJudul.create({ data: { ...values, idMahasiswa: actor.id,
    fileProposal: await storeUpload(uploads.proposal, "proposal"), status: "diajukan", statusDraft: "diajukan", counterPengajuan: (previous?.counterPengajuan ?? 0) + 1,
    semesterSaatPengajuan: semesterFromNim(profile.nim ?? profile.nimArsip ?? "", settings),
    periodeAkademikSaatPengajuan: `${period.jenis === "ganjil" ? "Ganjil" : "Genap"} ${period.tahunMulai}/${period.tahunMulai + 1}`,
    snapshotVersion: "sias-ts-academic-v1", siklusKe: payment?.siklusKe ?? 1,
    ...similarityColumns(result),
    tanggalPengajuan: new Date(), createdAt: new Date(),
  } });
  await event(context, "pengajuan_judul_diajukan", `judul:${row.id}`, existing, row,
    [actor.id, ...await managers(tx)], "Pengajuan judul menunggu review program studi.", `/judul/${row.id}`);
}

export async function reviewTitle(context: Context, input: Input, decision: "approve" | "revise" | "cancel" | "archive") {
  const { tx, actor } = context;
  const title = await titleRecord(tx, idSchema.parse(input.id));
  ensure(!title.deletedAt && !title.isDiarsipkan && title.statusDraft === "diajukan", "Pengajuan sudah diarsipkan atau masih draft.");
  ensure(decision === "archive" || title.mahasiswa.role === "mahasiswa" && title.mahasiswa.statusAkun === "aktif" && !title.mahasiswa.deletedAt, "Akun mahasiswa tidak aktif.");
  const ownerCancel = decision === "cancel" && title.idMahasiswa === actor.id && actor.role === "mahasiswa";
  if (ownerCancel) ensure(title.status === "diajukan", "Mahasiswa hanya dapat membatalkan judul menunggu review.");
  else requireManager(context);
  const authority = context.role === "sekpro" ? "sekpro" : "kaprodi";
  ensure(ownerCancel || decision === "archive" || authority !== "sekpro" || title.lastVerifierRole !== "kaprodi", "Keputusan Kaprodi bersifat final bagi Sekpro.");
  ensure(decision === "archive" || !title.bimbingan?.idDosenPembimbing && !title.bimbingan?.idDosenPembimbing2,
    "Batalkan penetapan pembimbing terlebih dahulu.");
  if (decision === "archive") ensure(actor.role === "superadmin", "Pengarsipan bisnis memerlukan superadmin.");
  const note = decision === "approve" || ownerCancel ? "" : reason.parse(input.reason);
  if (decision === "archive") {
    const settings = await settingsValues(tx);
    ensure(witaDate() >= (settings.periode_pengajuan_judul_mulai || "2026-08-29") && witaDate() <= (settings.periode_pengajuan_judul_selesai || "2026-10-31"), "Pengarsipan judul memerlukan periode pengajuan terbuka.");
    if (title.bimbingan?.idDosenPembimbing) await cancelSupervisor(context, title.bimbingan.id, 1, note, "archive");
    if (title.bimbingan?.idDosenPembimbing2) await cancelSupervisor(context, title.bimbingan.id, 2, note, "archive");
  }
  const archived = decision === "cancel" || decision === "archive";
  const data = { status: decision === "approve" ? "disetujui" : decision === "revise" ? "direvisi" : "dibatalkan",
    catatanKaprodi: note || null, lastVerifierId: ownerCancel ? title.lastVerifierId : actor.id,
    lastVerifierRole: ownerCancel ? title.lastVerifierRole : authority,
    tanggalPersetujuan: decision === "approve" ? new Date() : title.tanggalPersetujuan,
    ...(archived ? { isDiarsipkan: true, diarsipkanAt: new Date(), diarsipkanOlehId: actor.id, alasanArsip: note || "Dibatalkan sendiri oleh mahasiswa" } : {}), updatedAt: new Date(),
  };
  await tx.pengajuanJudul.update({ where: { id: title.id }, data });
  const overridden = title.lastVerifierRole === "sekpro" && authority === "kaprodi" ? title.lastVerifierId : null;
  await event(context, `judul_${decision}`, `judul:${title.id}`, title, data, [title.idMahasiswa, overridden],
    `Keputusan pengajuan judul diperbarui. ${note}`, `/judul/${title.id}`);
}

export async function assignSupervisors(context: Context, input: Input) {
  requireManager(context);
  const { tx } = context;
  const title = await titleRecord(tx, idSchema.parse(input.id));
  ensure(currentTitle(title) && title.status === "disetujui" && title.mahasiswa.role === "mahasiswa" && title.mahasiswa.statusAkun === "aktif" && !title.mahasiswa.deletedAt,
    "Judul harus disetujui dan mahasiswa aktif.");
  const ids = z.array(idSchema).min(1).max(2).refine((values) => new Set(values).size === values.length).parse(input.supervisors);
  const existing = title.bimbingan;
  ensure(!existing?.idDosenPembimbing || existing.idDosenPembimbing === ids[0], "Batalkan pembimbing 1 sebelum mengganti dosen.");
  ensure(!existing?.idDosenPembimbing2 || existing.idDosenPembimbing2 === (ids[1] ?? null), "Batalkan pembimbing 2 sebelum mengganti dosen.");
  for (const id of ids) {
    const lecturer = await tx.dosen.findUnique({ where: { penggunaId: id }, include: { pengguna: { select: { role: true, statusAkun: true, deletedAt: true } } } });
    ensure(lecturer && lecturer.pengguna.statusAkun === "aktif" && !lecturer.pengguna.deletedAt
      && ["dosen", "kaprodi", "sekpro"].includes(lecturer.pengguna.role) && !lecturer.nidn?.includes("_DEL_"), "Dosen tidak aktif.");
    ensure(await supervisorLoad(tx, id, existing?.id) < lecturer.kuotaBimbingan, "Kuota dosen sudah penuh.");
  }
  const data = { idDosenPembimbing: ids[0], idDosenPembimbing2: ids[1] ?? null, tanggalPenetapan: new Date(), updatedAt: new Date() };
  const b = existing ? await tx.bimbingan.update({ where: { id: existing.id }, data })
    : await tx.bimbingan.create({ data: { ...data, idPengajuan: title.id, siklusKe: title.siklusKe, createdAt: new Date() } });
  if (existing && (existing.idDosenPembimbing !== data.idDosenPembimbing || existing.idDosenPembimbing2 !== data.idDosenPembimbing2)) {
    await tx.pengajuanPerubahanJudul.updateMany({ where: { bimbinganId: b.id, status: { in: ["menunggu_dospem", "menunggu_kaprodi"] } },
      data: { status: "ditolak_kaprodi", catatanKaprodi: "Susunan pembimbing berubah. Ajukan perubahan judul kembali.",
        penyetujuId: context.actor.id, keputusanAt: new Date(), updatedAt: new Date() } });
  }
  await event(context, "penetapan_dosen_pembimbing", `bimbingan:${b.id}`, existing, b, [title.idMahasiswa, ...ids], "Pembimbing telah ditetapkan.", `/bimbingan/${b.id}`);
}

export async function submitAdministration(context: Context, input: Input, uploads: Uploads, draft = false) {
  requireStudent(context);
  const { tx, actor } = context;
  const settings = await settingsValues(tx);
  const previous = await tx.verifikasiPembayaran.findFirst({ where: { idMahasiswa: actor.id }, orderBy: { id: "desc" } });
  const code = periodCode(settings);
  const existing = previous?.periode === code || !previous?.periode ? previous : null;
  const activeTitle = await tx.pengajuanJudul.findFirst({ where: { idMahasiswa: actor.id, isDiarsipkan: false,
    deletedAt: null, statusDraft: "diajukan" }, include: { bimbingan: true }, orderBy: { id: "desc" } });
  ensure(!existing || existing.statusVerifikasi !== "terverifikasi" || existing.perluVerifikasiUlang, "Administrasi sah sudah terkunci.");
  const sender = draft && !input.namaPengirim ? existing?.namaPengirim ?? null : z.string().trim().min(3).max(255).parse(input.namaPengirim);
  const date = draft && !input.tanggalTransfer ? existing?.tanggalTransfer?.toISOString().slice(0, 10) ?? null : z.iso.date().parse(input.tanggalTransfer);
  ensure(!date || date <= witaDate(), "Tanggal transfer tidak boleh di masa depan.");
  const paths: Record<string, string> = {};
  for (const [key, field, folder] of [["kwitansi", "fileKwitansi", "kwitansi"], ["transfer", "fileBuktiTransfer", "transfer"], ["krs", "fileKrsSka", "krs"]] as const) {
    const upload = uploads[key];
    const old = existing?.[field];
    if (draft && !upload && !old) continue;
    ensure(upload || old, "Lengkapi kwitansi, bukti transfer, dan KRS/SKA.");
    paths[field] = upload ? await storeUpload(upload, `verifikasi/${folder}`) : old!;
    if (!upload) await readStoredFile(paths[field], ["public"]);
  }
  const data = { fileKwitansi: paths.fileKwitansi, fileBuktiTransfer: paths.fileBuktiTransfer, fileKrsSka: paths.fileKrsSka,
    namaPengirim: sender, tanggalTransfer: date ? new Date(`${date}T00:00:00Z`) : null, statusVerifikasi: "menunggu_verifikasi",
    perluVerifikasiUlang: false, catatanPenolakan: null, periode: code,
    siklusKe: existing?.siklusKe ?? (previous ? Math.max(previous.siklusKe, activeTitle?.bimbingan?.siklusKe ?? 0) + 1 : 1),
    snapshotVersion: "sias-ts-academic-v1", updatedAt: new Date(),
  };
  const row = existing ? await tx.verifikasiPembayaran.update({ where: { id: existing.id }, data: { ...data, revision: { increment: 1 } } })
    : await tx.verifikasiPembayaran.create({ data: { ...data, idMahasiswa: actor.id, createdAt: new Date() } });
  const finance = draft ? [] : await tx.pengguna.findMany({ where: { role: "admin_keuangan", statusAkun: "aktif", deletedAt: null }, select: { id: true } });
  await event(context, "unggah_verifikasi_administrasi", `administrasi:${row.id}`, existing, row,
    [actor.id, ...finance.map((user) => user.id)], draft ? "Berkas administrasi sementara disimpan. Lengkapi sebelum verifikasi." : "Berkas administrasi menunggu verifikasi.", "/administrasi");
}

export async function removeAdministrationFile(context: Context, input: Input) {
  requireStudent(context);
  const row = await context.tx.verifikasiPembayaran.findUnique({ where: { id: idSchema.parse(input.id) } });
  ensure(row && row.idMahasiswa === context.actor.id, "Berkas administrasi bukan milik Anda.");
  const latest = await context.tx.verifikasiPembayaran.findFirst({ where: { idMahasiswa: context.actor.id }, orderBy: { id: "desc" } });
  ensure(latest?.id === row.id && (row.statusVerifikasi !== "terverifikasi" || row.perluVerifikasiUlang), "Administrasi sah atau historis sudah terkunci.");
  ensure(row.revision === z.coerce.number().int().positive().parse(input.revision), "Berkas administrasi telah berubah. Muat ulang halaman.");
  const field = { kwitansi: "fileKwitansi", transfer: "fileBuktiTransfer", krs: "fileKrsSka" }[z.enum(["kwitansi", "transfer", "krs"]).parse(input.file)];
  const data = { [field]: null, revision: { increment: 1 }, updatedAt: new Date() };
  await context.tx.verifikasiPembayaran.update({ where: { id: row.id }, data });
  // Retain the physical object: its path remains referenced in the audit/history.
  await event(context, "hapus_berkas_administrasi", `administrasi:${row.id}`, row, { file: input.file }, [], "", "/administrasi");
}

export async function decideAdministration(context: Context, input: Input, approve: boolean) {
  requireFinance(context);
  const { tx, actor } = context;
  const row = await tx.verifikasiPembayaran.findUnique({ where: { id: idSchema.parse(input.id) } });
  ensure(row, "Administrasi tidak ditemukan.");
  const latest = await tx.verifikasiPembayaran.findFirst({ where: { idMahasiswa: row.idMahasiswa }, orderBy: { id: "desc" } });
  ensure(latest?.id === row.id, "Tinjau administrasi terbaru. Record ini merupakan histori.");
  ensure(row.revision === z.coerce.number().int().positive().parse(input.revision), "Berkas administrasi telah berubah. Muat ulang dan tinjau versi terbaru.");
  const note = approve ? null : z.string().trim().min(10).max(1000).parse(input.reason);
  if (approve) {
    ensure(row.fileBuktiTransfer && row.fileKwitansi && row.fileKrsSka && row.namaPengirim && row.tanggalTransfer, "Berkas dan data administrasi belum lengkap.");
    for (const path of [row.fileBuktiTransfer, row.fileKwitansi, row.fileKrsSka]) await readStoredFile(path, ["public"]);
  }
  const data = { statusVerifikasi: approve ? "terverifikasi" : "ditolak", idAdminKeuangan: actor.id,
    perluVerifikasiUlang: false, catatanPenolakan: note, revision: { increment: 1 }, updatedAt: new Date() };
  await tx.verifikasiPembayaran.update({ where: { id: row.id }, data });
  if (approve) {
    const title = await tx.pengajuanJudul.findFirst({ where: { idMahasiswa: row.idMahasiswa, isDiarsipkan: false, deletedAt: null }, include: { bimbingan: true }, orderBy: { id: "desc" } });
    const b = title?.bimbingan;
    if (title && b && row.siklusKe > b.siklusKe) {
      for (const [slot, id] of [[1, b.idDosenPembimbing], [2, b.idDosenPembimbing2]] as const) {
        if (!id) continue;
        const lecturer = await tx.dosen.findUnique({ where: { penggunaId: id }, include: { pengguna: { select: { role: true, statusAkun: true, deletedAt: true } } } });
        if (!lecturer || lecturer.pengguna.statusAkun !== "aktif" || lecturer.pengguna.deletedAt
          || !["dosen", "kaprodi", "sekpro"].includes(lecturer.pengguna.role) || lecturer.nidn?.includes("_DEL_")
          || await supervisorLoad(tx, id, b.id) >= lecturer.kuotaBimbingan) await cancelSupervisor(context, b.id, slot, "Pembimbing tidak aktif atau kuota penuh pada pembukaan siklus baru", "renewal");
      }
      await tx.bimbingan.update({ where: { id: b.id }, data: { siklusKe: row.siklusKe, updatedAt: new Date() } });
      await tx.pengajuanJudul.update({ where: { id: title.id }, data: { siklusKe: row.siklusKe, updatedAt: new Date() } });
      // The official sempro result survives a period change. ACC skripsi must meet the new cycle's minimum.
      await tx.dokumenVerifikasi.updateMany({ where: { idBimbingan: b.id, jenisDokumen: "acc_sidang", status: "sah" },
        data: { status: "dicabut", dicabutAt: new Date(), dicabutOlehId: actor.id, alasanPencabutan: "Pembukaan siklus bimbingan baru", updatedAt: new Date() } });
      await event(context, "pembukaan_siklus_baru", `bimbingan:${b.id}`, { siklusKe: b.siklusKe }, { siklusKe: row.siklusKe },
        [row.idMahasiswa, b.idDosenPembimbing, b.idDosenPembimbing2], "Siklus bimbingan baru dibuka. Logbook siklus sebelumnya hanya baca.", `/bimbingan/${b.id}`);
    }
  }
  await event(context, `verifikasi_pembayaran_${approve ? "disetujui" : "ditolak"}`, `administrasi:${row.id}`, row, data,
    [row.idMahasiswa], note || "Administrasi telah diverifikasi.", "/administrasi");
}

export async function checkSimilarity(context: Context, title: unknown) {
  const corpus = await context.tx.arsipJudulSkripsi.findMany({ orderBy: { id: "asc" } });
  const result = similarity(z.string().trim().min(3).max(255).parse(title), corpus);
  return { ...result, ...similarityWarning(result.skor, await settingsValues(context.tx)), corpusSize: corpus.length };
}
