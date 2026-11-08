BEGIN;
-- AlterTable
ALTER TABLE "dokumen_verifikasi" ALTER COLUMN "nama_penandatangan" DROP NOT NULL;

-- AlterTable
ALTER TABLE "jadwal_sempro" ADD COLUMN     "alasan_perubahan_pembimbing_1" TEXT,
ADD COLUMN     "alasan_perubahan_pembimbing_2" TEXT,
ADD COLUMN     "alasan_perubahan_penguji" TEXT,
ADD COLUMN     "status_konfirmasi_pembimbing_1" VARCHAR(50),
ADD COLUMN     "status_konfirmasi_pembimbing_2" VARCHAR(50),
ADD COLUMN     "status_konfirmasi_penguji" VARCHAR(50);

-- AlterTable
ALTER TABLE "berita_acara" ADD COLUMN     "alasan_susulan_pembimbing" TEXT,
ADD COLUMN     "catatan_keputusan_kaprodi" TEXT,
ADD COLUMN     "catatan_revisi_pembimbing" TEXT,
ADD COLUMN     "izin_pembimbing_berlaku_sampai" TIMESTAMP(0),
ADD COLUMN     "pembimbing_perlu_revisi" BOOLEAN,
ADD COLUMN     "status_izin_susulan_pembimbing" VARCHAR(30);

-- CreateTable
CREATE TABLE "permohonan_sempro" (
    "id" BIGSERIAL NOT NULL,
    "jadwal_sempro_id" BIGINT NOT NULL,
    "konfirmasi_id" BIGINT,
    "versi_jadwal" INTEGER NOT NULL,
    "jenis" VARCHAR(30) NOT NULL,
    "pemohon_tipe" VARCHAR(20) NOT NULL,
    "pemohon_user_id" BIGINT NOT NULL,
    "alasan" TEXT NOT NULL,
    "dosen_pengganti_id" BIGINT,
    "slot_usulan" JSONB,
    "status" VARCHAR(30) NOT NULL,
    "aktif_key" VARCHAR(50),
    "keputusan_oleh" BIGINT,
    "alasan_keputusan" TEXT,
    "diputuskan_at" TIMESTAMP(0),
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "permohonan_sempro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legacy_import_runs" (
    "binding" CHAR(64) NOT NULL,
    "snapshot_id" VARCHAR(100) NOT NULL,
    "snapshot_checksum" CHAR(64) NOT NULL,
    "mapping_version" VARCHAR(100) NOT NULL,

    CONSTRAINT "legacy_import_runs_pkey" PRIMARY KEY ("binding")
);

-- CreateTable
CREATE TABLE "legacy_import_checkpoints" (
    "binding" CHAR(64) NOT NULL,
    "stage" VARCHAR(100) NOT NULL,
    "checksum" CHAR(64) NOT NULL,

    CONSTRAINT "legacy_import_checkpoints_pkey" PRIMARY KEY ("binding","stage")
);

-- CreateTable
CREATE TABLE "legacy_import_rows" (
    "source_table" VARCHAR(100) NOT NULL,
    "source_pk" VARCHAR(500) NOT NULL,
    "binding" CHAR(64) NOT NULL,
    "source_json" JSONB NOT NULL,
    "source_checksum" CHAR(64) NOT NULL,
    "provenance" JSONB NOT NULL,

    CONSTRAINT "legacy_import_rows_pkey" PRIMARY KEY ("source_table","source_pk")
);

-- CreateTable
CREATE TABLE "legacy_import_files" (
    "id" CHAR(64) NOT NULL,
    "binding" CHAR(64) NOT NULL,
    "disk" VARCHAR(7) NOT NULL,
    "path" VARCHAR(1000) NOT NULL,
    "descriptor" JSONB NOT NULL,

    CONSTRAINT "legacy_import_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "permohonan_sempro_aktif_key_key" ON "permohonan_sempro"("aktif_key");

-- CreateIndex
CREATE UNIQUE INDEX "legacy_import_runs_snapshot_id_key" ON "legacy_import_runs"("snapshot_id");

-- CreateIndex
CREATE INDEX "legacy_import_rows_binding_idx" ON "legacy_import_rows"("binding");

-- CreateIndex
CREATE INDEX "legacy_import_files_path_idx" ON "legacy_import_files"("path");

-- AddForeignKey
ALTER TABLE "permohonan_sempro" ADD CONSTRAINT "permohonan_sempro_jadwal_sempro_id_fkey" FOREIGN KEY ("jadwal_sempro_id") REFERENCES "jadwal_sempro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permohonan_sempro" ADD CONSTRAINT "permohonan_sempro_konfirmasi_id_fkey" FOREIGN KEY ("konfirmasi_id") REFERENCES "konfirmasi_jadwal_sempro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permohonan_sempro" ADD CONSTRAINT "permohonan_sempro_pemohon_user_id_fkey" FOREIGN KEY ("pemohon_user_id") REFERENCES "pengguna"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permohonan_sempro" ADD CONSTRAINT "permohonan_sempro_dosen_pengganti_id_fkey" FOREIGN KEY ("dosen_pengganti_id") REFERENCES "pengguna"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permohonan_sempro" ADD CONSTRAINT "permohonan_sempro_keputusan_oleh_fkey" FOREIGN KEY ("keputusan_oleh") REFERENCES "pengguna"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
