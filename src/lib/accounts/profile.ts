import "server-only";
import { activeProgram, hasLeadership } from "@/lib/organization/store";
import { canDecideAccount } from "./policy";
import { activeProgramId } from "@/lib/organization/policy";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { AuthenticatedSession } from "@/lib/auth/session";
import { profileSchema, reasonSchema } from "./validation";
import { assertProgramExpertise } from "./expertise";
import { accountTransaction, assertIdentities, audit, checkedActor, ensure, identitySnapshot, invalidateSessions, lockedAccount, syncExpertise, type Account, type Tx } from "./store";

type ProfileChanges = z.infer<typeof profileSchema>;

function checkProfileRole(user: Account, data: ProfileChanges) {
  ensure(user.deletedAt === null && user.statusAkun === "aktif", "Akun harus aktif.");
  if (user.role === "mahasiswa") ensure(user.mahasiswa && data.nidn === undefined && data.bidang === undefined, "Kolom perubahan tidak sesuai profil mahasiswa.");
  else if (user.dosen && ["dosen", "kaprodi", "sekpro"].includes(user.role)) ensure(data.nim === undefined && data.semester === undefined, "Kolom perubahan tidak sesuai profil dosen.");
  else ensure(data.programStudiId === undefined && data.nim === undefined && data.nidn === undefined && data.bidang === undefined && data.semester === undefined && data.noHp === undefined, "Kolom perubahan tidak sesuai jenis akun.");
}

async function applyProfile(tx: Tx, user: Account, data: ProfileChanges) {
  checkProfileRole(user, data);
  const program = data.programStudiId !== undefined ? await activeProgram(tx, data.programStudiId) : null;
  const profile = user.role === "mahasiswa" ? user.mahasiswa : user.dosen;
  if (program) ensure(!hasLeadership(user) || profile?.programStudiId === program.id, "Berhentikan jabatan sebelum memindahkan afiliasi.");
  await assertIdentities(tx, user.id, data);
  await tx.pengguna.update({ where: { id: user.id }, data: { nama: data.nama, email: data.email, updatedAt: new Date() } });
  if (user.role === "mahasiswa") {
    await tx.mahasiswa.update({ where: { penggunaId: user.id }, data: { nim: data.nim, semester: data.semester, programStudiId: program?.id, prodi: program?.nama, noHp: data.noHp, updatedAt: new Date() } });
  } else if (user.dosen) {
    await tx.dosen.update({ where: { penggunaId: user.id }, data: { nidn: data.nidn, programStudiId: program?.id, prodi: program?.nama, noHp: data.noHp, updatedAt: new Date() } });
    if (data.bidang) await syncExpertise(tx, user.id, data.bidang);
  }
  if ((program && program.id !== profile?.programStudiId) || (data.email !== undefined && data.email !== user.email)) await invalidateSessions(tx, user.id);
}

export async function editAccountProfile(session: AuthenticatedSession, id: bigint, input: unknown, reason: string) {
  const data = profileSchema.parse(input);
  reasonSchema.parse(reason);
  return accountTransaction(async (tx) => {
    const actor = await checkedActor(tx, session, "superadmin");
    const target = await lockedAccount(tx, id);
    ensure(target.role !== "superadmin", "Gunakan profil sendiri untuk akun superadmin.");
    const before = identitySnapshot(target);
    await applyProfile(tx, target, data);
    await audit(tx, actor.id, "edit_data_pribadi_pengguna", `pengguna:${id}`, { reason, before, after: identitySnapshot(await lockedAccount(tx, id)) });
  });
}

export async function updateOwnName(session: AuthenticatedSession, name: string) {
  const nama = z.string().trim().min(3).max(255).parse(name);
  return accountTransaction(async (tx) => {
    const actor = await checkedActor(tx, session);
    await tx.pengguna.update({ where: { id: actor.id }, data: { nama, updatedAt: new Date() } });
    await audit(tx, actor.id, "update_profil", `pengguna:${actor.id}`, { before: actor.nama, after: nama });
  });
}

export async function submitProfileRequest(session: AuthenticatedSession, input: unknown, reason: string) {
  const data = profileSchema.parse(input);
  reasonSchema.parse(reason);
  return accountTransaction(async (tx) => {
    const user = await checkedActor(tx, session);
    ensure(user.role === "mahasiswa" || (user.dosen && ["dosen", "kaprodi", "sekpro"].includes(user.role)), "Akun ini tidak mempunyai profil akademik.");
    checkProfileRole(user, data);
    if (data.programStudiId !== undefined) { await activeProgram(tx, data.programStudiId); ensure(!hasLeadership(user), "Berhentikan jabatan sebelum mengajukan perubahan afiliasi."); }
    await assertIdentities(tx, user.id, data);
    if (data.bidang) await assertProgramExpertise(tx, data.bidang, data.programStudiId ?? user.dosen?.programStudiId);
    const common = {
      namaLama: user.nama, emailLama: user.email, noHpLama: user.role === "mahasiswa" ? user.mahasiswa?.noHp : user.dosen?.noHp,
      namaBaru: data.nama, ubahNama: data.nama !== undefined,
      emailBaru: data.email, ubahEmail: data.email !== undefined,
      noHpBaru: data.noHp, ubahNoHp: data.noHp !== undefined,
      programStudiLamaId: (user.role === "mahasiswa" ? user.mahasiswa : user.dosen)?.programStudiId,
      programStudiBaruId: data.programStudiId, ubahProgramStudi: data.programStudiId !== undefined,
      alasan: reason, createdAt: new Date(), updatedAt: new Date(),
    };
    let id: bigint;
    if (user.role === "mahasiswa") {
      ensure(!await tx.biodataChangeRequest.findFirst({ where: { mahasiswaId: user.id, status: "pending" } }), "Masih ada permohonan biodata yang menunggu keputusan.");
      const request = await tx.biodataChangeRequest.create({ data: {
        ...common, mahasiswaId: user.id, nim: user.mahasiswa!.nim, nimLama: user.mahasiswa!.nim,
        nimBaru: data.nim, ubahNim: data.nim !== undefined,
        semesterLama: user.mahasiswa!.semester, semesterBaru: data.semester, ubahSemester: data.semester !== undefined,
      } });
      id = request.id;
    } else {
      ensure(!await tx.keahlianChangeRequest.findFirst({ where: { dosenId: user.id, status: "pending" } }), "Masih ada permohonan data dosen yang menunggu keputusan.");
      const request = await tx.keahlianChangeRequest.create({ data: {
        ...common, dosenId: user.id, nidnLama: user.dosen!.nidn, nidnBaru: data.nidn, ubahNidn: data.nidn !== undefined,
        keahlianLama: user.dosen!.keahlian.map((item) => item.bidangId.toString()),
        keahlianDiajukan: data.bidang?.map(String), ubahKeahlian: data.bidang !== undefined,
      } });
      id = request.id;
    }
    await audit(tx, user.id, "pengajuan_perubahan_profil", `${user.role === "mahasiswa" ? "biodata" : "keahlian"}_request:${id}`, { fields: Object.keys(data), reason });
  });
}

export async function decideProfileRequest(session: AuthenticatedSession, kind: "biodata" | "keahlian", id: bigint, approve: boolean, reason: string) {
  if (!approve) reasonSchema.parse(reason);
  return accountTransaction(async (tx) => {
    const actor = await checkedActor(tx, session, "manage");
    const common = { status: approve ? "disetujui" : "ditolak", catatanKaprodi: approve ? "Disetujui" : reason, diputuskanOleh: actor.id, diputuskanAt: new Date(), updatedAt: new Date() };
    const request = kind === "biodata"
      ? await tx.biodataChangeRequest.findUnique({ where: { id } })
      : await tx.keahlianChangeRequest.findUnique({ where: { id } });
    ensure(request?.status === "pending", "Permohonan sudah diproses atau tidak ditemukan.");
    const ownerId = "mahasiswaId" in request ? request.mahasiswaId : request.dosenId;
    const target = await lockedAccount(tx, ownerId);
    ensure(canDecideAccount(actor, target), "Akun berada di luar kewenangan program studi Anda.");
    if (approve) {
      ensure((kind === "biodata" && target.role === "mahasiswa") || (kind === "keahlian" && target.dosen && ["dosen", "kaprodi", "sekpro"].includes(target.role)), "Peran akun telah berubah.");
      // Legacy NIDN and expertise requests predate the explicit change flags.
      if (request.ubahProgramStudi) ensure(request.programStudiLamaId === (kind === "biodata" ? target.mahasiswa : target.dosen)?.programStudiId, "Afiliasi telah berubah sejak pengajuan.");
      if (request.ubahProgramStudi && actor.role !== "superadmin") ensure(activeProgramId(actor.dosen) === request.programStudiBaruId, "Perpindahan lintas prodi memerlukan superadmin.");
      const fields: Record<string, unknown> = {
        programStudiId: request.ubahProgramStudi ? String(request.programStudiBaruId) : undefined,
        nama: request.ubahNama ? request.namaBaru : undefined,
        email: request.ubahEmail ? request.emailBaru : undefined,
        noHp: request.ubahNoHp ? request.noHpBaru : undefined,
      };
      ensure(!request.ubahNama || request.namaLama === target.nama, "Nama telah berubah sejak pengajuan. Ajukan ulang permohonan.");
      ensure(!request.ubahEmail || request.emailLama?.toLowerCase() === target.email?.toLowerCase(), "Email telah berubah sejak pengajuan. Ajukan ulang permohonan.");
      ensure(!request.ubahNoHp || request.noHpLama === (kind === "biodata" ? target.mahasiswa?.noHp : target.dosen?.noHp), "Nomor HP telah berubah sejak pengajuan.");
      if ("nimBaru" in request) {
        fields.nim = request.ubahNim ? request.nimBaru : undefined;
        fields.semester = request.ubahSemester ? request.semesterBaru : undefined;
        ensure(!request.ubahNim || (request.nimLama ?? request.nim) === target.mahasiswa?.nim, "NIM telah berubah sejak pengajuan.");
        ensure(!request.ubahSemester || request.semesterLama === target.mahasiswa?.semester, "Semester telah berubah sejak pengajuan.");
      } else {
        fields.nidn = request.ubahNidn || request.nidnBaru ? request.nidnBaru : undefined;
        const bidang = request.keahlianDiajukan;
        if (request.ubahKeahlian || bidang) ensure(request.programStudiLamaId == null || request.programStudiLamaId === target.dosen?.programStudiId,
          "Afiliasi telah berubah sejak pengajuan keahlian. Ajukan ulang permohonan.");
        if (request.ubahKeahlian || bidang) {
          ensure(Array.isArray(bidang), "Data keahlian permohonan tidak valid. Ajukan ulang permohonan.");
          fields.bidang = bidang.map((value) => {
            ensure(typeof value === "string" || (typeof value === "number" && Number.isSafeInteger(value)), "ID keahlian legacy tidak valid.");
            return String(value);
          });
          if (Array.isArray(request.keahlianLama)) {
            const original = request.keahlianLama.map(String).sort();
            const current = target.dosen!.keahlian.map((item) => item.bidangId.toString()).sort();
            ensure(JSON.stringify(original) === JSON.stringify(current), "Keahlian telah berubah sejak pengajuan.");
          }
        }
        ensure(fields.nidn === undefined || request.nidnLama === target.dosen?.nidn, "NIDN telah berubah sejak pengajuan.");
      }
      const data = profileSchema.parse(fields);
      const before = identitySnapshot(target);
      await applyProfile(tx, target, data);
      await audit(tx, actor.id, "approve_perubahan_profil", `${kind}_request:${id}`, { before, after: identitySnapshot(await lockedAccount(tx, ownerId)) });
    } else await audit(tx, actor.id, "reject_perubahan_profil", `${kind}_request:${id}`, { reason });
    if (kind === "biodata") await tx.biodataChangeRequest.update({ where: { id }, data: common });
    else await tx.keahlianChangeRequest.update({ where: { id }, data: common });
  });
}

export function requestSummary(request: Prisma.BiodataChangeRequestGetPayload<object> | Prisma.KeahlianChangeRequestGetPayload<object>) {
  const values: Record<string, unknown> = {};
  if (request.ubahProgramStudi) values.programStudiId = request.programStudiBaruId;
  if (request.ubahNama) values.nama = request.namaBaru;
  if (request.ubahEmail) values.email = request.emailBaru;
  if (request.ubahNoHp) values.noHp = request.noHpBaru;
  if ("nimBaru" in request) {
    if (request.ubahNim) values.nim = request.nimBaru;
    if (request.ubahSemester) values.semester = request.semesterBaru;
  } else {
    if (request.ubahNidn || request.nidnBaru) values.nidn = request.nidnBaru;
    if (request.ubahKeahlian || request.keahlianDiajukan) values.keahlian = request.keahlianDiajukan;
  }
  return values;
}
