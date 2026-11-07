BEGIN;

-- 1. CreateTable: pendaftaran_sempro
CREATE TABLE "pendaftaran_sempro" (
    "id" BIGSERIAL NOT NULL,
    "id_pengajuan" BIGINT NOT NULL,
    "id_dosen_pembimbing_sempro" BIGINT,
    "id_acc" BIGINT,
    "status_draft" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "status_berkas" VARCHAR(30) NOT NULL DEFAULT 'draft',
    "catatan_verifikasi" TEXT,
    "n_final" INTEGER,
    "syarat_final" INTEGER,
    "terkumpul_final" INTEGER,
    "status_final" VARCHAR(50),
    "dikunci_pada" TIMESTAMP(0),
    "dispensasi_id" BIGINT,
    "tanggal_daftar" TIMESTAMP(0),
    "tanggal_submit" TIMESTAMP(0),
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "pendaftaran_sempro_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pendaftaran_sempro_id_pengajuan_key" ON "pendaftaran_sempro"("id_pengajuan");
CREATE INDEX "pendaftaran_sempro_status_berkas_idx" ON "pendaftaran_sempro"("status_berkas");
CREATE INDEX "idx_sempro_snapshot" ON "pendaftaran_sempro"("status_final", "dikunci_pada");

-- 2. CreateTable: checklist_dokumen
CREATE TABLE "checklist_dokumen" (
    "id" BIGSERIAL NOT NULL,
    "id_sempro" BIGINT,
    "id_sidang_daftar" BIGINT,
    "nomor_item" SMALLINT NOT NULL,
    "nama_dokumen" VARCHAR(255) NOT NULL,
    "deskripsi" TEXT,
    "jenis_bentuk" VARCHAR(20) NOT NULL DEFAULT 'asli',
    "verifikator_role" VARCHAR(20) NOT NULL DEFAULT 'kaprodi',
    "file_pindaian" VARCHAR(255),
    "status_unggahan" VARCHAR(50),
    "status_item" VARCHAR(20) NOT NULL DEFAULT 'kosong',
    "catatan_verifikator" TEXT,
    "tenggat_pasca_sempro" TIMESTAMP(0),
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "checklist_dokumen_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "checklist_dokumen_id_sempro_nomor_item_idx" ON "checklist_dokumen"("id_sempro", "nomor_item");

-- 3. CreateTable: penugasan_penguji
CREATE TABLE "penugasan_penguji" (
    "id" BIGSERIAL NOT NULL,
    "id_dosen_penguji" BIGINT NOT NULL,
    "id_sempro" BIGINT,
    "id_sidang_daftar" BIGINT,
    "nomor_penguji" SMALLINT,
    "jenis" VARCHAR(20) NOT NULL DEFAULT 'sempro',
    "peran" VARCHAR(20) NOT NULL DEFAULT 'anggota',
    "status_approval" VARCHAR(20) NOT NULL DEFAULT 'menunggu',
    "catatan" TEXT,
    "is_pengganti" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "penugasan_penguji_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "penugasan_penguji_id_sempro_nomor_penguji_idx" ON "penugasan_penguji"("id_sempro", "nomor_penguji");
CREATE INDEX "penugasan_penguji_id_dosen_penguji_status_approval_idx" ON "penugasan_penguji"("id_dosen_penguji", "status_approval");

-- 4. CreateTable: jadwal_sempro
CREATE TABLE "jadwal_sempro" (
    "id" BIGSERIAL NOT NULL,
    "id_sempro" BIGINT,
    "versi" SMALLINT NOT NULL DEFAULT 1,
    "tanggal" DATE,
    "waktu_mulai" VARCHAR(10),
    "waktu_selesai" VARCHAR(10),
    "ruang" VARCHAR(100),
    "status" VARCHAR(30) NOT NULL DEFAULT 'draft',
    "status_konfirmasi_dosen" VARCHAR(30) NOT NULL DEFAULT 'menunggu',
    "status_pelaksanaan" VARCHAR(30) NOT NULL DEFAULT 'terjadwal',
    "diterbitkan_at" TIMESTAMP(0),
    "revisi_undangan" INTEGER NOT NULL DEFAULT 0,
    "catatan" TEXT,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "jadwal_sempro_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "jadwal_sempro_id_sempro_key" ON "jadwal_sempro"("id_sempro");
CREATE INDEX "jadwal_sempro_tanggal_waktu_mulai_idx" ON "jadwal_sempro"("tanggal", "waktu_mulai");

-- 5. CreateTable: konfirmasi_jadwal_sempro
CREATE TABLE "konfirmasi_jadwal_sempro" (
    "id" BIGSERIAL NOT NULL,
    "jadwal_sempro_id" BIGINT NOT NULL,
    "versi" INTEGER NOT NULL DEFAULT 1,
    "dosen_id" BIGINT NOT NULL,
    "peran" VARCHAR(20) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'menunggu',
    "ditetapkan_kaprodi" BOOLEAN NOT NULL DEFAULT false,
    "catatan" TEXT,
    "usulan_jadwal" JSONB,
    "responded_at" TIMESTAMP(0),
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "konfirmasi_jadwal_sempro_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "konf_jadwal_sempro_versi_dosen_unique" ON "konfirmasi_jadwal_sempro"("jadwal_sempro_id", "versi", "dosen_id");

-- 6. CreateTable: riwayat_jadwal_sempro
CREATE TABLE "riwayat_jadwal_sempro" (
    "id" BIGSERIAL NOT NULL,
    "jadwal_sempro_id" BIGINT NOT NULL,
    "versi" INTEGER NOT NULL,
    "tanggal" DATE,
    "jam_mulai" VARCHAR(10),
    "jam_selesai" VARCHAR(10),
    "ruang" VARCHAR(100),
    "alasan_perubahan" TEXT,
    "diubah_oleh" BIGINT,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "riwayat_jadwal_sempro_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_riwayat_jadwal_sempro_versi" ON "riwayat_jadwal_sempro"("jadwal_sempro_id", "versi");

-- 7. CreateTable: kehadiran_seminar
CREATE TABLE "kehadiran_seminar" (
    "id" BIGSERIAL NOT NULL,
    "id_jadwal" BIGINT NOT NULL,
    "id_mahasiswa" BIGINT NOT NULL,
    "path_foto" VARCHAR(255),
    "is_manual" BOOLEAN NOT NULL DEFAULT false,
    "ditambahkan_oleh_id" BIGINT,
    "catatan_manual" TEXT,
    "waktu_ambil" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" VARCHAR(20) NOT NULL DEFAULT 'valid',
    "id_penolak" BIGINT,
    "alasan_penolakan" TEXT,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "kehadiran_seminar_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uniq_jadwal_mahasiswa_kehadiran" ON "kehadiran_seminar"("id_jadwal", "id_mahasiswa");
CREATE INDEX "kehadiran_seminar_id_mahasiswa_status_idx" ON "kehadiran_seminar"("id_mahasiswa", "status");
CREATE INDEX "kehadiran_seminar_id_jadwal_status_idx" ON "kehadiran_seminar"("id_jadwal", "status");

-- 8. CreateTable: dispensasi_kehadiran_sempro
CREATE TABLE "dispensasi_kehadiran_sempro" (
    "id" BIGSERIAL NOT NULL,
    "pendaftaran_sempro_id" BIGINT NOT NULL,
    "mahasiswa_id" BIGINT NOT NULL,
    "alasan" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'menunggu',
    "diputuskan_oleh" BIGINT,
    "peran_pemutus" VARCHAR(20),
    "alasan_keputusan" TEXT,
    "diputuskan_pada" TIMESTAMP(0),
    "syarat_saat_pengajuan" INTEGER NOT NULL DEFAULT 0,
    "terkumpul_saat_pengajuan" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "dispensasi_kehadiran_sempro_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_disp_sempro_status" ON "dispensasi_kehadiran_sempro"("pendaftaran_sempro_id", "status");
CREATE INDEX "idx_disp_mhs_status" ON "dispensasi_kehadiran_sempro"("mahasiswa_id", "status");

-- 9. CreateTable: berita_acara
CREATE TABLE "berita_acara" (
    "id" BIGSERIAL NOT NULL,
    "id_jadwal" BIGINT,
    "id_jadwal_sidang" BIGINT,
    "penguji_1_id" BIGINT,
    "file_scan" VARCHAR(255),
    "nilai_presentasi" DECIMAL(5,2),
    "nilai_penguasaan_materi" DECIMAL(5,2),
    "nilai_metodologi" DECIMAL(5,2),
    "nilai_alat_bantu" DECIMAL(5,2),
    "nilai_penampilan" DECIMAL(5,2),
    "nilai_kelayakan_proposal" DECIMAL(5,2),
    "nilai_penguji_1" DECIMAL(5,2),
    "nilai_penguji_2" DECIMAL(5,2),
    "nilai_akhir_penguji" DECIMAL(5,2),
    "catatan_penguji_1_input" TEXT,
    "catatan_penguji_2_input" TEXT,
    "nilai_pembimbing_presentasi" SMALLINT,
    "nilai_pembimbing_alat_bantu" SMALLINT,
    "nilai_pembimbing_penampilan" SMALLINT,
    "nilai_pembimbing_penguasaan_materi" SMALLINT,
    "nilai_pembimbing_kelayakan_proposal" SMALLINT,
    "nilai_pembimbing_total" DECIMAL(5,2),
    "catatan_pembimbing" TEXT,
    "status_dinilai_pembimbing" BOOLEAN NOT NULL DEFAULT false,
    "tanggal_dinilai_pembimbing" TIMESTAMP(0),
    "nilai" DECIMAL(5,2),
    "keputusan_penguji_1" VARCHAR(30),
    "catatan_penguji_1" TEXT,
    "tenggat_revisi_penguji_1" DATE,
    "diputuskan_penguji_1_at" TIMESTAMP(0),
    "status_persetujuan" VARCHAR(50) NOT NULL DEFAULT 'menunggu_nilai_lengkap',
    "disetujui_kaprodi_at" TIMESTAMP(0),
    "catatan_kaprodi" TEXT,
    "hasil" VARCHAR(30),
    "catatan_revisi" TEXT,
    "tenggat_revisi" DATE,
    "status_revisi" VARCHAR(50),
    "bukti_kehadiran" VARCHAR(255),
    "berita_acara" VARCHAR(255),
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "berita_acara_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "berita_acara_id_jadwal_key" ON "berita_acara"("id_jadwal");

-- 10. CreateTable: revisi_dokumen
CREATE TABLE "revisi_dokumen" (
    "id" BIGSERIAL NOT NULL,
    "tipe" VARCHAR(30) NOT NULL DEFAULT 'sempro',
    "berita_acara_id" BIGINT NOT NULL,
    "mahasiswa_id" BIGINT NOT NULL,
    "versi" INTEGER NOT NULL DEFAULT 1,
    "file_draft" VARCHAR(255) NOT NULL,
    "file_nama_asli" VARCHAR(255),
    "file_ukuran_bytes" BIGINT,
    "status" VARCHAR(30) NOT NULL DEFAULT 'menunggu_persetujuan',
    "catatan_mahasiswa" TEXT,
    "persetujuan" JSONB,
    "alasan_penolakan" TEXT,
    "ditolak_oleh_id" BIGINT,
    "disetujui_at" TIMESTAMP(0),
    "ditolak_at" TIMESTAMP(0),
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "revisi_dokumen_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_revisi_dokumen_ba_versi" ON "revisi_dokumen"("berita_acara_id", "versi");
CREATE INDEX "idx_revisi_dokumen_mhs" ON "revisi_dokumen"("mahasiswa_id", "tipe");

-- 11. CreateTable: nomor_surat_dasar
CREATE TABLE "nomor_surat_dasar" (
    "id" BIGSERIAL NOT NULL,
    "id_pengajuan" BIGINT NOT NULL,
    "tahun" INTEGER NOT NULL,
    "nomor_urut" INTEGER NOT NULL,
    "tanggal_alokasi" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "nomor_surat_dasar_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "nomor_surat_dasar_id_pengajuan_key" ON "nomor_surat_dasar"("id_pengajuan");
CREATE UNIQUE INDEX "uq_nomor_dasar_tahun_urut" ON "nomor_surat_dasar"("tahun", "nomor_urut");

-- 12. CreateTable: nomor_surat_kategori
CREATE TABLE "nomor_surat_kategori" (
    "id" BIGSERIAL NOT NULL,
    "id_nomor_dasar" BIGINT NOT NULL,
    "kategori" VARCHAR(10) NOT NULL,
    "nomor_lengkap" VARCHAR(100) NOT NULL,
    "bulan_romawi" VARCHAR(10) NOT NULL,
    "tahun" INTEGER NOT NULL,
    "tanggal_terbit" DATE NOT NULL,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "nomor_surat_kategori_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "nomor_surat_kategori_nomor_lengkap_key" ON "nomor_surat_kategori"("nomor_lengkap");
CREATE UNIQUE INDEX "uq_nomor_kategori_dasar" ON "nomor_surat_kategori"("id_nomor_dasar", "kategori");

-- 13. Add Foreign Keys
ALTER TABLE "pendaftaran_sempro" ADD CONSTRAINT "pendaftaran_sempro_id_pengajuan_fkey" FOREIGN KEY ("id_pengajuan") REFERENCES "pengajuan_judul"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pendaftaran_sempro" ADD CONSTRAINT "pendaftaran_sempro_id_dosen_pembimbing_sempro_fkey" FOREIGN KEY ("id_dosen_pembimbing_sempro") REFERENCES "pengguna"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pendaftaran_sempro" ADD CONSTRAINT "pendaftaran_sempro_dispensasi_id_fkey" FOREIGN KEY ("dispensasi_id") REFERENCES "dispensasi_kehadiran_sempro"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "checklist_dokumen" ADD CONSTRAINT "checklist_dokumen_id_sempro_fkey" FOREIGN KEY ("id_sempro") REFERENCES "pendaftaran_sempro"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "penugasan_penguji" ADD CONSTRAINT "penugasan_penguji_id_sempro_fkey" FOREIGN KEY ("id_sempro") REFERENCES "pendaftaran_sempro"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "penugasan_penguji" ADD CONSTRAINT "penugasan_penguji_id_dosen_penguji_fkey" FOREIGN KEY ("id_dosen_penguji") REFERENCES "pengguna"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "jadwal_sempro" ADD CONSTRAINT "jadwal_sempro_id_sempro_fkey" FOREIGN KEY ("id_sempro") REFERENCES "pendaftaran_sempro"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "konfirmasi_jadwal_sempro" ADD CONSTRAINT "konfirmasi_jadwal_sempro_jadwal_sempro_id_fkey" FOREIGN KEY ("jadwal_sempro_id") REFERENCES "jadwal_sempro"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "konfirmasi_jadwal_sempro" ADD CONSTRAINT "konfirmasi_jadwal_sempro_dosen_id_fkey" FOREIGN KEY ("dosen_id") REFERENCES "pengguna"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "riwayat_jadwal_sempro" ADD CONSTRAINT "riwayat_jadwal_sempro_jadwal_sempro_id_fkey" FOREIGN KEY ("jadwal_sempro_id") REFERENCES "jadwal_sempro"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "riwayat_jadwal_sempro" ADD CONSTRAINT "riwayat_jadwal_sempro_diubah_oleh_fkey" FOREIGN KEY ("diubah_oleh") REFERENCES "pengguna"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "kehadiran_seminar" ADD CONSTRAINT "kehadiran_seminar_id_jadwal_fkey" FOREIGN KEY ("id_jadwal") REFERENCES "jadwal_sempro"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "kehadiran_seminar" ADD CONSTRAINT "kehadiran_seminar_id_mahasiswa_fkey" FOREIGN KEY ("id_mahasiswa") REFERENCES "pengguna"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "kehadiran_seminar" ADD CONSTRAINT "kehadiran_seminar_ditambahkan_oleh_id_fkey" FOREIGN KEY ("ditambahkan_oleh_id") REFERENCES "pengguna"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "kehadiran_seminar" ADD CONSTRAINT "kehadiran_seminar_id_penolak_fkey" FOREIGN KEY ("id_penolak") REFERENCES "pengguna"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "dispensasi_kehadiran_sempro" ADD CONSTRAINT "dispensasi_kehadiran_sempro_pendaftaran_sempro_id_fkey" FOREIGN KEY ("pendaftaran_sempro_id") REFERENCES "pendaftaran_sempro"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dispensasi_kehadiran_sempro" ADD CONSTRAINT "dispensasi_kehadiran_sempro_mahasiswa_id_fkey" FOREIGN KEY ("mahasiswa_id") REFERENCES "pengguna"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dispensasi_kehadiran_sempro" ADD CONSTRAINT "dispensasi_kehadiran_sempro_diputuskan_oleh_fkey" FOREIGN KEY ("diputuskan_oleh") REFERENCES "pengguna"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "berita_acara" ADD CONSTRAINT "berita_acara_id_jadwal_fkey" FOREIGN KEY ("id_jadwal") REFERENCES "jadwal_sempro"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "berita_acara" ADD CONSTRAINT "berita_acara_penguji_1_id_fkey" FOREIGN KEY ("penguji_1_id") REFERENCES "pengguna"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "revisi_dokumen" ADD CONSTRAINT "revisi_dokumen_berita_acara_id_fkey" FOREIGN KEY ("berita_acara_id") REFERENCES "berita_acara"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "revisi_dokumen" ADD CONSTRAINT "revisi_dokumen_mahasiswa_id_fkey" FOREIGN KEY ("mahasiswa_id") REFERENCES "pengguna"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "revisi_dokumen" ADD CONSTRAINT "revisi_dokumen_ditolak_oleh_id_fkey" FOREIGN KEY ("ditolak_oleh_id") REFERENCES "pengguna"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "nomor_surat_dasar" ADD CONSTRAINT "nomor_surat_dasar_id_pengajuan_fkey" FOREIGN KEY ("id_pengajuan") REFERENCES "pengajuan_judul"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "nomor_surat_kategori" ADD CONSTRAINT "nomor_surat_kategori_id_nomor_dasar_fkey" FOREIGN KEY ("id_nomor_dasar") REFERENCES "nomor_surat_dasar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "dokumen_verifikasi" ADD CONSTRAINT "dokumen_verifikasi_id_sempro_fkey" FOREIGN KEY ("id_sempro") REFERENCES "pendaftaran_sempro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "dokumen_verifikasi" ADD CONSTRAINT "dokumen_verifikasi_id_jadwal_fkey" FOREIGN KEY ("id_jadwal") REFERENCES "jadwal_sempro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
