BEGIN;

-- AlterTable
ALTER TABLE "log_aktivitas" ADD COLUMN     "alasan_pembatalan" TEXT,
ADD COLUMN     "data" JSONB,
ADD COLUMN     "dibatalkan_at" TIMESTAMP(0),
ADD COLUMN     "dibatalkan_oleh_id" BIGINT,
ADD COLUMN     "pelaku_asli_id" BIGINT,
ADD COLUMN     "status" VARCHAR(30) NOT NULL DEFAULT 'aktif';

-- CreateTable
CREATE TABLE "verifikasi_pembayaran" (
    "id" BIGSERIAL NOT NULL,
    "id_mahasiswa" BIGINT NOT NULL,
    "id_admin_keuangan" BIGINT,
    "file_kwitansi" VARCHAR(255),
    "file_krs_ska" VARCHAR(255),
    "file_bukti_transfer" VARCHAR(255),
    "tanggal_transfer" DATE,
    "nama_pengirim" VARCHAR(255),
    "status_verifikasi" VARCHAR(30) NOT NULL DEFAULT 'menunggu_verifikasi',
    "catatan_penolakan" TEXT,
    "perlu_verifikasi_ulang" BOOLEAN NOT NULL DEFAULT false,
    "periode" VARCHAR(100),
    "siklus_ke" SMALLINT NOT NULL DEFAULT 1,
    "snapshot_version" VARCHAR(80),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "verifikasi_pembayaran_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pengajuan_judul" (
    "id" BIGSERIAL NOT NULL,
    "id_mahasiswa" BIGINT NOT NULL,
    "bidang_keahlian_id" BIGINT,
    "bidang_keahlian_2_id" BIGINT,
    "judul" VARCHAR(255) NOT NULL,
    "file_proposal" VARCHAR(255) NOT NULL,
    "matriks_penelitian" JSONB,
    "status" VARCHAR(30) NOT NULL DEFAULT 'diajukan',
    "status_draft" VARCHAR(30) NOT NULL DEFAULT 'draft',
    "draft_data" JSONB,
    "counter_pengajuan" INTEGER NOT NULL DEFAULT 0,
    "catatan_kaprodi" TEXT,
    "preferensi_dosen_ids" JSONB,
    "skor_kemiripan" INTEGER,
    "judul_termirip" TEXT,
    "penulis_termirip" VARCHAR(255),
    "nim_termirip" VARCHAR(50),
    "tahun_termirip" INTEGER,
    "top_kemiripan" JSONB,
    "tanggal_pengajuan" TIMESTAMP(0),
    "tanggal_persetujuan" TIMESTAMP(0),
    "last_verifier_id" BIGINT,
    "last_verifier_role" VARCHAR(30),
    "semester_saat_pengajuan" SMALLINT,
    "periode_akademik_saat_pengajuan" VARCHAR(255),
    "siklus_ke" SMALLINT NOT NULL DEFAULT 1,
    "snapshot_version" VARCHAR(80),
    "is_diarsipkan" BOOLEAN NOT NULL DEFAULT false,
    "diarsipkan_at" TIMESTAMP(0),
    "diarsipkan_oleh_id" BIGINT,
    "alasan_arsip" TEXT,
    "deleted_at" TIMESTAMP(0),
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "pengajuan_judul_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bimbingan" (
    "id" BIGSERIAL NOT NULL,
    "id_pengajuan" BIGINT NOT NULL,
    "id_dosen_pembimbing" BIGINT,
    "id_dosen_pembimbing_2" BIGINT,
    "tanggal_penetapan" DATE NOT NULL,
    "catatan_permintaan_mhs" TEXT,
    "pembatalan_p1" JSONB,
    "pembatalan_p2" JSONB,
    "siklus_ke" SMALLINT NOT NULL DEFAULT 1,
    "fase_skripsi_at" TIMESTAMP(0),
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "bimbingan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logbook_bimbingan" (
    "id" BIGSERIAL NOT NULL,
    "id_bimbingan" BIGINT NOT NULL,
    "id_dosen" BIGINT,
    "fase" VARCHAR(20) NOT NULL DEFAULT 'sempro',
    "siklus_ke" SMALLINT NOT NULL DEFAULT 1,
    "tanggal" DATE NOT NULL,
    "catatan" TEXT NOT NULL,
    "catatan_mahasiswa" TEXT,
    "status_selesai" BOOLEAN NOT NULL DEFAULT false,
    "is_dibatalkan" BOOLEAN NOT NULL DEFAULT false,
    "dibatalkan_at" TIMESTAMP(0),
    "dibatalkan_oleh_id" BIGINT,
    "alasan_pembatalan" TEXT,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "logbook_bimbingan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pengajuan_perubahan_judul" (
    "id" BIGSERIAL NOT NULL,
    "bimbingan_id" BIGINT NOT NULL,
    "judul_lama" TEXT NOT NULL,
    "judul_baru" TEXT NOT NULL,
    "alasan" TEXT NOT NULL,
    "matriks_lama" JSONB,
    "matriks_baru" JSONB,
    "bidang_keahlian_id_baru" BIGINT,
    "bidang_keahlian_2_id_baru" BIGINT,
    "jenis_perubahan" VARCHAR(30) NOT NULL DEFAULT 'revisi_minor',
    "status" VARCHAR(30) NOT NULL DEFAULT 'menunggu_dospem',
    "catatan_dospem" TEXT,
    "catatan_internal_dospem" TEXT,
    "catatan_kaprodi" TEXT,
    "konfirmasi_dospem_1_at" TIMESTAMP(0),
    "konfirmasi_dospem_2_at" TIMESTAMP(0),
    "disetujui_dospem_1" BOOLEAN,
    "disetujui_dospem_2" BOOLEAN,
    "skor_kemiripan" INTEGER,
    "penyetuju_id" BIGINT,
    "penyetuju_role" VARCHAR(30),
    "keputusan_at" TIMESTAMP(0),
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "pengajuan_perubahan_judul_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jadwal_bimbingan" (
    "id" BIGSERIAL NOT NULL,
    "dosen_id" BIGINT NOT NULL,
    "mahasiswa_id" BIGINT NOT NULL,
    "bimbingan_id" BIGINT,
    "waktu_mulai" TIMESTAMP(0) NOT NULL,
    "waktu_selesai" TIMESTAMP(0) NOT NULL,
    "lokasi" VARCHAR(255) NOT NULL,
    "catatan" TEXT,
    "alasan_reschedule" TEXT,
    "usulan_waktu_reschedule" TIMESTAMP(0),
    "status" VARCHAR(30) NOT NULL DEFAULT 'diajukan',
    "deleted_at" TIMESTAMP(0),
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "jadwal_bimbingan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arsip_judul_skripsi" (
    "id" BIGSERIAL NOT NULL,
    "judul" TEXT NOT NULL,
    "nama_penulis" VARCHAR(255),
    "nim" VARCHAR(50),
    "tahun" VARCHAR(10),
    "prodi" VARCHAR(100),
    "keywords" JSONB,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "arsip_judul_skripsi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dokumen_verifikasi" (
    "id" BIGSERIAL NOT NULL,
    "jenis_dokumen" VARCHAR(50) NOT NULL,
    "token" VARCHAR(64) NOT NULL,
    "id_pengajuan" BIGINT,
    "id_bimbingan" BIGINT,
    "id_sempro" BIGINT,
    "id_jadwal" BIGINT,
    "id_sidang" BIGINT,
    "id_jadwal_sidang" BIGINT,
    "penandatangan_user_id" BIGINT,
    "nama_penandatangan" VARCHAR(255) NOT NULL,
    "jabatan_snapshot" VARCHAR(255),
    "peran" VARCHAR(50),
    "nomor_surat" VARCHAR(255),
    "status" VARCHAR(30) NOT NULL DEFAULT 'sah',
    "versi" INTEGER NOT NULL DEFAULT 1,
    "digantikan_oleh_id" BIGINT,
    "snapshot_json" JSONB,
    "hash_sha256" CHAR(64),
    "diterbitkan_at" TIMESTAMP(0),
    "dicabut_at" TIMESTAMP(0),
    "alasan_pencabutan" TEXT,
    "dicabut_oleh_id" BIGINT,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "dokumen_verifikasi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifikasi" (
    "id" BIGSERIAL NOT NULL,
    "pengguna_id" BIGINT NOT NULL,
    "jenis_event" VARCHAR(255) NOT NULL,
    "kanal" VARCHAR(30) NOT NULL,
    "status_kirim" VARCHAR(30) NOT NULL DEFAULT 'pending',
    "waktu_kirim" TIMESTAMP(0),
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "notifikasi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "type" VARCHAR(255) NOT NULL,
    "notifiable_type" VARCHAR(255) NOT NULL,
    "notifiable_id" BIGINT NOT NULL,
    "data" TEXT NOT NULL,
    "read_at" TIMESTAMP(0),
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_receipts" (
    "key" UUID NOT NULL,
    "actor_id" BIGINT NOT NULL,
    "command" VARCHAR(80) NOT NULL,
    "fingerprint" CHAR(64) NOT NULL,
    "result" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "academic_receipts_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "verifikasi_pembayaran_id_mahasiswa_status_verifikasi_idx" ON "verifikasi_pembayaran"("id_mahasiswa", "status_verifikasi");

-- CreateIndex
CREATE INDEX "pengajuan_judul_id_mahasiswa_is_diarsipkan_deleted_at_idx" ON "pengajuan_judul"("id_mahasiswa", "is_diarsipkan", "deleted_at");

-- CreateIndex
CREATE INDEX "pengajuan_judul_status_status_draft_idx" ON "pengajuan_judul"("status", "status_draft");

-- CreateIndex
CREATE UNIQUE INDEX "bimbingan_id_pengajuan_key" ON "bimbingan"("id_pengajuan");

-- CreateIndex
CREATE INDEX "bimbingan_id_dosen_pembimbing_idx" ON "bimbingan"("id_dosen_pembimbing");

-- CreateIndex
CREATE INDEX "bimbingan_id_dosen_pembimbing_2_idx" ON "bimbingan"("id_dosen_pembimbing_2");

-- CreateIndex
CREATE INDEX "logbook_bimbingan_id_bimbingan_fase_siklus_ke_idx" ON "logbook_bimbingan"("id_bimbingan", "fase", "siklus_ke");

-- CreateIndex
CREATE INDEX "pengajuan_perubahan_judul_bimbingan_id_status_idx" ON "pengajuan_perubahan_judul"("bimbingan_id", "status");

-- CreateIndex
CREATE INDEX "jadwal_bimbingan_mahasiswa_id_waktu_mulai_idx" ON "jadwal_bimbingan"("mahasiswa_id", "waktu_mulai");

-- CreateIndex
CREATE INDEX "jadwal_bimbingan_dosen_id_waktu_mulai_idx" ON "jadwal_bimbingan"("dosen_id", "waktu_mulai");

-- CreateIndex
CREATE INDEX "arsip_judul_skripsi_tahun_idx" ON "arsip_judul_skripsi"("tahun");

-- CreateIndex
CREATE INDEX "arsip_judul_skripsi_prodi_idx" ON "arsip_judul_skripsi"("prodi");

-- CreateIndex
CREATE UNIQUE INDEX "dokumen_verifikasi_token_key" ON "dokumen_verifikasi"("token");

-- CreateIndex
CREATE INDEX "dokumen_verifikasi_id_bimbingan_jenis_dokumen_status_idx" ON "dokumen_verifikasi"("id_bimbingan", "jenis_dokumen", "status");

-- CreateIndex
CREATE INDEX "notifications_notifiable_type_notifiable_id_idx" ON "notifications"("notifiable_type", "notifiable_id");

-- AddForeignKey
ALTER TABLE "log_aktivitas" ADD CONSTRAINT "log_aktivitas_dibatalkan_oleh_id_fkey" FOREIGN KEY ("dibatalkan_oleh_id") REFERENCES "pengguna"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "log_aktivitas" ADD CONSTRAINT "log_aktivitas_pelaku_asli_id_fkey" FOREIGN KEY ("pelaku_asli_id") REFERENCES "pengguna"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verifikasi_pembayaran" ADD CONSTRAINT "verifikasi_pembayaran_id_mahasiswa_fkey" FOREIGN KEY ("id_mahasiswa") REFERENCES "pengguna"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verifikasi_pembayaran" ADD CONSTRAINT "verifikasi_pembayaran_id_admin_keuangan_fkey" FOREIGN KEY ("id_admin_keuangan") REFERENCES "pengguna"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pengajuan_judul" ADD CONSTRAINT "pengajuan_judul_id_mahasiswa_fkey" FOREIGN KEY ("id_mahasiswa") REFERENCES "pengguna"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pengajuan_judul" ADD CONSTRAINT "pengajuan_judul_last_verifier_id_fkey" FOREIGN KEY ("last_verifier_id") REFERENCES "pengguna"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pengajuan_judul" ADD CONSTRAINT "pengajuan_judul_diarsipkan_oleh_id_fkey" FOREIGN KEY ("diarsipkan_oleh_id") REFERENCES "pengguna"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pengajuan_judul" ADD CONSTRAINT "pengajuan_judul_bidang_keahlian_id_fkey" FOREIGN KEY ("bidang_keahlian_id") REFERENCES "bidang_keahlian"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pengajuan_judul" ADD CONSTRAINT "pengajuan_judul_bidang_keahlian_2_id_fkey" FOREIGN KEY ("bidang_keahlian_2_id") REFERENCES "bidang_keahlian"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bimbingan" ADD CONSTRAINT "bimbingan_id_pengajuan_fkey" FOREIGN KEY ("id_pengajuan") REFERENCES "pengajuan_judul"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bimbingan" ADD CONSTRAINT "bimbingan_id_dosen_pembimbing_fkey" FOREIGN KEY ("id_dosen_pembimbing") REFERENCES "pengguna"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bimbingan" ADD CONSTRAINT "bimbingan_id_dosen_pembimbing_2_fkey" FOREIGN KEY ("id_dosen_pembimbing_2") REFERENCES "pengguna"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logbook_bimbingan" ADD CONSTRAINT "logbook_bimbingan_id_bimbingan_fkey" FOREIGN KEY ("id_bimbingan") REFERENCES "bimbingan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logbook_bimbingan" ADD CONSTRAINT "logbook_bimbingan_id_dosen_fkey" FOREIGN KEY ("id_dosen") REFERENCES "pengguna"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logbook_bimbingan" ADD CONSTRAINT "logbook_bimbingan_dibatalkan_oleh_id_fkey" FOREIGN KEY ("dibatalkan_oleh_id") REFERENCES "pengguna"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pengajuan_perubahan_judul" ADD CONSTRAINT "pengajuan_perubahan_judul_bimbingan_id_fkey" FOREIGN KEY ("bimbingan_id") REFERENCES "bimbingan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pengajuan_perubahan_judul" ADD CONSTRAINT "pengajuan_perubahan_judul_penyetuju_id_fkey" FOREIGN KEY ("penyetuju_id") REFERENCES "pengguna"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pengajuan_perubahan_judul" ADD CONSTRAINT "pengajuan_perubahan_judul_bidang_keahlian_id_baru_fkey" FOREIGN KEY ("bidang_keahlian_id_baru") REFERENCES "bidang_keahlian"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pengajuan_perubahan_judul" ADD CONSTRAINT "pengajuan_perubahan_judul_bidang_keahlian_2_id_baru_fkey" FOREIGN KEY ("bidang_keahlian_2_id_baru") REFERENCES "bidang_keahlian"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jadwal_bimbingan" ADD CONSTRAINT "jadwal_bimbingan_dosen_id_fkey" FOREIGN KEY ("dosen_id") REFERENCES "pengguna"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jadwal_bimbingan" ADD CONSTRAINT "jadwal_bimbingan_mahasiswa_id_fkey" FOREIGN KEY ("mahasiswa_id") REFERENCES "pengguna"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jadwal_bimbingan" ADD CONSTRAINT "jadwal_bimbingan_bimbingan_id_fkey" FOREIGN KEY ("bimbingan_id") REFERENCES "bimbingan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dokumen_verifikasi" ADD CONSTRAINT "dokumen_verifikasi_id_pengajuan_fkey" FOREIGN KEY ("id_pengajuan") REFERENCES "pengajuan_judul"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dokumen_verifikasi" ADD CONSTRAINT "dokumen_verifikasi_id_bimbingan_fkey" FOREIGN KEY ("id_bimbingan") REFERENCES "bimbingan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dokumen_verifikasi" ADD CONSTRAINT "dokumen_verifikasi_penandatangan_user_id_fkey" FOREIGN KEY ("penandatangan_user_id") REFERENCES "pengguna"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dokumen_verifikasi" ADD CONSTRAINT "dokumen_verifikasi_dicabut_oleh_id_fkey" FOREIGN KEY ("dicabut_oleh_id") REFERENCES "pengguna"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dokumen_verifikasi" ADD CONSTRAINT "dokumen_verifikasi_digantikan_oleh_id_fkey" FOREIGN KEY ("digantikan_oleh_id") REFERENCES "dokumen_verifikasi"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifikasi" ADD CONSTRAINT "notifikasi_pengguna_id_fkey" FOREIGN KEY ("pengguna_id") REFERENCES "pengguna"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
