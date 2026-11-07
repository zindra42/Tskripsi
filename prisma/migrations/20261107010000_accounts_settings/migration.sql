-- TASK-003. Submit through Sokudo's database proposal gate before applying.
BEGIN;

-- CreateTable
CREATE TABLE "bidang_keahlian" (
    "id" BIGSERIAL NOT NULL,
    "nama_bidang" CITEXT NOT NULL,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "bidang_keahlian_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dosen_keahlian" (
    "dosen_id" BIGINT NOT NULL,
    "bidang_id" BIGINT NOT NULL,

    CONSTRAINT "dosen_keahlian_pkey" PRIMARY KEY ("dosen_id","bidang_id")
);

-- CreateTable
CREATE TABLE "pengaturan_sistem" (
    "id" BIGSERIAL NOT NULL,
    "kunci" VARCHAR(255) NOT NULL,
    "nilai" TEXT NOT NULL,
    "keterangan" VARCHAR(255),
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "pengaturan_sistem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_requests" (
    "id" BIGSERIAL NOT NULL,
    "pengguna_id" BIGINT NOT NULL,
    "identitas" VARCHAR(255) NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'menunggu',
    "alasan_penolakan" TEXT,
    "approved_by" BIGINT,
    "approved_at" TIMESTAMP(0),
    "token" VARCHAR(64),
    "token_hash" CHAR(64),
    "auth_version" INTEGER,
    "expires_at" TIMESTAMP(0),
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "password_reset_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "biodata_change_requests" (
    "id" BIGSERIAL NOT NULL,
    "mahasiswa_id" BIGINT NOT NULL,
    "nama_lama" VARCHAR(255),
    "nama_baru" VARCHAR(255),
    "ubah_nama" BOOLEAN NOT NULL DEFAULT false,
    "email_lama" VARCHAR(255),
    "email_baru" VARCHAR(255),
    "ubah_email" BOOLEAN NOT NULL DEFAULT false,
    "nim" VARCHAR(255),
    "nim_lama" VARCHAR(255),
    "nim_baru" VARCHAR(255),
    "ubah_nim" BOOLEAN NOT NULL DEFAULT false,
    "semester_lama" SMALLINT,
    "semester_baru" SMALLINT,
    "ubah_semester" BOOLEAN NOT NULL DEFAULT false,
    "no_hp_lama" VARCHAR(255),
    "no_hp_baru" VARCHAR(255),
    "ubah_no_hp" BOOLEAN NOT NULL DEFAULT false,
    "rincian_data" TEXT,
    "alasan" TEXT NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'pending',
    "catatan_kaprodi" TEXT,
    "diputuskan_oleh" BIGINT,
    "diputuskan_at" TIMESTAMP(0),
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "biodata_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "keahlian_change_requests" (
    "id" BIGSERIAL NOT NULL,
    "dosen_id" BIGINT NOT NULL,
    "nama_lama" VARCHAR(255),
    "nama_baru" VARCHAR(255),
    "ubah_nama" BOOLEAN NOT NULL DEFAULT false,
    "email_lama" VARCHAR(255),
    "email_baru" VARCHAR(255),
    "ubah_email" BOOLEAN NOT NULL DEFAULT false,
    "nidn_lama" VARCHAR(50),
    "nidn_baru" VARCHAR(50),
    "ubah_nidn" BOOLEAN NOT NULL DEFAULT false,
    "no_hp_lama" VARCHAR(20),
    "no_hp_baru" VARCHAR(20),
    "ubah_no_hp" BOOLEAN NOT NULL DEFAULT false,
    "keahlian_lama" JSONB,
    "keahlian_diajukan" JSONB,
    "ubah_keahlian" BOOLEAN NOT NULL DEFAULT false,
    "alasan" TEXT,
    "status" VARCHAR(30) NOT NULL DEFAULT 'pending',
    "catatan_kaprodi" TEXT,
    "diputuskan_oleh" BIGINT,
    "diputuskan_at" TIMESTAMP(0),
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "keahlian_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "log_aktivitas" (
    "id" BIGSERIAL NOT NULL,
    "pengguna_id" BIGINT,
    "aksi" VARCHAR(255) NOT NULL,
    "entitas_terkait" VARCHAR(255) NOT NULL,
    "waktu" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "detail" JSONB,

    CONSTRAINT "log_aktivitas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "log_super_admin" (
    "id" BIGSERIAL NOT NULL,
    "waktu" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aksi" VARCHAR(255) NOT NULL,
    "target_type" VARCHAR(255),
    "target_identifier" VARCHAR(255),
    "target_nama" VARCHAR(255),
    "data_sebelum" JSONB,
    "data_sesudah" JSONB,
    "alasan" TEXT,
    "hasil" VARCHAR(255) NOT NULL DEFAULT 'berhasil',
    "ip_address" VARCHAR(255),
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "log_super_admin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bidang_keahlian_nama_bidang_key" ON "bidang_keahlian"("nama_bidang");

-- CreateIndex
CREATE UNIQUE INDEX "pengaturan_sistem_kunci_key" ON "pengaturan_sistem"("kunci");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_requests_token_key" ON "password_reset_requests"("token");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_requests_token_hash_key" ON "password_reset_requests"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_requests_pengguna_id_status_idx" ON "password_reset_requests"("pengguna_id", "status");

-- CreateIndex
CREATE INDEX "biodata_change_requests_mahasiswa_id_status_idx" ON "biodata_change_requests"("mahasiswa_id", "status");

-- CreateIndex
CREATE INDEX "keahlian_change_requests_dosen_id_status_idx" ON "keahlian_change_requests"("dosen_id", "status");

-- CreateIndex
CREATE INDEX "log_aktivitas_waktu_idx" ON "log_aktivitas"("waktu");

-- AddForeignKey
ALTER TABLE "dosen_keahlian" ADD CONSTRAINT "dosen_keahlian_dosen_id_fkey" FOREIGN KEY ("dosen_id") REFERENCES "dosen"("pengguna_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dosen_keahlian" ADD CONSTRAINT "dosen_keahlian_bidang_id_fkey" FOREIGN KEY ("bidang_id") REFERENCES "bidang_keahlian"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_requests" ADD CONSTRAINT "password_reset_requests_pengguna_id_fkey" FOREIGN KEY ("pengguna_id") REFERENCES "pengguna"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_requests" ADD CONSTRAINT "password_reset_requests_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "pengguna"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "biodata_change_requests" ADD CONSTRAINT "biodata_change_requests_mahasiswa_id_fkey" FOREIGN KEY ("mahasiswa_id") REFERENCES "pengguna"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "biodata_change_requests" ADD CONSTRAINT "biodata_change_requests_diputuskan_oleh_fkey" FOREIGN KEY ("diputuskan_oleh") REFERENCES "pengguna"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "keahlian_change_requests" ADD CONSTRAINT "keahlian_change_requests_dosen_id_fkey" FOREIGN KEY ("dosen_id") REFERENCES "pengguna"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "keahlian_change_requests" ADD CONSTRAINT "keahlian_change_requests_diputuskan_oleh_fkey" FOREIGN KEY ("diputuskan_oleh") REFERENCES "pengguna"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "log_aktivitas" ADD CONSTRAINT "log_aktivitas_pengguna_id_fkey" FOREIGN KEY ("pengguna_id") REFERENCES "pengguna"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
