-- Apply only through an approved Sokudo database proposal after orphan preflight.
BEGIN;

-- AlterTable
ALTER TABLE "pendaftaran_sempro" ADD COLUMN     "siklus_ke" SMALLINT NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "checklist_dokumen" ADD COLUMN     "last_verifier_id" BIGINT,
ADD COLUMN     "last_verifier_role" VARCHAR(30);

-- AlterTable
ALTER TABLE "penugasan_penguji" ADD COLUMN     "alasan_susulan" TEXT,
ADD COLUMN     "catatan_penilaian" TEXT,
ADD COLUMN     "catatan_revisi" TEXT,
ADD COLUMN     "izin_berlaku_sampai" TIMESTAMP(0),
ADD COLUMN     "nilai_alat_bantu" SMALLINT,
ADD COLUMN     "nilai_kelayakan_proposal" SMALLINT,
ADD COLUMN     "nilai_penampilan" SMALLINT,
ADD COLUMN     "nilai_penguasaan_materi" SMALLINT,
ADD COLUMN     "nilai_presentasi" SMALLINT,
ADD COLUMN     "nilai_total" DECIMAL(5,2),
ADD COLUMN     "perlu_revisi" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "status_dinilai" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "status_izin_susulan" VARCHAR(30) NOT NULL DEFAULT 'tidak_ada',
ADD COLUMN     "tanggal_dinilai" TIMESTAMP(0);

-- AlterTable
ALTER TABLE "berita_acara" ADD COLUMN     "alasan_override" TEXT,
ADD COLUMN     "ditetapkan_at" TIMESTAMP(0),
ADD COLUMN     "ditetapkan_oleh_id" BIGINT,
ADD COLUMN     "is_locked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_override_saran" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "jenis" VARCHAR(20) NOT NULL DEFAULT 'sempro',
ADD COLUMN     "nilai_pembimbing" DECIMAL(5,2),
ADD COLUMN     "predikat_huruf" VARCHAR(5),
ADD COLUMN     "saran_hasil" VARCHAR(30),
ADD COLUMN     "snapshot_data" JSONB,
ADD COLUMN     "snapshot_keputusan" JSONB,
ADD COLUMN     "source_hasil" VARCHAR(50),
ADD COLUMN     "source_status_persetujuan" VARCHAR(50),
ADD COLUMN     "transform_provenance" JSONB;

-- CreateTable
CREATE TABLE "pendaftaran_sidang" (
    "id" BIGSERIAL NOT NULL,
    "id_pengajuan" BIGINT NOT NULL,
    "id_dosen_pembimbing_sidang" BIGINT,
    "siklus_ke" SMALLINT NOT NULL DEFAULT 1,
    "ipk" DECIMAL(3,2),
    "file_transkrip" VARCHAR(255),
    "file_naskah" VARCHAR(255),
    "status_draft" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "status_berkas" VARCHAR(30) NOT NULL DEFAULT 'draft',
    "catatan_verifikasi" TEXT,
    "tanggal_daftar" TIMESTAMP(0),
    "tanggal_submit" TIMESTAMP(0),
    "diverifikasi_at" TIMESTAMP(0),
    "diverifikasi_oleh_id" BIGINT,
    "status_fisik" VARCHAR(30),
    "periode_snapshot" VARCHAR(255),
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "pendaftaran_sidang_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pembayaran_sidang" (
    "id" BIGSERIAL NOT NULL,
    "id_pendaftaran_sidang" BIGINT,
    "id_mahasiswa" BIGINT NOT NULL,
    "id_admin_keuangan" BIGINT,
    "siklus_ke" SMALLINT NOT NULL DEFAULT 1,
    "periode" VARCHAR(100),
    "file_kwitansi" VARCHAR(255),
    "file_krs_ska" VARCHAR(255),
    "file_bukti_transfer" VARCHAR(255),
    "tanggal_transfer" DATE,
    "nama_pengirim" VARCHAR(255),
    "pernah_ambil_skripsi_sebelumnya" BOOLEAN NOT NULL DEFAULT false,
    "jumlah_semester_sebelumnya" SMALLINT NOT NULL DEFAULT 0,
    "berkas_semester_sebelumnya" JSONB,
    "status_verifikasi" VARCHAR(30) NOT NULL DEFAULT 'menunggu_verifikasi',
    "catatan_penolakan" TEXT,
    "perlu_verifikasi_ulang" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "pembayaran_sidang_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jadwal_sidang" (
    "id" BIGSERIAL NOT NULL,
    "id_sidang" BIGINT NOT NULL,
    "versi" SMALLINT NOT NULL DEFAULT 1,
    "status" VARCHAR(30) NOT NULL DEFAULT 'draft',
    "tanggal" DATE,
    "waktu_mulai" VARCHAR(10),
    "waktu_selesai" VARCHAR(10),
    "ruang" VARCHAR(255) NOT NULL DEFAULT 'Ruang Seminar FRS',
    "diterbitkan_at" TIMESTAMP(0),
    "revisi_undangan" SMALLINT NOT NULL DEFAULT 0,
    "status_konfirmasi_dosen" VARCHAR(30) NOT NULL DEFAULT 'menunggu',
    "status_pelaksanaan" VARCHAR(30) NOT NULL DEFAULT 'terjadwal',
    "penguji_dikonfirmasi_ulang" BOOLEAN NOT NULL DEFAULT false,
    "dewan_snapshot" JSONB,
    "periode_snapshot" VARCHAR(255),
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "jadwal_sidang_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "konfirmasi_jadwal_sidang" (
    "id" BIGSERIAL NOT NULL,
    "jadwal_sidang_id" BIGINT NOT NULL,
    "versi" SMALLINT NOT NULL DEFAULT 1,
    "dosen_id" BIGINT NOT NULL,
    "peran" VARCHAR(30) NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'menunggu',
    "tipe_penolakan" VARCHAR(30),
    "id_dosen_pengganti_usulan" BIGINT,
    "usulan_tanggal" DATE,
    "usulan_waktu_mulai" VARCHAR(10),
    "usulan_waktu_selesai" VARCHAR(10),
    "slot_usulan" JSONB,
    "catatan" TEXT,
    "ditetapkan_kaprodi" BOOLEAN NOT NULL DEFAULT false,
    "responded_at" TIMESTAMP(0),
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "konfirmasi_jadwal_sidang_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "riwayat_jadwal_sidang" (
    "id" BIGSERIAL NOT NULL,
    "jadwal_sidang_id" BIGINT NOT NULL,
    "versi" INTEGER NOT NULL,
    "tanggal" DATE,
    "jam_mulai" VARCHAR(10),
    "jam_selesai" VARCHAR(10),
    "ruang" VARCHAR(255),
    "alasan_perubahan" TEXT,
    "diubah_oleh" BIGINT,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "riwayat_jadwal_sidang_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permohonan_sidang" (
    "id" BIGSERIAL NOT NULL,
    "jadwal_sidang_id" BIGINT NOT NULL,
    "konfirmasi_id" BIGINT,
    "versi_jadwal" INTEGER NOT NULL DEFAULT 1,
    "jenis" VARCHAR(30) NOT NULL,
    "pemohon_tipe" VARCHAR(20) NOT NULL,
    "pemohon_user_id" BIGINT NOT NULL,
    "alasan" TEXT NOT NULL,
    "dosen_pengganti_id" BIGINT,
    "slot_usulan" JSONB,
    "status" VARCHAR(30) NOT NULL DEFAULT 'menunggu',
    "aktif_key" VARCHAR(100),
    "keputusan_oleh" BIGINT,
    "alasan_keputusan" TEXT,
    "diputuskan_at" TIMESTAMP(0),
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "permohonan_sidang_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rubrik_penilaian" (
    "id" BIGSERIAL NOT NULL,
    "jenis" VARCHAR(30) NOT NULL DEFAULT 'sidang',
    "kode" VARCHAR(10) NOT NULL,
    "komponen" VARCHAR(255) NOT NULL,
    "bobot" SMALLINT NOT NULL,
    "keterangan" TEXT,
    "urutan" SMALLINT NOT NULL DEFAULT 1,
    "is_aktif" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "rubrik_penilaian_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "penilaian_sidang" (
    "id" BIGSERIAL NOT NULL,
    "id_jadwal_sidang" BIGINT NOT NULL,
    "penilai_id" BIGINT NOT NULL,
    "peran" VARCHAR(30) NOT NULL,
    "nilai_komponen" JSONB,
    "nilai_akhir" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "perlu_revisi" BOOLEAN NOT NULL DEFAULT false,
    "catatan_revisi" TEXT,
    "catatan_umum" TEXT,
    "status" VARCHAR(30) NOT NULL DEFAULT 'draft',
    "disimpan_at" TIMESTAMP(0),
    "izin_susulan" BOOLEAN NOT NULL DEFAULT false,
    "izin_berlaku_sampai" TIMESTAMP(0),
    "diizinkan_oleh_id" BIGINT,
    "rubrik_snapshot" JSONB,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "penilaian_sidang_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pengumuman" (
    "id" BIGSERIAL NOT NULL,
    "judul" VARCHAR(150) NOT NULL,
    "isi" TEXT NOT NULL,
    "lampiran_path" VARCHAR(500),
    "lampiran_nama" VARCHAR(255),
    "kategori" VARCHAR(20) NOT NULL DEFAULT 'umum',
    "target_peran" JSONB NOT NULL,
    "is_publik" BOOLEAN NOT NULL DEFAULT false,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "disematkan" BOOLEAN NOT NULL DEFAULT false,
    "tampil_mulai" TIMESTAMP(0),
    "tampil_selesai" TIMESTAMP(0),
    "dibuat_oleh" BIGINT,
    "diubah_oleh" BIGINT,
    "terbit_at" TIMESTAMP(0),
    "notifikasi_dikirim_at" TIMESTAMP(0),
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),
    "deleted_at" TIMESTAMP(0),

    CONSTRAINT "pengumuman_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pengumuman_dibaca" (
    "id" BIGSERIAL NOT NULL,
    "pengumuman_id" BIGINT NOT NULL,
    "pengguna_id" BIGINT NOT NULL,
    "dibaca_at" TIMESTAMP(0) NOT NULL,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "pengumuman_dibaca_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pendaftaran_sidang_id_pengajuan_siklus_ke_idx" ON "pendaftaran_sidang"("id_pengajuan", "siklus_ke");

-- CreateIndex
CREATE INDEX "pendaftaran_sidang_status_berkas_idx" ON "pendaftaran_sidang"("status_berkas");

-- CreateIndex
CREATE INDEX "pembayaran_sidang_id_mahasiswa_siklus_ke_idx" ON "pembayaran_sidang"("id_mahasiswa", "siklus_ke");

-- CreateIndex
CREATE INDEX "jadwal_sidang_id_sidang_status_idx" ON "jadwal_sidang"("id_sidang", "status");

-- CreateIndex
CREATE INDEX "jadwal_sidang_tanggal_ruang_idx" ON "jadwal_sidang"("tanggal", "ruang");

-- CreateIndex
CREATE INDEX "konfirmasi_jadwal_sidang_jadwal_sidang_id_versi_dosen_id_idx" ON "konfirmasi_jadwal_sidang"("jadwal_sidang_id", "versi", "dosen_id");

-- CreateIndex
CREATE INDEX "riwayat_jadwal_sidang_jadwal_sidang_id_versi_idx" ON "riwayat_jadwal_sidang"("jadwal_sidang_id", "versi");

-- CreateIndex
CREATE UNIQUE INDEX "permohonan_sidang_aktif_key_key" ON "permohonan_sidang"("aktif_key");

-- CreateIndex
CREATE INDEX "permohonan_sidang_jadwal_sidang_id_versi_jadwal_idx" ON "permohonan_sidang"("jadwal_sidang_id", "versi_jadwal");

-- CreateIndex
CREATE INDEX "rubrik_penilaian_jenis_is_aktif_idx" ON "rubrik_penilaian"("jenis", "is_aktif");

-- CreateIndex
CREATE UNIQUE INDEX "penilaian_sidang_id_jadwal_sidang_penilai_id_key" ON "penilaian_sidang"("id_jadwal_sidang", "penilai_id");

-- CreateIndex
CREATE INDEX "pengumuman_status_tampil_mulai_tampil_selesai_idx" ON "pengumuman"("status", "tampil_mulai", "tampil_selesai");

-- CreateIndex
CREATE UNIQUE INDEX "pengumuman_dibaca_pengumuman_id_pengguna_id_key" ON "pengumuman_dibaca"("pengumuman_id", "pengguna_id");

-- CreateIndex
CREATE INDEX "checklist_dokumen_id_sidang_daftar_nomor_item_idx" ON "checklist_dokumen"("id_sidang_daftar", "nomor_item");

-- CreateIndex
CREATE INDEX "penugasan_penguji_id_sidang_daftar_nomor_penguji_idx" ON "penugasan_penguji"("id_sidang_daftar", "nomor_penguji");

-- AddForeignKey
ALTER TABLE "dokumen_verifikasi" ADD CONSTRAINT "dokumen_verifikasi_id_sidang_fkey" FOREIGN KEY ("id_sidang") REFERENCES "pendaftaran_sidang"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dokumen_verifikasi" ADD CONSTRAINT "dokumen_verifikasi_id_jadwal_sidang_fkey" FOREIGN KEY ("id_jadwal_sidang") REFERENCES "jadwal_sidang"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_dokumen" ADD CONSTRAINT "checklist_dokumen_id_sidang_daftar_fkey" FOREIGN KEY ("id_sidang_daftar") REFERENCES "pendaftaran_sidang"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "penugasan_penguji" ADD CONSTRAINT "penugasan_penguji_id_sidang_daftar_fkey" FOREIGN KEY ("id_sidang_daftar") REFERENCES "pendaftaran_sidang"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "berita_acara" ADD CONSTRAINT "berita_acara_id_jadwal_sidang_fkey" FOREIGN KEY ("id_jadwal_sidang") REFERENCES "jadwal_sidang"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pendaftaran_sidang" ADD CONSTRAINT "pendaftaran_sidang_id_pengajuan_fkey" FOREIGN KEY ("id_pengajuan") REFERENCES "pengajuan_judul"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pendaftaran_sidang" ADD CONSTRAINT "pendaftaran_sidang_id_dosen_pembimbing_sidang_fkey" FOREIGN KEY ("id_dosen_pembimbing_sidang") REFERENCES "pengguna"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pendaftaran_sidang" ADD CONSTRAINT "pendaftaran_sidang_diverifikasi_oleh_id_fkey" FOREIGN KEY ("diverifikasi_oleh_id") REFERENCES "pengguna"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pembayaran_sidang" ADD CONSTRAINT "pembayaran_sidang_id_pendaftaran_sidang_fkey" FOREIGN KEY ("id_pendaftaran_sidang") REFERENCES "pendaftaran_sidang"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pembayaran_sidang" ADD CONSTRAINT "pembayaran_sidang_id_mahasiswa_fkey" FOREIGN KEY ("id_mahasiswa") REFERENCES "pengguna"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pembayaran_sidang" ADD CONSTRAINT "pembayaran_sidang_id_admin_keuangan_fkey" FOREIGN KEY ("id_admin_keuangan") REFERENCES "pengguna"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jadwal_sidang" ADD CONSTRAINT "jadwal_sidang_id_sidang_fkey" FOREIGN KEY ("id_sidang") REFERENCES "pendaftaran_sidang"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "konfirmasi_jadwal_sidang" ADD CONSTRAINT "konfirmasi_jadwal_sidang_jadwal_sidang_id_fkey" FOREIGN KEY ("jadwal_sidang_id") REFERENCES "jadwal_sidang"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "konfirmasi_jadwal_sidang" ADD CONSTRAINT "konfirmasi_jadwal_sidang_dosen_id_fkey" FOREIGN KEY ("dosen_id") REFERENCES "pengguna"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "riwayat_jadwal_sidang" ADD CONSTRAINT "riwayat_jadwal_sidang_jadwal_sidang_id_fkey" FOREIGN KEY ("jadwal_sidang_id") REFERENCES "jadwal_sidang"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permohonan_sidang" ADD CONSTRAINT "permohonan_sidang_jadwal_sidang_id_fkey" FOREIGN KEY ("jadwal_sidang_id") REFERENCES "jadwal_sidang"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permohonan_sidang" ADD CONSTRAINT "permohonan_sidang_konfirmasi_id_fkey" FOREIGN KEY ("konfirmasi_id") REFERENCES "konfirmasi_jadwal_sidang"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "penilaian_sidang" ADD CONSTRAINT "penilaian_sidang_id_jadwal_sidang_fkey" FOREIGN KEY ("id_jadwal_sidang") REFERENCES "jadwal_sidang"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "penilaian_sidang" ADD CONSTRAINT "penilaian_sidang_penilai_id_fkey" FOREIGN KEY ("penilai_id") REFERENCES "pengguna"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pengumuman_dibaca" ADD CONSTRAINT "pengumuman_dibaca_pengumuman_id_fkey" FOREIGN KEY ("pengumuman_id") REFERENCES "pengumuman"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pengumuman_dibaca" ADD CONSTRAINT "pengumuman_dibaca_pengguna_id_fkey" FOREIGN KEY ("pengguna_id") REFERENCES "pengguna"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
