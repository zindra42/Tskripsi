import { affiliation } from "./helpers/organization";
import assert from "node:assert/strict";
import test from "node:test";
import {
  availableRoles, canAccessArea, canAuthenticate, isRole, landingPath,
  type AccountPolicy,
} from "../src/lib/auth/policy";
import { hashPassword, verifyPassword } from "../src/lib/auth/password";
import { loginSchema, passwordSchema } from "../src/lib/auth/validation";
import { IDLE_MILLISECONDS, REMEMBER_MILLISECONDS, newSessionToken, sessionExpiry, tokenHash } from "../src/lib/auth/tokens";

const student: AccountPolicy = {
  role: "mahasiswa", statusAkun: "aktif", deletedAt: null,
  wajibGantiPassword: false, dosen: null,
};
const leader: AccountPolicy = {
  ...student, role: "dosen", dosen: { ...affiliation(), isKaprodi: true, isSekpro: false },
};

// Synthetic vectors generated with PHP 8.4 password_hash, never account data.
const phpPassword = "uji-kompatibilitas-SIAS";
const phpHashes = {
  bcrypt: "$2y$12$Ju9ee.pGV7IA1LlraulSb.oMzI6iCySISEr.VVGOA7tYalvgEIAxC",
  argon2i: "$argon2i$v=19$m=65536,t=4,p=1$d25MVEhpU2xXLlFmNzVEcA$5LTMXNgva1QzKiwswtPppnwujSFFKl/RdIpkerJvasE",
  argon2id: "$argon2id$v=19$m=65536,t=4,p=1$U01mMzBXcEpkNkpIa3lNeA$UJ+2SbohMwqQUk+EoDL961/G5Cf+Apd69n+Qy9xj534",
};

for (const [algorithm, encoded] of Object.entries(phpHashes)) {
  test(`verifikasi hash PHP ${algorithm} dan penolakan password salah`, async () => {
    assert.equal(await verifyPassword(phpPassword, encoded), true);
    assert.equal(await verifyPassword("password-salah", encoded), false);
  });
}

test("hash baru bcrypt dan awalan 2a/2b kompatibel", async () => {
  const encoded = await hashPassword("password-baru-aman");
  assert.match(encoded, /^\$2b\$12\$/);
  assert.equal(await verifyPassword("password-baru-aman", encoded), true);
  assert.equal(await verifyPassword(phpPassword, phpHashes.bcrypt.replace("$2y$", "$2a$")), true);
});

test("hash rusak dan algoritme asing ditolak tanpa exception", async () => {
  for (const encoded of ["", "password-plaintext", "$2y$broken", "$argon2id$broken", "$scrypt$unsupported"]) {
    assert.equal(await verifyPassword("password", encoded), false);
  }
});

test("password migrasi bcrypt panjang tetap mengikuti semantik PHP 72 byte", async () => {
  const longPassword = "a".repeat(72) + "legacy-suffix";
  const encoded = await hashPassword(longPassword);
  assert.equal(await verifyPassword(longPassword, encoded), true);
  assert.equal(await verifyPassword("a".repeat(72), encoded), true);
});

test("login mempertahankan password persis dan menormalisasi email", () => {
  const value = loginSchema.parse({ email: "DOSEN@UTS.AC.ID", password: " password ", remember: false });
  assert.equal(value.email, "dosen@uts.ac.id");
  assert.equal(value.password, " password ");
  assert.equal(loginSchema.safeParse({ ...value, email: "bukan-email" }).success, false);
  assert.equal(loginSchema.safeParse({ ...value, password: "" }).success, false);
});

test("validasi password baru mencegah pemotongan UTF-8, penggunaan ulang, dan konfirmasi salah", () => {
  const valid = { currentPassword: "password-lama", newPassword: "password-baru", confirmation: "password-baru" };
  assert.equal(passwordSchema.safeParse(valid).success, true);
  assert.equal(passwordSchema.safeParse({ ...valid, newPassword: "pendek" }).success, false);
  assert.equal(passwordSchema.safeParse({ ...valid, confirmation: "berbeda" }).success, false);
  assert.equal(passwordSchema.safeParse({ ...valid, newPassword: valid.currentPassword, confirmation: valid.currentPassword }).success, false);
  const unicode = "🔐".repeat(19);
  assert.equal(passwordSchema.safeParse({ ...valid, newPassword: unicode, confirmation: unicode }).success, false);
});

test("akun nonaktif, terhapus, dan status asing ditolak", () => {
  assert.equal(canAuthenticate(student), true);
  assert.equal(canAuthenticate({ ...student, statusAkun: "nonaktif" }), false);
  assert.equal(canAuthenticate({ ...student, deletedAt: new Date() }), false);
  assert.equal(canAuthenticate({ ...student, statusAkun: "unknown" }), false);
});

test("pending dan ditolak hanya diarahkan ke status akun", () => {
  for (const statusAkun of ["menunggu_persetujuan", "ditolak"]) {
    const pending = { ...student, statusAkun };
    assert.equal(canAuthenticate(pending), true);
    assert.equal(landingPath(pending, "mahasiswa"), "/menunggu-persetujuan");
    assert.equal(canAccessArea(pending, "mahasiswa", "mahasiswa"), false);
  }
});

test("penggantian password wajib memblokir area kerja termasuk superadmin", () => {
  for (const role of ["mahasiswa", "superadmin"] as const) {
    const temporary = { ...student, role, wajibGantiPassword: true };
    assert.equal(landingPath(temporary, role), "/ganti-password");
    assert.equal(canAccessArea(temporary, role, "mahasiswa"), false);
  }
});

test("kaprodi dan sekpro dapat beralih ke dosen tanpa role penugasan buatan", () => {
  assert.deepEqual(availableRoles(leader), ["kaprodi", "dosen"]);
  const secretary = { ...leader, dosen: { ...affiliation(), isKaprodi: false, isSekpro: true } };
  assert.deepEqual(availableRoles(secretary), ["sekpro", "dosen"]);
  assert.equal(landingPath(leader, "kaprodi"), "/dashboard/kaprodi");
  assert.equal(landingPath(leader, "dosen"), "/dashboard/dosen");
  assert.equal(canAccessArea(leader, "dosen", "kaprodi"), false);
  assert.equal(canAccessArea(leader, "kaprodi", "kaprodi"), true);
});

test("dua flag pimpinan dan role historis mempertahankan profil dosen", () => {
  assert.deepEqual(availableRoles({ ...leader, dosen: { ...affiliation(), isKaprodi: true, isSekpro: true } }), ["kaprodi", "sekpro", "dosen"]);
  assert.deepEqual(availableRoles({ ...leader, role: "kaprodi" }), ["kaprodi", "dosen"]);
  assert.deepEqual(availableRoles({ ...leader, role: "sekpro" }), ["sekpro", "dosen"]);
  assert.deepEqual(availableRoles({ ...student, role: "kaprodi" }), ["dosen"]);
  assert.deepEqual(availableRoles({ ...leader, role: "mahasiswa" }), ["mahasiswa"]);
});

test("mahasiswa dan dosen biasa tidak bisa menaikkan peran melalui URL atau sesi", () => {
  assert.equal(canAccessArea(student, "mahasiswa", "kaprodi"), false);
  assert.equal(canAccessArea(student, "superadmin", "superadmin"), false);
  assert.deepEqual(availableRoles({ ...leader, dosen: { ...affiliation(), isKaprodi: false, isSekpro: false } }), ["dosen"]);
  assert.equal(landingPath(student, "kaprodi"), "/dashboard/mahasiswa");
  assert.equal(isRole("pembimbing"), false);
  assert.equal(isRole("penguji"), false);
  assert.equal(isRole("constructor"), false);
});

test("superadmin mengikuti bypass role sumber dan tetap tunduk status akun", () => {
  const admin = { ...student, role: "superadmin" as const };
  assert.equal(canAccessArea(admin, "superadmin", "kaprodi"), true);
  assert.equal(canAccessArea({ ...admin, statusAkun: "nonaktif" }, "superadmin", "kaprodi"), false);
  assert.equal(canAccessArea({ ...admin, deletedAt: new Date() }, "superadmin", "kaprodi"), false);
});

test("role keuangan historis tidak menghapus status nonaktif hasil cleanup", () => {
  const historical = { ...student, role: "admin_keuangan" as const, statusAkun: "nonaktif", deletedAt: new Date() };
  assert.equal(canAuthenticate(historical), false);
  assert.equal(landingPath(historical, "admin_keuangan"), "/login");
});

test("token acak 256 bit, hash satu arah, dan durasi sesi", () => {
  const first = newSessionToken();
  const second = newSessionToken();
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.notEqual(first, second);
  assert.notEqual(tokenHash(first), first);
  assert.equal(tokenHash(first), tokenHash(first));
  const now = new Date("2026-11-07T00:00:00Z");
  assert.equal(sessionExpiry(now, false).getTime() - now.getTime(), IDLE_MILLISECONDS);
  assert.equal(sessionExpiry(now, true).getTime() - now.getTime(), REMEMBER_MILLISECONDS);
  assert.equal(IDLE_MILLISECONDS, 300_000);
  assert.equal(REMEMBER_MILLISECONDS, 604_800_000);
});

test("superadmin dikonfigurasi melalui .env dan divalidasi keamanannya", async () => {
  const { isSuperadminEmail, getSuperadminEnvConfig } = await import("../src/lib/auth/superadmin");
  const prevEmail = process.env.SUPERADMIN_EMAIL;
  const prevPass = process.env.SUPERADMIN_PASSWORD;
  const prevName = process.env.SUPERADMIN_NAME;

  try {
    delete process.env.SUPERADMIN_EMAIL;
    delete process.env.SUPERADMIN_PASSWORD;
    assert.equal(getSuperadminEnvConfig(), null);
    assert.equal(isSuperadminEmail("admin@example.com"), false);

    process.env.SUPERADMIN_EMAIL = "superadmin@uts.ac.id";
    process.env.SUPERADMIN_PASSWORD = "secretpassword123";
    process.env.SUPERADMIN_NAME = "Super Admin Utama";

    const config = getSuperadminEnvConfig();
    assert.ok(config);
    assert.equal(config.nama, "Super Admin Utama");
    assert.equal(config.email, "superadmin@uts.ac.id");
    assert.equal(config.password, "secretpassword123");
    assert.equal(isSuperadminEmail("SUPERADMIN@UTS.AC.ID"), true);
    assert.equal(isSuperadminEmail("other@uts.ac.id"), false);
  } finally {
    if (prevEmail === undefined) delete process.env.SUPERADMIN_EMAIL; else process.env.SUPERADMIN_EMAIL = prevEmail;
    if (prevPass === undefined) delete process.env.SUPERADMIN_PASSWORD; else process.env.SUPERADMIN_PASSWORD = prevPass;
    if (prevName === undefined) delete process.env.SUPERADMIN_NAME; else process.env.SUPERADMIN_NAME = prevName;
  }
});
