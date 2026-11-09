import "server-only";
import { activeProgram } from "@/lib/organization/store";
import { hashPassword } from "@/lib/auth/password";
import type { AuthenticatedSession } from "@/lib/auth/session";
import { academicPeriod, semesterFromNim } from "./policy";
import { idSchema, registrationSchema } from "./validation";
import { accountTransaction, assertIdentities, assertSingleKaprodi, audit, checkedActor, ensure, settingsValues, syncExpertise } from "./store";

export async function registerAccount(input: unknown, session?: AuthenticatedSession, temporaryPassword?: string) {
  const data = registrationSchema.parse(input);
  const admin = Boolean(session);
  ensure(admin || ["mahasiswa", "dosen", "admin_keuangan"].includes(data.role), "Peran pendaftaran tidak diizinkan.");
  ensure(admin || !data.isSekpro, "Jabatan Sekpro ditetapkan melalui tata kelola setelah akun dosen aktif.");
  ensure(admin || (data.password && data.password === data.confirmation), "Konfirmasi password tidak cocok.");
  const password = await hashPassword(temporaryPassword ?? data.password!);
  return accountTransaction(async (tx) => {
    const actor = session ? await checkedActor(tx, session, "superadmin") : null;
    const settings = await settingsValues(tx);
    const lecturer = ["dosen", "kaprodi", "sekpro"].includes(data.role);
    const program = data.role === "mahasiswa" || lecturer ? await activeProgram(tx, data.programStudiId) : null;
    if (data.role === "mahasiswa") {
      ensure(data.nim && data.semester && data.noHp, "NIM, semester, dan nomor HP wajib diisi.");
      const calculated = semesterFromNim(data.nim, settings);
      const parity = academicPeriod(settings).jenis === "ganjil" ? 1 : 0;
      ensure(data.semester >= 7 && data.semester % 2 === parity, "Semester harus sesuai periode aktif dan minimal 7.");
      ensure(admin || (calculated >= 7 && calculated <= 14 && calculated === data.semester), "Semester dari NIM harus 7 sampai 14 dan sesuai pilihan semester.");
    }
    if (lecturer) ensure(data.nidn && data.noHp, "NIDN dan nomor HP wajib diisi.");
    await assertIdentities(tx, undefined, { email: data.email, nim: data.role === "mahasiswa" ? data.nim : null, nidn: lecturer ? data.nidn : null });
    if (data.role === "kaprodi" || data.role === "sekpro") await assertSingleKaprodi(tx, undefined, program?.id, data.role);
    const now = new Date();
    const user = await tx.pengguna.create({ data: {
      nama: data.nama, email: data.email, password,
      role: lecturer ? "dosen" : data.role,
      statusAkun: admin ? "aktif" : "menunggu_persetujuan",
      dibuatOlehSuperAdmin: admin, wajibGantiPassword: admin,
      createdAt: now, updatedAt: now,
    } });
    if (data.role === "mahasiswa") {
      await tx.mahasiswa.create({ data: { penggunaId: user.id, nim: data.nim, semester: data.semester!, programStudiId: program!.id, prodi: program!.nama, noHp: data.noHp, createdAt: now, updatedAt: now } });
    } else if (lecturer) {
      await tx.dosen.create({ data: {
        penggunaId: user.id, nidn: data.nidn, noHp: data.noHp,
        programStudiId: program!.id, prodi: program!.nama,
        kuotaBimbingan: Number(settings.kuota_bimbingan_default ?? 10),
        isKaprodi: data.role === "kaprodi", isSekpro: data.role === "sekpro" || (!admin && data.isSekpro),
        createdAt: now, updatedAt: now,
      } });
      const ids: bigint[] = [];
      for (const value of data.bidang) {
        if (value === "lainnya") {
          ensure(data.bidangLainnya, "Nama bidang keahlian lainnya wajib diisi.");
          const bidang = await tx.bidangKeahlian.upsert({ where: { programStudiId_namaBidang: { programStudiId: program!.id, namaBidang: data.bidangLainnya } },
            create: { programStudiId: program!.id, namaBidang: data.bidangLainnya, createdAt: now, updatedAt: now }, update: {} });
          ids.push(bidang.id);
        } else ids.push(idSchema.parse(value));
      }
      await syncExpertise(tx, user.id, ids);
    } else {
      await tx.adminKeuangan.create({ data: { penggunaId: user.id, createdAt: now, updatedAt: now } });
    }
    await audit(tx, actor?.id ?? user.id, admin ? "tambah_akun_langsung" : "registrasi_akun", `pengguna:${user.id}`, {
      role: data.role, isSekpro: data.isSekpro, statusAkun: user.statusAkun,
    });
    return { id: user.id.toString(), email: user.email };
  });
}
