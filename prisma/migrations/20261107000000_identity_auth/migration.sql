BEGIN;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- Email uniqueness follows the case-insensitive legacy identity semantics.
CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('mahasiswa', 'dosen', 'kaprodi', 'sekpro', 'admin_keuangan', 'superadmin');

-- CreateEnum
CREATE TYPE "StatusAkun" AS ENUM ('menunggu_persetujuan', 'aktif', 'ditolak', 'nonaktif');

-- CreateTable
CREATE TABLE "pengguna" (
    "id" BIGSERIAL NOT NULL,
    "nama" VARCHAR(255) NOT NULL,
    "email" CITEXT,
    "email_arsip" VARCHAR(255),
    "password" VARCHAR(255) NOT NULL,
    "role" "Role" NOT NULL,
    "status_akun" "StatusAkun" NOT NULL DEFAULT 'menunggu_persetujuan',
    "catatan_penolakan" TEXT,
    "dibuat_oleh_super_admin" BOOLEAN NOT NULL DEFAULT false,
    "wajib_ganti_password" BOOLEAN NOT NULL DEFAULT false,
    "remember_token" VARCHAR(100),
    "auth_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),
    "deleted_at" TIMESTAMP(0),

    CONSTRAINT "pengguna_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mahasiswa" (
    "pengguna_id" BIGINT NOT NULL,
    "nim" VARCHAR(50),
    "nim_arsip" VARCHAR(50),
    "semester" SMALLINT NOT NULL,
    "no_hp" VARCHAR(255),
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "mahasiswa_pkey" PRIMARY KEY ("pengguna_id")
);

-- CreateTable
CREATE TABLE "dosen" (
    "pengguna_id" BIGINT NOT NULL,
    "nidn" VARCHAR(50),
    "nidn_arsip" VARCHAR(50),
    "no_hp" VARCHAR(20),
    "kuota_bimbingan" SMALLINT NOT NULL DEFAULT 8,
    "is_kaprodi" BOOLEAN NOT NULL DEFAULT false,
    "is_sekpro" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "dosen_pkey" PRIMARY KEY ("pengguna_id")
);

-- CreateTable
CREATE TABLE "admin_keuangan" (
    "pengguna_id" BIGINT NOT NULL,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "admin_keuangan_pkey" PRIMARY KEY ("pengguna_id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "token_hash" CHAR(64) NOT NULL,
    "public_id" UUID NOT NULL,
    "pengguna_id" BIGINT NOT NULL,
    "auth_version" INTEGER NOT NULL,
    "active_role" "Role" NOT NULL,
    "remember" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_activity" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("token_hash")
);

-- CreateTable
CREATE TABLE "auth_rate_limits" (
    "key" CHAR(64) NOT NULL,
    "attempts" INTEGER NOT NULL,
    "window_start" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "auth_rate_limits_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "pengguna_email_key" ON "pengguna"("email");

-- CreateIndex
CREATE UNIQUE INDEX "mahasiswa_nim_key" ON "mahasiswa"("nim");

-- CreateIndex
CREATE UNIQUE INDEX "dosen_nidn_key" ON "dosen"("nidn");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_public_id_key" ON "auth_sessions"("public_id");

-- CreateIndex
CREATE INDEX "auth_sessions_pengguna_id_idx" ON "auth_sessions"("pengguna_id");

-- CreateIndex
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions"("expires_at");

-- CreateIndex
CREATE INDEX "auth_rate_limits_window_start_idx" ON "auth_rate_limits"("window_start");

-- AddForeignKey
ALTER TABLE "mahasiswa" ADD CONSTRAINT "mahasiswa_pengguna_id_fkey" FOREIGN KEY ("pengguna_id") REFERENCES "pengguna"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dosen" ADD CONSTRAINT "dosen_pengguna_id_fkey" FOREIGN KEY ("pengguna_id") REFERENCES "pengguna"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_keuangan" ADD CONSTRAINT "admin_keuangan_pengguna_id_fkey" FOREIGN KEY ("pengguna_id") REFERENCES "pengguna"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_pengguna_id_fkey" FOREIGN KEY ("pengguna_id") REFERENCES "pengguna"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve unsigned legacy domains within PostgreSQL's signed bigint range.
ALTER TABLE "pengguna" ADD CONSTRAINT "pengguna_id_unsigned" CHECK ("id" >= 0);
ALTER TABLE "mahasiswa" ADD CONSTRAINT "mahasiswa_semester_unsigned_tinyint" CHECK ("semester" BETWEEN 0 AND 255);
ALTER TABLE "dosen" ADD CONSTRAINT "dosen_kuota_unsigned_tinyint" CHECK ("kuota_bimbingan" BETWEEN 0 AND 255);

COMMIT;
